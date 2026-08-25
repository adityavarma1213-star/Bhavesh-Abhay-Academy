import { json, writeAudit } from './_lib/security.js';
import { requireAuth, requireLearnerAccess } from './_lib/auth.js';
import { sql } from './_lib/db.js';

export const config={runtime:'nodejs'};
const clean=(v,max=240)=>String(v??'').trim().slice(0,max);
export default async function handler(req,res){
  if(req.method!=='GET')return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET required.'}},{Allow:'GET'});
  try{
    const session=await requireAuth(req);
    const learnerId=clean(req.query?.learnerId,120);
    await requireLearnerAccess(session,learnerId);
    const learner=await sql`SELECT id,display_name AS "displayName" FROM learners WHERE id=${learnerId} AND deactivated_at IS NULL LIMIT 1`;
    if(!learner.rows.length)return json(res,404,{error:{code:'LEARNER_NOT_FOUND',message:'Learner not found.'}});
    const evidence=await sql`SELECT id,concept,subject,topic,correctness,created_at AS "createdAt" FROM learning_evidence WHERE learner_id=${learnerId} ORDER BY created_at DESC LIMIT 1000`;
    const attempts=await sql`SELECT id,assessment_title AS "assessmentTitle",score,max_score AS "maxScore",status,end_time AS "completedAt" FROM assessment_attempts WHERE learner_id=${learnerId} AND status<>'in_progress' ORDER BY end_time DESC NULLS LAST LIMIT 50`;
    const grouped=new Map();
    for(const row of evidence.rows){
      const key=[row.subject,row.concept].filter(Boolean).join('::')||'unclassified';
      const item=grouped.get(key)||{concept:row.concept||'Unclassified',subject:row.subject||null,topic:row.topic||null,evidenceCount:0,correctCount:0,lastUpdated:null};
      item.evidenceCount++;if(row.correctness==='correct')item.correctCount++;if(!item.lastUpdated||String(row.createdAt)>String(item.lastUpdated))item.lastUpdated=row.createdAt;grouped.set(key,item);
    }
    const competencies=[...grouped.values()].filter(x=>x.evidenceCount>0).map(x=>({...x,status:x.correctCount===x.evidenceCount&&x.evidenceCount>=2?'mastered':x.correctCount/x.evidenceCount>=.7?'strong':x.correctCount/x.evidenceCount>=.4?'developing':'support_needed',verifiedByEvidence:true}));
    await writeAudit({actorUserId:session.user_id,action:'LEARNING_PASSPORT_VIEW',entityType:'learner',entityId:learnerId,metadata:{evidenceCount:evidence.rows.length,assessmentCount:attempts.rows.length}});
    return json(res,200,{ok:true,schemaVersion:2,student:learner.rows[0].displayName,learnerId,issuedAt:new Date().toISOString(),status:'server_evidence_record',competencies,assessments:attempts.rows,evidenceCount:evidence.rows.length,limitations:['Evidence-backed inside BAA server records; not an external credential.','Only submitted assessment evidence is included.','This record must not be presented as an external accreditation or guarantee.']});
  }catch(e){return json(res,e.status||500,{error:{code:e.code||'LEARNING_PASSPORT_FAILED',message:e.status?e.message:'Unable to build learning passport.'}});}
}
