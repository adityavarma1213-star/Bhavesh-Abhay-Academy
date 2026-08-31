import { json, writeAudit } from './_lib/security.js';
import { requireAuth, requireLearnerAccess } from './_lib/auth.js';
import { sql } from './_lib/db.js';

export const config={runtime:'nodejs'};
const clean=(v,max=240)=>String(v??'').trim().slice(0,max);
const MIN_EVIDENCE=3;
const VALID_CORRECTNESS=new Set(['correct','partially_correct','incorrect']);
const noStore={ 'Cache-Control':'private, no-store, max-age=0' };
export default async function handler(req,res){
  if(req.method!=='GET')return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET required.'}},{Allow:'GET',...noStore});
  try{
    const session=await requireAuth(req);
    const learnerId=clean(req.query?.learnerId,120);
    await requireLearnerAccess(session,learnerId);
    const learner=await sql`SELECT id,display_name AS "displayName" FROM learners WHERE id=${learnerId} AND deactivated_at IS NULL LIMIT 1`;
    if(!learner.rows.length)return json(res,404,{error:{code:'LEARNER_NOT_FOUND',message:'Learner not found.'},...noStore});
    const evidence=await sql`SELECT id,concept,subject,topic,correctness,created_at AS "createdAt" FROM learning_evidence WHERE learner_id=${learnerId} ORDER BY created_at DESC LIMIT 1000`;
    const attempts=await sql`SELECT id,assessment_title AS "assessmentTitle",score,max_score AS "maxScore",status,end_time AS "completedAt" FROM assessment_attempts WHERE learner_id=${learnerId} AND status<>'in_progress' ORDER BY end_time DESC NULLS LAST LIMIT 50`;
    const validEvidence=evidence.rows.filter(row=>VALID_CORRECTNESS.has(row.correctness));
    const grouped=new Map();
    for(const row of validEvidence){
      const key=[row.subject,row.concept].filter(Boolean).join('::')||'unclassified';
      const item=grouped.get(key)||{concept:row.concept||'Unclassified',subject:row.subject||null,topic:row.topic||null,evidenceCount:0,correctCount:0,lastUpdated:null};
      item.evidenceCount++;if(row.correctness==='correct')item.correctCount++;if(!item.lastUpdated||String(row.createdAt)>String(item.lastUpdated))item.lastUpdated=row.createdAt;grouped.set(key,item);
    }
    const competencies=[...grouped.values()].filter(x=>x.evidenceCount>0).map(x=>{
      const sufficient=x.evidenceCount>=MIN_EVIDENCE;
      const accuracy=sufficient?x.correctCount/x.evidenceCount:null;
      const status=!sufficient?'insufficient_evidence':x.correctCount===x.evidenceCount?'mastered':accuracy>=.7?'strong':accuracy>=.4?'developing':'support_needed';
      return {...x,status,accuracy,verifiedByEvidence:sufficient,evidenceSufficient:sufficient};
    });
    await writeAudit({actorUserId:session.user_id,action:'LEARNING_PASSPORT_VIEW',entityType:'learner',entityId:learnerId,metadata:{evidenceCount:validEvidence.length,excludedEvidenceCount:evidence.rows.length-validEvidence.length,assessmentCount:attempts.rows.length,minEvidence:MIN_EVIDENCE}});
    return json(res,200,{ok:true,schemaVersion:2,student:learner.rows[0].displayName,learnerId,issuedAt:new Date().toISOString(),status:'server_evidence_record',evidenceGate:{minimumEvidencePerConcept:MIN_EVIDENCE,sparseConceptsAreNotCharacterized:true,validCorrectnessStates:[...VALID_CORRECTNESS]},competencies,assessments:attempts.rows,evidenceCount:validEvidence.length,excludedEvidenceCount:evidence.rows.length-validEvidence.length,limitations:['Evidence-backed inside BAA server records; not an external credential.','Assessment attempts shown here are stored server outcomes and may include evaluated or completed records.','Concept status is characterized only after the minimum evidence threshold is met.','Only scored evidence with correctness values supported by the server contract is used.','This record must not be presented as an external accreditation or guarantee.']},noStore);
  }catch(e){return json(res,e.status||500,{error:{code:e.code||'LEARNING_PASSPORT_FAILED',message:e.status?e.message:'Unable to build learning passport.'}},noStore);}
}