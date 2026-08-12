// BAA v1: Planner persistence (Checkpoint 1 — see G7 audit).
//
// Design: snapshot sync, not fine-grained CRUD. The client (js/baa-planner.js)
// keeps generating and reading plans locally exactly as before — the AI
// candidate-generation logic depends on Section B evidence, which is not
// yet server-side (separate checkpoint). This endpoint only makes the
// *storage* of preferences/goals/upcoming-assessments/tasks real and
// per-learner instead of trapped in one browser's localStorage:
//   GET  -> the learner's current stored snapshot (used to hydrate a
//           session on load, e.g. a second device or a returning user)
//   PUT  -> the client pushes its current local store; server reconciles
//           (upserts goals/upcoming/tasks, deletes ones no longer present,
//           records a planner_task_events row for any task whose status
//           actually changed since last sync)
import { sql } from '../_lib/db.js';
import { requireAuth, requireLearnerAccess } from '../_lib/auth.js';
import { json, id, writeAudit } from '../_lib/security.js';
export const config={runtime:'nodejs'};

const VALID_STATUS = ['pending','completed','missed','cancelled','skipped'];

async function getSnapshot(learnerId) {
  const [prefs, goals, upcoming, tasks] = await Promise.all([
    sql`SELECT available_minutes_per_day FROM planner_preferences WHERE learner_id=${learnerId}`,
    sql`SELECT id,text,created_at FROM planner_goals WHERE learner_id=${learnerId} ORDER BY created_at ASC`,
    sql`SELECT id,title,subject,date,assessment_id FROM planner_upcoming_assessments WHERE learner_id=${learnerId} ORDER BY date ASC`,
    sql`SELECT id,type,title,concept,subject,estimated_minutes,priority,reasons,action,status,scheduled_date,created_at,completed_at
        FROM planner_tasks WHERE learner_id=${learnerId} ORDER BY created_at ASC`,
  ]);
  return {
    preferences: { availableMinutesPerDay: prefs.rows[0]?.available_minutes_per_day ?? null },
    goals: goals.rows.map(g=>({id:g.id,text:g.text,createdAt:g.created_at})),
    upcomingAssessments: upcoming.rows.map(u=>({id:u.id,title:u.title,subject:u.subject,date:u.date,assessmentId:u.assessment_id})),
    tasks: tasks.rows.map(t=>({
      id:t.id,type:t.type,title:t.title,concept:t.concept,subject:t.subject,
      estimatedMinutes:t.estimated_minutes,priority:t.priority,reasons:t.reasons,action:t.action,
      status:t.status,scheduledDate:t.scheduled_date,createdAt:t.created_at,completedAt:t.completed_at,
    })),
  };
}

function isPlainObject(v){ return v && typeof v==='object' && !Array.isArray(v); }

