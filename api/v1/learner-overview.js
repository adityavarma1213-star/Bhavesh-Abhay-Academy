import { sql } from '../_lib/db.js';
import { requireAuth, requireLearnerAccess } from '../_lib/auth.js';
import { json } from '../_lib/security.js';
export const config={runtime:'nodejs'};

async function snapshot(learnerId){
  const [learner, attempts, memory, planner, homework, rewards, concepts, recentAttempts] = await Promise.all([
    sql`SELECT id,display_name,created_at,updated_at FROM learners WHERE id=${learnerId} AND deactivated_at IS NULL LIMIT 1`,
    sql`SELECT COUNT(*)::int AS count, COALESCE(SUM(CASE WHEN status='submitted' THEN 1 ELSE 0 END),0)::int AS completed,
               COALESCE(SUM(score),0)::numeric AS score, COALESCE(SUM(max_score),0)::numeric AS max_score
        FROM assessment_attempts WHERE learner_id=${learnerId}`,
    sql`SELECT COUNT(*)::int AS concepts,
               COALESCE(SUM(CASE WHEN status IN ('mastered','strong') THEN 1 ELSE 0 END),0)::int AS strong,
               COALESCE(SUM(CASE WHEN status IN ('needs_revision','learning') THEN 1 ELSE 0 END),0)::int AS needs_attention,
               COALESCE(SUM(evidence_count),0)::int AS evidence_count
        FROM learning_memory WHERE learner_id=${learnerId}`,
    sql`SELECT COUNT(*)::int AS total,
               COALESCE(SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END),0)::int AS pending,
               COALESCE(SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END),0)::int AS completed
        FROM planner_tasks WHERE learner_id=${learnerId}`,
    sql`SELECT COUNT(*)::int AS submissions,
               COALESCE(SUM(CASE WHEN status IN ('evaluated','reviewed') THEN 1 ELSE 0 END),0)::int AS evaluated,
               COALESCE(SUM(CASE WHEN status='needs_human_review' THEN 1 ELSE 0 END),0)::int AS human_review
        FROM homework_submissions WHERE learner_id=${learnerId}`,
    sql`SELECT xp,completed_attempts,answered_questions,correct_answers,mastered_concepts
        FROM learner_rewards WHERE learner_id=${learnerId}`,
    sql`SELECT concept,subject,topic,status,evidence_count,correct_count,last_updated FROM learning_memory WHERE learner_id=${learnerId} ORDER BY subject,topic,concept`,
    sql`SELECT aa.id,aa.assessment_id,a.title,a.subject,a.chapter,aa.start_time,aa.end_time,aa.status,aa.score,aa.max_score FROM assessment_attempts aa JOIN assessments a ON a.id=aa.assessment_id WHERE aa.learner_id=${learnerId} ORDER BY aa.start_time DESC LIMIT 10`,
  ]);
  return {
    learner: learner.rows[0] || null,
    assessments: attempts.rows[0] || {},
    learning: memory.rows[0] || {},
    planner: planner.rows[0] || {},
    homework: homework.rows[0] || {},
    rewards: rewards.rows[0] || {},
    concepts: concepts.rows || [],
    recentAttempts: recentAttempts.rows || [],
  };
}

export default async function handler(req,res){
  if(req.method!=='GET') return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET required.'}},{Allow:'GET'});
  try{
    const session=await requireAuth(req);
    const learnerId=String(req.query?.learnerId||'');
    await requireLearnerAccess(session,learnerId);
    const snapshotData=await snapshot(learnerId);
    if(!snapshotData.learner) return json(res,404,{error:{code:'LEARNER_NOT_FOUND',message:'Learner not found.'}});
    return json(res,200,{ok:true,snapshot:snapshotData});
  }catch(e){
    return json(res,e.status||500,{error:{code:e.code||'LEARNER_OVERVIEW_FAILED',message:e.status?e.message:'Unable to load learner overview.'}});
  }
}
