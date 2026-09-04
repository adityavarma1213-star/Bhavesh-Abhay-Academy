import { json, writeAudit } from './_lib/security.js';
import { requireAuth, requireLearnerAccess } from './_lib/auth.js';
import { sql } from './_lib/db.js';

export const config={runtime:'nodejs'};
const MIN_EVIDENCE=3;
const PAGE_SIZE=500;
const ATTEMPT_PAGE_SIZE=50;
const MAX_LEARNER_ID_CHARS=120;
const VALID_CORRECTNESS=new Set(['correct','partially_correct','incorrect']);
const noStore={ 'Cache-Control':'private, no-store, max-age=0' };

function parseLearnerId(raw){
  if(typeof raw!=='string'||!raw.trim()){const error=new Error('Learner ID is required.');error.status=400;error.code='LEARNER_ID_REQUIRED';throw error;}
  const value=raw.trim();
  if(value.length>MAX_LEARNER_ID_CHARS){const error=new Error('Learner ID exceeds the maximum length.');error.status=400;error.code='LEARNER_ID_TOO_LONG';throw error;}
  return value;
}
function parseCursor(raw){
  if(!raw)return null;
  try{
    const parsed=JSON.parse(Buffer.from(String(raw),'base64url').toString('utf8'));
    if(!parsed||typeof parsed!=='object'||!parsed.endTime||!parsed.id)throw new Error();
    const endTime=new Date(parsed.endTime);
    if(Number.isNaN(endTime.getTime()))throw new Error();
    return {endTime:endTime.toISOString(),id:String(parsed.id)};
  }catch{
    const error=new Error('Invalid assessment cursor.');
    error.status=400;error.code='INVALID_CURSOR';throw error;
  }
}
function makeCursor(row){
  if(!row?.id)return null;
  const value={endTime:row.completedAt?new Date(row.completedAt).toISOString():null,id:String(row.id)};
  if(!value.endTime)return null;
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

async function loadAllEvidence(learnerId){
  const rows=[];
  let cursor=null;
  for(;;){
    const page=cursor
      ? await sql`SELECT id,concept,subject,topic,correctness,created_at AS "createdAt"
          FROM learning_evidence
          WHERE learner_id=${learnerId}
            AND (created_at < ${cursor.createdAt}
              OR (created_at = ${cursor.createdAt} AND id < ${cursor.id}))
          ORDER BY created_at DESC,id DESC
          LIMIT ${PAGE_SIZE}`
      : await sql`SELECT id,concept,subject,topic,correctness,created_at AS "createdAt"
          FROM learning_evidence
          WHERE learner_id=${learnerId}
          ORDER BY created_at DESC,id DESC
          LIMIT ${PAGE_SIZE}`;
    const batch=Array.isArray(page?.rows)?page.rows:[];
    rows.push(...batch);
    if(batch.length<PAGE_SIZE)break;
    const last=batch[batch.length-1];
    cursor={createdAt:last.createdAt,id:last.id};
  }
  return rows;
}

async function handler(req,res){
  if(req.method!=='GET')return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET required.'}},{Allow:'GET',...noStore});
  try{
    const session=await requireAuth(req);
    const learnerId=parseLearnerId(req.query?.learnerId);
    await requireLearnerAccess(session,learnerId);
    const learner=await sql`SELECT id,display_name AS "displayName" FROM learners WHERE id=${learnerId} AND deactivated_at IS NULL LIMIT 1`;
    if(!learner.rows.length)return json(res,404,{error:{code:'LEARNER_NOT_FOUND',message:'Learner not found.'},...noStore});
    const attemptLimit=Math.min(Math.max(Number(req.query?.attemptLimit||ATTEMPT_PAGE_SIZE),1),100);
    const attemptCursor=parseCursor(req.query?.attemptCursor);
    const [evidence,attempts]=await Promise.all([
      loadAllEvidence(learnerId),
      attemptCursor
        ? sql`SELECT id,assessment_title AS "assessmentTitle",score,max_score AS "maxScore",status,end_time AS "completedAt" FROM assessment_attempts WHERE learner_id=${learnerId} AND status<>'in_progress' AND end_time IS NOT NULL AND (end_time < ${attemptCursor.endTime} OR (end_time = ${attemptCursor.endTime} AND id < ${attemptCursor.id})) ORDER BY end_time DESC,id DESC LIMIT ${attemptLimit+1}`
        : sql`SELECT id,assessment_title AS "assessmentTitle",score,max_score AS "maxScore",status,end_time AS "completedAt" FROM assessment_attempts WHERE learner_id=${learnerId} AND status<>'in_progress' ORDER BY end_time DESC NULLS LAST,id DESC LIMIT ${attemptLimit+1}`,
    ]);
    const attemptRows=Array.isArray(attempts?.rows)?attempts.rows:[];
    const hasMoreAttempts=attemptRows.length>attemptLimit;
    const visibleAttempts=hasMoreAttempts?attemptRows.slice(0,attemptLimit):attemptRows;
    const nextAttemptCursor=hasMoreAttempts?makeCursor(visibleAttempts[visibleAttempts.length-1]):null;
    const validEvidence=evidence.filter(row=>VALID_CORRECTNESS.has(row.correctness));
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
    await writeAudit({actorUserId:session.user_id,action:'LEARNING_PASSPORT_VIEW',entityType:'learner',entityId:learnerId,metadata:{evidenceCount:validEvidence.length,excludedEvidenceCount:evidence.length-validEvidence.length,assessmentCount:visibleAttempts.length,assessmentPageSize:attemptLimit,assessmentHasMore:hasMoreAttempts,minEvidence:MIN_EVIDENCE}});
    return json(res,200,{ok:true,schemaVersion:2,student:learner.rows[0].displayName,learnerId,issuedAt:new Date().toISOString(),status:'server_evidence_record',evidenceGate:{minimumEvidencePerConcept:MIN_EVIDENCE,sparseConceptsAreNotCharacterized:true,validCorrectnessStates:[...VALID_CORRECTNESS]},competencies,assessments:visibleAttempts,assessmentPagination:{limit:attemptLimit,nextCursor:nextAttemptCursor,hasMore:hasMoreAttempts},evidenceCount:validEvidence.length,excludedEvidenceCount:evidence.length-validEvidence.length,limitations:['Evidence-backed inside BAA server records; not an external credential.','Assessment attempts are returned newest-first with keyset pagination so older stored outcomes can be retrieved without an arbitrary history ceiling.','Concept status is characterized only after the minimum evidence threshold is met.','Only scored evidence with correctness values supported by the server contract is used.','This record must not be presented as an external accreditation or guarantee.','Evidence is read with keyset pagination so older records are not silently dropped at an arbitrary row limit.']},noStore);
  }catch(e){return json(res,e.status||500,{error:{code:e.code||'LEARNING_PASSPORT_FAILED',message:e.status?e.message:'Unable to build learning passport.'}},noStore);}
}

export default handler;