export default async function handler(req,res){
  try{
    const s=await requireAuth(req);
    const learnerId=String(req.query?.learnerId||'');
    await requireLearnerAccess(s,learnerId);

    if (req.method==='GET') {
      return json(res,200,{ok:true,snapshot:await getSnapshot(learnerId)});
    }

    if (req.method==='PUT') {
      const body=req.body||{};
      const goals=Array.isArray(body.goals)?body.goals:[];
      const upcoming=Array.isArray(body.upcomingAssessments)?body.upcomingAssessments:[];
      const tasks=Array.isArray(body.tasks)?body.tasks:[];
      const minutes=body.preferences?.availableMinutesPerDay;
      const now=new Date().toISOString();

      if (minutes!=null && Number.isFinite(Number(minutes))) {
        await sql`INSERT INTO planner_preferences(learner_id,available_minutes_per_day,updated_at)
                   VALUES(${learnerId},${Math.round(Number(minutes))},${now})
                   ON CONFLICT(learner_id) DO UPDATE SET available_minutes_per_day=EXCLUDED.available_minutes_per_day,updated_at=EXCLUDED.updated_at`;
      }

      // Goals: replace-set semantics (client sends its full current list;
      // anything on the server but not in that list was removed locally).
      const goalIds=goals.map(g=>String(g.id||'')).filter(Boolean);
      if (goalIds.length) {
        await sql`DELETE FROM planner_goals WHERE learner_id=${learnerId} AND id != ALL(${goalIds})`;
      } else {
        await sql`DELETE FROM planner_goals WHERE learner_id=${learnerId}`;
      }
      for (const g of goals) {
        if (!g?.id || !g?.text) continue;
        const owner=await sql`SELECT learner_id FROM planner_goals WHERE id=${g.id} LIMIT 1`;
        if (owner.rows.length && owner.rows[0].learner_id!==learnerId) continue;
        await sql`INSERT INTO planner_goals(id,learner_id,text,created_at) VALUES(${g.id},${learnerId},${String(g.text).slice(0,500)},${g.createdAt||now})
                   ON CONFLICT(id) DO UPDATE SET text=EXCLUDED.text WHERE planner_goals.learner_id=EXCLUDED.learner_id;
      }

      // Upcoming assessments: same replace-set semantics.
      const upcomingIds=upcoming.map(u=>String(u.id||'')).filter(Boolean);
      if (upcomingIds.length) {
        await sql`DELETE FROM planner_upcoming_assessments WHERE learner_id=${learnerId} AND id != ALL(${upcomingIds})`;
      } else {
        await sql`DELETE FROM planner_upcoming_assessments WHERE learner_id=${learnerId}`;
      }
      for (const u of upcoming) {
        if (!u?.id || !u?.title || !u?.date) continue;
        const owner=await sql`SELECT learner_id FROM planner_upcoming_assessments WHERE id=${u.id} LIMIT 1`;
        if (owner.rows.length && owner.rows[0].learner_id!==learnerId) continue;
        await sql`INSERT INTO planner_upcoming_assessments(id,learner_id,title,subject,date,assessment_id,created_at)
                   VALUES(${u.id},${learnerId},${String(u.title).slice(0,300)},${u.subject||null},${u.date},${u.assessmentId||null},${now})
                   ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,subject=EXCLUDED.subject,date=EXCLUDED.date,assessment_id=EXCLUDED.assessment_id WHERE planner_upcoming_assessments.learner_id=EXCLUDED.learner_id;
      }

      // Tasks: never deleted (matches client's own "full task history"
      // rule). Upsert, and record a task_event only when status actually
      // changed since the last sync.
      if (tasks.length) {
        const existing=await sql`SELECT id,status FROM planner_tasks WHERE learner_id=${learnerId} AND id = ANY(${tasks.map(t=>String(t.id||'')).filter(Boolean)})`;
        const prevStatus=new Map(existing.rows.map(r=>[r.id,r.status]));
        for (const t of tasks) {
          if (!t?.id || !t?.title || !t?.type) continue;
          const owner=await sql`SELECT learner_id FROM planner_tasks WHERE id=${t.id} LIMIT 1`;
          if (owner.rows.length && owner.rows[0].learner_id!==learnerId) continue;
          const status=VALID_STATUS.includes(t.status) ? t.status : 'pending';
          await sql`INSERT INTO planner_tasks(id,learner_id,type,title,concept,subject,estimated_minutes,priority,reasons,action,status,scheduled_date,created_at,completed_at)
                     VALUES(${t.id},${learnerId},${t.type},${String(t.title).slice(0,300)},${t.concept||null},${t.subject||null},
                            ${t.estimatedMinutes||0},${t.priority||'medium'},${JSON.stringify(t.reasons||[])},${t.action?JSON.stringify(t.action):null},
                            ${status},${t.scheduledDate},${t.createdAt||now},${t.completedAt||null})
                     ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,completed_at=EXCLUDED.completed_at,scheduled_date=EXCLUDED.scheduled_date WHERE planner_tasks.learner_id=EXCLUDED.learner_id;
          const was=prevStatus.get(t.id);
          if (was!==undefined && was!==status) {
            await sql`INSERT INTO planner_task_events(id,task_id,event,note,occurred_at) VALUES(${id('evt')},${t.id},${status},${'synced from client'},${now})`;
          } else if (was===undefined) {
            await sql`INSERT INTO planner_task_events(id,task_id,event,note,occurred_at) VALUES(${id('evt')},${t.id},${'created'},${null},${now})`;
          }
        }
      }

      await writeAudit({actorUserId:s.user_id,action:'planner.sync',entityType:'learner',entityId:learnerId,metadata:{goals:goals.length,upcoming:upcoming.length,tasks:tasks.length}});
      return json(res,200,{ok:true,snapshot:await getSnapshot(learnerId)});
    }

    return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET or PUT required.'}},{Allow:'GET, PUT'});
  }catch(e){return json(res,e.status||500,{error:{code:e.code||'PLANNER_SYNC_FAILED',message:e.status?e.message:'Planner sync failed.'}});}
}
