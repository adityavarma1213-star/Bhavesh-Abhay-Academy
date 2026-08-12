// BAA v1: resolve the learner(s) the current session is allowed to act as.
//
// Why this exists: signup.js now creates a `learners` row for new student
// accounts, but every account created before that change (and every
// parent/teacher) has no direct way to discover a learnerId. This endpoint
// is the one place the client asks "which learner(s) am I looking at?" —
// self-healing (auto-creates a missing student learner row) rather than
// requiring a manual migration.
import { sql } from '../_lib/db.js';
import { requireAuth } from '../_lib/auth.js';
import { json, id, writeAudit } from '../_lib/security.js';
export const config={runtime:'nodejs'};

export default async function handler(req,res){
  if (req.method!=='GET') return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET required.'}},{Allow:'GET'});
  try{
    const s=await requireAuth(req);
    let learners=[];

    if (s.roles.includes('student')) {
      const r=await sql`SELECT id,display_name FROM learners WHERE user_id=${s.user_id} AND deactivated_at IS NULL ORDER BY created_at ASC LIMIT 1`;
      if (r.rows.length) {
        learners.push({...r.rows[0],relationship:'self'});
      } else {
        // Self-heal: a student session with no learners row yet (account
        // predates this endpoint). Create one now rather than erroring.
        const learnerId=id('learner'), now=new Date().toISOString();
        await sql`INSERT INTO learners(id,user_id,display_name,created_at,updated_at) VALUES(${learnerId},${s.user_id},${s.display_name},${now},${now})`;
        await writeAudit({actorUserId:s.user_id,action:'learner.create',entityType:'learner',entityId:learnerId,metadata:{viaSelfHeal:true}});
        learners.push({id:learnerId,display_name:s.display_name,relationship:'self'});
      }
    }
    if (s.roles.includes('parent')) {
      const r=await sql`SELECT l.id,l.display_name FROM parent_learner pl JOIN learners l ON l.id=pl.learner_id
                         WHERE pl.parent_user_id=${s.user_id} AND pl.status='active' AND l.deactivated_at IS NULL`;
      learners.push(...r.rows.map(row=>({...row,relationship:'parent'})));
    }
    if (s.roles.includes('teacher')) {
      const r=await sql`SELECT l.id,l.display_name FROM teacher_learner tl JOIN learners l ON l.id=tl.learner_id
                         WHERE tl.teacher_user_id=${s.user_id} AND tl.status='active' AND l.deactivated_at IS NULL`;
      learners.push(...r.rows.map(row=>({...row,relationship:'teacher'})));
    }

    return json(res,200,{ok:true,learners});
  }catch(e){return json(res,e.status||500,{error:{code:e.code||'MY_LEARNERS_FAILED',message:e.status?e.message:'Unable to resolve learners.'}});}
}
