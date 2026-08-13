import { sql } from '../_lib/db.js';
import { requireAuth, requireLearnerAccess } from '../_lib/auth.js';
import { json, writeAudit } from '../_lib/security.js';
import { verifyHomeworkVerdict, hashHomeworkText } from '../_lib/assessment-verdict.js';
import { beginOfflineOperation, completeOfflineOperation, rejectOfflineOperation } from '../_lib/offline-sync.js';
export const config={runtime:'nodejs'};
async function snapshot(learnerId){const r=await sql`SELECT * FROM homework_submissions WHERE learner_id=${learnerId} ORDER BY submitted_at DESC`;return r.rows;}
export default async function handler(req,res){let offlineOp=null;try{const s=await requireAuth(req);const learnerId=String(req.query?.learnerId||'');await requireLearnerAccess(s,learnerId);if(req.method==='PUT'){offlineOp=await beginOfflineOperation(req,{learnerId,endpoint:'homework'});if(offlineOp.duplicate)return json(res,200,offlineOp.response);}if(req.method==='GET')return json(res,200,{ok:true,submissions:await snapshot(learnerId)});if(req.method!=='PUT')return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET or PUT required.'}},{Allow:'GET, PUT'});const b=req.body||{};const rows=Array.isArray(b.submissions)?b.submissions:[];for(const x of rows){
  if(!x?.id||!x?.text)continue;
  const owner=await sql`SELECT learner_id FROM homework_submissions WHERE id=${x.id} LIMIT 1`;
  if(owner.rows.length && owner.rows[0].learner_id!==learnerId)continue;
  const text=String(x.text).slice(0,8000);

  // SECURITY RULE (same boundary as api/v1/assessment.js): the browser never decides
  // what the AI evaluator concluded about a submission. evaluation/learning_integration
  // are only persisted when a valid, server-signed verdict token proves they came from
  // api/evaluate-homework.js for this exact submission id and this exact text.
  let evaluation=null, learningIntegration=null, status=x.status||'received', lastEvaluationError=x.lastEvaluationError||null;
  if(x.evaluation && x.evaluation.verdictToken){
    const textHash=hashHomeworkText(text);
    const check=verifyHomeworkVerdict(x.evaluation.verdictToken,{submissionId:x.id,textHash});
    if(check.ok){
      evaluation={...x.evaluation, overallAssessment:check.verdict.overallAssessment, confidence:check.verdict.confidence, humanReviewRequired:check.verdict.humanReviewRequired};
      learningIntegration=x.learningIntegration?JSON.stringify(x.learningIntegration):null;
      status='evaluated';
    } else {
      // Do not write a client-supplied evaluation. Preserve the submission as unresolved.
      status='pending_review'; lastEvaluationError=`Evaluation verdict rejected: ${check.code}`;
    }
  } else if (x.evaluation) {
    // Client sent an evaluation with no verifiable token at all — never trust it.
    status='pending_review'; lastEvaluationError='Evaluation verdict rejected: VERDICT_MISSING';
  }

  await sql`INSERT INTO homework_submissions(id,learner_id,submitted_at,input_type,text,subject_hint,attachments,status,evaluation,last_evaluation_error,learning_integration,review,updated_at) VALUES(${x.id},${learnerId},${x.submittedAt||new Date().toISOString()},${x.inputType||'text'},${text},${x.subjectHint||null},${JSON.stringify(x.attachments||[])},${status},${evaluation?JSON.stringify(evaluation):null},${lastEvaluationError},${learningIntegration},${x.review?JSON.stringify(x.review):null},${new Date().toISOString()}) ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,evaluation=EXCLUDED.evaluation,last_evaluation_error=EXCLUDED.last_evaluation_error,learning_integration=EXCLUDED.learning_integration,review=EXCLUDED.review,updated_at=EXCLUDED.updated_at WHERE homework_submissions.learner_id=EXCLUDED.learner_id;
}const response={ok:true,submissions:await snapshot(learnerId)};await completeOfflineOperation(offlineOp,response);await writeAudit({actorUserId:s.user_id,action:'homework.sync',entityType:'learner',entityId:learnerId,metadata:{submissions:rows.length,offlineOperation:Boolean(offlineOp?.enabled)}});return json(res,200,response);}catch(e){if(offlineOp?.enabled&&!offlineOp?.duplicate)await rejectOfflineOperation(offlineOp,e.code||'HOMEWORK_SYNC_FAILED').catch(()=>{});return json(res,e.status||500,{error:{code:e.code||'HOMEWORK_SYNC_FAILED',message:e.status?e.message:'Homework sync failed.'}});}}
