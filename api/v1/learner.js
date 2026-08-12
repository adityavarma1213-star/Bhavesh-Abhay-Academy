import { sql } from '../_lib/db.js';
import { requireAuth, requireLearnerAccess } from '../_lib/auth.js';
import { json, id, writeAudit } from '../_lib/security.js';
export const config={runtime:'nodejs'};

export default async function handler(req,res){
  try{
    const s=await requireAuth(req);
    const learnerId=String(req.query?.learnerId||'');
    await requireLearnerAccess(s,learnerId);
    if(req.method==='GET'){
      const [l,p,e,t]=await Promise.all([
        sql`SELECT id,display_name,created_at,updated_at FROM learners WHERE id=${learnerId} AND deactivated_at IS NULL`,
        sql`SELECT preferences,updated_at FROM learning_profiles WHERE learner_id=${learnerId}`,
        sql`SELECT COUNT(*)::int AS count FROM learning_evidence WHERE learner_id=${learnerId}`,
        sql`SELECT COUNT(*)::int AS count FROM planner_tasks WHERE learner_id=${learnerId} AND status='pending'`
      ]);
      if(!l.rows.length)return json(res,404,{error:{code:'LEARNER_NOT_FOUND',message:'Learner not found.'}});
      return json(res,200,{ok:true,learner:l.rows[0],profile:p.rows[0]||null,metrics:{evidence:e.rows[0].count,pendingTasks:t.rows[0].count}});
    }
    if(req.method==='PATCH'){
      const {displayName,preferences}=req.body||{};
      if(displayName!==undefined){
        const name=String(displayName).trim(); if(!name||name.length>120)return json(res,400,{error:{code:'INVALID_NAME',message:'Display name is invalid.'}});
        await sql`UPDATE learners SET display_name=${name},updated_at=NOW() WHERE id=${learnerId}`;
      }
      if(preferences!==undefined){
        const jsonPrefs=JSON.stringify(preferences||{});
        await sql`INSERT INTO learning_profiles(learner_id,preferences,created_at,updated_at) VALUES(${learnerId},${jsonPrefs},NOW(),NOW()) ON CONFLICT(learner_id) DO UPDATE SET preferences=EXCLUDED.preferences,updated_at=NOW()`;
      }
      await writeAudit({actorUserId:s.user_id,action:'learner.update',entityType:'learner',entityId:learnerId,metadata:{displayName:displayName!==undefined,preferences:preferences!==undefined}});
      return json(res,200,{ok:true});
    }
    return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET or PATCH required.'}},{Allow:'GET, PATCH'});
  }catch(e){return json(res,e.status||500,{error:{code:e.code||'LEARNER_REQUEST_FAILED',message:e.status?e.message:'Learner request failed.'}});}
}
