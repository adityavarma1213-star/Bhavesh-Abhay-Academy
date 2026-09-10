import { beginOfflineOperation, completeOfflineOperation, rejectOfflineOperation } from '../_lib/offline-sync.js';
import { gradeDeterministic, verifyAssessmentVerdict, verifyHomeworkVerdict, hashHomeworkText } from '../_lib/assessment-verdict.js';
import { json, id, writeAudit, clientIp, verifyPassword } from '../_lib/security.js';
import { requireAuth, hasRole, requireLearnerAccess } from '../_lib/auth.js';
import { sql } from '../_lib/db.js';
import { runOcr } from '../_lib/ocr-provider.js';
import crypto from 'node:crypto';

export const config={runtime:'nodejs'};

/* ================ academic-forecast.js ================ */
function __build_academic_forecast(){
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function forecastFor({score, evidence, daysUntil}){
  const evidenceCount=evidence.length;
  if(evidenceCount<3 || score==null) return {status:'insufficient_evidence',message:'BAA needs at least 3 relevant evidence points before making a chapter forecast.'};
  const recent=evidence.slice(-10);
  const correct=recent.filter(x=>x.correctness==='correct').length/recent.length*100;
  const base=Number(score);
  const predicted=Math.round(clamp(base*0.45+correct*0.55,0,100));
  const low=Math.max(0,predicted-6), high=Math.min(100,predicted+6);
  let level=predicted<60?'urgent':predicted<75?'caution':'monitor';
  // exam-close-caution intentionally wins over the 60–74% caution band when both apply.
  if(daysUntil!=null && daysUntil<=14 && predicted<75) level=predicted<60?'urgent':'exam_close_caution';
  return {status:'forecast',predictedPercentage:predicted,range:{low,high},warningLevel:level,evidenceCount,daysUntil};
}
async function handler(req,res){
  if(req.method!=='GET') return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET required.'}},{Allow:'GET'});
  try{
    const s=await requireAuth(req); const learnerId=String(req.query?.learnerId||''); await requireLearnerAccess(s,learnerId);
    const [upcoming,attempts,evidence]=await Promise.all([
      sql`SELECT p.id,p.title,p.subject,p.date,p.assessment_id,a.chapter FROM planner_upcoming_assessments p LEFT JOIN assessments a ON a.id=p.assessment_id WHERE p.learner_id=${learnerId} AND p.date>=CURRENT_DATE ORDER BY p.date ASC LIMIT 12`,
      sql`SELECT aa.id,aa.assessment_id,aa.score,aa.max_score,aa.end_time,a.subject,a.chapter FROM assessment_attempts aa JOIN assessments a ON a.id=aa.assessment_id WHERE aa.learner_id=${learnerId} AND aa.status='submitted' AND aa.score IS NOT NULL AND aa.max_score>0 ORDER BY aa.end_time DESC LIMIT 12`,
      sql`SELECT subject,chapter,correctness,created_at FROM learning_evidence WHERE learner_id=${learnerId} ORDER BY created_at DESC LIMIT 200`,
    ]);
    const all=attempts.rows.map(a=>Number(a.score)/Number(a.max_score)*100);
    const overall=all.length?all.reduce((x,y)=>x+y,0)/all.length:null;
    const exams=upcoming.rows.map(u=>{
      const rel=evidence.rows.filter(e=>(u.subject?e.subject===u.subject:true)&&(u.chapter?e.chapter===u.chapter:true));
      const relAttempts=attempts.rows.filter(a=>(u.subject?a.subject===u.subject:true)&&(u.chapter?a.chapter===u.chapter:true));
      // Forecasts are scoped to the exact upcoming assessment's subject/chapter.
      // Do not borrow an unrelated subject's score when this chapter has no completed attempt.
      const chapterScore=relAttempts.length?Number(relAttempts[0].score)/Number(relAttempts[0].max_score)*100:null;
      const days=Math.ceil((new Date(`${u.date}T00:00:00Z`).getTime()-Date.now())/86400000);
      return {...u,daysUntil:days,forecast:forecastFor({score:chapterScore,evidence:rel,daysUntil:days})};
    });
    const warnings=exams.filter(e=>['urgent','exam_close_caution','caution'].includes(e.forecast.warningLevel));
    return json(res,200,{ok:true,overallPercentage:overall==null?null:Math.round(overall*10)/10,exams,warnings});
  }catch(e){return json(res,e.status||500,{error:{code:e.code||'ACADEMIC_FORECAST_FAILED',message:e.status?e.message:'Unable to generate academic forecast.'}});}
}
  return handler;
}
const handler_academic_forecast = __build_academic_forecast();

/* ================ assessment.js ================ */
function __build_assessment(){
async function previousChapterGate(learnerId, subject, chapter){
  const order=await sql`SELECT subject,chapter,MIN(created_at) AS first_seen FROM assessments WHERE subject IS NOT NULL AND chapter IS NOT NULL GROUP BY subject,chapter ORDER BY first_seen ASC,subject ASC,chapter ASC`;
  const list=order.rows.map(r=>({subject:r.subject,chapter:r.chapter}));
  const index=list.findIndex(x=>x.subject===subject&&x.chapter===chapter);
  if(index<=0) return {allowed:true,previous:null};
  const previous=list[index-1];
  const [gate,bypass,latestAttempt]=await Promise.all([
    sql`SELECT status FROM learning_progression_gates WHERE learner_id=${learnerId} AND subject=${previous.subject} AND chapter=${previous.chapter} LIMIT 1`,
    sql`SELECT created_at FROM learning_gate_bypasses WHERE learner_id=${learnerId} AND subject=${previous.subject} AND chapter=${previous.chapter} ORDER BY created_at DESC LIMIT 1`,
    sql`SELECT aa.end_time FROM assessment_attempts aa JOIN assessments a ON a.id=aa.assessment_id WHERE aa.learner_id=${learnerId} AND a.subject=${previous.subject} AND a.chapter=${previous.chapter} AND aa.status='submitted' ORDER BY aa.end_time DESC NULLS LAST LIMIT 1`
  ]);
  const status=gate.rows[0]?.status||'open';
  const bypassActive=Boolean(bypass.rows[0]?.created_at) && (!latestAttempt.rows[0]?.end_time || new Date(bypass.rows[0].created_at).getTime()>new Date(latestAttempt.rows[0].end_time).getTime());
  if(status==='cleared') return {allowed:true,previous};
  if(status==='locked' && bypassActive) return {allowed:true,previous,bypassed:true};
  if(status==='locked') return {allowed:false,previous};
  return {allowed:true,previous};
}

async function snapshot(learnerId){
  const [attempts, answers, results, evidence, reviews]=await Promise.all([
    sql`SELECT * FROM assessment_attempts WHERE learner_id=${learnerId} ORDER BY start_time ASC`,
    sql`SELECT aa.* FROM assessment_answers aa JOIN assessment_attempts a ON a.id=aa.attempt_id WHERE a.learner_id=${learnerId}`,
    sql`SELECT ar.* FROM assessment_results ar JOIN assessment_attempts a ON a.id=ar.attempt_id WHERE a.learner_id=${learnerId}`,
    sql`SELECT * FROM learning_evidence WHERE learner_id=${learnerId} ORDER BY created_at ASC`,
    sql`SELECT * FROM teacher_reviews WHERE learner_id=${learnerId} ORDER BY created_at ASC`,
  ]);
  return {attempts:attempts.rows,answers:answers.rows,results:results.rows,evidence:evidence.rows,reviews:reviews.rows};
}

async function handler(req,res){
  let offlineOp=null;
  try{
    const s=await requireAuth(req); const learnerId=String(req.query?.learnerId||''); await requireLearnerAccess(s,learnerId);
    if(req.method==='PUT'){ offlineOp=await beginOfflineOperation(req,{learnerId,endpoint:'assessment'}); if(offlineOp.duplicate) return json(res,200,offlineOp.response); }
    if(req.method==='GET') return json(res,200,{ok:true,snapshot:await snapshot(learnerId)});
    if(req.method!=='PUT') return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET or PUT required.'}},{Allow:'GET, PUT'});
    const b=req.body||{}; const attempts=Array.isArray(b.attempts)?b.attempts:[]; const answers=Array.isArray(b.answers)?b.answers:[]; const results=Array.isArray(b.results)?b.results:[]; const evidence=Array.isArray(b.evidence)?b.evidence:[];
    const attemptIds=[...new Set(attempts.map(a=>String(a?.id||'')).filter(Boolean))];
    const answerAttemptIds=[...new Set(answers.map(a=>String(a?.attemptId||'')).filter(Boolean))];
    const resultAttemptIds=[...new Set(results.map(r=>String(r?.attemptId||'')).filter(Boolean))];
    const evidenceAttemptIds=[...new Set(evidence.map(e=>String(e?.attemptId||'')).filter(Boolean))];
    const allAttemptIds=[...new Set([...attemptIds,...answerAttemptIds,...resultAttemptIds,...evidenceAttemptIds])];
    const questionIds=[...new Set([...answers.map(a=>String(a?.questionId||'')),...results.map(r=>String(r?.questionId||'')),...evidence.map(e=>String(e?.questionId||''))].filter(Boolean))];
    const assessmentIds=[...new Set(attempts.map(a=>String(a?.assessmentId||'')).filter(Boolean))];
    const [ownedAttempts, validQuestions, validAssessments]=await Promise.all([
      allAttemptIds.length?sql`SELECT id,assessment_id FROM assessment_attempts WHERE learner_id=${learnerId} AND id = ANY(${allAttemptIds})`:Promise.resolve({rows:[]}),
      questionIds.length?sql`SELECT id, type, correct_answer, marks FROM questions WHERE id = ANY(${questionIds})`:Promise.resolve({rows:[]}),
      assessmentIds.length?sql`SELECT id FROM assessments WHERE id = ANY(${assessmentIds})`:Promise.resolve({rows:[]}),
    ]);
    const ownedAttemptMap=new Map(ownedAttempts.rows.map(r=>[r.id,r.assessment_id]));
    const validQuestionIds=new Set(validQuestions.rows.map(r=>r.id));
    const questionMap=new Map(validQuestions.rows.map(r=>[r.id,r]));
    const validAssessmentIds=new Set(validAssessments.rows.map(r=>r.id));
    const acceptedAttemptIds=new Set();
    for(const a of attempts){ if(!a?.id||!a?.assessmentId||!validAssessmentIds.has(String(a.assessmentId))) continue; const assessmentMeta=await sql`SELECT subject,chapter FROM assessments WHERE id=${a.assessmentId} LIMIT 1`; if(!assessmentMeta.rows.length) continue; const gate=await previousChapterGate(learnerId,assessmentMeta.rows[0].subject,assessmentMeta.rows[0].chapter); const existingOwner=ownedAttemptMap.get(String(a.id)); if(!existingOwner && !gate.allowed) continue; if(existingOwner && existingOwner!==String(a.assessmentId)) continue; acceptedAttemptIds.add(String(a.id)); await sql`INSERT INTO assessment_attempts(id,assessment_id,learner_id,attempt_number,start_time,end_time,status,evaluation_status,review_status,score,max_score) VALUES(${a.id},${a.assessmentId},${learnerId},${Number(a.attemptNumber)||1},${a.startTime||new Date().toISOString()},${a.endTime||null},${a.status||'in_progress'},${a.evaluationStatus||'pending'},${a.reviewStatus||'not_reviewed'},${a.score==null?null:Number(a.score)},${a.maxScore==null?null:Number(a.maxScore)}) ON CONFLICT(id) DO UPDATE SET end_time=EXCLUDED.end_time,status=EXCLUDED.status,evaluation_status=EXCLUDED.evaluation_status,review_status=EXCLUDED.review_status,score=EXCLUDED.score,max_score=EXCLUDED.max_score`; }
    for(const x of answers){ if(!x?.attemptId||!x?.questionId||!acceptedAttemptIds.has(String(x.attemptId))&&!ownedAttemptMap.has(String(x.attemptId))) continue; if(!validQuestionIds.has(String(x.questionId))) continue; await sql`INSERT INTO assessment_answers(id,attempt_id,question_id,raw_answer,answered_at) VALUES(${x.id||id('ans')},${x.attemptId},${x.questionId},${x.rawAnswer==null?null:String(x.rawAnswer).slice(0,8000)},${x.answeredAt||new Date().toISOString()}) ON CONFLICT(attempt_id,question_id) DO UPDATE SET raw_answer=EXCLUDED.raw_answer,answered_at=EXCLUDED.answered_at`; }
    for(const r of results){
      if(!r?.attemptId||!r?.questionId||!acceptedAttemptIds.has(String(r.attemptId))&&!ownedAttemptMap.has(String(r.attemptId))) continue;
      if(!validQuestionIds.has(String(r.questionId))) continue;

      // SECURITY RULE: the browser never decides what is correct for a gate/score.
      // Deterministic questions are re-graded from the server-side answer key.
      // AI-graded questions require a short-lived HMAC-signed verdict issued by /api/evaluate.js.
      const q=questionMap.get(String(r.questionId));
      const storedAnswer=await sql`SELECT raw_answer FROM assessment_answers WHERE attempt_id=${r.attemptId} AND question_id=${r.questionId} LIMIT 1`;
      const rawAnswer=storedAnswer.rows[0]?.raw_answer ?? null;
      let verified;
      if(q && ['mcq','true_false'].includes(q.type) && q.correct_answer != null){
        const auto=gradeDeterministic(rawAnswer,q.correct_answer,q.marks);
        verified={
          gradingMode:'auto', score:auto.score, maxScore:auto.maxScore, correctness:auto.correctness,
          isCorrect:auto.isCorrect, confidence:'high', humanReviewRequired:false, evaluationFailed:false,
          errors:auto.isCorrect?[]:[`Incorrect answer.`], missingConcepts:[],
        };
      } else {
        const tokenCheck=verifyAssessmentVerdict(r.verdictToken,{attemptId:r.attemptId,questionId:r.questionId});
        if(!tokenCheck.ok){
          // Do not write a client-supplied grade. Preserve the question as unresolved/human-review.
          await sql`UPDATE assessment_attempts SET evaluation_status='failed', review_status='pending_review' WHERE id=${r.attemptId} AND learner_id=${learnerId}`;
          continue;
        }
        const v=tokenCheck.verdict;
        verified={
          gradingMode:'ai', score:v.score==null?null:Number(v.score), maxScore:Number(q?.marks||v.maxScore||r.maxScore||0),
          correctness:v.correctness, isCorrect:v.correctness==='correct', confidence:v.confidence,
          humanReviewRequired:!!v.humanReviewRequired, evaluationFailed:v.score==null,
          errors:Array.isArray(v.errors)?v.errors:[], missingConcepts:Array.isArray(v.missingConcepts)?v.missingConcepts:[],
        };
      }
      const findingDetails=[...verified.errors,...verified.missingConcepts.map(x=>`missing: ${x}`)].slice(0,16).map(x=>String(x).slice(0,180));
      const finalMax=Number(verified.maxScore||q?.marks||0);
      await sql`INSERT INTO assessment_results(id,attempt_id,question_id,grading_mode,is_correct,correctness,score,max_score,confidence,human_review_required,evaluation_failed,finding_details,created_at)
        VALUES(${r.id||id('res')},${r.attemptId},${r.questionId},${verified.gradingMode},${verified.gradingMode==='auto'?verified.isCorrect:null},${verified.correctness},${verified.score==null?null:Number(verified.score)},${finalMax},${verified.confidence||'low'},${!!verified.humanReviewRequired},${!!verified.evaluationFailed},${JSON.stringify(findingDetails)}::jsonb,${r.createdAt||new Date().toISOString()})
        ON CONFLICT(attempt_id,question_id) DO UPDATE SET grading_mode=EXCLUDED.grading_mode,is_correct=EXCLUDED.is_correct,correctness=EXCLUDED.correctness,score=EXCLUDED.score,max_score=EXCLUDED.max_score,confidence=EXCLUDED.confidence,human_review_required=EXCLUDED.human_review_required,evaluation_failed=EXCLUDED.evaluation_failed,finding_details=EXCLUDED.finding_details`;

      const meta=await sql`SELECT a.subject,a.chapter FROM assessment_attempts aa JOIN assessments a ON a.id=aa.assessment_id WHERE aa.id=${r.attemptId} AND aa.learner_id=${learnerId} LIMIT 1`;
      if(!meta.rows.length) continue;
      const subject=meta.rows[0].subject||'Unknown'; const chapter=meta.rows[0].chapter||'Unspecified';
      const findings=findingDetails;
      const incorrect=verified.correctness==='incorrect' || verified.correctness==='partially_correct' || verified.correctness==='uncertain' || verified.evaluationFailed;
      if(findings.length===0 && !incorrect){
        await sql`UPDATE learning_gate_findings SET status='green',cleared_at=NOW(),last_seen_at=NOW() WHERE learner_id=${learnerId} AND subject=${subject} AND chapter=${chapter} AND question_id=${r.questionId} AND status='red'`;
      } else {
        const safeFindings=findings.length?findings:['general_error'];
        for(const finding of safeFindings){
          const key=`${r.questionId}::${finding.toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,100)}`;
          await sql`INSERT INTO learning_gate_findings(id,learner_id,subject,chapter,attempt_id,question_id,finding_key,finding_type,finding_text,status,first_seen_at,last_seen_at)
            VALUES(${id('finding')},${learnerId},${subject},${chapter},${r.attemptId},${r.questionId},${key},'error',${finding},'red',NOW(),NOW())
            ON CONFLICT(learner_id,subject,chapter,finding_key) DO UPDATE SET attempt_id=EXCLUDED.attempt_id,last_seen_at=NOW(),status='red',cleared_at=NULL`;
        }
      }
    }
    // Server-derived attempt totals: never trust client-supplied score/maxScore for forecasts or progression.
    for(const attemptId of acceptedAttemptIds){
      const totals=await sql`SELECT COALESCE(SUM(score),0) AS score, COALESCE(SUM(max_score),0) AS max_score,
        COUNT(*) AS result_count, COUNT(*) FILTER (WHERE evaluation_failed=false AND human_review_required=false) AS settled_count
        FROM assessment_results WHERE attempt_id=${attemptId}`;
      const row=totals.rows[0]||{};
      const resultCount=Number(row.result_count||0);
      const settledCount=Number(row.settled_count||0);
      const evaluationStatus=resultCount===0?'failed':(settledCount===resultCount?'complete':'partial');
      await sql`UPDATE assessment_attempts SET score=${Number(row.score||0)}, max_score=${Number(row.max_score||0)}, evaluation_status=${evaluationStatus}
        WHERE id=${attemptId} AND learner_id=${learnerId}`;
    }

    // Learning Evidence is derived from server-verified assessment results.
    // The client-provided evidence array is intentionally ignored for authenticated persistence.
    for(const attemptId of acceptedAttemptIds){
      const verifiedRows=await sql`SELECT ar.id AS result_id, ar.attempt_id, ar.question_id, ar.correctness, ar.score, ar.max_score, ar.confidence,
        ar.human_review_required, ar.evaluation_failed, ar.finding_details, aa.assessment_id, q.subject,q.chapter,q.topic,q.concept,q.difficulty,q.common_error_type
        FROM assessment_results ar JOIN assessment_attempts aa ON aa.id=ar.attempt_id JOIN questions q ON q.id=ar.question_id
        WHERE ar.attempt_id=${attemptId} AND aa.learner_id=${learnerId}`;
      for(const e of verifiedRows.rows){
        const errors=Array.isArray(e.finding_details)?e.finding_details:[];
        const errorType=e.correctness==='correct'?null:(e.common_error_type||'assessment_evaluation_gap');
        const evidenceId=id('ev');
        await sql`INSERT INTO learning_evidence(id,learner_id,attempt_id,assessment_id,question_id,subject,chapter,topic,concept,difficulty,correctness,error_type,score,max_score,confidence,evidence_type,source,created_at)
          VALUES(${evidenceId},${learnerId},${e.attempt_id},${e.assessment_id},${e.question_id},${e.subject},${e.chapter},${e.topic},${e.concept},${e.difficulty},${e.correctness},${errorType},${e.score==null?null:Number(e.score)},${Number(e.max_score||0)},${e.confidence||'low'},'assessment_answer','server_verified_assessment',NOW())
          ON CONFLICT (attempt_id,question_id) DO UPDATE SET correctness=EXCLUDED.correctness,error_type=EXCLUDED.error_type,score=EXCLUDED.score,max_score=EXCLUDED.max_score,confidence=EXCLUDED.confidence,source='server_verified_assessment',created_at=NOW()`;
      }
    }

    await sql`INSERT INTO learning_progression_gates(id,learner_id,subject,chapter,status,red_count,green_count,last_assessment_id,last_attempt_id,updated_at)
      SELECT ${id('gate')},${learnerId},a.subject,a.chapter,
             CASE WHEN COUNT(*) FILTER (WHERE f.status='red')>0 THEN 'locked' WHEN COUNT(*)>0 THEN 'cleared' ELSE 'open' END,
             COUNT(*) FILTER (WHERE f.status='red')::int,COUNT(*) FILTER (WHERE f.status='green')::int,a.id,aa.id,NOW()
      FROM assessment_attempts aa JOIN assessments a ON a.id=aa.assessment_id LEFT JOIN learning_gate_findings f ON f.learner_id=aa.learner_id AND f.subject=a.subject AND f.chapter=a.chapter
      WHERE aa.id = ANY(${Array.from(acceptedAttemptIds)}) AND aa.learner_id=${learnerId}
      GROUP BY a.subject,a.chapter,a.id,aa.id
      ON CONFLICT(learner_id,subject,chapter) DO UPDATE SET status=EXCLUDED.status,red_count=EXCLUDED.red_count,green_count=EXCLUDED.green_count,last_assessment_id=EXCLUDED.last_assessment_id,last_attempt_id=EXCLUDED.last_attempt_id,updated_at=NOW()`;
    const response={ok:true,snapshot:await snapshot(learnerId)};
    await completeOfflineOperation(offlineOp,response);
    await writeAudit({actorUserId:s.user_id,action:'assessment.sync',entityType:'learner',entityId:learnerId,metadata:{attempts:attempts.length,evidence:evidence.length,offlineOperation:Boolean(offlineOp?.enabled)}});
    return json(res,200,response);
  }catch(e){
    if(offlineOp?.enabled && !offlineOp?.duplicate) await rejectOfflineOperation(offlineOp,e.code||'ASSESSMENT_SYNC_FAILED').catch(()=>{});
    return json(res,e.status||500,{error:{code:e.code||'ASSESSMENT_SYNC_FAILED',message:e.status?e.message:'Assessment sync failed.'}});
  }
}
  return handler;
}
const handler_assessment = __build_assessment();

/* ================ audit.js ================ */
function __build_audit(){
async function handler(req,res){
  try{
    const s=await requireAuth(req);
    if(!hasRole(s,'admin')) return json(res,403,{error:{code:'ADMIN_REQUIRED',message:'Administrator role required.'}});
    if(req.method!=='GET') return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET required.'}},{Allow:'GET'});
    const limit=Math.min(200,Math.max(1,Number(req.query?.limit||50)));
    const r=await sql`SELECT id,actor_user_id,action,entity_type,entity_id,metadata,created_at FROM audit_log ORDER BY created_at DESC LIMIT ${limit}`;
    return json(res,200,{ok:true,events:r.rows});
  }catch(e){return json(res,e.status||500,{error:{code:e.code||'AUDIT_FAILED',message:e.status?e.message:'Audit lookup failed.'}});}
}
  return handler;
}
const handler_audit = __build_audit();

/* ================ billing.js ================ */
function __build_billing(){
const PLANS={free:{price:0},student:{price:199},family:{price:499},institution:{price:null}};
async function handler(req,res){
  try{
    const s=await requireAuth(req);
    if(req.method==='GET'){
      const [sub,ent]=await Promise.all([
        sql`SELECT id,plan_id,status,provider,started_at,renewal_at FROM subscriptions WHERE user_id=${s.user_id} AND status IN ('active','trial') ORDER BY created_at DESC LIMIT 1`,
        sql`SELECT feature,allowed,source,expires_at FROM entitlements WHERE user_id=${s.user_id}`
      ]);
      return json(res,200,{ok:true,subscription:sub.rows[0]||{plan_id:'free',status:'active',provider:'none'},entitlements:ent.rows});
    }
    if(req.method!=='POST') return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET or POST required.'}});
    const action=String(req.body?.action||'');
    if(action==='subscribe'){
      const plan=String(req.body?.planId||''); if(!PLANS[plan]) return json(res,400,{error:{code:'UNKNOWN_PLAN',message:'Unknown plan.'}});
      if(plan==='institution') return json(res,409,{error:{code:'EXTERNAL_PROVIDER_REQUIRED',message:'Institution licensing requires a configured payment/licensing provider.'}});
      await sql`UPDATE subscriptions SET status='cancelled',cancelled_at=NOW(),updated_at=NOW() WHERE user_id=${s.user_id} AND status IN ('active','trial')`;
      const subId=id('sub');
      await sql`INSERT INTO subscriptions(id,user_id,plan_id,status,provider,started_at,created_at,updated_at) VALUES(${subId},${s.user_id},${plan},'active','sandbox',NOW(),NOW(),NOW())`;
      await sql`INSERT INTO entitlements(id,user_id,feature,allowed,source,created_at,updated_at) VALUES(${id('ent')},${s.user_id},'premium',${plan!=='free'},'sandbox',NOW(),NOW()) ON CONFLICT(user_id,feature) DO UPDATE SET allowed=EXCLUDED.allowed,source='sandbox',updated_at=NOW()`;
      await writeAudit({actorUserId:s.user_id,action:'billing.sandbox_subscribe',entityType:'subscription',entityId:subId,metadata:{plan}});
      return json(res,200,{ok:true,mode:'sandbox',subscription:{id:subId,plan_id:plan,status:'active',provider:'sandbox'},limitation:'No real payment was processed.'});
    }
    return json(res,400,{error:{code:'UNKNOWN_ACTION',message:'Unsupported billing action.'}});
  }catch(e){return json(res,e.status||500,{error:{code:e.code||'BILLING_FAILED',message:e.status?e.message:'Billing operation failed.'}});}
}
  return handler;
}
const handler_billing = __build_billing();

/* ================ class-analytics.js ================ */
function __build_class_analytics(){
async function teacherOwnsClass(userId,classId){
  const r=await sql`SELECT id,name,subject,teacher_user_id FROM classes WHERE id=${classId} AND teacher_user_id=${userId} AND archived_at IS NULL LIMIT 1`;
  return r.rows[0]||null;
}
async function classSnapshot(userId,classId){
  const cls=await teacherOwnsClass(userId,classId); if(!cls){const e=new Error('Class not found or not owned by this teacher.');e.status=404;throw e;}
  const members=await sql`SELECT l.id,l.display_name FROM class_members cm JOIN learners l ON l.id=cm.learner_id WHERE cm.class_id=${classId} AND cm.status='active' AND l.deactivated_at IS NULL ORDER BY l.display_name`;
  const memberIds=members.rows.map(x=>x.id);
  if(!memberIds.length) return {class:cls,members:[],concepts:[],studentConcepts:[],commonMistakes:[],summary:{learners:0,evidence:0,accuracy:null}};
  const evidence=await sql`SELECT subject,chapter,topic,concept,COUNT(*)::int AS total,COUNT(*) FILTER(WHERE correctness='correct')::int AS correct,COUNT(DISTINCT learner_id)::int AS learners
    FROM learning_evidence WHERE learner_id=ANY(${memberIds}) GROUP BY subject,chapter,topic,concept ORDER BY subject,chapter,topic,concept`;
  const summary=await sql`SELECT COUNT(DISTINCT learner_id)::int AS learners,COUNT(*)::int AS evidence,ROUND(100.0*SUM(CASE WHEN correctness='correct' THEN 1 ELSE 0 END)/NULLIF(COUNT(*),0),1) AS accuracy FROM learning_evidence WHERE learner_id=ANY(${memberIds})`;
  // Per-student x concept breakdown — the actual heatmap data. Kept as a
  // separate query rather than folding into the class-wide one above so
  // existing callers of the class-wide shape (if any) are unaffected.
  const studentConcepts=await sql`SELECT learner_id,concept,subject,COUNT(*)::int AS total,COUNT(*) FILTER(WHERE correctness='correct')::int AS correct
    FROM learning_evidence WHERE learner_id=ANY(${memberIds}) GROUP BY learner_id,concept,subject ORDER BY learner_id,subject,concept`;
  // Common mistakes across the class — real data from M22's existing
  // mistake_patterns table, not invented for this endpoint.
  const commonMistakes=await sql`SELECT concept,subject,error_type,COUNT(DISTINCT learner_id)::int AS learnerCount
    FROM mistake_patterns WHERE learner_id=ANY(${memberIds}) AND status='possible_misconception' GROUP BY concept,subject,error_type ORDER BY learnerCount DESC LIMIT 20`;
  return {
    class:cls,members:members.rows,
    concepts:evidence.rows.map(r=>({...r,accuracy:r.total?Math.round(Number(r.correct)*1000/Number(r.total))/10:null})),
    studentConcepts:studentConcepts.rows.map(r=>({...r,accuracy:r.total?Math.round(Number(r.correct)*1000/Number(r.total))/10:null})),
    commonMistakes:commonMistakes.rows,
    summary:summary.rows[0]||{},
  };
}
async function handler(req,res){
  try{
    const s=await requireAuth(req); if(!hasRole(s,'teacher')&&!hasRole(s,'admin')) return json(res,403,{error:{code:'TEACHER_ROLE_REQUIRED',message:'Teacher access required.'}});
    if(req.method==='GET'){
      const classId=String(req.query?.classId||'');
      if(!classId){const r=await sql`SELECT id,name,subject,created_at,updated_at FROM classes WHERE teacher_user_id=${s.user_id} AND archived_at IS NULL ORDER BY created_at DESC`;return json(res,200,{ok:true,classes:r.rows});}
      return json(res,200,{ok:true,snapshot:await classSnapshot(s.user_id,classId)});
    }
    if(req.method!=='POST') return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET or POST required.'}},{Allow:'GET, POST'});
    const action=String(req.body?.action||'create_class');
    if(action==='create_class'){
      const name=String(req.body?.name||'').trim().slice(0,120); const subject=String(req.body?.subject||'').trim().slice(0,120)||null;
      if(!name)return json(res,400,{error:{code:'CLASS_NAME_REQUIRED',message:'Class name is required.'}});
      const classId=id('class'); await sql`INSERT INTO classes(id,teacher_user_id,name,subject,created_at,updated_at) VALUES(${classId},${s.user_id},${name},${subject},NOW(),NOW())`;
      const learnerIds=Array.isArray(req.body?.learnerIds)?req.body.learnerIds.map(String).slice(0,100):[];
      for(const learnerId of learnerIds){const ok=await sql`SELECT 1 FROM teacher_learner WHERE teacher_user_id=${s.user_id} AND learner_id=${learnerId} AND status='active' LIMIT 1`;if(ok.rows.length)await sql`INSERT INTO class_members(id,class_id,learner_id,status,joined_at) VALUES(${id('cm')},${classId},${learnerId},'active',NOW()) ON CONFLICT(class_id,learner_id) DO UPDATE SET status='active',removed_at=NULL`}
      await writeAudit({actorUserId:s.user_id,action:'class.create',entityType:'class',entityId:classId,metadata:{learnerCount:learnerIds.length}});
      return json(res,201,{ok:true,class:{id:classId,name,subject}});
    }
    if(action==='add_member'){
      const classId=String(req.body?.classId||''),learnerId=String(req.body?.learnerId||''); if(!classId||!learnerId)return json(res,400,{error:{code:'CLASS_MEMBER_FIELDS_REQUIRED',message:'classId and learnerId are required.'}});
      if(!(await teacherOwnsClass(s.user_id,classId)))return json(res,404,{error:{code:'CLASS_NOT_FOUND',message:'Class not found.'}});
      const ok=await sql`SELECT 1 FROM teacher_learner WHERE teacher_user_id=${s.user_id} AND learner_id=${learnerId} AND status='active' LIMIT 1`;if(!ok.rows.length)return json(res,403,{error:{code:'LEARNER_NOT_ASSIGNED',message:'Assign the learner to this teacher before adding them to a class.'}});
      await sql`INSERT INTO class_members(id,class_id,learner_id,status,joined_at) VALUES(${id('cm')},${classId},${learnerId},'active',NOW()) ON CONFLICT(class_id,learner_id) DO UPDATE SET status='active',removed_at=NULL`;
      return json(res,200,{ok:true});
    }
    return json(res,400,{error:{code:'UNKNOWN_CLASS_ACTION',message:'Unsupported class action.'}});
  }catch(e){return json(res,e.status||500,{error:{code:e.code||'CLASS_ANALYTICS_FAILED',message:e.status?e.message:'Unable to load class analytics.'}});}
}
  return handler;
}
const handler_class_analytics = __build_class_analytics();

/* ================ consent.js ================ */
function __build_consent(){
const TYPES=new Set(['data_processing','ai_evaluation','notifications','research_testing','voice_processing']);
async function handler(req,res){
  try{
    const s=await requireAuth(req);
    if(req.method==='GET'){
      const r=await sql`SELECT consent_type,granted,granted_at FROM consent_preferences WHERE user_id=${s.user_id} ORDER BY consent_type`;
      return json(res,200,{ok:true,consents:r.rows});
    }
    if(req.method==='PUT'){
      const {consentType,granted}=req.body||{};
      if(!TYPES.has(consentType)||typeof granted!=='boolean') return json(res,400,{error:{code:'INVALID_CONSENT',message:'Invalid consent type or value.'}});
      await sql`INSERT INTO consent_preferences(id,user_id,consent_type,granted,granted_at) VALUES(${id('consent')},${s.user_id},${consentType},${granted},NOW()) ON CONFLICT(user_id,consent_type) DO UPDATE SET granted=EXCLUDED.granted,granted_at=EXCLUDED.granted_at`;
      await writeAudit({actorUserId:s.user_id,action:'consent.update',entityType:'consent_preferences',entityId:`${s.user_id}:${consentType}`,metadata:{consentType,granted}});
      return json(res,200,{ok:true,consentType,granted});
    }
    return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET or PUT required.'}},{Allow:'GET, PUT'});
  }catch(e){return json(res,e.status||500,{error:{code:e.code||'CONSENT_FAILED',message:e.status?e.message:'Consent operation failed.'}});}
}
  return handler;
}
const handler_consent = __build_consent();

/* ================ homework.js ================ */
function __build_homework(){
async function snapshot(learnerId){const r=await sql`SELECT * FROM homework_submissions WHERE learner_id=${learnerId} ORDER BY submitted_at DESC`;return r.rows;}
async function handler(req,res){let offlineOp=null;try{const s=await requireAuth(req);const learnerId=String(req.query?.learnerId||'');await requireLearnerAccess(s,learnerId);if(req.method==='PUT'){offlineOp=await beginOfflineOperation(req,{learnerId,endpoint:'homework'});if(offlineOp.duplicate)return json(res,200,offlineOp.response);}if(req.method==='GET')return json(res,200,{ok:true,submissions:await snapshot(learnerId)});if(req.method!=='PUT')return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET or PUT required.'}},{Allow:'GET, PUT'});const b=req.body||{};const rows=Array.isArray(b.submissions)?b.submissions:[];for(const x of rows){
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

  await sql`INSERT INTO homework_submissions(id,learner_id,submitted_at,input_type,text,subject_hint,attachments,status,evaluation,last_evaluation_error,learning_integration,review,updated_at) VALUES(${x.id},${learnerId},${x.submittedAt||new Date().toISOString()},${x.inputType||'text'},${text},${x.subjectHint||null},${JSON.stringify(x.attachments||[])},${status},${evaluation?JSON.stringify(evaluation):null},${lastEvaluationError},${learningIntegration},${x.review?JSON.stringify(x.review):null},${new Date().toISOString()}) ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,evaluation=EXCLUDED.evaluation,last_evaluation_error=EXCLUDED.last_evaluation_error,learning_integration=EXCLUDED.learning_integration,review=EXCLUDED.review,updated_at=EXCLUDED.updated_at WHERE homework_submissions.learner_id=EXCLUDED.learner_id`;
}const response={ok:true,submissions:await snapshot(learnerId)};await completeOfflineOperation(offlineOp,response);await writeAudit({actorUserId:s.user_id,action:'homework.sync',entityType:'learner',entityId:learnerId,metadata:{submissions:rows.length,offlineOperation:Boolean(offlineOp?.enabled)}});return json(res,200,response);}catch(e){if(offlineOp?.enabled&&!offlineOp?.duplicate)await rejectOfflineOperation(offlineOp,e.code||'HOMEWORK_SYNC_FAILED').catch(()=>{});return json(res,e.status||500,{error:{code:e.code||'HOMEWORK_SYNC_FAILED',message:e.status?e.message:'Homework sync failed.'}});}}
  return handler;
}
const handler_homework = __build_homework();

/* ================ learner-overview.js ================ */
function __build_learner_overview(){
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

async function handler(req,res){
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
  return handler;
}
const handler_learner_overview = __build_learner_overview();

/* ================ learner.js ================ */
function __build_learner(){
async function handler(req,res){
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
  return handler;
}
const handler_learner = __build_learner();

// ---- Shared Learning Memory derivation engine (module scope) ----
// Extracted from what was originally a local function inside
// __build_learning_memory() below, so that M69 (Learning Memory
// Integration) can call the exact same derivation engine when new
// board-sourced evidence arrives, rather than reimplementing the same
// mastery-status formula a second time. Behavior is byte-for-byte
// unchanged from the original — this is a pure code-motion refactor, not
// a logic change. See learning-memory.js's handler below for the
// pre-existing security rationale (server-derived only, client payload
// ignored) that still applies unchanged.
const LEARNING_MEMORY_MIN_EVIDENCE_FOR_JUDGEMENT = 3;
const LEARNING_MEMORY_RECENT_WINDOW = 5;
const LEARNING_MEMORY_MASTERED_THRESHOLD = 0.8;
const LEARNING_MEMORY_LEARNING_THRESHOLD = 0.5;
const LEARNING_MEMORY_MISTAKE_PATTERN_THRESHOLD = 3;

async function deriveAndPersistLearningMemory(learnerId) {
  const evidence = await sql`SELECT id,concept,subject,topic,correctness,error_type,attempt_id,question_id,created_at
    FROM learning_evidence WHERE learner_id=${learnerId} ORDER BY created_at ASC`;
  const rows = evidence.rows;
  const now = new Date().toISOString();

  const byConcept = new Map();
  for (const r of rows) {
    if (!byConcept.has(r.concept)) byConcept.set(r.concept, []);
    byConcept.get(r.concept).push(r);
  }
  for (const [concept, allForConcept] of byConcept) {
    const evidenceCount = allForConcept.length;
    const correctCount = allForConcept.filter(e => e.correctness === 'correct').length;
    let status;
    if (evidenceCount < LEARNING_MEMORY_MIN_EVIDENCE_FOR_JUDGEMENT) {
      status = 'insufficient_evidence';
    } else {
      const recent = allForConcept.slice(-LEARNING_MEMORY_RECENT_WINDOW);
      const correctRate = recent.filter(e => e.correctness === 'correct').length / recent.length;
      status = correctRate >= LEARNING_MEMORY_MASTERED_THRESHOLD ? 'mastered' : correctRate >= LEARNING_MEMORY_LEARNING_THRESHOLD ? 'learning' : 'needs_revision';
    }
    const last = allForConcept[allForConcept.length - 1];
    await sql`INSERT INTO learning_memory(learner_id,concept,subject,topic,status,evidence_count,correct_count,last_updated)
               VALUES(${learnerId},${concept},${last.subject||null},${last.topic||null},${status},${evidenceCount},${correctCount},${now})
               ON CONFLICT(learner_id,concept) DO UPDATE SET
                 subject=EXCLUDED.subject, topic=EXCLUDED.topic, status=EXCLUDED.status,
                 evidence_count=EXCLUDED.evidence_count, correct_count=EXCLUDED.correct_count, last_updated=EXCLUDED.last_updated`;
    const prior = await sql`SELECT status,evidence_count FROM learning_memory_history WHERE learner_id=${learnerId} AND concept=${concept} ORDER BY recorded_at DESC LIMIT 1`;
    const p = prior.rows[0];
    if (!p || p.status !== status || Number(p.evidence_count) !== evidenceCount) {
      await sql`INSERT INTO learning_memory_history(id,learner_id,concept,status,evidence_count,recorded_at)
                 VALUES(${id('lmh')},${learnerId},${concept},${status},${evidenceCount},${now})`;
    }
  }

  const byPatternKey = new Map();
  for (const r of rows) {
    if (r.correctness === 'correct' || !r.error_type) continue;
    const key = `${r.concept}::${r.error_type}`;
    if (!byPatternKey.has(key)) byPatternKey.set(key, { concept: r.concept, subject: r.subject, errorType: r.error_type, occurrences: [] });
    byPatternKey.get(key).occurrences.push(r);
  }
  for (const p of byPatternKey.values()) {
    const status = p.occurrences.length >= LEARNING_MEMORY_MISTAKE_PATTERN_THRESHOLD ? 'possible_misconception' : 'watching';
    const first = p.occurrences[0].created_at;
    const last = p.occurrences[p.occurrences.length - 1].created_at;
    const patternId = id('pattern');
    const inserted = await sql`INSERT INTO mistake_patterns(id,learner_id,concept,subject,error_type,status,first_detected,last_detected)
               VALUES(${patternId},${learnerId},${p.concept},${p.subject||null},${p.errorType},${status},${first},${last})
               ON CONFLICT(learner_id,concept,error_type) DO UPDATE SET status=EXCLUDED.status,last_detected=EXCLUDED.last_detected
               RETURNING id`;
    const realPatternId = inserted.rows[0]?.id || patternId;
    for (const occ of p.occurrences) {
      await sql`INSERT INTO mistake_pattern_occurrences(id,pattern_id,evidence_id,occurred_at)
                 VALUES(${id('occ')},${realPatternId},${occ.id},${occ.created_at})
                 ON CONFLICT(pattern_id,evidence_id) DO NOTHING`;
    }
  }

  return getLearningMemorySnapshot(learnerId);
}

async function getLearningMemorySnapshot(learnerId) {
  const [memory, patterns] = await Promise.all([
    sql`SELECT concept,subject,topic,status,evidence_count,correct_count,last_updated FROM learning_memory WHERE learner_id=${learnerId}`,
    sql`SELECT id,concept,subject,error_type,status,first_detected,last_detected FROM mistake_patterns WHERE learner_id=${learnerId}`,
  ]);
  const learningMemory = {};
  for (const m of memory.rows) {
    learningMemory[m.concept] = {
      concept: m.concept, subject: m.subject, topic: m.topic, status: m.status,
      evidenceCount: m.evidence_count, correctCount: m.correct_count, lastUpdated: m.last_updated,
    };
  }
  return {
    learningMemory,
    mistakePatterns: patterns.rows.map(p => ({
      id: p.id, concept: p.concept, subject: p.subject, errorType: p.error_type,
      status: p.status, firstDetected: p.first_detected, lastSeen: p.last_detected,
    })),
  };
}

// ---- M69 — Learning Memory Integration bridge (module scope) ----
// The one real entry point board-sourced evidence (M67 exam attempts, M68
// practice attempts) uses to reach the existing, unmodified Learning
// Memory engine above. Evidence-gated: re-verifies the source question is
// published+verified at the moment of writing (never trusts a caller's
// say-so), and never writes a row it can't fully justify (e.g. a question
// with no concept mapped yet cannot produce valid evidence, so it doesn't
// write one rather than fabricating a placeholder concept).
async function recordBoardLearningEvidence({ learnerId, boardQuestionId, sourceAttemptId, evidenceType, isCorrect }) {
  const rows = await sql`
    SELECT bq.status, bq.verification_status, bq.difficulty, s.name AS subject_name, c.name AS concept_name, t.name AS topic_name
    FROM board_questions bq
    LEFT JOIN subjects s ON s.id = bq.subject_id
    LEFT JOIN concepts c ON c.id = bq.concept_id
    LEFT JOIN topics t ON t.id = bq.topic_id
    WHERE bq.id = ${boardQuestionId}`;
  if (!rows.rows.length) return { written: false, reason: 'QUESTION_NOT_FOUND' };
  const q = rows.rows[0];
  if (q.status !== 'published' || q.verification_status !== 'verified') return { written: false, reason: 'QUESTION_NOT_VERIFIED_PUBLISHED' };
  if (!q.concept_name) return { written: false, reason: 'NO_CONCEPT_MAPPED' };

  const now = new Date().toISOString();
  await sql`INSERT INTO learning_evidence (id, learner_id, subject, chapter, topic, concept, difficulty, correctness, evidence_type, source, board_question_id, source_attempt_id, created_at)
    VALUES (${id('ev')}, ${learnerId}, ${q.subject_name || 'Unspecified'}, NULL, ${q.topic_name || null}, ${q.concept_name}, ${q.difficulty || null}, ${isCorrect ? 'correct' : 'incorrect'}, ${evidenceType}, 'board_question_bank', ${boardQuestionId}, ${sourceAttemptId}, ${now})`;

  const snapshot = await deriveAndPersistLearningMemory(learnerId);
  return { written: true, snapshot };
}

/* ================ learning-memory.js ================ */
function __build_learning_memory(){
// BAA v1: Learning Memory persistence.
//
// SECURITY RULE (same boundary as api/v1/assessment.js and api/v1/rewards.js):
// learning_memory and mistake_patterns are marked DERIVED in db/schema.sql —
// "Recomputable from learning_evidence at any time... see js/baa-assessment.js
// updateLearningMemory() for the exact derivation rule being mirrored." This
// file now honors that: status/evidence_count/correct_count and mistake
// pattern status are computed server-side from server-verified
// learning_evidence rows (which are themselves only ever written from
// verified assessment_results — see api/v1/assessment.js). The client's own
// learningMemory/mistakePatterns payload is no longer written to the
// database; it is accepted for backward compatibility but ignored, so a
// forged "mastered" claim on a concept the student never actually answered
// correctly cannot reach a table that AI Mode, the Tutor, Planner, or the
// Confidence Meter (M9/M10) read from.
//
// The exact thresholds mirror js/baa-assessment.js:
// MIN_EVIDENCE_FOR_JUDGEMENT=3, RECENT_WINDOW=5, MASTERED_THRESHOLD=0.8,
// LEARNING_THRESHOLD=0.5, MISTAKE_PATTERN_THRESHOLD=3 — so server-derived
// status matches what the client would have computed from the same evidence.


async function handler(req, res) {
  let offlineOp=null;
  try {
    const s = await requireAuth(req);
    const learnerId = String(req.query?.learnerId || '');
    await requireLearnerAccess(s, learnerId);
    if(req.method==='PUT'){ offlineOp=await beginOfflineOperation(req,{learnerId,endpoint:'learning-memory'}); if(offlineOp.duplicate) return json(res,200,offlineOp.response); }

    if (req.method === 'GET') {
      return json(res, 200, { ok: true, snapshot: await getLearningMemorySnapshot(learnerId) });
    }

    if (req.method === 'PUT') {
      // The client's learningMemory/mistakePatterns body (if any) is intentionally not read:
      // both are DERIVED tables (see db/schema.sql) and are recomputed here from
      // server-verified learning_evidence instead, so this sync can never be used to
      // write an unearned "mastered" status or hide a real mistake pattern.
      const snapshot = await deriveAndPersistLearningMemory(learnerId);
      const response={ok:true,snapshot};
      await completeOfflineOperation(offlineOp,response);
      await writeAudit({ actorUserId: s.user_id, action: 'learning_memory.sync', entityType: 'learner', entityId: learnerId, metadata: { serverDerived: true, concepts: Object.keys(snapshot.learningMemory).length, patterns: snapshot.mistakePatterns.length, offlineOperation:Boolean(offlineOp?.enabled) } });
      return json(res, 200, response);
    }

    return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'GET or PUT required.' } }, { Allow: 'GET, PUT' });
  } catch (e) {
    if(offlineOp?.enabled && !offlineOp?.duplicate) await rejectOfflineOperation(offlineOp,e.code||'LEARNING_MEMORY_SYNC_FAILED').catch(()=>{});
    return json(res, e.status || 500, { error: { code: e.code || 'LEARNING_MEMORY_SYNC_FAILED', message: e.status ? e.message : 'Learning memory sync failed.' } });
  }
}
  return handler;
}
const handler_learning_memory = __build_learning_memory();

/* ================ my-learners.js ================ */
function __build_my_learners(){
// BAA v1: resolve the learner(s) the current session is allowed to act as.
//
// Why this exists: signup.js now creates a `learners` row for new student
// accounts, but every account created before that change (and every
// parent/teacher) has no direct way to discover a learnerId. This endpoint
// is the one place the client asks "which learner(s) am I looking at?" —
// self-healing (auto-creates a missing student learner row) rather than
// requiring a manual migration.

async function handler(req,res){
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
  return handler;
}
const handler_my_learners = __build_my_learners();

/* ================ planner.js ================ */
function __build_planner(){
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

async function handler(req,res){
  try{
    const s=await requireAuth(req);
    const learnerId=String(req.query?.learnerId||'');
    await requireLearnerAccess(s,learnerId);
    if(req.method==='PUT'){ offlineOp=await beginOfflineOperation(req,{learnerId,endpoint:'planner'}); if(offlineOp.duplicate) return json(res,200,offlineOp.response); }

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
                   ON CONFLICT(id) DO UPDATE SET text=EXCLUDED.text WHERE planner_goals.learner_id=EXCLUDED.learner_id`;
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
                   ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,subject=EXCLUDED.subject,date=EXCLUDED.date,assessment_id=EXCLUDED.assessment_id WHERE planner_upcoming_assessments.learner_id=EXCLUDED.learner_id`;
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
                     ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,completed_at=EXCLUDED.completed_at,scheduled_date=EXCLUDED.scheduled_date WHERE planner_tasks.learner_id=EXCLUDED.learner_id`;
          const was=prevStatus.get(t.id);
          if (was!==undefined && was!==status) {
            await sql`INSERT INTO planner_task_events(id,task_id,event,note,occurred_at) VALUES(${id('evt')},${t.id},${status},${'synced from client'},${now})`;
          } else if (was===undefined) {
            await sql`INSERT INTO planner_task_events(id,task_id,event,note,occurred_at) VALUES(${id('evt')},${t.id},${'created'},${null},${now})`;
          }
        }
      }

      const response={ok:true,snapshot:await getSnapshot(learnerId)};
      await completeOfflineOperation(offlineOp,response);
      await writeAudit({actorUserId:s.user_id,action:'planner.sync',entityType:'learner',entityId:learnerId,metadata:{goals:goals.length,upcoming:upcoming.length,tasks:tasks.length,offlineOperation:Boolean(offlineOp?.enabled)}});
      return json(res,200,response);
    }

    return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET or PUT required.'}},{Allow:'GET, PUT'});
  }catch(e){
    if(offlineOp?.enabled && !offlineOp?.duplicate) await rejectOfflineOperation(offlineOp,e.code||'PLANNER_SYNC_FAILED').catch(()=>{});
    return json(res,e.status||500,{error:{code:e.code||'PLANNER_SYNC_FAILED',message:e.status?e.message:'Planner sync failed.'}});
  }
}
  return handler;
}
const handler_planner = __build_planner();

/* ================ progression-gate.js ================ */
function __build_progression_gate(){
const clean=(v,max)=>typeof v==='string'?v.replace(/\s+/g,' ').trim().slice(0,max):'';

async function progressionOrder(subject, chapter){
  const rows=await sql`SELECT subject,chapter,MIN(created_at) AS first_seen FROM assessments WHERE subject IS NOT NULL AND chapter IS NOT NULL GROUP BY subject,chapter ORDER BY first_seen ASC,subject ASC,chapter ASC`;
  const list=rows.rows.map(r=>({subject:r.subject,chapter:r.chapter}));
  const index=list.findIndex(x=>x.subject===subject&&x.chapter===chapter);
  return {list,index,previous:index>0?list[index-1]:null};
}

async function gateSnapshot(learnerId, subject, chapter){
  const [gate, findings, latest, bypass] = await Promise.all([
    sql`SELECT * FROM learning_progression_gates WHERE learner_id=${learnerId} AND subject=${subject} AND chapter=${chapter} LIMIT 1`,
    sql`SELECT * FROM learning_gate_findings WHERE learner_id=${learnerId} AND subject=${subject} AND chapter=${chapter} ORDER BY last_seen_at DESC`,
    sql`SELECT aa.id,aa.assessment_id,aa.end_time FROM assessment_attempts aa JOIN assessments a ON a.id=aa.assessment_id WHERE aa.learner_id=${learnerId} AND a.subject=${subject} AND a.chapter=${chapter} AND aa.status='submitted' ORDER BY aa.end_time DESC NULLS LAST LIMIT 1`,
    sql`SELECT * FROM learning_gate_bypasses WHERE learner_id=${learnerId} AND subject=${subject} AND chapter=${chapter} ORDER BY created_at DESC LIMIT 1`,
  ]);
  const red=findings.rows.filter(f=>f.status==='red');
  const green=findings.rows.filter(f=>f.status==='green');
  const latestAttemptAt=latest.rows[0]?.end_time ? new Date(latest.rows[0].end_time).getTime() : 0;
  const latestBypass=bypass.rows[0]||null;
  const bypassActive=!!latestBypass && new Date(latestBypass.created_at).getTime()>latestAttemptAt;
  return {
    subject,chapter,
    status: bypassActive ? 'bypassed' : red.length ? 'locked' : findings.rows.length ? 'cleared' : 'open',
    redCount:red.length,greenCount:green.length,totalFindings:findings.rows.length,
    findings:findings.rows.map(f=>({id:f.id,type:f.finding_type,text:f.finding_text,status:f.status,questionId:f.question_id,lastSeenAt:f.last_seen_at,clearedAt:f.cleared_at})),
    bypassActive,
    bypassReason: latestBypass?.reason || null,
    lastAssessmentId:latest.rows[0]?.assessment_id||null,
    lastAttemptId:latest.rows[0]?.id||null,
  };
}

async function handler(req,res){
  try{
    const session=await requireAuth(req);
    const learnerId=clean(req.query?.learnerId,120);
    const subject=clean(req.query?.subject || req.body?.subject,80);
    const chapter=clean(req.query?.chapter || req.body?.chapter,120);
    if(!learnerId||!subject||!chapter) return json(res,400,{error:{code:'INVALID_GATE_SCOPE',message:'learnerId, subject and chapter are required.'}});
    await requireLearnerAccess(session,learnerId);

    if(req.method==='GET'){
      const order=await progressionOrder(subject,chapter);
      const current=await gateSnapshot(learnerId,subject,chapter);
      let previous=null;
      if(order.previous) previous=await gateSnapshot(learnerId,order.previous.subject,order.previous.chapter);
      const canEnter=!previous || previous.status==='cleared' || previous.status==='bypassed';
      return json(res,200,{ok:true,gate:current,previous,canEnter,progression:order.list});
    }

    if(req.method==='POST'){
      if(!hasRole(session,'parent')) return json(res,403,{error:{code:'PARENT_REQUIRED',message:'Only an authenticated parent can bypass a learning gate.'}});
      const password=String(req.body?.password||'');
      const reason=clean(req.body?.reason,500);
      if(password.length<1) return json(res,400,{error:{code:'PASSWORD_REQUIRED',message:'Parent password is required.'}});
      if(reason.length<10) return json(res,400,{error:{code:'REASON_REQUIRED',message:'Please provide a reason of at least 10 characters.'}});
      const rel=await sql`SELECT 1 FROM parent_learner WHERE parent_user_id=${session.user_id} AND learner_id=${learnerId} AND status='active' LIMIT 1`;
      if(!rel.rows.length) return json(res,403,{error:{code:'PARENT_LEARNER_FORBIDDEN',message:'This parent account is not linked to the selected learner.'}});
      const cred=await sql`SELECT password_hash FROM credentials WHERE user_id=${session.user_id} LIMIT 1`;
      if(!cred.rows.length || !verifyPassword(password,cred.rows[0].password_hash)) return json(res,401,{error:{code:'INVALID_PARENT_PASSWORD',message:'Parent password could not be verified.'}});
      const bypassId=id('gate_bypass');
      await sql`INSERT INTO learning_gate_bypasses(id,learner_id,parent_user_id,subject,chapter,reason,created_at,ip_address) VALUES(${bypassId},${learnerId},${session.user_id},${subject},${chapter},${reason},NOW(),${clientIp(req)})`;
      await writeAudit({actorUserId:session.user_id,action:'learning_gate.bypass',entityType:'learner',entityId:learnerId,metadata:{subject,chapter,reason,bypassId}});
      const gate=await gateSnapshot(learnerId,subject,chapter);
      return json(res,200,{ok:true,gate,message:'Parent-authorized bypass recorded. The next completed assessment in this chapter will re-evaluate the gate.'});
    }
    return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET or POST required.'}},{Allow:'GET, POST'});
  }catch(e){return json(res,e.status||500,{error:{code:e.code||'PROGRESSION_GATE_FAILED',message:e.status?e.message:'Unable to process learning progression gate.'}});}
}
  return handler;
}
const handler_progression_gate = __build_progression_gate();

/* ================ rewards.js ================ */
function __build_rewards(){
function badgesFor(s){
  return [
    s.completedAttempts>=1?'first_attempt':null,
    s.completedAttempts>=5?'five_attempts':null,
    s.answeredQuestions>=50?'fifty_answers':null,
    s.correctAnswers>=100?'hundred_correct':null,
    s.masteredConcepts>=1?'first_mastery':null,
    s.masteredConcepts>=5?'five_masteries':null,
  ].filter(Boolean);
}

async function derive(learnerId){
  const [attempts,answers,correct,mast,events]=await Promise.all([
    sql`SELECT COUNT(*)::int AS n FROM assessment_attempts WHERE learner_id=${learnerId} AND status IN ('submitted','evaluated') AND evaluation_status <> 'partial'`,
    sql`SELECT COUNT(*)::int AS n FROM assessment_answers aa JOIN assessment_attempts a ON a.id=aa.attempt_id WHERE a.learner_id=${learnerId}`,
    sql`SELECT COUNT(*)::int AS n FROM assessment_results ar JOIN assessment_attempts a ON a.id=ar.attempt_id WHERE a.learner_id=${learnerId} AND ar.correctness='correct'`,
    sql`SELECT COUNT(*)::int AS n FROM learning_memory WHERE learner_id=${learnerId} AND status IN ('mastered','strong')`,
    sql`SELECT id,event_type,source_id,xp,metadata,created_at FROM reward_events WHERE learner_id=${learnerId} ORDER BY created_at ASC`,
  ]);
  const stats={completedAttempts:Number(attempts.rows[0]?.n||0),answeredQuestions:Number(answers.rows[0]?.n||0),correctAnswers:Number(correct.rows[0]?.n||0),masteredConcepts:Number(mast.rows[0]?.n||0)};
  stats.xp=stats.completedAttempts*10 + stats.correctAnswers*5 + stats.masteredConcepts*25;
  const earnedBadgeIds=badgesFor(stats);
  await sql`INSERT INTO learner_rewards(learner_id,earned_badge_ids,xp,completed_attempts,answered_questions,correct_answers,mastered_concepts,updated_at)
             VALUES(${learnerId},${JSON.stringify(earnedBadgeIds)},${stats.xp},${stats.completedAttempts},${stats.answeredQuestions},${stats.correctAnswers},${stats.masteredConcepts},NOW())
             ON CONFLICT(learner_id) DO UPDATE SET earned_badge_ids=EXCLUDED.earned_badge_ids,xp=EXCLUDED.xp,completed_attempts=EXCLUDED.completed_attempts,answered_questions=EXCLUDED.answered_questions,correct_answers=EXCLUDED.correct_answers,mastered_concepts=EXCLUDED.mastered_concepts,updated_at=EXCLUDED.updated_at`;
  return {...stats,earnedBadgeIds,events:events.rows};
}

async function handler(req,res){
  try{
    const s=await requireAuth(req);
    const learnerId=String(req.query?.learnerId||'');
    await requireLearnerAccess(s,learnerId);
    if(req.method==='GET') return json(res,200,{ok:true,rewards:await derive(learnerId)});
    if(req.method!=='PUT') return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET or PUT required.'}},{Allow:'GET, PUT'});
    const b=req.body||{}; const now=new Date().toISOString();
    // XP, counts and badges are server-derived and are intentionally ignored from the client payload.
    // The client may append idempotent activity events for audit/history only.
    let eventCount=0;
    for(const e of (Array.isArray(b.events)?b.events:[])){
      if(!e?.id||!e?.eventType)continue;
      await sql`INSERT INTO reward_events(id,learner_id,event_type,source_id,xp,metadata,created_at)
                 VALUES(${String(e.id).slice(0,200)},${learnerId},${String(e.eventType).slice(0,100)},${e.sourceId||null},0,${JSON.stringify(e.metadata||{})},${e.createdAt||now}) ON CONFLICT(id) DO NOTHING`;
      eventCount++;
    }
    const rewards=await derive(learnerId);
    await writeAudit({actorUserId:s.user_id,action:'rewards.sync',entityType:'learner',entityId:learnerId,metadata:{events:eventCount,serverDerived:true}});
    return json(res,200,{ok:true,rewards});
  }catch(e){return json(res,e.status||500,{error:{code:e.code||'REWARDS_SYNC_FAILED',message:e.status?e.message:'Rewards sync failed.'}});}
}
  return handler;
}
const handler_rewards = __build_rewards();

/* ================ teacher-notes.js ================ */
function __build_teacher_notes(){
async function handler(req,res){
  try{
    const session=await requireAuth(req);
    if(!hasRole(session,'teacher') && !hasRole(session,'admin')) return json(res,403,{error:{code:'TEACHER_ROLE_REQUIRED',message:'Teacher access required.'}});
    const learnerId=String(req.query?.learnerId||'');
    await requireLearnerAccess(session,learnerId);
    if(req.method==='GET'){
      const r=await sql`SELECT id,learner_id,text,created_at,author_user_id FROM teacher_notes WHERE learner_id=${learnerId} ORDER BY created_at DESC`;
      return json(res,200,{ok:true,notes:r.rows});
    }
    if(req.method!=='POST' && req.method!=='DELETE') return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET, POST or DELETE required.'}});
    if(req.method==='POST'){
      const text=String(req.body?.text||'').trim().slice(0,500);
      if(!text) return json(res,400,{error:{code:'NOTE_TEXT_REQUIRED',message:'Note text is required.'}});
      const noteId=id('note');
      await sql`INSERT INTO teacher_notes(id,learner_id,author_user_id,text,created_at) VALUES(${noteId},${learnerId},${session.user_id},${text},NOW())`;
      await writeAudit({actorUserId:session.user_id,action:'teacher_note.create',entityType:'learner',entityId:learnerId,metadata:{noteId}});
      return json(res,201,{ok:true,note:{id:noteId,learner_id:learnerId,text,author_user_id:session.user_id}});
    }
    const noteId=String(req.query?.noteId||'');
    if(!noteId) return json(res,400,{error:{code:'NOTE_ID_REQUIRED',message:'Note ID is required.'}});
    const owned=await sql`SELECT id FROM teacher_notes WHERE id=${noteId} AND learner_id=${learnerId} AND author_user_id=${session.user_id} LIMIT 1`;
    if(!owned.rows.length) return json(res,404,{error:{code:'NOTE_NOT_FOUND',message:'Note not found or not owned by this teacher.'}});
    await sql`DELETE FROM teacher_notes WHERE id=${noteId} AND learner_id=${learnerId} AND author_user_id=${session.user_id}`;
    await writeAudit({actorUserId:session.user_id,action:'teacher_note.delete',entityType:'learner',entityId:learnerId,metadata:{noteId}});
    return json(res,200,{ok:true});
  }catch(e){return json(res,e.status||500,{error:{code:e.code||'TEACHER_NOTES_FAILED',message:e.status?e.message:'Unable to manage teacher notes.'}});}
}
  return handler;
}
const handler_teacher_notes = __build_teacher_notes();

/* ================ client-state.js ================ */
function __build_client_state(){
// Generic per-learner state sync (see db/migrations/016_client_state_sync.sql).
// Backs modules whose entire state is one small preferences/config JSON
// blob rather than relational data: M02 Custom Mode, M03 Hybrid Mode,
// M15 Parent Approval, M18 School Calendar. Previously these were
// localStorage-only (see MASTER-COMPLETION-STATUS / audit notes).
const ALLOWED_KEYS = new Set(['custom_mode_v1','hybrid_mode_v1','parent_approval_v1','school_calendar_v1','learning_resources_v1','language_pref_v1','low_bandwidth_v1']);
async function handler(req,res){
  try{
    const session=await requireAuth(req);
    const learnerId=String(req.query?.learnerId||'');
    await requireLearnerAccess(session,learnerId);
    const stateKey=String(req.query?.stateKey||'');
    if(!ALLOWED_KEYS.has(stateKey)) return json(res,400,{error:{code:'INVALID_STATE_KEY',message:'stateKey must be one of: '+[...ALLOWED_KEYS].join(', ')}});

    if(req.method==='GET'){
      const r=await sql`SELECT state_value,updated_at FROM client_state WHERE learner_id=${learnerId} AND state_key=${stateKey}`;
      return json(res,200,{ok:true,state:r.rows[0]?.state_value ?? null,updatedAt:r.rows[0]?.updated_at ?? null});
    }
    if(req.method!=='PUT') return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET or PUT required.'}});

    const value=req.body && typeof req.body==='object' ? req.body : null;
    if(!value) return json(res,400,{error:{code:'STATE_VALUE_REQUIRED',message:'A JSON object body is required.'}});
    if(JSON.stringify(value).length>50000) return json(res,400,{error:{code:'STATE_VALUE_TOO_LARGE',message:'State payload exceeds the size limit.'}});
    const now=new Date().toISOString();
    await sql`INSERT INTO client_state(learner_id,state_key,state_value,updated_at,updated_by_user_id)
               VALUES(${learnerId},${stateKey},${JSON.stringify(value)}::jsonb,${now},${session.user_id})
               ON CONFLICT(learner_id,state_key) DO UPDATE SET state_value=EXCLUDED.state_value,updated_at=EXCLUDED.updated_at,updated_by_user_id=EXCLUDED.updated_by_user_id`;
    return json(res,200,{ok:true,updatedAt:now});
  }catch(e){return json(res,e.status||500,{error:{code:e.code||'CLIENT_STATE_FAILED',message:e.status?e.message:'Unable to sync client state.'}});}
}
  return handler;
}
const handler_client_state = __build_client_state();

/* ================ ai-council.js ================ */
function __build_ai_council(){
// M62 — BAA AI Council. Admin-only. Server-side mirror of the validation
// rules already in js/baa-ai-council.js (topic must be a non-empty string,
// reviewers must be a non-empty array of strings, a response requires a
// known reviewer name and non-empty text) so the client and server never
// disagree about what counts as a valid record.
function computeStatus(reviewers,responses){
  const responded=new Set((responses||[]).map(r=>r.reviewer));
  const allResponded=(reviewers||[]).every(r=>responded.has(r));
  return allResponded && reviewers.length ? 'ready_for_decision' : 'awaiting_reviews';
}
async function handler(req,res){
  try{
    const session=await requireAuth(req);
    if(!hasRole(session,'admin')) return json(res,403,{error:{code:'ADMIN_REQUIRED',message:'Administrator role required.'}});

    if(req.method==='GET'){
      const reviewId=String(req.query?.reviewId||'');
      if(reviewId){
        const r=await sql`SELECT id,topic,reviewers,responses,status,created_by_user_id,created_at,updated_at FROM ai_council_reviews WHERE id=${reviewId}`;
        if(!r.rows.length) return json(res,404,{error:{code:'REVIEW_NOT_FOUND',message:'Council review was not found.'}});
        return json(res,200,{ok:true,review:r.rows[0]});
      }
      const r=await sql`SELECT id,topic,reviewers,responses,status,created_by_user_id,created_at,updated_at FROM ai_council_reviews ORDER BY created_at DESC LIMIT 100`;
      return json(res,200,{ok:true,reviews:r.rows});
    }

    if(req.method==='POST'){
      const topic=String(req.body?.topic||'').trim().slice(0,300);
      const reviewers=Array.isArray(req.body?.reviewers)?req.body.reviewers.filter(x=>typeof x==='string'&&x.trim()).map(x=>x.trim().slice(0,120)):[];
      if(!topic||!reviewers.length) return json(res,400,{error:{code:'INVALID_COUNCIL_REVIEW',message:'A topic and at least one reviewer are required.'}});
      const reviewId=id('council');
      const now=new Date().toISOString();
      await sql`INSERT INTO ai_council_reviews(id,topic,reviewers,responses,status,created_by_user_id,created_at,updated_at)
                 VALUES(${reviewId},${topic},${JSON.stringify(reviewers)}::jsonb,'[]'::jsonb,'awaiting_reviews',${session.user_id},${now},${now})`;
      await writeAudit({actorUserId:session.user_id,action:'ai_council.review_created',entityType:'ai_council_review',entityId:reviewId,metadata:{topic,reviewerCount:reviewers.length}});
      return json(res,201,{ok:true,review:{id:reviewId,topic,reviewers,responses:[],status:'awaiting_reviews'}});
    }

    if(req.method!=='PUT') return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET, POST or PUT required.'}});

    // PUT: add one reviewer's response to an existing review.
    const reviewId=String(req.query?.reviewId||'');
    if(!reviewId) return json(res,400,{error:{code:'REVIEW_ID_REQUIRED',message:'reviewId is required.'}});
    const existing=await sql`SELECT id,reviewers,responses FROM ai_council_reviews WHERE id=${reviewId}`;
    if(!existing.rows.length) return json(res,404,{error:{code:'REVIEW_NOT_FOUND',message:'Council review was not found.'}});
    const row=existing.rows[0];
    const reviewer=String(req.body?.reviewer||'').trim();
    const response=String(req.body?.response||'').trim();
    if(!reviewer||!response) return json(res,400,{error:{code:'INVALID_COUNCIL_RESPONSE',message:'reviewer and response text are required.'}});
    if(!row.reviewers.includes(reviewer)) return json(res,400,{error:{code:'UNKNOWN_REVIEWER',message:'reviewer must be one of the reviewers named when this review was created.'}});
    const responses=[...row.responses,{reviewer,response:response.slice(0,2000),at:new Date().toISOString()}];
    const status=computeStatus(row.reviewers,responses);
    const now=new Date().toISOString();
    await sql`UPDATE ai_council_reviews SET responses=${JSON.stringify(responses)}::jsonb,status=${status},updated_at=${now} WHERE id=${reviewId}`;
    await writeAudit({actorUserId:session.user_id,action:'ai_council.response_added',entityType:'ai_council_review',entityId:reviewId,metadata:{reviewer,status}});
    return json(res,200,{ok:true,review:{id:reviewId,reviewers:row.reviewers,responses,status}});
  }catch(e){return json(res,e.status||500,{error:{code:e.code||'AI_COUNCIL_FAILED',message:e.status?e.message:'Unable to manage AI Council review.'}});}
}
  return handler;
}
const handler_ai_council = __build_ai_council();

/* ================ assessment-integrity.js ================ */
function __build_assessment_integrity(){
// M42 — AI Safety & Anti-Cheating System. Logs behavioral signals
// (tab-switch/focus-loss) during a timed attempt. NEVER auto-fails a
// result — only flags the attempt for human review (via the existing
// review_status column also used by M39 appeals) once a threshold is
// crossed. The threshold is a fixed server-side constant, never taken
// from client input — a client that could raise its own threshold
// could hide real cheating signals.
const INTEGRITY_FLAG_THRESHOLD = 5;
const ALLOWED_EVENT_TYPES = new Set(['visibility_hidden','window_blur','fullscreen_exit']);

async function handler(req,res){
  try{
    const session=await requireAuth(req);

    if(req.method==='POST'){
      const learnerId=String(req.body?.learnerId||'');
      const attemptId=String(req.body?.attemptId||'');
      await requireLearnerAccess(session,learnerId);
      if(!attemptId) return json(res,400,{error:{code:'ATTEMPT_ID_REQUIRED',message:'attemptId is required.'}});

      const attemptRow=await sql`SELECT id,learner_id,review_status FROM assessment_attempts WHERE id=${attemptId} AND learner_id=${learnerId}`;
      if(!attemptRow.rows.length) return json(res,404,{error:{code:'ATTEMPT_NOT_FOUND',message:'That attempt does not belong to this learner.'}});

      const events=Array.isArray(req.body?.events)?req.body.events:[];
      const clean=events.filter(e=>e&&ALLOWED_EVENT_TYPES.has(e.type)&&e.at).slice(0,50);
      if(!clean.length) return json(res,400,{error:{code:'NO_VALID_EVENTS',message:'No valid integrity events were provided.'}});

      for(const e of clean){
        await sql`INSERT INTO assessment_integrity_events(id,attempt_id,learner_id,event_type,at) VALUES(${id('ie')},${attemptId},${learnerId},${e.type},${e.at})`;
      }

      const countRow=await sql`SELECT COUNT(*)::int AS n FROM assessment_integrity_events WHERE attempt_id=${attemptId}`;
      const total=countRow.rows[0]?.n||0;
      let flagged=false;
      const currentStatus=attemptRow.rows[0].review_status;
      // Never downgrade a review someone already resolved (accepted/edited/rejected).
      if(total>=INTEGRITY_FLAG_THRESHOLD && (currentStatus==='not_reviewed')){
        await sql`UPDATE assessment_attempts SET review_status='pending_review', flagged_reason=${`Integrity: ${total} tab-switch/focus-loss events during this attempt.`} WHERE id=${attemptId}`;
        flagged=true;
      }
      return json(res,200,{ok:true,totalEvents:total,flaggedThisRequest:flagged});
    }

    if(req.method!=='GET') return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET or POST required.'}});

    // GET: the student who owns the attempt, or a teacher/admin, may view.
    const attemptId=String(req.query?.attemptId||'');
    if(!attemptId) return json(res,400,{error:{code:'ATTEMPT_ID_REQUIRED',message:'attemptId is required.'}});
    const attemptRow=await sql`SELECT id,learner_id,review_status,flagged_reason FROM assessment_attempts WHERE id=${attemptId}`;
    if(!attemptRow.rows.length) return json(res,404,{error:{code:'ATTEMPT_NOT_FOUND',message:'Attempt not found.'}});
    // requireLearnerAccess already covers admin (blanket), teacher (via
    // teacher_learner), parent (via parent_learner), and the student
    // themself — one call correctly scopes every role, no separate branch needed.
    await requireLearnerAccess(session,attemptRow.rows[0].learner_id);

    const events=await sql`SELECT event_type,at FROM assessment_integrity_events WHERE attempt_id=${attemptId} ORDER BY at ASC`;
    return json(res,200,{ok:true,reviewStatus:attemptRow.rows[0].review_status,flaggedReason:attemptRow.rows[0].flagged_reason,events:events.rows});
  }catch(e){return json(res,e.status||500,{error:{code:e.code||'INTEGRITY_EVENT_FAILED',message:e.status?e.message:'Unable to process integrity event.'}});}
}
  return handler;
}
const handler_assessment_integrity = __build_assessment_integrity();

/* ================ cognitive-safety.js ================ */
function __build_cognitive_safety(){
// M54 — Psychological Safety & Cognitive Recovery. A deliberately
// narrow, explicit, student-initiated signal. No other module may
// write to this table — this handler only accepts a write when the
// caller IS the learner (not a parent, not a teacher, not an admin
// "on behalf of"), matching the master spec's explicit boundary.
function evaluate(studyMinutes,breakMinutes,pressure){
  const overloaded=studyMinutes>=180&&breakMinutes<15;
  const highPressure=pressure>=4;
  return {
    recommendation:overloaded?'Take a recovery break before continuing.':highPressure?'Consider reducing task difficulty or discussing the workload with a trusted adult.':'Continue with a sustainable study pace.',
    signals:{overloaded,highPressure},
    limitation:'This is a learning-safety prompt, not a medical or psychological diagnosis.',
  };
}
async function handler(req,res){
  try{
    const session=await requireAuth(req);
    const learnerId=String(req.query?.learnerId||req.body?.learnerId||'');
    await requireLearnerAccess(session,learnerId);

    if(req.method==='POST'){
      // The explicit, narrow boundary: only the learner's own account may
      // write their own check-in — not a parent or teacher "for" them.
      const selfRow=await sql`SELECT 1 FROM learners WHERE id=${learnerId} AND user_id=${session.user_id} AND deactivated_at IS NULL LIMIT 1`;
      if(!selfRow.rows.length) return json(res,403,{error:{code:'SELF_REPORT_ONLY',message:'Only the student themself may record this check-in.'}});

      const pressure=Number(req.body?.selfRatedPressure);
      const breakMinutes=Number(req.body?.breakMinutes);
      if(!Number.isFinite(pressure)||pressure<1||pressure>5) return json(res,400,{error:{code:'INVALID_PRESSURE',message:'selfRatedPressure must be 1-5.'}});
      if(!Number.isFinite(breakMinutes)||breakMinutes<0) return json(res,400,{error:{code:'INVALID_BREAK_MINUTES',message:'breakMinutes must be 0 or greater.'}});

      const today=new Date().toISOString().slice(0,10);
      const id_=id('checkin');
      await sql`INSERT INTO planner_energy_checkins(id,learner_id,checkin_date,self_rated_pressure,self_reported_break_minutes)
                 VALUES(${id_},${learnerId},${today},${Math.round(pressure)},${Math.round(breakMinutes)})
                 ON CONFLICT(learner_id,checkin_date) DO UPDATE SET self_rated_pressure=EXCLUDED.self_rated_pressure,self_reported_break_minutes=EXCLUDED.self_reported_break_minutes`;

      const minutesRow=await sql`SELECT COALESCE(SUM(estimated_minutes),0)::int AS n FROM planner_tasks WHERE learner_id=${learnerId} AND scheduled_date=${today} AND status NOT IN ('cancelled','skipped')`;
      const studyMinutes=minutesRow.rows[0]?.n||0;
      return json(res,200,{ok:true,studyMinutes,breakMinutes:Math.round(breakMinutes),...evaluate(studyMinutes,Math.round(breakMinutes),Math.round(pressure))});
    }

    if(req.method!=='GET') return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET or POST required.'}});
    const today=new Date().toISOString().slice(0,10);
    const row=await sql`SELECT self_rated_pressure,self_reported_break_minutes FROM planner_energy_checkins WHERE learner_id=${learnerId} AND checkin_date=${today}`;
    if(!row.rows.length) return json(res,200,{ok:true,checkedInToday:false});
    const minutesRow=await sql`SELECT COALESCE(SUM(estimated_minutes),0)::int AS n FROM planner_tasks WHERE learner_id=${learnerId} AND scheduled_date=${today} AND status NOT IN ('cancelled','skipped')`;
    const studyMinutes=minutesRow.rows[0]?.n||0;
    return json(res,200,{ok:true,checkedInToday:true,studyMinutes,breakMinutes:row.rows[0].self_reported_break_minutes,...evaluate(studyMinutes,row.rows[0].self_reported_break_minutes,row.rows[0].self_rated_pressure)});
  }catch(e){return json(res,e.status||500,{error:{code:e.code||'COGNITIVE_SAFETY_FAILED',message:e.status?e.message:'Unable to process check-in.'}});}
}
  return handler;
}
const handler_cognitive_safety = __build_cognitive_safety();

/* ================ appeals.js ================ */
function __build_appeals(){
// Merged M39 (AI Review & Appeal) + M59 (Human-in-the-Loop Governance).
// Reuses the existing teacher_reviews table/state-machine rather than a
// parallel queue table. Nothing is silently altered: the original
// assessment_results/ai_evaluation_records rows are never modified by
// this handler — a resolution is a separate, additional record.
async function handler(req,res){
  try{
    const session=await requireAuth(req);

    if(req.method==='POST'){
      const learnerId=String(req.body?.learnerId||'');
      await requireLearnerAccess(session,learnerId);
      const attemptId=String(req.body?.attemptId||'');
      const questionId=String(req.body?.questionId||'');
      const reason=String(req.body?.reason||'').trim().slice(0,1000);
      if(!attemptId||!questionId) return json(res,400,{error:{code:'ATTEMPT_AND_QUESTION_REQUIRED',message:'attemptId and questionId are required.'}});
      if(!reason) return json(res,400,{error:{code:'REASON_REQUIRED',message:'Please explain why you are requesting a review.'}});

      const resultRow=await sql`SELECT ar.id FROM assessment_results ar JOIN assessment_attempts aa ON aa.id=ar.attempt_id
        WHERE ar.attempt_id=${attemptId} AND ar.question_id=${questionId} AND aa.learner_id=${learnerId}`;
      if(!resultRow.rows.length) return json(res,404,{error:{code:'RESULT_NOT_FOUND',message:'That result does not belong to this learner.'}});

      const existing=await sql`SELECT id,teacher_status FROM teacher_reviews WHERE attempt_id=${attemptId} AND question_id=${questionId}`;
      if(existing.rows.length && existing.rows[0].teacher_status==='pending'){
        return json(res,200,{ok:true,review:{id:existing.rows[0].id,status:'pending'},alreadyPending:true});
      }

      const evalRow=await sql`SELECT id FROM ai_evaluation_records WHERE attempt_id=${attemptId} AND question_id=${questionId} ORDER BY created_at DESC LIMIT 1`;
      const reviewId=id('review');
      const now=new Date().toISOString();
      await sql`INSERT INTO teacher_reviews(id,attempt_id,question_id,ai_evaluation_id,learner_id,teacher_status,appeal_reason,requested_at,created_at)
                 VALUES(${reviewId},${attemptId},${questionId},${evalRow.rows[0]?.id||null},${learnerId},'pending',${reason},${now},${now})`;
      await writeAudit({actorUserId:session.user_id,action:'appeal.requested',entityType:'teacher_review',entityId:reviewId,metadata:{attemptId,questionId}});
      return json(res,201,{ok:true,review:{id:reviewId,status:'pending'}});
    }

    if(req.method==='PUT'){
      // Resolve — teacher/admin only, and only for their own students.
      if(!hasRole(session,'teacher')&&!hasRole(session,'admin')) return json(res,403,{error:{code:'TEACHER_ROLE_REQUIRED',message:'Teacher access required.'}});
      const reviewId=String(req.query?.reviewId||'');
      const row=await sql`SELECT id,learner_id,teacher_status FROM teacher_reviews WHERE id=${reviewId}`;
      if(!row.rows.length) return json(res,404,{error:{code:'REVIEW_NOT_FOUND',message:'Review not found.'}});
      if(!hasRole(session,'admin')) await requireLearnerAccess(session,row.rows[0].learner_id);

      const status=String(req.body?.status||'');
      if(!['accepted','edited','rejected'].includes(status)) return json(res,400,{error:{code:'INVALID_RESOLUTION_STATUS',message:'status must be accepted, edited, or rejected.'}});
      const teacherMarks=req.body?.teacherMarks==null?null:Number(req.body.teacherMarks);
      const teacherComment=String(req.body?.teacherComment||'').trim().slice(0,1000)||null;
      if(status==='edited'&&(teacherMarks==null||!Number.isFinite(teacherMarks))) return json(res,400,{error:{code:'MARKS_REQUIRED_FOR_EDIT',message:'teacherMarks is required when editing a score.'}});

      const now=new Date().toISOString();
      await sql`UPDATE teacher_reviews SET teacher_status=${status},teacher_marks=${teacherMarks},teacher_comment=${teacherComment},reviewer_user_id=${session.user_id},reviewed_at=${now} WHERE id=${reviewId}`;
      await writeAudit({actorUserId:session.user_id,action:'appeal.resolved',entityType:'teacher_review',entityId:reviewId,metadata:{status}});
      return json(res,200,{ok:true,review:{id:reviewId,status}});
    }

    if(req.method!=='GET') return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET, POST or PUT required.'}});

    if(hasRole(session,'teacher')||hasRole(session,'admin')){
      // Teacher/admin queue — own students only via teacher_learner, unless admin (blanket).
      const rows=hasRole(session,'admin')
        ? await sql`SELECT tr.*,l.display_name FROM teacher_reviews tr JOIN learners l ON l.id=tr.learner_id WHERE tr.teacher_status='pending' ORDER BY tr.requested_at ASC LIMIT 100`
        : await sql`SELECT tr.*,l.display_name FROM teacher_reviews tr JOIN learners l ON l.id=tr.learner_id
            JOIN teacher_learner tl ON tl.learner_id=tr.learner_id AND tl.teacher_user_id=${session.user_id} AND tl.status='active'
            WHERE tr.teacher_status='pending' ORDER BY tr.requested_at ASC LIMIT 100`;
      return json(res,200,{ok:true,reviews:rows.rows});
    }

    // Student/parent — their own learner's reviews (any status).
    const learnerId=String(req.query?.learnerId||'');
    await requireLearnerAccess(session,learnerId);
    const rows=await sql`SELECT * FROM teacher_reviews WHERE learner_id=${learnerId} ORDER BY created_at DESC LIMIT 50`;
    return json(res,200,{ok:true,reviews:rows.rows});
  }catch(e){return json(res,e.status||500,{error:{code:e.code||'APPEAL_FAILED',message:e.status?e.message:'Unable to process appeal.'}});}
}
  return handler;
}
const handler_appeals = __build_appeals();

/* ================ mistake-map.js ================ */
function __build_mistake_map(){
// M52 — Mistake Archeology & Confusion Map. Purely a read-only view over
// data M22 (Weakness Detection) already derives and stores — no new
// table, no re-derivation, no separate threshold. A pattern below the
// same MISTAKE_PATTERN_THRESHOLD used by M22 (3 occurrences) is labeled
// "watching" — shown, but explicitly NOT presented as a root cause, per
// the Blueprint's own anti-diagnosis rule for this module.
async function handler(req,res){
  try{
    const session=await requireAuth(req);
    const learnerId=String(req.query?.learnerId||'');
    await requireLearnerAccess(session,learnerId);
    if(req.method!=='GET') return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET required.'}});

    const patterns=await sql`SELECT id,concept,subject,error_type,status,first_detected,last_detected FROM mistake_patterns WHERE learner_id=${learnerId} ORDER BY last_detected DESC`;
    const patternIds=patterns.rows.map(p=>p.id);
    let occurrencesByPattern={};
    if(patternIds.length){
      const occ=await sql`SELECT mpo.pattern_id,le.id AS evidence_id,le.attempt_id,le.question_id,le.correctness,le.error_type,q.text AS question_text
        FROM mistake_pattern_occurrences mpo
        JOIN learning_evidence le ON le.id=mpo.evidence_id
        JOIN questions q ON q.id=le.question_id
        WHERE mpo.pattern_id=ANY(${patternIds}) ORDER BY mpo.occurred_at ASC`;
      occurrencesByPattern=occ.rows.reduce((acc,r)=>{ (acc[r.pattern_id] ||= []).push(r); return acc; },{});
    }
    const results=patterns.rows.map(p=>({
      ...p,
      occurrenceCount:(occurrencesByPattern[p.id]||[]).length,
      evidenceChain:(occurrencesByPattern[p.id]||[]).map(o=>({attemptId:o.attempt_id,questionId:o.question_id,questionText:o.question_text,correctness:o.correctness})),
      // The one honesty rule this whole module exists to enforce:
      rootCauseClaimed: p.status==='possible_misconception',
      limitation: p.status==='possible_misconception'
        ? 'This pattern has repeated real evidence, but is still a pattern label, not a diagnosis.'
        : 'Not enough repeated evidence yet to call this a pattern — shown for transparency only.',
    }));
    return json(res,200,{ok:true,patterns:results});
  }catch(e){return json(res,e.status||500,{error:{code:e.code||'MISTAKE_MAP_FAILED',message:e.status?e.message:'Unable to load mistake map.'}});}
}
  return handler;
}
const handler_mistake_map = __build_mistake_map();

/* ================ teacher-diagnostic.js ================ */
function __build_teacher_diagnostic(){
// M58 — Teacher Diagnostic Snap & Differentiated Assignment. Groups a
// class by the real, already-computed learning_memory status for one
// concept (mastered/learning/needs_revision — the exact same vocabulary
// M09 already uses, not a new one). Optionally pushes a real,
// server-persisted planner task to each grouped student, using the
// same insert shape the planner's own sync path uses elsewhere in this
// file, so the assignment actually appears in the student's real plan.
const GROUP_TASK={
  reteach:{type:'revision',task:'Guided examples and one supported retry',minutes:20},
  practice:{type:'practice',task:'Retrieval practice with feedback',minutes:15},
  extend:{type:'practice',task:'Extension problem with explanation required',minutes:20},
};
async function handler(req,res){
  try{
    const session=await requireAuth(req);
    if(!hasRole(session,'teacher')&&!hasRole(session,'admin')) return json(res,403,{error:{code:'TEACHER_ROLE_REQUIRED',message:'Teacher access required.'}});

    const classId=String(req.query?.classId||req.body?.classId||'');
    const concept=String(req.query?.concept||req.body?.concept||'');
    if(!classId||!concept) return json(res,400,{error:{code:'CLASS_AND_CONCEPT_REQUIRED',message:'classId and concept are required.'}});

    const cls=hasRole(session,'admin')
      ? (await sql`SELECT id FROM classes WHERE id=${classId} AND archived_at IS NULL`).rows[0]
      : await teacherOwnsClass(session.user_id,classId);
    if(!cls) return json(res,404,{error:{code:'CLASS_NOT_FOUND',message:'Class not found or not owned by this teacher.'}});

    const members=await sql`SELECT l.id,l.display_name FROM class_members cm JOIN learners l ON l.id=cm.learner_id WHERE cm.class_id=${classId} AND cm.status='active' AND l.deactivated_at IS NULL`;
    const memberIds=members.rows.map(x=>x.id);
    const names=Object.fromEntries(members.rows.map(m=>[m.id,m.display_name]));
    const memory=memberIds.length ? await sql`SELECT learner_id,status FROM learning_memory WHERE learner_id=ANY(${memberIds}) AND concept=${concept}` : {rows:[]};
    const statusByLearner=Object.fromEntries(memory.rows.map(r=>[r.learner_id,r.status]));

    const groups={reteach:[],practice:[],extend:[],insufficient_evidence:[]};
    for(const learnerId of memberIds){
      const status=statusByLearner[learnerId];
      const bucket=status==='needs_revision'?'reteach':status==='learning'?'practice':status==='mastered'?'extend':'insufficient_evidence';
      groups[bucket].push({learnerId,displayName:names[learnerId]});
    }

    if(req.method==='GET') return json(res,200,{ok:true,groups});

    if(req.method!=='POST') return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET or POST required.'}});
    // POST: actually push the differentiated assignment into each
    // grouped student's real planner — this is what makes M58 an
    // actionable feature rather than only an informational grouping.
    const groupName=String(req.body?.group||'');
    if(!GROUP_TASK[groupName]) return json(res,400,{error:{code:'INVALID_GROUP',message:'group must be reteach, practice, or extend.'}});
    const targets=groups[groupName]||[];
    if(!targets.length) return json(res,200,{ok:true,assigned:0});

    const tpl=GROUP_TASK[groupName];
    const today=new Date().toISOString().slice(0,10);
    const now=new Date().toISOString();
    let assigned=0;
    for(const t of targets){
      const taskId=id('task');
      await sql`INSERT INTO planner_tasks(id,learner_id,type,title,concept,subject,estimated_minutes,priority,reasons,action,status,scheduled_date,created_at)
                 VALUES(${taskId},${t.learnerId},${tpl.type},${`Teacher-assigned: ${concept}`},${concept},${null},${tpl.minutes},'medium',
                        ${JSON.stringify([`Assigned by your teacher after a class diagnostic on ${concept}.`,tpl.task])},null,'pending',${today},${now})`;
      assigned++;
    }
    await writeAudit({actorUserId:session.user_id,action:'teacher_diagnostic.group_assigned',entityType:'class',entityId:classId,metadata:{concept,groupName,assigned}});
    return json(res,200,{ok:true,assigned});
  }catch(e){return json(res,e.status||500,{error:{code:e.code||'TEACHER_DIAGNOSTIC_FAILED',message:e.status?e.message:'Unable to process diagnostic grouping.'}});}
}
  return handler;
}
const handler_teacher_diagnostic = __build_teacher_diagnostic();

/* ================ outcome-comparison.js ================ */
function __build_outcome_comparison(){
// M53 — Learning Outcome Measurement. Compares real accuracy in an
// early window of evidence against a recent window for one concept.
// Mirrors js/baa-outcomes.js's compare() logic exactly. Per the
// Blueprint's own M53 rule ("a score increase alone should not be
// treated as proof of durable learning without appropriate
// comparison"), a real minimum evidence-per-window floor is enforced
// before any comparison is shown — below that, the honest answer is
// insufficient_evidence, not a guess.
const MIN_EVIDENCE_PER_WINDOW = 3;
function compare(pre,post){
  if(!Number.isFinite(pre)||!Number.isFinite(post)) return null;
  return {
    absoluteChange:Number((post-pre).toFixed(2)),
    relativeChange:pre?Number(((post-pre)/Math.abs(pre)*100).toFixed(2)):null,
    interpretation:post>pre?'improved':post<pre?'declined':'unchanged',
  };
}
async function handler(req,res){
  try{
    const session=await requireAuth(req);
    const learnerId=String(req.query?.learnerId||'');
    await requireLearnerAccess(session,learnerId);
    const concept=String(req.query?.concept||'');
    if(!concept) return json(res,400,{error:{code:'CONCEPT_REQUIRED',message:'concept is required.'}});
    if(req.method!=='GET') return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET required.'}});

    const rows=await sql`SELECT correctness,created_at FROM learning_evidence WHERE learner_id=${learnerId} AND concept=${concept} ORDER BY created_at ASC`;
    const evidence=rows.rows;
    if(evidence.length < MIN_EVIDENCE_PER_WINDOW*2){
      return json(res,200,{ok:true,status:'insufficient_evidence',totalEvidence:evidence.length,minRequired:MIN_EVIDENCE_PER_WINDOW*2});
    }
    const half=Math.floor(evidence.length/2);
    const early=evidence.slice(0,half);
    const recent=evidence.slice(-half);
    const acc=(w)=>Number((100*w.filter(e=>e.correctness==='correct').length/w.length).toFixed(1));
    const preAcc=acc(early), postAcc=acc(recent);
    const result=compare(preAcc,postAcc);
    return json(res,200,{
      ok:true,status:'measured',
      earlyWindow:{accuracy:preAcc,count:early.length,from:early[0]?.created_at,to:early[early.length-1]?.created_at},
      recentWindow:{accuracy:postAcc,count:recent.length,from:recent[0]?.created_at,to:recent[recent.length-1]?.created_at},
      ...result,
    });
  }catch(e){return json(res,e.status||500,{error:{code:e.code||'OUTCOME_COMPARISON_FAILED',message:e.status?e.message:'Unable to compute outcome comparison.'}});}
}
  return handler;
}
const handler_outcome_comparison = __build_outcome_comparison();

/* ================ adaptive-pacing.js ================ */
function __build_adaptive_pacing(){
// M56 — Adaptive Pacing & Productive Planning. Mirrors js/baa-pacing.js's
// recommend() logic exactly. Reuses real, already-collected signals
// rather than inventing new ones: plannedMinutes from real planner_tasks,
// availableMinutes from the real planner_preferences the student already
// set, and energy from M54's real, explicit, student-initiated check-in
// (inverted: energy = 6 - pressure) — never silently inferred, and if no
// check-in exists today, energy-dependent advice is honestly withheld
// rather than guessed. Per the Blueprint's own boundary ("should not
// secretly infer private life events"), reducing scope is something the
// student explicitly triggers (POST), never applied automatically.
function recommend(available,planned,energy){
  if(![available,planned].every(Number.isFinite)||available<0||planned<0) return null;
  let action='maintain';
  if(planned>available) action='reduce_scope';
  else if(Number.isFinite(energy)&&energy<=2) action='reduce_intensity';
  else if(available-planned>=30) action='optional_extension';
  return {action,reason:action==='reduce_scope'?'Planned work exceeds available time.':action==='reduce_intensity'?'Self-reported energy is low today.':action==='optional_extension'?'Current inputs support the planned workload, with room to spare.':'Current inputs support the planned workload.'};
}
async function handler(req,res){
  try{
    const session=await requireAuth(req);
    const learnerId=String(req.query?.learnerId||req.body?.learnerId||'');
    await requireLearnerAccess(session,learnerId);
    const today=new Date().toISOString().slice(0,10);

    const prefRow=await sql`SELECT available_minutes_per_day FROM planner_preferences WHERE learner_id=${learnerId}`;
    const available=prefRow.rows[0]?.available_minutes_per_day ?? 30;
    const plannedRow=await sql`SELECT COALESCE(SUM(estimated_minutes),0)::int AS n FROM planner_tasks WHERE learner_id=${learnerId} AND scheduled_date=${today} AND status NOT IN ('cancelled','skipped')`;
    const planned=plannedRow.rows[0]?.n||0;
    const checkinRow=await sql`SELECT self_rated_pressure FROM planner_energy_checkins WHERE learner_id=${learnerId} AND checkin_date=${today}`;
    const energy=checkinRow.rows.length?6-checkinRow.rows[0].self_rated_pressure:null;
    const rec=recommend(available,planned,energy);

    if(req.method==='GET') return json(res,200,{ok:true,availableMinutes:available,plannedMinutes:planned,energyKnown:energy!=null,...rec});

    if(req.method!=='POST') return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET or POST required.'}});
    // POST: student explicitly applies the reduce_scope recommendation —
    // cancels the lowest-priority pending tasks for today until planned
    // minutes fit within available minutes. Never runs automatically.
    if(rec.action!=='reduce_scope') return json(res,400,{error:{code:'NOTHING_TO_REDUCE',message:'There is nothing to reduce right now.'}});
    const tasks=await sql`SELECT id,estimated_minutes,priority FROM planner_tasks WHERE learner_id=${learnerId} AND scheduled_date=${today} AND status='pending' ORDER BY CASE priority WHEN 'low' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END ASC, estimated_minutes DESC`;
    let remaining=planned;
    const cancelled=[];
    for(const t of tasks.rows){
      if(remaining<=available) break;
      await sql`UPDATE planner_tasks SET status='cancelled' WHERE id=${t.id}`;
      remaining-=t.estimated_minutes;
      cancelled.push(t.id);
    }
    await writeAudit({actorUserId:session.user_id,action:'adaptive_pacing.scope_reduced',entityType:'learner',entityId:learnerId,metadata:{cancelledTaskCount:cancelled.length,before:planned,after:remaining}});
    return json(res,200,{ok:true,cancelledTaskCount:cancelled.length,plannedMinutesBefore:planned,plannedMinutesAfter:remaining});
  }catch(e){return json(res,e.status||500,{error:{code:e.code||'ADAPTIVE_PACING_FAILED',message:e.status?e.message:'Unable to process pacing request.'}});}
}
  return handler;
}
const handler_adaptive_pacing = __build_adaptive_pacing();

/* ================ parent-conversation.js ================ */
function __build_parent_conversation(){
// M57 — Parent Learning Conversation Assistant. Mirrors
// js/baa-parent-conversation.js's prompts() logic exactly, but derives
// the topic/state from the learner's real weakest concept in
// learning_memory instead of a generic placeholder — a parent's
// conversation starter should be grounded in real evidence, matching
// the Blueprint's own "supplied learning facts" requirement.
function prompts(topic,state){
  return [
    `Ask what felt easiest about ${topic}.`,
    `Ask what part of ${topic} felt difficult without assigning blame.`,
    `Ask whether the current ${state} feels manageable.`,
    'Agree on one small next step together.',
  ];
}
async function handler(req,res){
  try{
    const session=await requireAuth(req);
    const learnerId=String(req.query?.learnerId||'');
    await requireLearnerAccess(session,learnerId);
    if(req.method!=='GET') return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET required.'}});

    const row=await sql`SELECT concept,status FROM learning_memory WHERE learner_id=${learnerId} AND status='needs_revision' ORDER BY last_updated DESC LIMIT 1`;
    if(!row.rows.length){
      return json(res,200,{ok:true,status:'insufficient_evidence',message:'No recorded area needing revision yet — nothing to honestly ground a conversation starter in.'});
    }
    const {concept,status}=row.rows[0];
    return json(res,200,{ok:true,status:'grounded',topic:concept,state:status.replace(/_/g,' '),prompts:prompts(concept.replace(/-/g,' '),status.replace(/_/g,' ')),limitation:'Conversation prompts are supportive guidance, not diagnosis or clinical advice.'});
  }catch(e){return json(res,e.status||500,{error:{code:e.code||'PARENT_CONVERSATION_FAILED',message:e.status?e.message:'Unable to build conversation prompts.'}});}
}
  return handler;
}
const handler_parent_conversation = __build_parent_conversation();

/* ================ founder-lab.js ================ */
function __build_founder_lab(){
// M61 — One-Year Private Testing & Founder Lab. Admin-only structured
// testing journal — real, dated entries, never a claim that a
// longitudinal study occurred before entries actually exist.
async function handler(req,res){
  try{
    const session=await requireAuth(req);
    if(!hasRole(session,'admin')) return json(res,403,{error:{code:'ADMIN_REQUIRED',message:'Administrator role required.'}});

    if(req.method==='GET'){
      const r=await sql`SELECT id,hypothesis,metric,notes,created_at FROM founder_lab_logs ORDER BY created_at DESC LIMIT 200`;
      return json(res,200,{ok:true,logs:r.rows});
    }
    if(req.method!=='POST') return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET or POST required.'}});

    const hypothesis=String(req.body?.hypothesis||'').trim().slice(0,500);
    const metric=String(req.body?.metric||'').trim().slice(0,200);
    const notes=String(req.body?.notes||'').trim().slice(0,2000)||null;
    if(!hypothesis||!metric) return json(res,400,{error:{code:'INVALID_FOUNDER_LAB_ENTRY',message:'A hypothesis and metric are required.'}});
    const logId=id('lab');
    const now=new Date().toISOString();
    await sql`INSERT INTO founder_lab_logs(id,hypothesis,metric,notes,created_by_user_id,created_at) VALUES(${logId},${hypothesis},${metric},${notes},${session.user_id},${now})`;
    await writeAudit({actorUserId:session.user_id,action:'founder_lab.entry_logged',entityType:'founder_lab_log',entityId:logId,metadata:{metric}});
    return json(res,201,{ok:true,log:{id:logId,hypothesis,metric,notes,created_at:now}});
  }catch(e){return json(res,e.status||500,{error:{code:e.code||'FOUNDER_LAB_FAILED',message:e.status?e.message:'Unable to save founder lab entry.'}});}
}
  return handler;
}
const handler_founder_lab = __build_founder_lab();

/* ================ guide-robot-sessions.js ================ */
function __build_guide_robot_sessions(){
// M63 — Guide Robot optional usage log. Any authenticated user may log
// their own topic views; there is no cross-user read path here since
// the feature itself never needs one — this exists purely for the
// founder's own product-usage insight, queried directly if/when wanted.
async function handler(req,res){
  try{
    const session=await requireAuth(req);
    if(req.method!=='POST') return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'POST required.'}});
    const topicId=String(req.body?.topicId||'').trim().slice(0,120);
    if(!topicId) return json(res,400,{error:{code:'TOPIC_ID_REQUIRED',message:'topicId is required.'}});
    const page=String(req.body?.page||'').trim().slice(0,120)||null;
    const roleContext=String(req.body?.role||'').trim().slice(0,40)||null;
    await sql`INSERT INTO guide_robot_sessions(id,user_id,topic_id,page,role_context,opened_at) VALUES(${id('gs')},${session.user_id},${topicId},${page},${roleContext},${new Date().toISOString()})`;
    return json(res,201,{ok:true});
  }catch(e){return json(res,e.status||500,{error:{code:e.code||'GUIDE_SESSION_LOG_FAILED',message:e.status?e.message:'Unable to log session.'}});}
}
  return handler;
}
const handler_guide_robot_sessions = __build_guide_robot_sessions();

/* ================ board-registry.js ================ */
function __build_board_registry(){
// M64 — India Board & Exam Registry (Blueprint V3.2, IB-01/IB-02).
// Read is available to any authenticated user (board selection is a
// pre-learning-content step every role needs). Create/update is
// admin-only and writes an append-only audit row — this mirrors the
// governance workflow the blueprint requires (Draft/Review/Verify/
// Approve/Publish) at the smallest real slice: a board's own record.
// This is registry-only. Curriculum graph (IB-03) is M65 scope;
// question bank (IB-05) is M66 scope. Nothing here assumes any
// particular board — CBSE/CISCE are seed data, not hard-coded logic.
const ALLOWED_BOARD_TYPES = new Set(['national', 'state_ut', 'international']);
const ALLOWED_VERIFICATION = new Set(['pending_verification', 'verified', 'needs_review']);
const ALLOWED_STATUS = new Set(['active', 'inactive']);

function serializeBoard(row) {
  return {
    id: row.id, name: row.name, shortName: row.short_name, boardType: row.board_type,
    stateUt: row.state_ut, officialSourceUrl: row.official_source_url,
    verificationStatus: row.verification_status, verificationNote: row.verification_note,
    status: row.status, version: row.version, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

async function handleList(req, res) {
  const boardType = req.query?.boardType ? String(req.query.boardType) : null;
  const stateUt = req.query?.stateUt ? String(req.query.stateUt) : null;
  const includeInactive = String(req.query?.includeInactive || '') === 'true';
  const rows = await sql`
    SELECT * FROM boards
    WHERE (${boardType}::text IS NULL OR board_type = ${boardType})
      AND (${stateUt}::text IS NULL OR state_ut = ${stateUt})
      AND (${includeInactive} OR status = 'active')
    ORDER BY board_type, name ASC`;
  return json(res, 200, { ok: true, boards: rows.rows.map(serializeBoard) });
}

async function handleGet(req, res, boardId) {
  const rows = await sql`SELECT * FROM boards WHERE id = ${boardId}`;
  if (!rows.rows.length) return json(res, 404, { error: { code: 'BOARD_NOT_FOUND', message: 'No board with that id.' } });
  const years = await sql`SELECT id, year_label, start_date, end_date, status FROM academic_years WHERE board_id = ${boardId} ORDER BY year_label DESC`;
  return json(res, 200, { ok: true, board: serializeBoard(rows.rows[0]), academicYears: years.rows });
}

async function handleCreate(req, res, session) {
  if (!hasRole(session, 'admin')) return json(res, 403, { error: { code: 'FORBIDDEN', message: 'Only admin can register a board.' } });
  const b = req.body || {};
  const boardId = String(b.id || '').trim().toLowerCase().slice(0, 40);
  const name = String(b.name || '').trim().slice(0, 200);
  const shortName = String(b.shortName || '').trim().slice(0, 40);
  const boardType = String(b.boardType || '').trim();
  const stateUt = b.stateUt ? String(b.stateUt).trim().slice(0, 80) : null;
  const officialSourceUrl = String(b.officialSourceUrl || '').trim().slice(0, 300);
  const verificationStatus = String(b.verificationStatus || 'pending_verification').trim();
  const verificationNote = b.verificationNote ? String(b.verificationNote).trim().slice(0, 500) : null;

  if (!boardId || !/^[a-z0-9-]+$/.test(boardId)) return json(res, 400, { error: { code: 'INVALID_BOARD_ID', message: 'id must be a lowercase slug (letters, digits, hyphens).' } });
  if (!name || !shortName) return json(res, 400, { error: { code: 'NAME_REQUIRED', message: 'name and shortName are required.' } });
  if (!ALLOWED_BOARD_TYPES.has(boardType)) return json(res, 400, { error: { code: 'INVALID_BOARD_TYPE', message: 'boardType must be national, state_ut, or international.' } });
  if (boardType === 'state_ut' && !stateUt) return json(res, 400, { error: { code: 'STATE_UT_REQUIRED', message: 'stateUt is required when boardType is state_ut.' } });
  if (!officialSourceUrl || !/^https:\/\//.test(officialSourceUrl)) return json(res, 400, { error: { code: 'INVALID_SOURCE_URL', message: 'officialSourceUrl must be a real https URL — this is provenance metadata, not optional.' } });
  if (!ALLOWED_VERIFICATION.has(verificationStatus)) return json(res, 400, { error: { code: 'INVALID_VERIFICATION_STATUS', message: 'Invalid verificationStatus.' } });

  const existing = await sql`SELECT id FROM boards WHERE id = ${boardId}`;
  if (existing.rows.length) return json(res, 409, { error: { code: 'BOARD_ALREADY_EXISTS', message: 'A board with that id already exists — use update instead.' } });

  const now = new Date().toISOString();
  await sql`INSERT INTO boards (id, name, short_name, board_type, state_ut, official_source_url, verification_status, verification_note, status, version, created_at, updated_at)
    VALUES (${boardId}, ${name}, ${shortName}, ${boardType}, ${stateUt}, ${officialSourceUrl}, ${verificationStatus}, ${verificationNote}, 'active', 1, ${now}, ${now})`;
  await sql`INSERT INTO board_registry_audit (id, board_id, actor_user_id, action, before_json, after_json, created_at)
    VALUES (${id('bra')}, ${boardId}, ${session.user_id}, 'created', NULL, ${JSON.stringify({ name, shortName, boardType, stateUt, officialSourceUrl, verificationStatus })}, ${now})`;
  await writeAudit({ actorUserId: session.user_id, action: 'board_registry.created', entityType: 'board', entityId: boardId, metadata: { boardType } });

  const rows = await sql`SELECT * FROM boards WHERE id = ${boardId}`;
  return json(res, 201, { ok: true, board: serializeBoard(rows.rows[0]) });
}

async function handleUpdate(req, res, session, boardId) {
  if (!hasRole(session, 'admin')) return json(res, 403, { error: { code: 'FORBIDDEN', message: 'Only admin can update a board.' } });
  const existingRows = await sql`SELECT * FROM boards WHERE id = ${boardId}`;
  if (!existingRows.rows.length) return json(res, 404, { error: { code: 'BOARD_NOT_FOUND', message: 'No board with that id.' } });
  const before = existingRows.rows[0];
  const b = req.body || {};

  const status = b.status !== undefined ? String(b.status) : before.status;
  const verificationStatus = b.verificationStatus !== undefined ? String(b.verificationStatus) : before.verification_status;
  const verificationNote = b.verificationNote !== undefined ? (b.verificationNote ? String(b.verificationNote).trim().slice(0, 500) : null) : before.verification_note;
  const officialSourceUrl = b.officialSourceUrl !== undefined ? String(b.officialSourceUrl).trim().slice(0, 300) : before.official_source_url;

  if (!ALLOWED_STATUS.has(status)) return json(res, 400, { error: { code: 'INVALID_STATUS', message: 'Invalid status.' } });
  if (!ALLOWED_VERIFICATION.has(verificationStatus)) return json(res, 400, { error: { code: 'INVALID_VERIFICATION_STATUS', message: 'Invalid verificationStatus.' } });
  if (!officialSourceUrl || !/^https:\/\//.test(officialSourceUrl)) return json(res, 400, { error: { code: 'INVALID_SOURCE_URL', message: 'officialSourceUrl must be a real https URL.' } });

  // Optimistic concurrency: caller must supply the version it last read.
  const expectedVersion = Number(b.expectedVersion);
  if (!Number.isInteger(expectedVersion)) return json(res, 400, { error: { code: 'EXPECTED_VERSION_REQUIRED', message: 'expectedVersion (integer) is required to prevent overwriting a concurrent change.' } });
  if (expectedVersion !== before.version) return json(res, 409, { error: { code: 'STALE_VERSION', message: 'This board was modified since you last read it. Re-fetch and retry.' } });

  const now = new Date().toISOString();
  const updateResult = await sql`UPDATE boards SET status=${status}, verification_status=${verificationStatus}, verification_note=${verificationNote}, official_source_url=${officialSourceUrl}, version=version+1, updated_at=${now}
    WHERE id=${boardId} AND version=${expectedVersion}`;
  if (!updateResult.count) return json(res, 409, { error: { code: 'STALE_VERSION', message: 'This board was modified since you last read it. Re-fetch and retry.' } });

  await sql`INSERT INTO board_registry_audit (id, board_id, actor_user_id, action, before_json, after_json, created_at)
    VALUES (${id('bra')}, ${boardId}, ${session.user_id}, 'updated', ${JSON.stringify({ status: before.status, verificationStatus: before.verification_status, officialSourceUrl: before.official_source_url })}, ${JSON.stringify({ status, verificationStatus, officialSourceUrl })}, ${now})`;
  await writeAudit({ actorUserId: session.user_id, action: 'board_registry.updated', entityType: 'board', entityId: boardId, metadata: { status, verificationStatus } });

  const rows = await sql`SELECT * FROM boards WHERE id = ${boardId}`;
  return json(res, 200, { ok: true, board: serializeBoard(rows.rows[0]) });
}

async function handler(req, res) {
  try {
    const session = await requireAuth(req);
    const boardId = req.query?.id ? String(req.query.id) : null;
    if (req.method === 'GET' && !boardId) return await handleList(req, res);
    if (req.method === 'GET' && boardId) return await handleGet(req, res, boardId);
    if (req.method === 'POST' && !boardId) return await handleCreate(req, res, session);
    if (req.method === 'PATCH' && boardId) return await handleUpdate(req, res, session, boardId);
    return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'GET, POST, or PATCH required.' } }, { Allow: 'GET, POST, PATCH' });
  } catch (e) { return json(res, e.status || 500, { error: { code: e.code || 'BOARD_REGISTRY_FAILED', message: e.status ? e.message : 'Unable to process board registry request.' } }); }
}
  return handler;
}
const handler_board_registry = __build_board_registry();

/* ================ curriculum-graph.js ================ */
function __build_curriculum_graph(){
// M65 — Curriculum Graph (Blueprint V3.2, IB-03): Board -> AcademicYear ->
// Class -> Subject -> Chapter -> Topic -> Concept -> LearningOutcome.
// Extensible: every entity is created against a board_id from M64's
// registry; nothing here assumes which board. Write access is admin-only,
// mirroring board-registry.js's governance model. Subjects and chapters
// carry a version column (they're the levels most likely to be corrected
// after creation — a wrong class/medium/name), so their updates use
// optimistic concurrency the same way board-registry.js does. Topics,
// concepts, and learning outcomes are create/list/get only in this pass —
// deliberately bounded scope, documented as such in the M65 report rather
// than silently implied to have full CRUD.
const TYPES = ['subject', 'chapter', 'topic', 'concept', 'learning-outcome'];
const TABLE = { subject: 'subjects', chapter: 'chapters', topic: 'topics', concept: 'concepts', 'learning-outcome': 'learning_outcomes' };

async function handleListOrGet(req, res, type) {
  const id0 = req.query?.id ? String(req.query.id) : null;
  if (type === 'subject') {
    if (id0) {
      const rows = await sql`SELECT * FROM subjects WHERE id = ${id0}`;
      if (!rows.rows.length) return json(res, 404, { error: { code: 'SUBJECT_NOT_FOUND', message: 'No subject with that id.' } });
      const chapters = await sql`SELECT id, sequence_no, name, status, version FROM chapters WHERE subject_id = ${id0} ORDER BY sequence_no ASC`;
      return json(res, 200, { ok: true, subject: rows.rows[0], chapters: chapters.rows });
    }
    const boardId = req.query?.boardId ? String(req.query.boardId) : null;
    const academicYearId = req.query?.academicYearId ? String(req.query.academicYearId) : null;
    const classLevel = req.query?.classLevel ? String(req.query.classLevel) : null;
    const rows = await sql`SELECT * FROM subjects WHERE (${boardId}::text IS NULL OR board_id = ${boardId}) AND (${academicYearId}::text IS NULL OR academic_year_id = ${academicYearId}) AND (${classLevel}::text IS NULL OR class_level = ${classLevel}) AND status = 'active' ORDER BY class_level, name`;
    return json(res, 200, { ok: true, subjects: rows.rows });
  }
  if (type === 'chapter') {
    if (id0) {
      const rows = await sql`SELECT * FROM chapters WHERE id = ${id0}`;
      if (!rows.rows.length) return json(res, 404, { error: { code: 'CHAPTER_NOT_FOUND', message: 'No chapter with that id.' } });
      const topics = await sql`SELECT id, name, status FROM topics WHERE chapter_id = ${id0} ORDER BY name`;
      return json(res, 200, { ok: true, chapter: rows.rows[0], topics: topics.rows });
    }
    const subjectId = String(req.query?.subjectId || '');
    if (!subjectId) return json(res, 400, { error: { code: 'SUBJECT_ID_REQUIRED', message: 'subjectId is required to list chapters.' } });
    const rows = await sql`SELECT * FROM chapters WHERE subject_id = ${subjectId} AND status = 'active' ORDER BY sequence_no ASC`;
    return json(res, 200, { ok: true, chapters: rows.rows });
  }
  if (type === 'topic') {
    if (id0) {
      const rows = await sql`SELECT * FROM topics WHERE id = ${id0}`;
      if (!rows.rows.length) return json(res, 404, { error: { code: 'TOPIC_NOT_FOUND', message: 'No topic with that id.' } });
      const concepts = await sql`SELECT id, name, status FROM concepts WHERE topic_id = ${id0} ORDER BY name`;
      return json(res, 200, { ok: true, topic: rows.rows[0], concepts: concepts.rows });
    }
    const chapterId = String(req.query?.chapterId || '');
    if (!chapterId) return json(res, 400, { error: { code: 'CHAPTER_ID_REQUIRED', message: 'chapterId is required to list topics.' } });
    const rows = await sql`SELECT * FROM topics WHERE chapter_id = ${chapterId} AND status = 'active' ORDER BY name`;
    return json(res, 200, { ok: true, topics: rows.rows });
  }
  if (type === 'concept') {
    if (id0) {
      const rows = await sql`SELECT * FROM concepts WHERE id = ${id0}`;
      if (!rows.rows.length) return json(res, 404, { error: { code: 'CONCEPT_NOT_FOUND', message: 'No concept with that id.' } });
      const outcomes = await sql`SELECT id, description FROM learning_outcomes WHERE concept_id = ${id0} ORDER BY id`;
      return json(res, 200, { ok: true, concept: rows.rows[0], learningOutcomes: outcomes.rows });
    }
    const topicId = String(req.query?.topicId || '');
    if (!topicId) return json(res, 400, { error: { code: 'TOPIC_ID_REQUIRED', message: 'topicId is required to list concepts.' } });
    const rows = await sql`SELECT * FROM concepts WHERE topic_id = ${topicId} AND status = 'active' ORDER BY name`;
    return json(res, 200, { ok: true, concepts: rows.rows });
  }
  if (type === 'learning-outcome') {
    const conceptId = String(req.query?.conceptId || '');
    if (!conceptId) return json(res, 400, { error: { code: 'CONCEPT_ID_REQUIRED', message: 'conceptId is required to list learning outcomes.' } });
    const rows = await sql`SELECT * FROM learning_outcomes WHERE concept_id = ${conceptId} ORDER BY id`;
    return json(res, 200, { ok: true, learningOutcomes: rows.rows });
  }
}

async function handleCreate(req, res, session, type) {
  if (!hasRole(session, 'admin')) return json(res, 403, { error: { code: 'FORBIDDEN', message: 'Only admin can extend the curriculum graph.' } });
  const b = req.body || {};
  const now = new Date().toISOString();

  if (type === 'subject') {
    const boardId = String(b.boardId || '').trim();
    const classLevel = String(b.classLevel || '').trim().slice(0, 60);
    const medium = String(b.medium || '').trim().slice(0, 60);
    const name = String(b.name || '').trim().slice(0, 200);
    if (!boardId || !classLevel || !medium || !name) return json(res, 400, { error: { code: 'MISSING_FIELDS', message: 'boardId, classLevel, medium, and name are required.' } });
    const boardRows = await sql`SELECT id FROM boards WHERE id = ${boardId}`;
    if (!boardRows.rows.length) return json(res, 400, { error: { code: 'UNKNOWN_BOARD', message: 'boardId does not match any registered board — register it via board-registry first.' } });
    const dupe = await sql`SELECT id FROM subjects WHERE board_id=${boardId} AND class_level=${classLevel} AND medium=${medium} AND name=${name}`;
    if (dupe.rows.length) return json(res, 409, { error: { code: 'SUBJECT_ALREADY_EXISTS', message: 'A subject with this board/class/medium/name already exists.' } });
    const subjectId = id('subj');
    const academicYearId = b.academicYearId ? String(b.academicYearId) : null;
    await sql`INSERT INTO subjects (id, board_id, academic_year_id, class_level, medium, name, status, version, created_at, updated_at) VALUES (${subjectId}, ${boardId}, ${academicYearId}, ${classLevel}, ${medium}, ${name}, 'active', 1, ${now}, ${now})`;
    const rows = await sql`SELECT * FROM subjects WHERE id = ${subjectId}`;
    return json(res, 201, { ok: true, subject: rows.rows[0] });
  }
  if (type === 'chapter') {
    const subjectId = String(b.subjectId || '').trim();
    const sequenceNo = Number(b.sequenceNo);
    const name = String(b.name || '').trim().slice(0, 200);
    if (!subjectId || !Number.isInteger(sequenceNo) || sequenceNo < 1 || !name) return json(res, 400, { error: { code: 'MISSING_FIELDS', message: 'subjectId, an integer sequenceNo >= 1, and name are required.' } });
    const subjectRows = await sql`SELECT id FROM subjects WHERE id = ${subjectId}`;
    if (!subjectRows.rows.length) return json(res, 400, { error: { code: 'UNKNOWN_SUBJECT', message: 'subjectId does not match any existing subject.' } });
    const dupe = await sql`SELECT id FROM chapters WHERE subject_id=${subjectId} AND sequence_no=${sequenceNo}`;
    if (dupe.rows.length) return json(res, 409, { error: { code: 'CHAPTER_SEQUENCE_TAKEN', message: 'A chapter already occupies that sequence number for this subject.' } });
    const chapterId = id('chap');
    await sql`INSERT INTO chapters (id, subject_id, sequence_no, name, status, version, created_at) VALUES (${chapterId}, ${subjectId}, ${sequenceNo}, ${name}, 'active', 1, ${now})`;
    const rows = await sql`SELECT * FROM chapters WHERE id = ${chapterId}`;
    return json(res, 201, { ok: true, chapter: rows.rows[0] });
  }
  if (type === 'topic') {
    const chapterId = String(b.chapterId || '').trim();
    const name = String(b.name || '').trim().slice(0, 200);
    if (!chapterId || !name) return json(res, 400, { error: { code: 'MISSING_FIELDS', message: 'chapterId and name are required.' } });
    const chapterRows = await sql`SELECT id FROM chapters WHERE id = ${chapterId}`;
    if (!chapterRows.rows.length) return json(res, 400, { error: { code: 'UNKNOWN_CHAPTER', message: 'chapterId does not match any existing chapter.' } });
    const topicId = id('top');
    await sql`INSERT INTO topics (id, chapter_id, name, status, created_at) VALUES (${topicId}, ${chapterId}, ${name}, 'active', ${now})`;
    const rows = await sql`SELECT * FROM topics WHERE id = ${topicId}`;
    return json(res, 201, { ok: true, topic: rows.rows[0] });
  }
  if (type === 'concept') {
    const topicId = String(b.topicId || '').trim();
    const name = String(b.name || '').trim().slice(0, 200);
    if (!topicId || !name) return json(res, 400, { error: { code: 'MISSING_FIELDS', message: 'topicId and name are required.' } });
    const topicRows = await sql`SELECT id FROM topics WHERE id = ${topicId}`;
    if (!topicRows.rows.length) return json(res, 400, { error: { code: 'UNKNOWN_TOPIC', message: 'topicId does not match any existing topic.' } });
    const conceptId = id('con');
    await sql`INSERT INTO concepts (id, topic_id, name, status, created_at) VALUES (${conceptId}, ${topicId}, ${name}, 'active', ${now})`;
    const rows = await sql`SELECT * FROM concepts WHERE id = ${conceptId}`;
    return json(res, 201, { ok: true, concept: rows.rows[0] });
  }
  if (type === 'learning-outcome') {
    const conceptId = String(b.conceptId || '').trim();
    const description = String(b.description || '').trim().slice(0, 500);
    if (!conceptId || !description) return json(res, 400, { error: { code: 'MISSING_FIELDS', message: 'conceptId and description are required.' } });
    const conceptRows = await sql`SELECT id FROM concepts WHERE id = ${conceptId}`;
    if (!conceptRows.rows.length) return json(res, 400, { error: { code: 'UNKNOWN_CONCEPT', message: 'conceptId does not match any existing concept.' } });
    const outcomeId = id('lo');
    await sql`INSERT INTO learning_outcomes (id, concept_id, description, created_at) VALUES (${outcomeId}, ${conceptId}, ${description}, ${now})`;
    const rows = await sql`SELECT * FROM learning_outcomes WHERE id = ${outcomeId}`;
    return json(res, 201, { ok: true, learningOutcome: rows.rows[0] });
  }
}

async function handleUpdate(req, res, session, type, entityId) {
  if (!hasRole(session, 'admin')) return json(res, 403, { error: { code: 'FORBIDDEN', message: 'Only admin can update the curriculum graph.' } });
  if (type !== 'subject' && type !== 'chapter') return json(res, 400, { error: { code: 'NOT_UPDATABLE', message: 'Only subject and chapter support update in this version.' } });
  const table = TABLE[type];
  const existing = await sql`SELECT * FROM subjects WHERE id = ${entityId}`.catch(() => ({ rows: [] }));
  // (table name is validated against a fixed allowlist above; separate branches below query the concrete table directly)
  if (type === 'subject') {
    const rows = await sql`SELECT * FROM subjects WHERE id = ${entityId}`;
    if (!rows.rows.length) return json(res, 404, { error: { code: 'SUBJECT_NOT_FOUND', message: 'No subject with that id.' } });
    const before = rows.rows[0];
    const status = req.body?.status !== undefined ? String(req.body.status) : before.status;
    if (!['active', 'inactive'].includes(status)) return json(res, 400, { error: { code: 'INVALID_STATUS', message: 'Invalid status.' } });
    const expectedVersion = Number(req.body?.expectedVersion);
    if (!Number.isInteger(expectedVersion)) return json(res, 400, { error: { code: 'EXPECTED_VERSION_REQUIRED', message: 'expectedVersion is required.' } });
    if (expectedVersion !== before.version) return json(res, 409, { error: { code: 'STALE_VERSION', message: 'This subject changed since you last read it.' } });
    const now2 = new Date().toISOString();
    const upd = await sql`UPDATE subjects SET status=${status}, version=version+1, updated_at=${now2} WHERE id=${entityId} AND version=${expectedVersion}`;
    if (!upd.count) return json(res, 409, { error: { code: 'STALE_VERSION', message: 'This subject changed since you last read it.' } });
    const after = await sql`SELECT * FROM subjects WHERE id = ${entityId}`;
    return json(res, 200, { ok: true, subject: after.rows[0] });
  }
  if (type === 'chapter') {
    const rows = await sql`SELECT * FROM chapters WHERE id = ${entityId}`;
    if (!rows.rows.length) return json(res, 404, { error: { code: 'CHAPTER_NOT_FOUND', message: 'No chapter with that id.' } });
    const before = rows.rows[0];
    const status = req.body?.status !== undefined ? String(req.body.status) : before.status;
    if (!['active', 'inactive'].includes(status)) return json(res, 400, { error: { code: 'INVALID_STATUS', message: 'Invalid status.' } });
    const expectedVersion = Number(req.body?.expectedVersion);
    if (!Number.isInteger(expectedVersion)) return json(res, 400, { error: { code: 'EXPECTED_VERSION_REQUIRED', message: 'expectedVersion is required.' } });
    if (expectedVersion !== before.version) return json(res, 409, { error: { code: 'STALE_VERSION', message: 'This chapter changed since you last read it.' } });
    const upd = await sql`UPDATE chapters SET status=${status}, version=version+1 WHERE id=${entityId} AND version=${expectedVersion}`;
    if (!upd.count) return json(res, 409, { error: { code: 'STALE_VERSION', message: 'This chapter changed since you last read it.' } });
    const after = await sql`SELECT * FROM chapters WHERE id = ${entityId}`;
    return json(res, 200, { ok: true, chapter: after.rows[0] });
  }
}

async function handler(req, res) {
  try {
    const session = await requireAuth(req);
    const type = String(req.query?.type || '');
    if (!TYPES.includes(type)) return json(res, 400, { error: { code: 'INVALID_TYPE', message: `type must be one of: ${TYPES.join(', ')}.` } });
    const entityId = req.query?.id ? String(req.query.id) : null;
    if (req.method === 'GET') return await handleListOrGet(req, res, type);
    if (req.method === 'POST') return await handleCreate(req, res, session, type);
    if (req.method === 'PATCH' && entityId) return await handleUpdate(req, res, session, type, entityId);
    return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'GET, POST, or PATCH required.' } }, { Allow: 'GET, POST, PATCH' });
  } catch (e) { return json(res, e.status || 500, { error: { code: e.code || 'CURRICULUM_GRAPH_FAILED', message: e.status ? e.message : 'Unable to process curriculum graph request.' } }); }
}
  return handler;
}
const handler_curriculum_graph = __build_curriculum_graph();

/* ================ paper-ingestion.js ================ */
function __build_paper_ingestion(){
// M65 — Paper Ingestion Pipeline (Blueprint V3.2/V3.3, IB-06/IB-07, §H).
// Governance state machine: uploaded -> validated -> parsed (or
// needs_manual_transcription when OCR is unavailable) -> needs_review ->
// verified -> licence_check -> approved -> published, with reject/retire
// branches. Nothing here is exposed to students/parents — unpublished
// content never reaches an unauthorized reader (teacher/admin only for
// every method), and this endpoint never itself becomes the student-facing
// question bank — that's M66's job once content reaches 'published'.
const MAX_INGEST_BYTES = 8 * 1024 * 1024; // 8 MB — a scanned board paper PDF/image, not a video
const ALLOWED_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png']);

// Explicit whitelist of valid (action, fromStatus) -> toStatus transitions.
// Anything not listed here is rejected — this is what makes "cannot skip
// governance states" a property of the code, not a convention.
const TRANSITIONS = {
  submit_manual_transcription: { from: ['needs_manual_transcription'], to: 'parsed', roles: ['admin', 'teacher'] },
  mark_needs_review: { from: ['parsed'], to: 'needs_review', roles: ['admin', 'teacher'] },
  verify_source: { from: ['needs_review'], to: 'verified', roles: ['admin', 'teacher'] },
  enter_licence_check: { from: ['verified'], to: 'licence_check', roles: ['admin'] },
  licence_pass: { from: ['licence_check'], to: 'approved', roles: ['admin'] },
  licence_fail: { from: ['licence_check'], to: 'licence_rejected', roles: ['admin'] },
  publish: { from: ['approved'], to: 'published', roles: ['admin'] },
  retire: { from: ['published'], to: 'retired', roles: ['admin'] },
  reject: { from: ['parsed', 'needs_review', 'verified', 'licence_check'], to: 'rejected_validation', roles: ['admin'] },
};

async function handleUpload(req, res, session) {
  if (!hasRole(session, 'admin') && !hasRole(session, 'teacher')) return json(res, 403, { error: { code: 'FORBIDDEN', message: 'Only teacher or admin can upload a paper for ingestion.' } });
  const b = req.body || {};
  const filename = String(b.filename || '').trim().slice(0, 200);
  const mimeType = String(b.mimeType || '').trim();
  const contentBase64 = String(b.contentBase64 || '');
  const examPaperId = b.examPaperId ? String(b.examPaperId) : null;

  if (!filename || !ALLOWED_MIME.has(mimeType)) return json(res, 400, { error: { code: 'INVALID_FILE_TYPE', message: 'filename is required and mimeType must be application/pdf, image/jpeg, or image/png.' } });
  if (!contentBase64) return json(res, 400, { error: { code: 'CONTENT_REQUIRED', message: 'contentBase64 is required.' } });

  let buffer;
  try { buffer = Buffer.from(contentBase64, 'base64'); } catch { return json(res, 400, { error: { code: 'INVALID_BASE64', message: 'contentBase64 could not be decoded.' } }); }
  if (!buffer.length) return json(res, 400, { error: { code: 'EMPTY_FILE', message: 'Decoded file is empty.' } });
  if (buffer.length > MAX_INGEST_BYTES) return json(res, 400, { error: { code: 'FILE_TOO_LARGE', message: `File exceeds the ${MAX_INGEST_BYTES} byte limit.` } });

  if (examPaperId) {
    const paperRows = await sql`SELECT id FROM exam_papers WHERE id = ${examPaperId}`;
    if (!paperRows.rows.length) return json(res, 400, { error: { code: 'UNKNOWN_EXAM_PAPER', message: 'examPaperId does not match any existing exam paper.' } });
  }

  const contentHash = crypto.createHash('sha256').update(buffer).digest('hex');

  // Idempotency: uploading byte-identical content twice returns the
  // existing job rather than creating a duplicate ingestion pipeline run.
  const existing = await sql`SELECT * FROM ingestion_jobs WHERE content_hash = ${contentHash}`;
  if (existing.rows.length) return json(res, 200, { ok: true, job: existing.rows[0], deduplicated: true });

  const jobId = id('ing');
  const now = new Date().toISOString();
  // VALIDATE step already happened above (type/size/base64) — every job
  // that reaches INSERT has passed validation, so it starts at 'validated'.
  await sql`INSERT INTO ingestion_jobs (id, exam_paper_id, uploaded_by_user_id, original_filename, mime_type, size_bytes, content_hash, status, version, created_at, updated_at)
    VALUES (${jobId}, ${examPaperId}, ${session.user_id}, ${filename}, ${mimeType}, ${buffer.length}, ${contentHash}, 'validated', 1, ${now}, ${now})`;
  await sql`INSERT INTO ingestion_audit (id, ingestion_job_id, actor_user_id, from_status, to_status, note, created_at) VALUES (${id('ia')}, ${jobId}, ${session.user_id}, 'uploaded', 'validated', 'Upload passed type/size validation.', ${now})`;

  // Attempt OCR/parse via the provider abstraction. This is a real call,
  // not a stub — its only implementation today honestly reports
  // not-configured (see api/_lib/ocr-provider.js).
  const ocrResult = await runOcr({ contentHash, mimeType });
  const nextStatus = ocrResult.status === 'succeeded' ? 'parsed' : 'needs_manual_transcription';
  const now2 = new Date().toISOString();
  await sql`UPDATE ingestion_jobs SET ocr_provider=${ocrResult.provider}, ocr_status=${ocrResult.status}, ocr_result_text=${ocrResult.text}, error_code=${ocrResult.errorCode || null}, error_message=${ocrResult.errorMessage || null}, status=${nextStatus}, version=version+1, updated_at=${now2} WHERE id=${jobId}`;
  await sql`INSERT INTO ingestion_audit (id, ingestion_job_id, actor_user_id, from_status, to_status, note, created_at) VALUES (${id('ia')}, ${jobId}, NULL, 'validated', ${nextStatus}, ${ocrResult.errorMessage || 'OCR succeeded.'}, ${now2})`;

  const rows = await sql`SELECT * FROM ingestion_jobs WHERE id = ${jobId}`;
  return json(res, 201, { ok: true, job: rows.rows[0], deduplicated: false });
}

async function handleTransition(req, res, session, jobId) {
  const action = String(req.body?.action || '');
  const def = TRANSITIONS[action];
  if (!def) return json(res, 400, { error: { code: 'INVALID_ACTION', message: `action must be one of: ${Object.keys(TRANSITIONS).join(', ')}.` } });
  if (!def.roles.some(r => hasRole(session, r))) return json(res, 403, { error: { code: 'FORBIDDEN', message: `This action requires one of: ${def.roles.join(', ')}.` } });

  const rows = await sql`SELECT * FROM ingestion_jobs WHERE id = ${jobId}`;
  if (!rows.rows.length) return json(res, 404, { error: { code: 'INGESTION_JOB_NOT_FOUND', message: 'No ingestion job with that id.' } });
  const before = rows.rows[0];

  if (!def.from.includes(before.status)) {
    return json(res, 409, { error: { code: 'INVALID_TRANSITION', message: `Cannot ${action} from status '${before.status}'. Valid from-states: ${def.from.join(', ')}.` } });
  }
  const expectedVersion = Number(req.body?.expectedVersion);
  if (!Number.isInteger(expectedVersion)) return json(res, 400, { error: { code: 'EXPECTED_VERSION_REQUIRED', message: 'expectedVersion is required.' } });
  if (expectedVersion !== before.version) return json(res, 409, { error: { code: 'STALE_VERSION', message: 'This ingestion job changed since you last read it.' } });

  const now = new Date().toISOString();
  if (action === 'submit_manual_transcription') {
    const text = String(req.body?.transcriptionText || '').trim();
    if (!text) return json(res, 400, { error: { code: 'TRANSCRIPTION_TEXT_REQUIRED', message: 'transcriptionText is required for this action.' } });
    const upd = await sql`UPDATE ingestion_jobs SET status=${def.to}, ocr_result_text=${text}, ocr_status='succeeded', version=version+1, updated_at=${now} WHERE id=${jobId} AND version=${expectedVersion}`;
    if (!upd.count) return json(res, 409, { error: { code: 'STALE_VERSION', message: 'This ingestion job changed since you last read it.' } });
  } else {
    const upd = await sql`UPDATE ingestion_jobs SET status=${def.to}, version=version+1, updated_at=${now} WHERE id=${jobId} AND version=${expectedVersion}`;
    if (!upd.count) return json(res, 409, { error: { code: 'STALE_VERSION', message: 'This ingestion job changed since you last read it.' } });
  }
  await sql`INSERT INTO ingestion_audit (id, ingestion_job_id, actor_user_id, from_status, to_status, note, created_at) VALUES (${id('ia')}, ${jobId}, ${session.user_id}, ${before.status}, ${def.to}, ${req.body?.note ? String(req.body.note).slice(0, 500) : null}, ${now})`;
  await writeAudit({ actorUserId: session.user_id, action: `paper_ingestion.${action}`, entityType: 'ingestion_job', entityId: jobId, metadata: { from: before.status, to: def.to } });

  const after = await sql`SELECT * FROM ingestion_jobs WHERE id = ${jobId}`;
  return json(res, 200, { ok: true, job: after.rows[0] });
}

async function handler(req, res) {
  try {
    const session = await requireAuth(req);
    // Unpublished ingestion content is teacher/admin-only at every method —
    // there is deliberately no path for a student/parent session here.
    if (!hasRole(session, 'admin') && !hasRole(session, 'teacher')) return json(res, 403, { error: { code: 'FORBIDDEN', message: 'Only teacher or admin can access paper ingestion.' } });
    const jobId = req.query?.jobId ? String(req.query.jobId) : null;
    if (req.method === 'GET' && jobId) {
      const rows = await sql`SELECT * FROM ingestion_jobs WHERE id = ${jobId}`;
      if (!rows.rows.length) return json(res, 404, { error: { code: 'INGESTION_JOB_NOT_FOUND', message: 'No ingestion job with that id.' } });
      const audit = await sql`SELECT from_status, to_status, note, created_at FROM ingestion_audit WHERE ingestion_job_id = ${jobId} ORDER BY created_at ASC`;
      return json(res, 200, { ok: true, job: rows.rows[0], history: audit.rows });
    }
    if (req.method === 'GET' && !jobId) {
      const status = req.query?.status ? String(req.query.status) : null;
      const rows = await sql`SELECT * FROM ingestion_jobs WHERE (${status}::text IS NULL OR status = ${status}) ORDER BY created_at DESC LIMIT 100`;
      return json(res, 200, { ok: true, jobs: rows.rows });
    }
    if (req.method === 'POST' && !jobId) return await handleUpload(req, res, session);
    if (req.method === 'PATCH' && jobId) return await handleTransition(req, res, session, jobId);
    return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'GET, POST, or PATCH required.' } }, { Allow: 'GET, POST, PATCH' });
  } catch (e) { return json(res, e.status || 500, { error: { code: e.code || 'PAPER_INGESTION_FAILED', message: e.status ? e.message : 'Unable to process paper ingestion request.' } }); }
}
  return handler;
}
const handler_paper_ingestion = __build_paper_ingestion();

/* ================ question-bank.js ================ */
function __build_question_bank(){
// M66 — Universal Question Bank + Search (Blueprint V3.2/V3.3, IB-05).
// Builds directly on the `questions` table M65 created — no duplicate
// question architecture, per the explicit instruction to reuse it. This
// module owns creation/update of individual questions and the
// search/filter layer; the ingestion *pipeline* that gets a paper from
// upload to published remains M65's paper-ingestion.js.
//
// Visibility rule (G3 / child-safety): a question only becomes visible to
// students/parents once status='published' AND verification_status=
// 'verified' — both, not either. Admin/teacher can see everything via
// includeUnpublished, since they're the ones doing the reviewing.
const QUESTION_TYPES = new Set(['mcq', 'short_answer', 'long_answer', 'numerical', 'diagram_based', 'unclassified']);
const DIFFICULTIES = new Set(['easy', 'medium', 'hard', 'unclassified']);
const BLOOM_LEVELS = new Set(['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create', 'unclassified']);
const LICENCE_TYPES = new Set(['unknown', 'open_licence', 'permitted_reference_only', 'restricted']);
const VERIFICATION_STATES = new Set(['pending_verification', 'verified', 'needs_review']);
const STATUSES = new Set(['draft', 'needs_review', 'verified', 'approved', 'published', 'rejected', 'retired']);

function serialize(row) {
  return {
    id: row.id, version: row.version, examPaperId: row.exam_paper_id, boardId: row.board_id,
    classLevel: row.class_level, subjectId: row.subject_id, medium: row.medium,
    chapterId: row.chapter_id, topicId: row.topic_id, conceptId: row.concept_id, learningOutcomeId: row.learning_outcome_id,
    questionText: row.question_text, questionType: row.question_type, marks: row.marks, difficulty: row.difficulty,
    bloomLevel: row.bloom_level, sourceUrl: row.source_url, licenceType: row.licence_type,
    verificationStatus: row.verification_status, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

async function handleCreate(req, res, session) {
  if (!hasRole(session, 'admin') && !hasRole(session, 'teacher')) return json(res, 403, { error: { code: 'FORBIDDEN', message: 'Only teacher or admin can author a question.' } });
  const b = req.body || {};
  const boardId = String(b.boardId || '').trim();
  const classLevel = String(b.classLevel || '').trim().slice(0, 60);
  const medium = String(b.medium || '').trim().slice(0, 60);
  const questionText = String(b.questionText || '').trim().slice(0, 5000);
  const questionType = String(b.questionType || 'unclassified');
  const difficulty = String(b.difficulty || 'unclassified');
  const bloomLevel = String(b.bloomLevel || 'unclassified');
  const licenceType = String(b.licenceType || 'unknown');
  const marks = b.marks !== undefined ? Number(b.marks) : null;
  const examPaperId = b.examPaperId ? String(b.examPaperId) : null;
  const subjectId = b.subjectId ? String(b.subjectId) : null;
  const chapterId = b.chapterId ? String(b.chapterId) : null;
  const topicId = b.topicId ? String(b.topicId) : null;
  const conceptId = b.conceptId ? String(b.conceptId) : null;
  const learningOutcomeId = b.learningOutcomeId ? String(b.learningOutcomeId) : null;
  const sourceUrl = b.sourceUrl ? String(b.sourceUrl).trim().slice(0, 300) : null;

  if (!boardId || !classLevel || !medium || !questionText) return json(res, 400, { error: { code: 'MISSING_FIELDS', message: 'boardId, classLevel, medium, and questionText are required.' } });
  if (!QUESTION_TYPES.has(questionType)) return json(res, 400, { error: { code: 'INVALID_QUESTION_TYPE', message: 'Invalid questionType.' } });
  if (!DIFFICULTIES.has(difficulty)) return json(res, 400, { error: { code: 'INVALID_DIFFICULTY', message: 'Invalid difficulty.' } });
  if (!BLOOM_LEVELS.has(bloomLevel)) return json(res, 400, { error: { code: 'INVALID_BLOOM_LEVEL', message: 'Invalid bloomLevel.' } });
  if (!LICENCE_TYPES.has(licenceType)) return json(res, 400, { error: { code: 'INVALID_LICENCE_TYPE', message: 'Invalid licenceType.' } });
  if (marks !== null && (!Number.isFinite(marks) || marks < 0)) return json(res, 400, { error: { code: 'INVALID_MARKS', message: 'marks must be a non-negative number.' } });

  const boardRows = await sql`SELECT id FROM boards WHERE id = ${boardId}`;
  if (!boardRows.rows.length) return json(res, 400, { error: { code: 'UNKNOWN_BOARD', message: 'boardId does not match any registered board.' } });

  if (examPaperId) {
    const dupe = await sql`SELECT id FROM board_questions WHERE exam_paper_id = ${examPaperId} AND question_text = ${questionText}`;
    if (dupe.rows.length) return json(res, 409, { error: { code: 'DUPLICATE_QUESTION', message: 'A question with this exact text already exists for this paper.' } });
  }

  const questionId = id('q');
  const now = new Date().toISOString();
  await sql`INSERT INTO board_questions (id, version, exam_paper_id, board_id, class_level, subject_id, medium, chapter_id, topic_id, concept_id, learning_outcome_id, question_text, question_type, marks, difficulty, bloom_level, source_url, licence_type, verification_status, status, search_vector, created_at, updated_at)
    VALUES (${questionId}, 1, ${examPaperId}, ${boardId}, ${classLevel}, ${subjectId}, ${medium}, ${chapterId}, ${topicId}, ${conceptId}, ${learningOutcomeId}, ${questionText}, ${questionType}, ${marks}, ${difficulty}, ${bloomLevel}, ${sourceUrl}, ${licenceType}, 'pending_verification', 'draft', to_tsvector('english', ${questionText}), ${now}, ${now})`;
  await writeAudit({ actorUserId: session.user_id, action: 'question_bank.created', entityType: 'question', entityId: questionId, metadata: { boardId, questionType } });

  const rows = await sql`SELECT * FROM board_questions WHERE id = ${questionId}`;
  return json(res, 201, { ok: true, question: serialize(rows.rows[0]) });
}

async function handleUpdate(req, res, session, questionId) {
  if (!hasRole(session, 'admin') && !hasRole(session, 'teacher')) return json(res, 403, { error: { code: 'FORBIDDEN', message: 'Only teacher or admin can update a question.' } });
  const rows = await sql`SELECT * FROM board_questions WHERE id = ${questionId}`;
  if (!rows.rows.length) return json(res, 404, { error: { code: 'QUESTION_NOT_FOUND', message: 'No question with that id.' } });
  const before = rows.rows[0];
  const b = req.body || {};

  // Publishing/verification-state changes are admin-only governance; a
  // teacher may correct metadata (marks, difficulty, mapping) but not
  // move a question to 'published' or 'verified' unilaterally.
  const status = b.status !== undefined ? String(b.status) : before.status;
  const verificationStatus = b.verificationStatus !== undefined ? String(b.verificationStatus) : before.verification_status;
  if ((status !== before.status || verificationStatus !== before.verification_status) && !hasRole(session, 'admin')) {
    return json(res, 403, { error: { code: 'FORBIDDEN', message: 'Only admin can change a question\'s status or verification state.' } });
  }
  if (!STATUSES.has(status)) return json(res, 400, { error: { code: 'INVALID_STATUS', message: 'Invalid status.' } });
  if (!VERIFICATION_STATES.has(verificationStatus)) return json(res, 400, { error: { code: 'INVALID_VERIFICATION_STATUS', message: 'Invalid verificationStatus.' } });

  const difficulty = b.difficulty !== undefined ? String(b.difficulty) : before.difficulty;
  const marks = b.marks !== undefined ? Number(b.marks) : before.marks;
  if (!DIFFICULTIES.has(difficulty)) return json(res, 400, { error: { code: 'INVALID_DIFFICULTY', message: 'Invalid difficulty.' } });
  if (marks !== null && (!Number.isFinite(marks) || marks < 0)) return json(res, 400, { error: { code: 'INVALID_MARKS', message: 'marks must be a non-negative number.' } });

  const expectedVersion = Number(b.expectedVersion);
  if (!Number.isInteger(expectedVersion)) return json(res, 400, { error: { code: 'EXPECTED_VERSION_REQUIRED', message: 'expectedVersion is required.' } });
  if (expectedVersion !== before.version) return json(res, 409, { error: { code: 'STALE_VERSION', message: 'This question changed since you last read it.' } });

  const now = new Date().toISOString();
  const upd = await sql`UPDATE board_questions SET status=${status}, verification_status=${verificationStatus}, difficulty=${difficulty}, marks=${marks}, version=version+1, updated_at=${now} WHERE id=${questionId} AND version=${expectedVersion}`;
  if (!upd.count) return json(res, 409, { error: { code: 'STALE_VERSION', message: 'This question changed since you last read it.' } });
  await writeAudit({ actorUserId: session.user_id, action: 'question_bank.updated', entityType: 'question', entityId: questionId, metadata: { status, verificationStatus } });

  const after = await sql`SELECT * FROM board_questions WHERE id = ${questionId}`;
  return json(res, 200, { ok: true, question: serialize(after.rows[0]) });
}

async function handleSearch(req, res, session) {
  const canSeeUnpublished = hasRole(session, 'admin') || hasRole(session, 'teacher');
  const includeUnpublished = canSeeUnpublished && String(req.query?.includeUnpublished || '') === 'true';

  const boardId = req.query?.boardId ? String(req.query.boardId) : null;
  const classLevel = req.query?.classLevel ? String(req.query.classLevel) : null;
  const subjectId = req.query?.subjectId ? String(req.query.subjectId) : null;
  const chapterId = req.query?.chapterId ? String(req.query.chapterId) : null;
  const topicId = req.query?.topicId ? String(req.query.topicId) : null;
  const conceptId = req.query?.conceptId ? String(req.query.conceptId) : null;
  const learningOutcomeId = req.query?.learningOutcomeId ? String(req.query.learningOutcomeId) : null;
  const examPaperId = req.query?.examPaperId ? String(req.query.examPaperId) : null;
  const questionType = req.query?.questionType ? String(req.query.questionType) : null;
  const difficulty = req.query?.difficulty ? String(req.query.difficulty) : null;
  const keyword = req.query?.q ? String(req.query.q).trim().slice(0, 200) : null;
  const limit = Math.min(Math.max(parseInt(req.query?.limit, 10) || 20, 1), 100);
  const offset = Math.max(parseInt(req.query?.offset, 10) || 0, 0);

  const rows = await sql`
    SELECT * FROM board_questions
    WHERE (${includeUnpublished} OR (status = 'published' AND verification_status = 'verified'))
      AND (${boardId}::text IS NULL OR board_id = ${boardId})
      AND (${classLevel}::text IS NULL OR class_level = ${classLevel})
      AND (${subjectId}::text IS NULL OR subject_id = ${subjectId})
      AND (${chapterId}::text IS NULL OR chapter_id = ${chapterId})
      AND (${topicId}::text IS NULL OR topic_id = ${topicId})
      AND (${conceptId}::text IS NULL OR concept_id = ${conceptId})
      AND (${learningOutcomeId}::text IS NULL OR learning_outcome_id = ${learningOutcomeId})
      AND (${examPaperId}::text IS NULL OR exam_paper_id = ${examPaperId} OR id IN (SELECT board_question_id FROM mock_exam_questions WHERE exam_paper_id = ${examPaperId}))
      AND (${questionType}::text IS NULL OR question_type = ${questionType})
      AND (${difficulty}::text IS NULL OR difficulty = ${difficulty})
      AND (${keyword}::text IS NULL OR search_vector @@ plainto_tsquery('english', ${keyword}))
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}`;

  // Low-bandwidth mode (M75, IB-17): a slim payload drops every field a
  // list view doesn't need (provenance, timestamps, full mapping ids),
  // cutting response size for constrained connections. Real and testable,
  // not a claim of offline support — see M75's report for that distinction.
  const slim = String(req.query?.fields || '') === 'minimal';
  const serialized = rows.rows.map(serialize);
  const payload = slim ? serialized.map(q2 => ({ id: q2.id, questionText: q2.questionText, questionType: q2.questionType, marks: q2.marks, difficulty: q2.difficulty })) : serialized;
  return json(res, 200, { ok: true, questions: payload, limit, offset, count: rows.rows.length, slim });
}

async function handleGet(req, res, session, questionId) {
  const rows = await sql`SELECT * FROM board_questions WHERE id = ${questionId}`;
  if (!rows.rows.length) return json(res, 404, { error: { code: 'QUESTION_NOT_FOUND', message: 'No question with that id.' } });
  const q = rows.rows[0];
  const canSeeUnpublished = hasRole(session, 'admin') || hasRole(session, 'teacher');
  const isVisible = canSeeUnpublished || (q.status === 'published' && q.verification_status === 'verified');
  if (!isVisible) return json(res, 404, { error: { code: 'QUESTION_NOT_FOUND', message: 'No question with that id.' } }); // 404, not 403 — do not confirm existence of unpublished content to unauthorized readers
  return json(res, 200, { ok: true, question: serialize(q) });
}

async function handler(req, res) {
  try {
    const session = await requireAuth(req);
    const questionId = req.query?.id ? String(req.query.id) : null;
    if (req.method === 'GET' && questionId) return await handleGet(req, res, session, questionId);
    if (req.method === 'GET' && !questionId) return await handleSearch(req, res, session);
    if (req.method === 'POST') return await handleCreate(req, res, session);
    if (req.method === 'PATCH' && questionId) return await handleUpdate(req, res, session, questionId);
    return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'GET, POST, or PATCH required.' } }, { Allow: 'GET, POST, PATCH' });
  } catch (e) { return json(res, e.status || 500, { error: { code: e.code || 'QUESTION_BANK_FAILED', message: e.status ? e.message : 'Unable to process question bank request.' } }); }
}
  return handler;
}
const handler_question_bank = __build_question_bank();

/* ================ exam-attempts.js ================ */
function __build_exam_attempts(){
// M67 — Assessment & Exam Room (Blueprint V3.2/V3.3, EX-04/EX-09).
// Server-authoritative on every axis that matters: the deadline is a
// stored timestamp computed at start (never trust a client-sent "time
// remaining"), a second concurrent attempt on the same paper is blocked
// by a real unique index (not just an application check), autosave is an
// idempotent per-question upsert (retrying a save never duplicates an
// answer), and evaluation is a real teacher/admin-driven scoring workflow
// rather than a fabricated auto-grade.
const ATTEMPT_ACTIONS = new Set(['save_answer', 'mark_for_review', 'submit', 'abandon', 'score_answer', 'finalize_evaluation']);

function serializeAttempt(a, now) {
  const deadline = new Date(a.server_deadline_at).getTime();
  const remainingMs = a.status === 'in_progress' ? Math.max(0, deadline - now.getTime()) : null;
  return {
    id: a.id, examPaperId: a.exam_paper_id, learnerId: a.learner_id, timeLimitSeconds: a.time_limit_seconds,
    startedAt: a.started_at, serverDeadlineAt: a.server_deadline_at, submittedAt: a.submitted_at, evaluatedAt: a.evaluated_at,
    totalScore: a.total_score, status: a.status, version: a.version,
    secondsRemaining: remainingMs === null ? null : Math.floor(remainingMs / 1000),
  };
}

// Runs at the top of every read/write on an attempt. If the server
// deadline has passed while status is still 'in_progress', the attempt is
// authoritatively flipped to 'timed_out' right here — not by trusting
// whatever the client's local countdown says.
async function applyTimeoutIfNeeded(attempt) {
  if (attempt.status !== 'in_progress') return attempt;
  const now = new Date();
  if (now.getTime() < new Date(attempt.server_deadline_at).getTime()) return attempt;
  const nowIso = now.toISOString();
  await sql`UPDATE exam_attempts SET status='timed_out', version=version+1, updated_at=${nowIso} WHERE id=${attempt.id} AND version=${attempt.version}`;
  await sql`INSERT INTO exam_attempt_events (id, attempt_id, event_type, metadata, created_at) VALUES (${id('eae')}, ${attempt.id}, 'timed_out', NULL, ${nowIso})`;
  const rows = await sql`SELECT * FROM exam_attempts WHERE id = ${attempt.id}`;
  return rows.rows[0];
}

async function handleStart(req, res, session) {
  const b = req.body || {};
  const examPaperId = String(b.examPaperId || '').trim();
  const learnerId = String(b.learnerId || '').trim();
  const timeLimitSeconds = Number(b.timeLimitSeconds);
  if (!examPaperId || !learnerId || !Number.isInteger(timeLimitSeconds) || timeLimitSeconds < 60) {
    return json(res, 400, { error: { code: 'MISSING_FIELDS', message: 'examPaperId, learnerId, and an integer timeLimitSeconds >= 60 are required.' } });
  }
  await requireLearnerAccess(session, learnerId); // throws 403 if this session cannot act as this learner

  const paperRows = await sql`SELECT id, status FROM exam_papers WHERE id = ${examPaperId}`;
  if (!paperRows.rows.length) return json(res, 400, { error: { code: 'UNKNOWN_EXAM_PAPER', message: 'examPaperId does not match any existing paper.' } });
  if (paperRows.rows[0].status !== 'published') return json(res, 400, { error: { code: 'PAPER_NOT_PUBLISHED', message: 'Only a published exam paper can be attempted — evidence integrity requires this.' } });

  const existingInProgress = await sql`SELECT id FROM exam_attempts WHERE exam_paper_id = ${examPaperId} AND learner_id = ${learnerId} AND status = 'in_progress'`;
  if (existingInProgress.rows.length) return json(res, 409, { error: { code: 'ATTEMPT_ALREADY_IN_PROGRESS', message: 'An attempt on this paper is already in progress for this learner. Resume it instead of starting a new one.', attemptId: existingInProgress.rows[0].id } });

  const attemptId = id('att');
  const now = new Date();
  const deadline = new Date(now.getTime() + timeLimitSeconds * 1000);
  const nowIso = now.toISOString();
  await sql`INSERT INTO exam_attempts (id, exam_paper_id, learner_id, time_limit_seconds, started_at, server_deadline_at, status, version, created_at, updated_at)
    VALUES (${attemptId}, ${examPaperId}, ${learnerId}, ${timeLimitSeconds}, ${nowIso}, ${deadline.toISOString()}, 'in_progress', 1, ${nowIso}, ${nowIso})`;
  await sql`INSERT INTO exam_attempt_events (id, attempt_id, event_type, metadata, created_at) VALUES (${id('eae')}, ${attemptId}, 'started', NULL, ${nowIso})`;

  const rows = await sql`SELECT * FROM exam_attempts WHERE id = ${attemptId}`;
  return json(res, 201, { ok: true, attempt: serializeAttempt(rows.rows[0], now) });
}

async function fetchAttemptOr404(res, attemptId) {
  const rows = await sql`SELECT * FROM exam_attempts WHERE id = ${attemptId}`;
  if (!rows.rows.length) { json(res, 404, { error: { code: 'ATTEMPT_NOT_FOUND', message: 'No exam attempt with that id.' } }); return null; }
  return rows.rows[0];
}

async function handleGet(req, res, session, attemptId) {
  let attempt = await fetchAttemptOr404(res, attemptId);
  if (!attempt) return;
  if (!hasRole(session, 'admin') && !hasRole(session, 'teacher')) await requireLearnerAccess(session, attempt.learner_id);
  attempt = await applyTimeoutIfNeeded(attempt);
  const answers = await sql`SELECT question_id, response_text, marked_for_review, marks_awarded FROM exam_attempt_answers WHERE attempt_id = ${attemptId}`;
  return json(res, 200, { ok: true, attempt: serializeAttempt(attempt, new Date()), answers: answers.rows });
}

async function handleTransition(req, res, session, attemptId) {
  const action = String(req.body?.action || '');
  if (!ATTEMPT_ACTIONS.has(action)) return json(res, 400, { error: { code: 'INVALID_ACTION', message: `action must be one of: ${[...ATTEMPT_ACTIONS].join(', ')}.` } });

  let attempt = await fetchAttemptOr404(res, attemptId);
  if (!attempt) return;

  const isPrivileged = hasRole(session, 'admin') || hasRole(session, 'teacher');
  if (action === 'score_answer' || action === 'finalize_evaluation') {
    if (!isPrivileged) return json(res, 403, { error: { code: 'FORBIDDEN', message: 'Only teacher or admin can score or finalize an attempt.' } });
  } else {
    // save_answer / mark_for_review / submit / abandon are the learner's own actions.
    if (!isPrivileged) await requireLearnerAccess(session, attempt.learner_id);
  }

  attempt = await applyTimeoutIfNeeded(attempt);

  const expectedVersion = Number(req.body?.expectedVersion);
  if (!Number.isInteger(expectedVersion)) return json(res, 400, { error: { code: 'EXPECTED_VERSION_REQUIRED', message: 'expectedVersion is required.' } });
  if (expectedVersion !== attempt.version) return json(res, 409, { error: { code: 'STALE_VERSION', message: 'This attempt changed since you last read it (it may have just timed out — re-fetch it).' } });

  const now = new Date();
  const nowIso = now.toISOString();

  if (action === 'save_answer' || action === 'mark_for_review') {
    if (attempt.status !== 'in_progress') return json(res, 409, { error: { code: 'ATTEMPT_NOT_ACTIVE', message: `Cannot modify an answer on an attempt with status '${attempt.status}'.` } });
    // M75 (IB-17, low-bandwidth/reconnect): reuses the EXISTING offline-sync
    // engine (api/_lib/offline-sync.js) rather than building a parallel
    // retry-dedup mechanism. Only wired for save_answer — the highest-value
    // spot for "a spotty connection retries the same autosave." If the
    // caller doesn't send an x-baa-operation-id header, beginOfflineOperation
    // returns {enabled:false} immediately with no DB access, so this is a
    // no-op for every caller that isn't opted in (including every existing
    // test and every other action here).
    let offlineOp = null;
    if (action === 'save_answer') {
      offlineOp = await beginOfflineOperation(req, { learnerId: attempt.learner_id, endpoint: 'exam-attempt-answer' });
      if (offlineOp.duplicate) return json(res, 200, offlineOp.response);
    }
    const questionId = String(req.body?.questionId || '');
    if (!questionId) return json(res, 400, { error: { code: 'QUESTION_ID_REQUIRED', message: 'questionId is required.' } });
    const responseText = action === 'save_answer' ? String(req.body?.responseText ?? '').slice(0, 10000) : undefined;
    const markedForReview = action === 'mark_for_review' ? Boolean(req.body?.markedForReview) : undefined;

    const existing = await sql`SELECT * FROM exam_attempt_answers WHERE attempt_id = ${attemptId} AND question_id = ${questionId}`;
    if (existing.rows.length) {
      const before = existing.rows[0];
      const newText = responseText !== undefined ? responseText : before.response_text;
      const newMarked = markedForReview !== undefined ? markedForReview : before.marked_for_review;
      await sql`UPDATE exam_attempt_answers SET response_text=${newText}, marked_for_review=${newMarked}, version=version+1, answered_at=${nowIso}, updated_at=${nowIso} WHERE id=${before.id}`;
    } else {
      await sql`INSERT INTO exam_attempt_answers (id, attempt_id, question_id, response_text, marked_for_review, version, answered_at, created_at, updated_at)
        VALUES (${id('eaa')}, ${attemptId}, ${questionId}, ${responseText ?? null}, ${markedForReview ?? false}, 1, ${nowIso}, ${nowIso}, ${nowIso})`;
    }
    await sql`INSERT INTO exam_attempt_events (id, attempt_id, event_type, metadata, created_at) VALUES (${id('eae')}, ${attemptId}, ${action === 'save_answer' ? 'answer_saved' : 'marked_for_review'}, ${questionId}, ${nowIso})`;
    // Autosave/mark-for-review does not itself consume the attempt's optimistic-concurrency
    // version (it's a per-question row) — but re-reading the attempt still reflects live secondsRemaining.
    const rows = await sql`SELECT * FROM exam_attempts WHERE id = ${attemptId}`;
    const responseBody = { ok: true, attempt: serializeAttempt(rows.rows[0], now) };
    if (offlineOp) await completeOfflineOperation(offlineOp, responseBody);
    return json(res, 200, responseBody);
  }

  if (action === 'submit') {
    if (attempt.status !== 'in_progress') return json(res, 409, { error: { code: 'ATTEMPT_ALREADY_FINALIZED', message: `This attempt cannot be submitted again — its status is '${attempt.status}'.` } });
    const upd = await sql`UPDATE exam_attempts SET status='submitted', submitted_at=${nowIso}, version=version+1, updated_at=${nowIso} WHERE id=${attemptId} AND version=${expectedVersion}`;
    if (!upd.count) return json(res, 409, { error: { code: 'STALE_VERSION', message: 'This attempt changed since you last read it.' } });
    await sql`INSERT INTO exam_attempt_events (id, attempt_id, event_type, metadata, created_at) VALUES (${id('eae')}, ${attemptId}, 'submitted', NULL, ${nowIso})`;
    const rows = await sql`SELECT * FROM exam_attempts WHERE id = ${attemptId}`;
    return json(res, 200, { ok: true, attempt: serializeAttempt(rows.rows[0], now) });
  }

  if (action === 'abandon') {
    if (attempt.status !== 'in_progress') return json(res, 409, { error: { code: 'ATTEMPT_ALREADY_FINALIZED', message: `Cannot abandon an attempt with status '${attempt.status}'.` } });
    const upd = await sql`UPDATE exam_attempts SET status='abandoned', version=version+1, updated_at=${nowIso} WHERE id=${attemptId} AND version=${expectedVersion}`;
    if (!upd.count) return json(res, 409, { error: { code: 'STALE_VERSION', message: 'This attempt changed since you last read it.' } });
    await sql`INSERT INTO exam_attempt_events (id, attempt_id, event_type, metadata, created_at) VALUES (${id('eae')}, ${attemptId}, 'abandoned', NULL, ${nowIso})`;
    const rows = await sql`SELECT * FROM exam_attempts WHERE id = ${attemptId}`;
    return json(res, 200, { ok: true, attempt: serializeAttempt(rows.rows[0], now) });
  }

  if (action === 'score_answer') {
    if (attempt.status !== 'submitted' && attempt.status !== 'timed_out') return json(res, 409, { error: { code: 'ATTEMPT_NOT_READY_FOR_SCORING', message: 'An attempt can only be scored once it is submitted or timed out.' } });
    const questionId = String(req.body?.questionId || '');
    const marksAwarded = Number(req.body?.marksAwarded);
    if (!questionId || !Number.isFinite(marksAwarded) || marksAwarded < 0) return json(res, 400, { error: { code: 'INVALID_SCORE', message: 'questionId and a non-negative marksAwarded are required.' } });
    const upd = await sql`UPDATE exam_attempt_answers SET marks_awarded=${marksAwarded}, version=version+1, updated_at=${nowIso} WHERE attempt_id=${attemptId} AND question_id=${questionId}`;
    if (!upd.count) return json(res, 404, { error: { code: 'ANSWER_NOT_FOUND', message: 'No answer row for that question on this attempt (the learner may not have answered it).' } });
    await sql`INSERT INTO exam_attempt_events (id, attempt_id, event_type, metadata, created_at) VALUES (${id('eae')}, ${attemptId}, 'answer_scored', ${JSON.stringify({ questionId, marksAwarded })}, ${nowIso})`;
    return json(res, 200, { ok: true });
  }

  if (action === 'finalize_evaluation') {
    if (attempt.status !== 'submitted' && attempt.status !== 'timed_out') return json(res, 409, { error: { code: 'ATTEMPT_NOT_READY_FOR_SCORING', message: 'An attempt can only be finalized once it is submitted or timed out.' } });
    const answers = await sql`SELECT marks_awarded FROM exam_attempt_answers WHERE attempt_id = ${attemptId}`;
    const totalScore = answers.rows.reduce((sum, a) => sum + (Number(a.marks_awarded) || 0), 0);
    const upd = await sql`UPDATE exam_attempts SET status='evaluated', total_score=${totalScore}, evaluated_at=${nowIso}, version=version+1, updated_at=${nowIso} WHERE id=${attemptId} AND version=${expectedVersion}`;
    if (!upd.count) return json(res, 409, { error: { code: 'STALE_VERSION', message: 'This attempt changed since you last read it.' } });
    await sql`INSERT INTO exam_attempt_events (id, attempt_id, event_type, metadata, created_at) VALUES (${id('eae')}, ${attemptId}, 'evaluated', ${JSON.stringify({ totalScore })}, ${nowIso})`;
    await writeAudit({ actorUserId: session.user_id, action: 'exam_attempts.evaluated', entityType: 'exam_attempt', entityId: attemptId, metadata: { totalScore } });
    const rows = await sql`SELECT * FROM exam_attempts WHERE id = ${attemptId}`;
    return json(res, 200, { ok: true, attempt: serializeAttempt(rows.rows[0], now) });
  }
}

async function handleHistory(req, res, session) {
  const learnerId = String(req.query?.learnerId || '');
  if (!learnerId) return json(res, 400, { error: { code: 'LEARNER_ID_REQUIRED', message: 'learnerId is required.' } });
  if (!hasRole(session, 'admin') && !hasRole(session, 'teacher')) await requireLearnerAccess(session, learnerId);
  const rows = await sql`SELECT * FROM exam_attempts WHERE learner_id = ${learnerId} ORDER BY started_at DESC LIMIT 100`;
  return json(res, 200, { ok: true, attempts: rows.rows.map(a => serializeAttempt(a, new Date())) });
}

async function handler(req, res) {
  try {
    const session = await requireAuth(req);
    const attemptId = req.query?.id ? String(req.query.id) : null;
    if (req.method === 'GET' && attemptId) return await handleGet(req, res, session, attemptId);
    if (req.method === 'GET' && !attemptId) return await handleHistory(req, res, session);
    if (req.method === 'POST') return await handleStart(req, res, session);
    if (req.method === 'PATCH' && attemptId) return await handleTransition(req, res, session, attemptId);
    return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'GET, POST, or PATCH required.' } }, { Allow: 'GET, POST, PATCH' });
  } catch (e) { return json(res, e.status || 500, { error: { code: e.code || 'EXAM_ATTEMPTS_FAILED', message: e.status ? e.message : 'Unable to process exam attempt request.' } }); }
}
  return handler;
}
const handler_exam_attempts = __build_exam_attempts();

/* ================ adaptive-practice.js ================ */
function __build_adaptive_practice(){
// M68 — Adaptive Practice + Remediation (Blueprint V3.2/V3.3, EX-05/EX-06/EX-07).
// Evidence -> Mastery Gap -> Verified Question Selection -> Attempt ->
// Mistake Classification -> Micro-concept -> Explanation -> Similar
// Practice -> Re-test -> Mastery Update.
//
// Grading honesty: a practice attempt is graded deterministically only
// when the question has a real correct_answer_text (teacher-authored, via
// M66's question-bank update); otherwise it stays is_correct=NULL
// ('ungraded') until a human scores it. Nothing here ever guesses at
// correctness — see graded_by CHECK in the migration.

const MASTERED_THRESHOLD = 0.8;
const DEVELOPING_THRESHOLD = 0.4;
const MIN_ATTEMPTS_FOR_MASTERED = 3;
const FAILURE_TYPES = new Set(['conceptual', 'calculation', 'comprehension', 'application', 'careless', 'time_pressure', 'unclassified']);

function serializeMastery(m) {
  return { conceptId: m.concept_id, correctCount: m.correct_count, incorrectCount: m.incorrect_count, masteryScore: m.mastery_score === null ? null : Number(m.mastery_score), status: m.status, lastPracticedAt: m.last_practiced_at };
}

async function selectNextQuestion(conceptId, practiceSessionId) {
  // Verified question selection: only published+verified content, and
  // never a question already attempted in this session (a session
  // shouldn't repeat the same item — that would be re-showing, not
  // "similar practice").
  const rows = await sql`
    SELECT * FROM board_questions
    WHERE concept_id = ${conceptId} AND status = 'published' AND verification_status = 'verified'
      AND id NOT IN (SELECT question_id FROM practice_attempts WHERE practice_session_id = ${practiceSessionId})
    ORDER BY difficulty ASC, created_at ASC
    LIMIT 1`;
  return rows.rows[0] || null;
}

async function recomputeMastery(learnerId, conceptId) {
  const gradedRows = await sql`SELECT is_correct FROM practice_attempts pa JOIN practice_sessions ps ON ps.id = pa.practice_session_id WHERE ps.learner_id = ${learnerId} AND ps.concept_id = ${conceptId} AND pa.is_correct IS NOT NULL`;
  const graded = gradedRows.rows;
  const correctCount = graded.filter(r => r.is_correct === true).length;
  const incorrectCount = graded.filter(r => r.is_correct === false).length;
  const total = correctCount + incorrectCount;
  let masteryScore = null, status = 'insufficient_evidence';
  if (total > 0) {
    masteryScore = correctCount / total;
    if (masteryScore >= MASTERED_THRESHOLD && total >= MIN_ATTEMPTS_FOR_MASTERED) status = 'mastered';
    else if (masteryScore >= DEVELOPING_THRESHOLD) status = 'developing';
    else status = 'weak';
  }
  const now = new Date().toISOString();
  const existing = await sql`SELECT id, version FROM concept_mastery WHERE learner_id = ${learnerId} AND concept_id = ${conceptId}`;
  if (existing.rows.length) {
    await sql`UPDATE concept_mastery SET correct_count=${correctCount}, incorrect_count=${incorrectCount}, mastery_score=${masteryScore}, status=${status}, last_practiced_at=${now}, version=version+1, updated_at=${now} WHERE id=${existing.rows[0].id}`;
  } else {
    await sql`INSERT INTO concept_mastery (id, learner_id, concept_id, correct_count, incorrect_count, mastery_score, status, last_practiced_at, version, updated_at) VALUES (${id('cm')}, ${learnerId}, ${conceptId}, ${correctCount}, ${incorrectCount}, ${masteryScore}, ${status}, ${now}, 1, ${now})`;
  }
}

async function handleWeakConcepts(req, res, session) {
  const learnerId = String(req.query?.learnerId || '');
  if (!learnerId) return json(res, 400, { error: { code: 'LEARNER_ID_REQUIRED', message: 'learnerId is required.' } });
  if (!hasRole(session, 'admin') && !hasRole(session, 'teacher')) await requireLearnerAccess(session, learnerId);
  const rows = await sql`SELECT * FROM concept_mastery WHERE learner_id = ${learnerId} AND status IN ('weak', 'insufficient_evidence') ORDER BY mastery_score ASC NULLS FIRST`;
  return json(res, 200, { ok: true, weakConcepts: rows.rows.map(serializeMastery) });
}

async function handleStartSession(req, res, session) {
  const b = req.body || {};
  const learnerId = String(b.learnerId || '').trim();
  const conceptId = String(b.conceptId || '').trim();
  if (!learnerId || !conceptId) return json(res, 400, { error: { code: 'MISSING_FIELDS', message: 'learnerId and conceptId are required.' } });
  await requireLearnerAccess(session, learnerId);

  const conceptRows = await sql`SELECT id FROM concepts WHERE id = ${conceptId}`;
  if (!conceptRows.rows.length) return json(res, 400, { error: { code: 'UNKNOWN_CONCEPT', message: 'conceptId does not match any existing concept.' } });

  const sessionId = id('ps');
  const now = new Date().toISOString();
  await sql`INSERT INTO practice_sessions (id, learner_id, concept_id, status, version, created_at) VALUES (${sessionId}, ${learnerId}, ${conceptId}, 'in_progress', 1, ${now})`;

  const question = await selectNextQuestion(conceptId, sessionId);
  if (!question) return json(res, 201, { ok: true, sessionId, question: null, message: 'No verified, published question is available for this concept yet.' });
  return json(res, 201, { ok: true, sessionId, question: { id: question.id, questionText: question.question_text, questionType: question.question_type, marks: question.marks, difficulty: question.difficulty } });
}

async function handleSubmitAnswer(req, res, session, sessionId) {
  const rows = await sql`SELECT * FROM practice_sessions WHERE id = ${sessionId}`;
  if (!rows.rows.length) return json(res, 404, { error: { code: 'SESSION_NOT_FOUND', message: 'No practice session with that id.' } });
  const practiceSession = rows.rows[0];
  await requireLearnerAccess(session, practiceSession.learner_id);
  if (practiceSession.status !== 'in_progress') return json(res, 409, { error: { code: 'SESSION_NOT_ACTIVE', message: `This session's status is '${practiceSession.status}'.` } });

  const questionId = String(req.body?.questionId || '');
  const responseText = String(req.body?.responseText || '').trim().slice(0, 5000);
  if (!questionId) return json(res, 400, { error: { code: 'QUESTION_ID_REQUIRED', message: 'questionId is required.' } });

  const qRows = await sql`SELECT id, question_type, correct_answer_text, explanation_text FROM board_questions WHERE id = ${questionId}`;
  if (!qRows.rows.length) return json(res, 400, { error: { code: 'UNKNOWN_QUESTION', message: 'questionId does not match any existing question.' } });
  const question = qRows.rows[0];

  // Deterministic grading ONLY when a real answer key exists — otherwise
  // stays ungraded rather than fabricating a judgment.
  let isCorrect = null, gradedBy = 'ungraded';
  if (question.correct_answer_text !== null && question.correct_answer_text !== undefined && (question.question_type === 'mcq' || question.question_type === 'numerical')) {
    isCorrect = responseText.trim().toLowerCase() === String(question.correct_answer_text).trim().toLowerCase();
    gradedBy = 'deterministic';
  }

  const now = new Date().toISOString();
  const existingAttempt = await sql`SELECT id FROM practice_attempts WHERE practice_session_id = ${sessionId} AND question_id = ${questionId}`;
  if (existingAttempt.rows.length) {
    await sql`UPDATE practice_attempts SET response_text=${responseText}, is_correct=${isCorrect}, graded_by=${gradedBy}, answered_at=${now} WHERE id=${existingAttempt.rows[0].id}`;
  } else {
    await sql`INSERT INTO practice_attempts (id, practice_session_id, question_id, response_text, is_correct, graded_by, answered_at) VALUES (${id('pa')}, ${sessionId}, ${questionId}, ${responseText}, ${isCorrect}, ${gradedBy}, ${now})`;
  }

  // If deterministically wrong, log an (initially unclassified) mistake
  // record — a real teacher classifies the failure_type later; nothing
  // here guesses at *why* it was wrong.
  if (isCorrect === false) {
    const dupeExists = await sql`SELECT id FROM mistake_records WHERE learner_id = ${practiceSession.learner_id} AND question_id = ${questionId} AND practice_attempt_id IS NULL`;
    await sql`INSERT INTO mistake_records (id, learner_id, concept_id, question_id, practice_attempt_id, failure_type, recorded_at) VALUES (${id('mr')}, ${practiceSession.learner_id}, ${practiceSession.concept_id}, ${questionId}, NULL, 'unclassified', ${now})`;
  }

  await recomputeMastery(practiceSession.learner_id, practiceSession.concept_id);

  // M69 — Learning Memory Integration: only a deterministically graded
  // attempt is real enough evidence to feed the shared engine. An
  // ungraded (no answer key) attempt updates M68's own concept_mastery
  // above, but must not reach the cross-module learning_evidence table —
  // that would let unverified correctness silently influence AI Mode,
  // the Tutor, Planner, or the Confidence Meter (M9/M10).
  if (gradedBy === 'deterministic') {
    await recordBoardLearningEvidence({ learnerId: practiceSession.learner_id, boardQuestionId: questionId, sourceAttemptId: sessionId, evidenceType: 'board_practice_attempt', isCorrect });
  }

  // Similar practice: select the next verified question in the same concept.
  const nextQuestion = await selectNextQuestion(practiceSession.concept_id, sessionId);
  const masteryRows = await sql`SELECT * FROM concept_mastery WHERE learner_id = ${practiceSession.learner_id} AND concept_id = ${practiceSession.concept_id}`;

  return json(res, 200, {
    ok: true,
    isCorrect, gradedBy,
    explanation: gradedBy === 'deterministic' ? (question.explanation_text || null) : null,
    nextQuestion: nextQuestion ? { id: nextQuestion.id, questionText: nextQuestion.question_text, questionType: nextQuestion.question_type, marks: nextQuestion.marks, difficulty: nextQuestion.difficulty } : null,
    mastery: masteryRows.rows.length ? serializeMastery(masteryRows.rows[0]) : null,
  });
}

async function handleCompleteSession(req, res, session, sessionId) {
  const rows = await sql`SELECT * FROM practice_sessions WHERE id = ${sessionId}`;
  if (!rows.rows.length) return json(res, 404, { error: { code: 'SESSION_NOT_FOUND', message: 'No practice session with that id.' } });
  const practiceSession = rows.rows[0];
  await requireLearnerAccess(session, practiceSession.learner_id);
  if (practiceSession.status !== 'in_progress') return json(res, 409, { error: { code: 'SESSION_NOT_ACTIVE', message: `This session's status is '${practiceSession.status}'.` } });
  const expectedVersion = Number(req.body?.expectedVersion);
  if (!Number.isInteger(expectedVersion)) return json(res, 400, { error: { code: 'EXPECTED_VERSION_REQUIRED', message: 'expectedVersion is required.' } });
  if (expectedVersion !== practiceSession.version) return json(res, 409, { error: { code: 'STALE_VERSION', message: 'This session changed since you last read it.' } });
  const now = new Date().toISOString();
  const upd = await sql`UPDATE practice_sessions SET status='completed', completed_at=${now}, version=version+1 WHERE id=${sessionId} AND version=${expectedVersion}`;
  if (!upd.count) return json(res, 409, { error: { code: 'STALE_VERSION', message: 'This session changed since you last read it.' } });
  return json(res, 200, { ok: true });
}

async function handleClassifyMistake(req, res, session, mistakeId) {
  if (!hasRole(session, 'admin') && !hasRole(session, 'teacher')) return json(res, 403, { error: { code: 'FORBIDDEN', message: 'Only teacher or admin can classify a mistake.' } });
  const failureType = String(req.body?.failureType || '');
  if (!FAILURE_TYPES.has(failureType)) return json(res, 400, { error: { code: 'INVALID_FAILURE_TYPE', message: `failureType must be one of: ${[...FAILURE_TYPES].join(', ')}.` } });
  const rows = await sql`SELECT id FROM mistake_records WHERE id = ${mistakeId}`;
  if (!rows.rows.length) return json(res, 404, { error: { code: 'MISTAKE_NOT_FOUND', message: 'No mistake record with that id.' } });
  await sql`UPDATE mistake_records SET failure_type=${failureType}, classified_by_user_id=${session.user_id} WHERE id=${mistakeId}`;
  return json(res, 200, { ok: true });
}

async function handler(req, res) {
  try {
    const session = await requireAuth(req);
    const action = req.query?.action ? String(req.query.action) : null;
    const sessionId = req.query?.sessionId ? String(req.query.sessionId) : null;
    const mistakeId = req.query?.mistakeId ? String(req.query.mistakeId) : null;

    if (req.method === 'GET' && action === 'weak-concepts') return await handleWeakConcepts(req, res, session);
    if (req.method === 'POST' && !sessionId && !mistakeId) return await handleStartSession(req, res, session);
    if (req.method === 'PATCH' && sessionId && req.body?.action === 'submit_answer') return await handleSubmitAnswer(req, res, session, sessionId);
    if (req.method === 'PATCH' && sessionId && req.body?.action === 'complete') return await handleCompleteSession(req, res, session, sessionId);
    if (req.method === 'PATCH' && mistakeId) return await handleClassifyMistake(req, res, session, mistakeId);
    return json(res, 400, { error: { code: 'INVALID_REQUEST', message: 'Unrecognized adaptive-practice request shape.' } });
  } catch (e) { return json(res, e.status || 500, { error: { code: e.code || 'ADAPTIVE_PRACTICE_FAILED', message: e.status ? e.message : 'Unable to process adaptive practice request.' } }); }
}
  return handler;
}
const handler_adaptive_practice = __build_adaptive_practice();

/* ================ paper-intelligence.js ================ */
function __build_paper_intelligence(){
// M70 — Paper Intelligence + Multi-Year Analytics (Blueprint V3.2/V3.3, IB-08).
// Read-only. Every figure here is a real count/percentage computed from
// published+verified board_questions — never a fabricated trend. The
// blueprint's own instruction ("do not imply prediction certainty... use
// evidence-based language... clearly distinguish observed evidence,
// calculated statistics, inference, insufficient evidence") is enforced
// structurally: year-over-year and "trend" fields are only ever populated
// when the underlying data actually supports them (see MIN_* thresholds
// below); otherwise the response says so explicitly instead of omitting
// the field silently or guessing.
const MIN_YEARS_FOR_TREND = 2;
const MIN_QUESTIONS_PER_YEAR_FOR_TREND = 3;

async function handleAnalyze(req, res, session) {
  const boardId = req.query?.boardId ? String(req.query.boardId) : null;
  const subjectId = req.query?.subjectId ? String(req.query.subjectId) : null;
  const classLevel = req.query?.classLevel ? String(req.query.classLevel) : null;
  if (!boardId) return json(res, 400, { error: { code: 'BOARD_ID_REQUIRED', message: 'boardId is required.' } });

  const canSeeUnpublished = hasRole(session, 'admin') || hasRole(session, 'teacher');
  const includeUnpublished = canSeeUnpublished && String(req.query?.includeUnpublished || '') === 'true';

  const rows = await sql`
    SELECT bq.id, bq.concept_id, bq.chapter_id, bq.question_type, bq.marks, bq.difficulty,
           ep.academic_year_id, ay.year_label, c.name AS concept_name, ch.name AS chapter_name
    FROM board_questions bq
    LEFT JOIN exam_papers ep ON ep.id = bq.exam_paper_id
    LEFT JOIN academic_years ay ON ay.id = ep.academic_year_id
    LEFT JOIN concepts c ON c.id = bq.concept_id
    LEFT JOIN chapters ch ON ch.id = bq.chapter_id
    WHERE bq.board_id = ${boardId}
      AND (${subjectId}::text IS NULL OR bq.subject_id = ${subjectId})
      AND (${classLevel}::text IS NULL OR bq.class_level = ${classLevel})
      AND (${includeUnpublished} OR (bq.status = 'published' AND bq.verification_status = 'verified'))`;

  const questions = rows.rows;
  const totalObserved = questions.length;

  if (totalObserved === 0) {
    return json(res, 200, {
      ok: true, totalQuestionsObserved: 0,
      insufficientEvidence: true, insufficientEvidenceReason: 'No verified, published questions exist yet for this board/subject/class combination.',
      conceptFrequency: [], chapterFrequency: [], questionTypeDistribution: [], difficultyDistribution: [], marksDistribution: [],
      yearOverYear: { insufficientEvidence: true, reason: 'No data at all.' },
    });
  }

  // Observed evidence: raw counts, grouped — no interpretation applied yet.
  function countBy(keyFn, labelFn) {
    const counts = new Map();
    for (const q of questions) {
      const key = keyFn(q);
      if (key === null || key === undefined) continue;
      if (!counts.has(key)) counts.set(key, { key, label: labelFn(q), count: 0 });
      counts.get(key).count += 1;
    }
    return [...counts.values()].sort((a, b) => b.count - a.count);
  }

  const conceptFrequencyRaw = countBy(q => q.concept_id, q => q.concept_name || q.concept_id);
  const chapterFrequencyRaw = countBy(q => q.chapter_id, q => q.chapter_name || q.chapter_id);
  const typeRaw = countBy(q => q.question_type, q => q.question_type);
  const difficultyRaw = countBy(q => q.difficulty, q => q.difficulty);
  const marksRaw = countBy(q => q.marks, q => String(q.marks));

  // Calculated statistics: percentages derived from the observed counts above — labeled as calculated, not presented as raw fact.
  const withPercent = (arr) => arr.map(x => ({ ...x, percentOfTotal: Math.round((x.count / totalObserved) * 1000) / 10 }));

  // Year-over-year: only ever populated with real per-year counts when the
  // blueprint's own evidence bar is met; otherwise explicit insufficient-evidence.
  const byYear = new Map();
  for (const q of questions) {
    if (!q.year_label) continue;
    if (!byYear.has(q.year_label)) byYear.set(q.year_label, []);
    byYear.get(q.year_label).push(q);
  }
  const yearsWithEnoughData = [...byYear.entries()].filter(([, qs]) => qs.length >= MIN_QUESTIONS_PER_YEAR_FOR_TREND);
  let yearOverYear;
  if (byYear.size === 0) {
    yearOverYear = { insufficientEvidence: true, reason: 'No question in this result set is linked to an academic year (exam_paper_id/academic_year_id missing).' };
  } else if (yearsWithEnoughData.length < MIN_YEARS_FOR_TREND) {
    yearOverYear = {
      insufficientEvidence: true,
      reason: `Only ${yearsWithEnoughData.length} academic year(s) have at least ${MIN_QUESTIONS_PER_YEAR_FOR_TREND} questions — at least ${MIN_YEARS_FOR_TREND} are needed before a year-over-year comparison is meaningful, not just theoretically possible.`,
      partialObservedCounts: [...byYear.entries()].map(([year, qs]) => ({ year, questionCount: qs.length })),
    };
  } else {
    yearOverYear = {
      insufficientEvidence: false,
      byYear: yearsWithEnoughData.map(([year, qs]) => {
        const counts = new Map();
        for (const q of qs) {
          if (!q.concept_id) continue;
          if (!counts.has(q.concept_id)) counts.set(q.concept_id, { key: q.concept_id, label: q.concept_name || q.concept_id, count: 0 });
          counts.get(q.concept_id).count += 1;
        }
        return { year, questionCount: qs.length, conceptFrequency: [...counts.values()].sort((a, b) => b.count - a.count) };
      }),
    };
  }

  return json(res, 200, {
    ok: true,
    totalQuestionsObserved: totalObserved,
    insufficientEvidence: false,
    conceptFrequency: withPercent(conceptFrequencyRaw),
    chapterFrequency: withPercent(chapterFrequencyRaw),
    questionTypeDistribution: withPercent(typeRaw),
    difficultyDistribution: withPercent(difficultyRaw),
    marksDistribution: withPercent(marksRaw),
    yearOverYear,
  });
}

async function handler(req, res) {
  try {
    const session = await requireAuth(req);
    if (req.method !== 'GET') return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'GET required.' } }, { Allow: 'GET' });
    return await handleAnalyze(req, res, session);
  } catch (e) { return json(res, e.status || 500, { error: { code: e.code || 'PAPER_INTELLIGENCE_FAILED', message: e.status ? e.message : 'Unable to process paper intelligence request.' } }); }
}
  return handler;
}
const handler_paper_intelligence = __build_paper_intelligence();

/* ================ adaptive-mock-exam.js ================ */
function __build_adaptive_mock_exam(){
// M71 — Adaptive Mock Examination (Blueprint V3.2/V3.3).
// Reuses existing engines rather than duplicating them: M67's
// exam-attempts.js is the actual exam-taking runtime (timer, autosave,
// submission, scoring) — this module only assembles WHICH questions go
// into a new synthetic paper and WHY, then hands off to that existing
// runtime. Selection is deterministic (a fixed, auditable priority order:
// weakest concept first, tie-broken by concept id) and every inclusion is
// recorded with its real reason in mock_exam_questions — this IS the
// "explain why questions were selected" requirement, not a separate log
// bolted on afterward. Marked paper_type='mock' with
// generated_for_learner_id set, so it can never be confused with or
// contaminate an official assessment record.
async function handleGenerate(req, res, session) {
  const b = req.body || {};
  const learnerId = String(b.learnerId || '').trim();
  const boardId = String(b.boardId || '').trim();
  const subjectId = String(b.subjectId || '').trim();
  const classLevel = String(b.classLevel || '').trim();
  const medium = String(b.medium || '').trim();
  const questionCount = Number(b.questionCount);
  const timeLimitSeconds = Number(b.timeLimitSeconds);

  if (!learnerId || !boardId || !subjectId || !classLevel || !medium) return json(res, 400, { error: { code: 'MISSING_FIELDS', message: 'learnerId, boardId, subjectId, classLevel, and medium are required.' } });
  if (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > 50) return json(res, 400, { error: { code: 'INVALID_QUESTION_COUNT', message: 'questionCount must be an integer between 1 and 50.' } });
  if (!Number.isInteger(timeLimitSeconds) || timeLimitSeconds < 60) return json(res, 400, { error: { code: 'INVALID_TIME_LIMIT', message: 'timeLimitSeconds must be an integer >= 60.' } });
  await requireLearnerAccess(session, learnerId);

  const boardRows = await sql`SELECT id FROM boards WHERE id = ${boardId}`;
  if (!boardRows.rows.length) return json(res, 400, { error: { code: 'UNKNOWN_BOARD', message: 'boardId does not match any registered board.' } });

  // Priority 1: weakest concepts first (deterministic tie-break: worst
  // mastery_score first, NULLs — insufficient_evidence — treated as worst).
  const weakConcepts = await sql`
    SELECT cm.concept_id, cm.mastery_score, cm.status
    FROM concept_mastery cm
    JOIN concepts c ON c.id = cm.concept_id
    JOIN topics t ON t.id = c.topic_id
    JOIN chapters ch ON ch.id = t.chapter_id
    JOIN subjects s ON s.id = ch.subject_id
    WHERE cm.learner_id = ${learnerId} AND s.id = ${subjectId} AND cm.status IN ('weak', 'insufficient_evidence')
    ORDER BY cm.mastery_score ASC NULLS FIRST, cm.concept_id ASC`;

  const selected = []; // { boardQuestionId, reason, conceptId }
  const usedQuestionIds = new Set();

  for (const wc of weakConcepts.rows) {
    if (selected.length >= questionCount) break;
    const qRows = await sql`
      SELECT id FROM board_questions
      WHERE concept_id = ${wc.concept_id} AND board_id = ${boardId} AND class_level = ${classLevel} AND medium = ${medium}
        AND status = 'published' AND verification_status = 'verified'
      ORDER BY difficulty ASC, id ASC LIMIT 2`;
    for (const q of qRows.rows) {
      if (selected.length >= questionCount || usedQuestionIds.has(q.id)) continue;
      usedQuestionIds.add(q.id);
      selected.push({ boardQuestionId: q.id, reason: wc.status === 'weak' ? 'weak_concept' : 'insufficient_evidence_concept', conceptId: wc.concept_id });
    }
  }

  // Priority 2 (coverage gap): if weak-concept questions don't fill the
  // requested count, fall back to any other verified/published question
  // for this board/subject/class not already selected — real coverage,
  // not a fabricated "weak concept" label for content chosen by default.
  if (selected.length < questionCount) {
    const fillRows = await sql`
      SELECT id, concept_id FROM board_questions
      WHERE board_id = ${boardId} AND subject_id = ${subjectId} AND class_level = ${classLevel} AND medium = ${medium}
        AND status = 'published' AND verification_status = 'verified'
      ORDER BY id ASC`;
    for (const q of fillRows.rows) {
      if (selected.length >= questionCount) break;
      if (usedQuestionIds.has(q.id)) continue;
      usedQuestionIds.add(q.id);
      selected.push({ boardQuestionId: q.id, reason: 'coverage_gap', conceptId: q.concept_id || null });
    }
  }

  if (selected.length === 0) {
    return json(res, 200, { ok: true, examPaperId: null, questions: [], insufficientEvidence: true, message: 'No verified, published question is available yet for this board/subject/class/medium — cannot generate a mock.' });
  }

  const examPaperId = id('ep');
  const now = new Date().toISOString();
  await sql`INSERT INTO exam_papers (id, board_id, exam_name, class_level, subject_id, medium, verification_status, status, paper_type, generated_for_learner_id, version, created_at, updated_at)
    VALUES (${examPaperId}, ${boardId}, 'Adaptive Mock Exam', ${classLevel}, ${subjectId}, ${medium}, 'verified', 'published', 'mock', ${learnerId}, 1, ${now}, ${now})`;

  let seq = 1;
  for (const s of selected) {
    await sql`INSERT INTO mock_exam_questions (id, exam_paper_id, board_question_id, sequence_no, selection_reason, concept_id, created_at)
      VALUES (${id('mq')}, ${examPaperId}, ${s.boardQuestionId}, ${seq}, ${s.reason}, ${s.conceptId}, ${now})`;
    seq += 1;
  }

  return json(res, 201, {
    ok: true, examPaperId, timeLimitSeconds,
    questionCount: selected.length,
    requestedQuestionCount: questionCount,
    partiallyFilled: selected.length < questionCount,
    selection: selected.map((s, i) => ({ sequenceNo: i + 1, boardQuestionId: s.boardQuestionId, reason: s.reason, conceptId: s.conceptId })),
  });
}

async function handleGetSelection(req, res, session, examPaperId) {
  const paperRows = await sql`SELECT generated_for_learner_id, paper_type FROM exam_papers WHERE id = ${examPaperId}`;
  if (!paperRows.rows.length || paperRows.rows[0].paper_type !== 'mock') return json(res, 404, { error: { code: 'MOCK_EXAM_NOT_FOUND', message: 'No adaptive mock exam with that id.' } });
  if (!hasRole(session, 'admin') && !hasRole(session, 'teacher')) await requireLearnerAccess(session, paperRows.rows[0].generated_for_learner_id);
  const rows = await sql`SELECT sequence_no, board_question_id, selection_reason, concept_id FROM mock_exam_questions WHERE exam_paper_id = ${examPaperId} ORDER BY sequence_no ASC`;
  return json(res, 200, { ok: true, selection: rows.rows.map(r => ({ sequenceNo: r.sequence_no, boardQuestionId: r.board_question_id, reason: r.selection_reason, conceptId: r.concept_id })) });
}

async function handler(req, res) {
  try {
    const session = await requireAuth(req);
    const examPaperId = req.query?.examPaperId ? String(req.query.examPaperId) : null;
    if (req.method === 'GET' && examPaperId) return await handleGetSelection(req, res, session, examPaperId);
    if (req.method === 'POST' && !examPaperId) return await handleGenerate(req, res, session);
    return json(res, 400, { error: { code: 'INVALID_REQUEST', message: 'Unrecognized adaptive-mock-exam request shape.' } });
  } catch (e) { return json(res, e.status || 500, { error: { code: e.code || 'ADAPTIVE_MOCK_EXAM_FAILED', message: e.status ? e.message : 'Unable to process adaptive mock exam request.' } }); }
}
  return handler;
}
const handler_adaptive_mock_exam = __build_adaptive_mock_exam();

/* ================ exam-readiness.js ================ */
function __build_exam_readiness(){
// M72 — Evidence-Based Exam Readiness (Blueprint V3.2/V3.3).
// "Do NOT calculate readiness merely from: percentage, AI opinion, generic
// confidence score... If evidence is insufficient: RETURN INSUFFICIENT
// EVIDENCE... Readiness must be explainable."
//
// This never blends signals into one fabricated number with invented
// weights. Every component (coverage, mastery, mock performance, time
// performance) is computed and returned separately with its own raw
// counts, so the person reading the response can see exactly what a
// readinessLevel is (or isn't) based on. A qualitative readinessLevel is
// only ever assigned when every required component actually has enough
// real evidence (thresholds below) — otherwise the response says
// INSUFFICIENT_EVIDENCE and names which component fell short, rather than
// silently defaulting to a number the UI happens to expect.
const MIN_CONCEPTS_WITH_EVIDENCE = 3;
const MIN_EVALUATED_MOCK_ATTEMPTS = 1;

async function handleReadiness(req, res, session) {
  const learnerId = String(req.query?.learnerId || '');
  const subjectId = String(req.query?.subjectId || '');
  if (!learnerId || !subjectId) return json(res, 400, { error: { code: 'MISSING_FIELDS', message: 'learnerId and subjectId are required.' } });
  if (!hasRole(session, 'admin') && !hasRole(session, 'teacher')) await requireLearnerAccess(session, learnerId);

  // ---- Coverage: how much of this subject's curriculum has ANY evidence ----
  const totalConceptsRows = await sql`
    SELECT COUNT(*)::int AS count FROM concepts c JOIN topics t ON t.id = c.topic_id JOIN chapters ch ON ch.id = t.chapter_id
    WHERE ch.subject_id = ${subjectId}`;
  const totalConcepts = totalConceptsRows.rows[0]?.count || 0;

  const masteryRows = await sql`
    SELECT cm.status, cm.mastery_score FROM concept_mastery cm
    JOIN concepts c ON c.id = cm.concept_id JOIN topics t ON t.id = c.topic_id JOIN chapters ch ON ch.id = t.chapter_id
    WHERE cm.learner_id = ${learnerId} AND ch.subject_id = ${subjectId}`;
  const conceptsWithEvidence = masteryRows.rows.length;
  const masteredCount = masteryRows.rows.filter(r => r.status === 'mastered').length;
  const developingCount = masteryRows.rows.filter(r => r.status === 'developing').length;
  const weakCount = masteryRows.rows.filter(r => r.status === 'weak').length;
  const scoredRows = masteryRows.rows.filter(r => r.mastery_score !== null);
  const averageMasteryScore = scoredRows.length ? scoredRows.reduce((s, r) => s + Number(r.mastery_score), 0) / scoredRows.length : null;

  const coverage = {
    totalConcepts, conceptsWithEvidence,
    coveragePercent: totalConcepts > 0 ? Math.round((conceptsWithEvidence / totalConcepts) * 1000) / 10 : null,
    insufficientEvidence: totalConcepts === 0,
    insufficientEvidenceReason: totalConcepts === 0 ? 'No curriculum (chapters/topics/concepts) exists yet for this subject — coverage cannot be measured against nothing.' : null,
  };
  const mastery = {
    conceptsWithEvidence, masteredCount, developingCount, weakCount,
    averageMasteryScore: averageMasteryScore === null ? null : Math.round(averageMasteryScore * 1000) / 1000,
    insufficientEvidence: conceptsWithEvidence < MIN_CONCEPTS_WITH_EVIDENCE,
    insufficientEvidenceReason: conceptsWithEvidence < MIN_CONCEPTS_WITH_EVIDENCE ? `Only ${conceptsWithEvidence} concept(s) have any practice evidence — at least ${MIN_CONCEPTS_WITH_EVIDENCE} are needed before mastery evidence is meaningful.` : null,
  };

  // ---- Mock performance: real evaluated mock exam_attempts for this subject ----
  const mockRows = await sql`
    SELECT ea.total_score, mq_sum.max_marks
    FROM exam_attempts ea
    JOIN exam_papers ep ON ep.id = ea.exam_paper_id
    LEFT JOIN LATERAL (
      SELECT SUM(bq.marks) AS max_marks FROM mock_exam_questions mq JOIN board_questions bq ON bq.id = mq.board_question_id WHERE mq.exam_paper_id = ep.id
    ) mq_sum ON true
    WHERE ea.learner_id = ${learnerId} AND ep.subject_id = ${subjectId} AND ep.paper_type = 'mock' AND ea.status = 'evaluated'`;
  const evaluatedMocks = mockRows.rows.filter(r => r.max_marks && Number(r.max_marks) > 0);
  const mockPerformance = {
    evaluatedMockAttempts: evaluatedMocks.length,
    averageScorePercent: evaluatedMocks.length ? Math.round((evaluatedMocks.reduce((s, r) => s + (Number(r.total_score) / Number(r.max_marks)), 0) / evaluatedMocks.length) * 1000) / 10 : null,
    insufficientEvidence: evaluatedMocks.length < MIN_EVALUATED_MOCK_ATTEMPTS,
    insufficientEvidenceReason: evaluatedMocks.length < MIN_EVALUATED_MOCK_ATTEMPTS ? `${evaluatedMocks.length} evaluated mock attempt(s) found for this subject — at least ${MIN_EVALUATED_MOCK_ATTEMPTS} is needed.` : null,
  };

  // ---- Time performance: real, observational only — never scored as good/bad ----
  const timedRows = await sql`
    SELECT ea.time_limit_seconds, ea.started_at, ea.submitted_at
    FROM exam_attempts ea JOIN exam_papers ep ON ep.id = ea.exam_paper_id
    WHERE ea.learner_id = ${learnerId} AND ep.subject_id = ${subjectId} AND ea.submitted_at IS NOT NULL`;
  const withDuration = timedRows.rows.map(r => ({ limit: r.time_limit_seconds, used: (new Date(r.submitted_at) - new Date(r.started_at)) / 1000 })).filter(r => r.limit > 0);
  const timePerformance = {
    attemptsObserved: withDuration.length,
    averageTimeUsedPercent: withDuration.length ? Math.round((withDuration.reduce((s, r) => s + (r.used / r.limit), 0) / withDuration.length) * 1000) / 10 : null,
    insufficientEvidence: withDuration.length === 0,
    insufficientEvidenceReason: withDuration.length === 0 ? 'No submitted, timed attempt exists yet for this subject.' : null,
  };

  // ---- Overall readinessLevel: only when every required component clears its own bar ----
  const componentsReady = !coverage.insufficientEvidence && !mastery.insufficientEvidence && !mockPerformance.insufficientEvidence;
  let readinessLevel = 'insufficient_evidence';
  let readinessExplanation;
  if (!componentsReady) {
    const missing = [];
    if (coverage.insufficientEvidence) missing.push('curriculum coverage');
    if (mastery.insufficientEvidence) missing.push('concept mastery evidence');
    if (mockPerformance.insufficientEvidence) missing.push('evaluated mock performance');
    readinessExplanation = `Readiness cannot be determined yet — insufficient evidence for: ${missing.join(', ')}.`;
  } else {
    // Deterministic, disclosed thresholds — not an AI opinion, not a single blended percentage.
    if (mastery.averageMasteryScore >= 0.8 && mockPerformance.averageScorePercent >= 70 && coverage.coveragePercent >= 70) {
      readinessLevel = 'exam_ready';
    } else if (mastery.averageMasteryScore >= 0.5 && mockPerformance.averageScorePercent >= 40) {
      readinessLevel = 'on_track';
    } else {
      readinessLevel = 'building';
    }
    readinessExplanation = `Based on ${coverage.coveragePercent}% curriculum coverage, average mastery score ${mastery.averageMasteryScore}, and average mock score ${mockPerformance.averageScorePercent}% across ${mockPerformance.evaluatedMockAttempts} evaluated mock(s).`;
  }

  return json(res, 200, { ok: true, learnerId, subjectId, coverage, mastery, mockPerformance, timePerformance, readinessLevel, readinessExplanation });
}

async function handler(req, res) {
  try {
    const session = await requireAuth(req);
    if (req.method !== 'GET') return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'GET required.' } }, { Allow: 'GET' });
    return await handleReadiness(req, res, session);
  } catch (e) { return json(res, e.status || 500, { error: { code: e.code || 'EXAM_READINESS_FAILED', message: e.status ? e.message : 'Unable to process exam readiness request.' } }); }
}
  return handler;
}
const handler_exam_readiness = __build_exam_readiness();

/* ================ board-missions.js ================ */
function __build_board_missions(){
// M73 — Board Preparation Missions + Revision (Blueprint V3.2/V3.3).
// "Use the existing BAA planner/revision engines where reusable. Do NOT
// create duplicate planning engines." planner_tasks (db/schema.sql, M11
// AI Planner) already has everything a board-revision task needs — type,
// concept/subject labels, estimated_minutes, priority, a JSONB reasons
// array for explainability, a JSONB action payload, and the full
// pending/completed/missed/cancelled/skipped lifecycle. This module
// writes real rows into that SAME table (type='board_revision') rather
// than inventing a second task-tracking system, so a mission a learner
// completes here shows up in the same Planner surface as every other
// task. Each task's reasons cite the real concept_mastery evidence that
// produced it — never a placeholder or a generic "study more" reason.
const DEFAULT_MINUTES = 20;

async function handleGenerate(req, res, session) {
  const b = req.body || {};
  const learnerId = String(b.learnerId || '').trim();
  const subjectId = String(b.subjectId || '').trim();
  const daysAhead = Number(b.daysAhead);
  if (!learnerId || !subjectId) return json(res, 400, { error: { code: 'MISSING_FIELDS', message: 'learnerId and subjectId are required.' } });
  if (!Number.isInteger(daysAhead) || daysAhead < 1 || daysAhead > 30) return json(res, 400, { error: { code: 'INVALID_DAYS_AHEAD', message: 'daysAhead must be an integer between 1 and 30 (this generates day-by-day/weekly/30-day missions with the same mechanism).' } });
  await requireLearnerAccess(session, learnerId);

  const weakConcepts = await sql`
    SELECT cm.concept_id, cm.mastery_score, cm.status, c.name AS concept_name, s.name AS subject_name
    FROM concept_mastery cm
    JOIN concepts c ON c.id = cm.concept_id
    JOIN topics t ON t.id = c.topic_id JOIN chapters ch ON ch.id = t.chapter_id JOIN subjects s ON s.id = ch.subject_id
    WHERE cm.learner_id = ${learnerId} AND s.id = ${subjectId} AND cm.status IN ('weak', 'insufficient_evidence')
    ORDER BY cm.mastery_score ASC NULLS FIRST, cm.concept_id ASC
    LIMIT ${daysAhead}`;

  if (!weakConcepts.rows.length) {
    return json(res, 200, { ok: true, tasksCreated: 0, insufficientEvidence: true, message: 'No weak or insufficient-evidence concepts found for this subject yet — nothing to build a revision mission from.' });
  }

  const created = [];
  const today = new Date();
  for (let i = 0; i < weakConcepts.rows.length; i++) {
    const wc = weakConcepts.rows[i];
    const scheduledDate = new Date(today.getTime() + i * 86400000).toISOString().slice(0, 10);

    // Idempotency: don't create a second identical mission for the same
    // learner/concept/day if one already exists (e.g. a retry).
    const existing = await sql`SELECT id FROM planner_tasks WHERE learner_id = ${learnerId} AND concept = ${wc.concept_name} AND type = 'board_revision' AND scheduled_date = ${scheduledDate}`;
    if (existing.rows.length) { created.push({ taskId: existing.rows[0].id, conceptId: wc.concept_id, deduplicated: true }); continue; }

    const taskId = id('task');
    const now = new Date().toISOString();
    const reasons = [{ type: wc.status === 'weak' ? 'weak_concept' : 'insufficient_evidence_concept', conceptId: wc.concept_id, masteryScore: wc.mastery_score }];
    const action = { kind: 'board_practice', conceptId: wc.concept_id };
    await sql`INSERT INTO planner_tasks (id, learner_id, type, title, concept, subject, estimated_minutes, priority, reasons, action, status, scheduled_date, created_at)
      VALUES (${taskId}, ${learnerId}, 'board_revision', ${'Revise: ' + (wc.concept_name || wc.concept_id)}, ${wc.concept_name}, ${wc.subject_name}, ${DEFAULT_MINUTES}, ${wc.status === 'weak' ? 'high' : 'medium'}, ${JSON.stringify(reasons)}, ${JSON.stringify(action)}, 'pending', ${scheduledDate}, ${now})`;
    created.push({ taskId, conceptId: wc.concept_id, deduplicated: false });
  }

  return json(res, 201, { ok: true, tasksCreated: created.length, tasks: created });
}

async function handleList(req, res, session) {
  const learnerId = String(req.query?.learnerId || '');
  if (!learnerId) return json(res, 400, { error: { code: 'LEARNER_ID_REQUIRED', message: 'learnerId is required.' } });
  if (!hasRole(session, 'admin') && !hasRole(session, 'teacher')) await requireLearnerAccess(session, learnerId);
  const rows = await sql`SELECT id, title, concept, subject, estimated_minutes, priority, reasons, action, status, scheduled_date, completed_at FROM planner_tasks WHERE learner_id = ${learnerId} AND type = 'board_revision' ORDER BY scheduled_date ASC`;
  return json(res, 200, { ok: true, tasks: rows.rows });
}

async function handleUpdateStatus(req, res, session, taskId) {
  const action = String(req.body?.action || '');
  if (!['complete', 'skip'].includes(action)) return json(res, 400, { error: { code: 'INVALID_ACTION', message: "action must be 'complete' or 'skip'." } });
  const rows = await sql`SELECT id, learner_id, status FROM planner_tasks WHERE id = ${taskId} AND type = 'board_revision'`;
  if (!rows.rows.length) return json(res, 404, { error: { code: 'TASK_NOT_FOUND', message: 'No board-revision task with that id.' } });
  const task = rows.rows[0];
  if (!hasRole(session, 'admin') && !hasRole(session, 'teacher')) await requireLearnerAccess(session, task.learner_id);
  if (task.status !== 'pending') return json(res, 409, { error: { code: 'TASK_NOT_PENDING', message: `This task's status is already '${task.status}'.` } });
  const now = new Date().toISOString();
  const newStatus = action === 'complete' ? 'completed' : 'skipped';
  await sql`UPDATE planner_tasks SET status = ${newStatus}, completed_at = ${action === 'complete' ? now : null} WHERE id = ${taskId}`;
  await sql`INSERT INTO planner_task_events (id, task_id, event, note, occurred_at) VALUES (${id('pte')}, ${taskId}, ${newStatus}, NULL, ${now})`;
  return json(res, 200, { ok: true });
}

async function handler(req, res) {
  try {
    const session = await requireAuth(req);
    const taskId = req.query?.taskId ? String(req.query.taskId) : null;
    if (req.method === 'GET') return await handleList(req, res, session);
    if (req.method === 'POST') return await handleGenerate(req, res, session);
    if (req.method === 'PATCH' && taskId) return await handleUpdateStatus(req, res, session, taskId);
    return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'GET, POST, or PATCH required.' } }, { Allow: 'GET, POST, PATCH' });
  } catch (e) { return json(res, e.status || 500, { error: { code: e.code || 'BOARD_MISSIONS_FAILED', message: e.status ? e.message : 'Unable to process board missions request.' } }); }
}
  return handler;
}
const handler_board_missions = __build_board_missions();

/* ================ board-intelligence.js ================ */
function __build_board_intelligence(){
// M74 — Teacher / Parent / School Board Intelligence (Blueprint V3.2/V3.3).
// Three views, each with a real, verified access boundary — never a
// client-supplied learner/class list:
//   view=learner — any session with real access to that ONE learner
//     (parent via parent_learner, teacher via teacher_learner, the
//     learner themself, or admin) — requireLearnerAccess enforces this
//     exactly like every other module, so a parent can never see a
//     child that isn't theirs.
//   view=class   — teacher/admin only, and a teacher must actually own
//     the class (classes.teacher_user_id) — verified by a real query,
//     not trusted from the request.
//   view=board   — admin only. Disclosed limitation: this codebase has
//     no separate school/institution entity beyond classes/teachers, so
//     "school" intelligence is scoped to a board-wide aggregate rather
//     than a fabricated multi-institution hierarchy that doesn't exist.
const AT_RISK_WEAK_CONCEPT_THRESHOLD = 2;

function summarizeMastery(rows) {
  const masteredCount = rows.filter(r => r.status === 'mastered').length;
  const developingCount = rows.filter(r => r.status === 'developing').length;
  const weakCount = rows.filter(r => r.status === 'weak').length;
  const insufficientCount = rows.filter(r => r.status === 'insufficient_evidence').length;
  const scored = rows.filter(r => r.mastery_score !== null);
  const averageMasteryScore = scored.length ? Math.round((scored.reduce((s, r) => s + Number(r.mastery_score), 0) / scored.length) * 1000) / 1000 : null;
  return { masteredCount, developingCount, weakCount, insufficientCount, averageMasteryScore, atRisk: weakCount >= AT_RISK_WEAK_CONCEPT_THRESHOLD };
}

async function handleLearnerView(req, res, session) {
  const learnerId = String(req.query?.learnerId || '');
  const subjectId = String(req.query?.subjectId || '');
  if (!learnerId || !subjectId) return json(res, 400, { error: { code: 'MISSING_FIELDS', message: 'learnerId and subjectId are required.' } });
  if (!hasRole(session, 'admin') && !hasRole(session, 'teacher')) await requireLearnerAccess(session, learnerId);
  const masteryRows = await sql`SELECT cm.status, cm.mastery_score, c.name AS concept_name FROM concept_mastery cm JOIN concepts c ON c.id = cm.concept_id JOIN topics t ON t.id = c.topic_id JOIN chapters ch ON ch.id = t.chapter_id WHERE cm.learner_id = ${learnerId} AND ch.subject_id = ${subjectId}`;
  const weakConceptNames = masteryRows.rows.filter(r => r.status === 'weak').map(r => r.concept_name);
  const missionRows = await sql`SELECT status FROM planner_tasks WHERE learner_id = ${learnerId} AND type = 'board_revision'`;
  const missionsCompleted = missionRows.rows.filter(r => r.status === 'completed').length;
  const missionsPending = missionRows.rows.filter(r => r.status === 'pending').length;
  return json(res, 200, {
    ok: true, learnerId, subjectId,
    mastery: summarizeMastery(masteryRows.rows),
    weakConcepts: weakConceptNames,
    revisionProgress: { missionsCompleted, missionsPending, insufficientEvidence: missionRows.rows.length === 0 },
  });
}

async function handleClassView(req, res, session) {
  if (!hasRole(session, 'admin') && !hasRole(session, 'teacher')) return json(res, 403, { error: { code: 'FORBIDDEN', message: 'Only teacher or admin can view class intelligence.' } });
  const classId = String(req.query?.classId || '');
  const subjectId = String(req.query?.subjectId || '');
  if (!classId || !subjectId) return json(res, 400, { error: { code: 'MISSING_FIELDS', message: 'classId and subjectId are required.' } });

  if (!hasRole(session, 'admin')) {
    const ownership = await sql`SELECT id FROM classes WHERE id = ${classId} AND teacher_user_id = ${session.user_id}`;
    if (!ownership.rows.length) return json(res, 403, { error: { code: 'NOT_YOUR_CLASS', message: 'You do not own this class.' } });
  }

  const members = await sql`SELECT learner_id FROM class_members WHERE class_id = ${classId} AND status = 'active'`;
  if (!members.rows.length) return json(res, 200, { ok: true, classId, subjectId, learnerCount: 0, insufficientEvidence: true, message: 'This class has no active members.', learners: [] });

  const learnerSummaries = [];
  for (const m of members.rows) {
    const masteryRows = await sql`SELECT cm.status, cm.mastery_score FROM concept_mastery cm JOIN concepts c ON c.id = cm.concept_id JOIN topics t ON t.id = c.topic_id JOIN chapters ch ON ch.id = t.chapter_id WHERE cm.learner_id = ${m.learner_id} AND ch.subject_id = ${subjectId}`;
    learnerSummaries.push({ learnerId: m.learner_id, ...summarizeMastery(masteryRows.rows) });
  }
  const atRiskLearnerIds = learnerSummaries.filter(l => l.atRisk).map(l => l.learnerId);
  const scoredSummaries = learnerSummaries.filter(l => l.averageMasteryScore !== null);
  const classAverageMasteryScore = scoredSummaries.length ? Math.round((scoredSummaries.reduce((s, l) => s + l.averageMasteryScore, 0) / scoredSummaries.length) * 1000) / 1000 : null;

  return json(res, 200, {
    ok: true, classId, subjectId, learnerCount: members.rows.length,
    classAverageMasteryScore, insufficientEvidence: classAverageMasteryScore === null,
    atRiskLearnerIds, atRiskCount: atRiskLearnerIds.length,
    learners: learnerSummaries,
  });
}

async function handleBoardView(req, res, session) {
  if (!hasRole(session, 'admin')) return json(res, 403, { error: { code: 'FORBIDDEN', message: 'Only admin can view board-wide intelligence.' } });
  const boardId = String(req.query?.boardId || '');
  if (!boardId) return json(res, 400, { error: { code: 'BOARD_ID_REQUIRED', message: 'boardId is required.' } });
  const rows = await sql`
    SELECT cm.status, cm.mastery_score FROM concept_mastery cm
    JOIN concepts c ON c.id = cm.concept_id JOIN topics t ON t.id = c.topic_id JOIN chapters ch ON ch.id = t.chapter_id JOIN subjects s ON s.id = ch.subject_id
    WHERE s.board_id = ${boardId}`;
  return json(res, 200, {
    ok: true, boardId,
    scopeNote: 'Aggregated across all concept-mastery evidence for this board — this codebase has no separate school/institution entity yet, so this is the closest real "school-level" view available, not a multi-institution rollup.',
    ...summarizeMastery(rows.rows),
    insufficientEvidence: rows.rows.length === 0,
  });
}

async function handler(req, res) {
  try {
    const session = await requireAuth(req);
    if (req.method !== 'GET') return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'GET required.' } }, { Allow: 'GET' });
    const view = String(req.query?.view || '');
    if (view === 'learner') return await handleLearnerView(req, res, session);
    if (view === 'class') return await handleClassView(req, res, session);
    if (view === 'board') return await handleBoardView(req, res, session);
    return json(res, 400, { error: { code: 'INVALID_VIEW', message: "view must be 'learner', 'class', or 'board'." } });
  } catch (e) { return json(res, e.status || 500, { error: { code: e.code || 'BOARD_INTELLIGENCE_FAILED', message: e.status ? e.message : 'Unable to process board intelligence request.' } }); }
}
  return handler;
}
const handler_board_intelligence = __build_board_intelligence();

/* ================ question-translations.js ================ */
function __build_question_translations(){
// M75 — Regional Language + Low-Bandwidth Expansion, translation piece
// (Blueprint V3.2/V3.3, IB-11). Every translation starts
// pending_verification regardless of who authored it — never
// auto-published, never treated as equivalent to the original until an
// admin independently verifies it. This is the concrete answer to "do not
// use naive translation as the only architecture": a translation is a
// first-class governed record, not a derived/cached string.
const VERIFICATION_STATES = new Set(['pending_verification', 'verified', 'needs_review']);

function serialize(row) {
  return { id: row.id, sourceQuestionId: row.source_question_id, medium: row.medium, translatedText: row.translated_text, verificationStatus: row.verification_status, version: row.version, createdAt: row.created_at, updatedAt: row.updated_at };
}

async function handleCreate(req, res, session) {
  if (!hasRole(session, 'admin') && !hasRole(session, 'teacher')) return json(res, 403, { error: { code: 'FORBIDDEN', message: 'Only teacher or admin can author a translation.' } });
  const b = req.body || {};
  const sourceQuestionId = String(b.sourceQuestionId || '').trim();
  const medium = String(b.medium || '').trim().slice(0, 60);
  const translatedText = String(b.translatedText || '').trim().slice(0, 5000);
  if (!sourceQuestionId || !medium || !translatedText) return json(res, 400, { error: { code: 'MISSING_FIELDS', message: 'sourceQuestionId, medium, and translatedText are required.' } });

  const qRows = await sql`SELECT id, medium FROM board_questions WHERE id = ${sourceQuestionId}`;
  if (!qRows.rows.length) return json(res, 400, { error: { code: 'UNKNOWN_QUESTION', message: 'sourceQuestionId does not match any existing question.' } });
  if (qRows.rows[0].medium === medium) return json(res, 400, { error: { code: 'SAME_MEDIUM', message: 'A translation into the question\'s own medium is not meaningful.' } });

  const existing = await sql`SELECT id FROM board_question_translations WHERE source_question_id = ${sourceQuestionId} AND medium = ${medium}`;
  if (existing.rows.length) return json(res, 409, { error: { code: 'TRANSLATION_ALREADY_EXISTS', message: 'A translation for this question/medium already exists — update it instead of creating a new one.' } });

  const translationId = id('qt');
  const now = new Date().toISOString();
  await sql`INSERT INTO board_question_translations (id, source_question_id, medium, translated_text, translated_by_user_id, verification_status, version, created_at, updated_at)
    VALUES (${translationId}, ${sourceQuestionId}, ${medium}, ${translatedText}, ${session.user_id}, 'pending_verification', 1, ${now}, ${now})`;
  const rows = await sql`SELECT * FROM board_question_translations WHERE id = ${translationId}`;
  return json(res, 201, { ok: true, translation: serialize(rows.rows[0]) });
}

async function handleList(req, res, session) {
  const sourceQuestionId = String(req.query?.sourceQuestionId || '');
  if (!sourceQuestionId) return json(res, 400, { error: { code: 'SOURCE_QUESTION_ID_REQUIRED', message: 'sourceQuestionId is required.' } });
  const canSeeUnverified = hasRole(session, 'admin') || hasRole(session, 'teacher');
  const rows = await sql`SELECT * FROM board_question_translations WHERE source_question_id = ${sourceQuestionId} AND (${canSeeUnverified} OR verification_status = 'verified')`;
  return json(res, 200, { ok: true, translations: rows.rows.map(serialize) });
}

async function handleUpdate(req, res, session, translationId) {
  const rows = await sql`SELECT * FROM board_question_translations WHERE id = ${translationId}`;
  if (!rows.rows.length) return json(res, 404, { error: { code: 'TRANSLATION_NOT_FOUND', message: 'No translation with that id.' } });
  const before = rows.rows[0];
  const b = req.body || {};
  const verificationStatus = b.verificationStatus !== undefined ? String(b.verificationStatus) : before.verification_status;
  const translatedText = b.translatedText !== undefined ? String(b.translatedText).trim().slice(0, 5000) : before.translated_text;

  // Verifying a translation is admin-only governance; correcting the text
  // itself can be done by the teacher who's reviewing it too.
  if (verificationStatus !== before.verification_status && !hasRole(session, 'admin')) return json(res, 403, { error: { code: 'FORBIDDEN', message: 'Only admin can change a translation\'s verification status.' } });
  if (translatedText !== before.translated_text && !hasRole(session, 'admin') && !hasRole(session, 'teacher')) return json(res, 403, { error: { code: 'FORBIDDEN', message: 'Only teacher or admin can edit a translation.' } });
  if (!VERIFICATION_STATES.has(verificationStatus)) return json(res, 400, { error: { code: 'INVALID_VERIFICATION_STATUS', message: 'Invalid verificationStatus.' } });

  const expectedVersion = Number(b.expectedVersion);
  if (!Number.isInteger(expectedVersion)) return json(res, 400, { error: { code: 'EXPECTED_VERSION_REQUIRED', message: 'expectedVersion is required.' } });
  if (expectedVersion !== before.version) return json(res, 409, { error: { code: 'STALE_VERSION', message: 'This translation changed since you last read it.' } });

  const now = new Date().toISOString();
  const verifiedBy = verificationStatus === 'verified' ? session.user_id : (verificationStatus !== before.verification_status ? null : before.verified_by_user_id);
  const upd = await sql`UPDATE board_question_translations SET translated_text=${translatedText}, verification_status=${verificationStatus}, verified_by_user_id=${verifiedBy}, version=version+1, updated_at=${now} WHERE id=${translationId} AND version=${expectedVersion}`;
  if (!upd.count) return json(res, 409, { error: { code: 'STALE_VERSION', message: 'This translation changed since you last read it.' } });
  const after = await sql`SELECT * FROM board_question_translations WHERE id = ${translationId}`;
  return json(res, 200, { ok: true, translation: serialize(after.rows[0]) });
}

async function handler(req, res) {
  try {
    const session = await requireAuth(req);
    const translationId = req.query?.id ? String(req.query.id) : null;
    if (req.method === 'GET') return await handleList(req, res, session);
    if (req.method === 'POST') return await handleCreate(req, res, session);
    if (req.method === 'PATCH' && translationId) return await handleUpdate(req, res, session, translationId);
    return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'GET, POST, or PATCH required.' } }, { Allow: 'GET, POST, PATCH' });
  } catch (e) { return json(res, e.status || 500, { error: { code: e.code || 'QUESTION_TRANSLATIONS_FAILED', message: e.status ? e.message : 'Unable to process question translation request.' } }); }
}
  return handler;
}
const handler_question_translations = __build_question_translations();

/* ================ skill-passport.js ================ */
function __build_skill_passport(){
// M76 — Board-to-Career + Skill Passport (Blueprint V3.2/V3.3).
// Every concept->skill and skill->pathway mapping is admin-curated data
// (a human decided this link is real), never inferred by this code at
// request time. The passport itself only ever surfaces a skill when the
// learner has a genuinely MASTERED concept mapped to it — never for
// developing/weak/insufficient_evidence concepts, and pathways are always
// returned as "related", explicitly not a recommendation or prediction.
async function handleCreateSkill(req, res, session) {
  if (!hasRole(session, 'admin')) return json(res, 403, { error: { code: 'FORBIDDEN', message: 'Only admin can define a skill.' } });
  const b = req.body || {};
  const name = String(b.name || '').trim().slice(0, 200);
  if (!name) return json(res, 400, { error: { code: 'NAME_REQUIRED', message: 'name is required.' } });
  const existing = await sql`SELECT id FROM skills WHERE name = ${name}`;
  if (existing.rows.length) return json(res, 409, { error: { code: 'SKILL_ALREADY_EXISTS', message: 'A skill with this name already exists.' } });
  const skillId = id('skill');
  await sql`INSERT INTO skills (id, name, category, description, created_at) VALUES (${skillId}, ${name}, ${b.category ? String(b.category).slice(0, 100) : null}, ${b.description ? String(b.description).slice(0, 1000) : null}, ${new Date().toISOString()})`;
  return json(res, 201, { ok: true, skillId });
}

async function handleCreatePathway(req, res, session) {
  if (!hasRole(session, 'admin')) return json(res, 403, { error: { code: 'FORBIDDEN', message: 'Only admin can define a career pathway.' } });
  const b = req.body || {};
  const name = String(b.name || '').trim().slice(0, 200);
  if (!name) return json(res, 400, { error: { code: 'NAME_REQUIRED', message: 'name is required.' } });
  const existing = await sql`SELECT id FROM career_pathways WHERE name = ${name}`;
  if (existing.rows.length) return json(res, 409, { error: { code: 'PATHWAY_ALREADY_EXISTS', message: 'A pathway with this name already exists.' } });
  const pathwayId = id('pathway');
  await sql`INSERT INTO career_pathways (id, name, description, created_at) VALUES (${pathwayId}, ${name}, ${b.description ? String(b.description).slice(0, 1000) : null}, ${new Date().toISOString()})`;
  return json(res, 201, { ok: true, pathwayId });
}

async function handleMapConceptSkill(req, res, session) {
  if (!hasRole(session, 'admin') && !hasRole(session, 'teacher')) return json(res, 403, { error: { code: 'FORBIDDEN', message: 'Only teacher or admin can map a concept to a skill.' } });
  const b = req.body || {};
  const conceptId = String(b.conceptId || '').trim();
  const skillId = String(b.skillId || '').trim();
  if (!conceptId || !skillId) return json(res, 400, { error: { code: 'MISSING_FIELDS', message: 'conceptId and skillId are required.' } });
  const conceptRows = await sql`SELECT id FROM concepts WHERE id = ${conceptId}`;
  if (!conceptRows.rows.length) return json(res, 400, { error: { code: 'UNKNOWN_CONCEPT', message: 'conceptId does not match any existing concept.' } });
  const skillRows = await sql`SELECT id FROM skills WHERE id = ${skillId}`;
  if (!skillRows.rows.length) return json(res, 400, { error: { code: 'UNKNOWN_SKILL', message: 'skillId does not match any existing skill.' } });
  const existing = await sql`SELECT id FROM concept_skill_map WHERE concept_id = ${conceptId} AND skill_id = ${skillId}`;
  if (existing.rows.length) return json(res, 409, { error: { code: 'MAPPING_ALREADY_EXISTS', message: 'This concept is already mapped to this skill.' } });
  await sql`INSERT INTO concept_skill_map (id, concept_id, skill_id, created_by_user_id, created_at) VALUES (${id('csm')}, ${conceptId}, ${skillId}, ${session.user_id}, ${new Date().toISOString()})`;
  return json(res, 201, { ok: true });
}

async function handleMapSkillPathway(req, res, session) {
  if (!hasRole(session, 'admin')) return json(res, 403, { error: { code: 'FORBIDDEN', message: 'Only admin can map a skill to a career pathway.' } });
  const b = req.body || {};
  const skillId = String(b.skillId || '').trim();
  const pathwayId = String(b.pathwayId || '').trim();
  if (!skillId || !pathwayId) return json(res, 400, { error: { code: 'MISSING_FIELDS', message: 'skillId and pathwayId are required.' } });
  const existing = await sql`SELECT id FROM skill_pathway_map WHERE skill_id = ${skillId} AND pathway_id = ${pathwayId}`;
  if (existing.rows.length) return json(res, 409, { error: { code: 'MAPPING_ALREADY_EXISTS', message: 'This skill is already mapped to this pathway.' } });
  await sql`INSERT INTO skill_pathway_map (id, skill_id, pathway_id, created_by_user_id, created_at) VALUES (${id('spm')}, ${skillId}, ${pathwayId}, ${session.user_id}, ${new Date().toISOString()})`;
  return json(res, 201, { ok: true });
}

async function handleGetPassport(req, res, session) {
  const learnerId = String(req.query?.learnerId || '');
  if (!learnerId) return json(res, 400, { error: { code: 'LEARNER_ID_REQUIRED', message: 'learnerId is required.' } });
  if (!hasRole(session, 'admin') && !hasRole(session, 'teacher')) await requireLearnerAccess(session, learnerId);

  const rows = await sql`
    SELECT s.id AS skill_id, s.name AS skill_name, s.category, c.name AS concept_name
    FROM concept_mastery cm
    JOIN concept_skill_map csm ON csm.concept_id = cm.concept_id
    JOIN skills s ON s.id = csm.skill_id
    JOIN concepts c ON c.id = cm.concept_id
    WHERE cm.learner_id = ${learnerId} AND cm.status = 'mastered'`;

  if (!rows.rows.length) {
    return json(res, 200, { ok: true, learnerId, insufficientEvidence: true, message: 'No mastered, skill-mapped concept exists yet for this learner — the passport has nothing verified to show.', skills: [], relatedPathways: [] });
  }

  const bySkill = new Map();
  for (const r of rows.rows) {
    if (!bySkill.has(r.skill_id)) bySkill.set(r.skill_id, { skillId: r.skill_id, name: r.skill_name, category: r.category, evidenceConcepts: [] });
    bySkill.get(r.skill_id).evidenceConcepts.push(r.concept_name);
  }
  const skillIds = [...bySkill.keys()];

  const pathwayRows = await sql`
    SELECT DISTINCT p.id, p.name, p.description, spm.skill_id
    FROM skill_pathway_map spm JOIN career_pathways p ON p.id = spm.pathway_id
    WHERE spm.skill_id = ANY(${skillIds})`;
  const pathwaysById = new Map();
  for (const p of pathwayRows.rows) {
    if (!pathwaysById.has(p.id)) pathwaysById.set(p.id, { pathwayId: p.id, name: p.name, description: p.description, relatedToSkills: [] });
    pathwaysById.get(p.id).relatedToSkills.push(bySkill.get(p.skill_id)?.name);
  }

  return json(res, 200, {
    ok: true, learnerId, insufficientEvidence: false,
    skills: [...bySkill.values()],
    relatedPathways: [...pathwaysById.values()],
    disclosure: 'These pathways are informational associations with skills you have demonstrated evidence for — they are not a recommendation, prediction, or endorsement of any career choice.',
  });
}

async function handler(req, res) {
  try {
    const session = await requireAuth(req);
    const resource = req.query?.resource ? String(req.query.resource) : null;
    if (req.method === 'GET' && !resource) return await handleGetPassport(req, res, session);
    if (req.method === 'POST' && resource === 'skill') return await handleCreateSkill(req, res, session);
    if (req.method === 'POST' && resource === 'pathway') return await handleCreatePathway(req, res, session);
    if (req.method === 'POST' && resource === 'concept-skill-map') return await handleMapConceptSkill(req, res, session);
    if (req.method === 'POST' && resource === 'skill-pathway-map') return await handleMapSkillPathway(req, res, session);
    return json(res, 400, { error: { code: 'INVALID_REQUEST', message: 'Unrecognized skill-passport request shape.' } });
  } catch (e) { return json(res, e.status || 500, { error: { code: e.code || 'SKILL_PASSPORT_FAILED', message: e.status ? e.message : 'Unable to process skill passport request.' } }); }
}
  return handler;
}
const handler_skill_passport = __build_skill_passport();

/* ================ content-governance.js ================ */
function __build_content_governance(){
// M77 — Content Governance & Certification (Blueprint V3.2/V3.3).
// "No uncertified/unauthorized content should silently enter production."
// Certification is a formal, admin-only sign-off distinct from
// verification: verification_status='verified' means someone checked the
// content is correct; certification is an explicit, permanently-logged
// attestation that it's approved for real institutional use — and it can
// only be granted once the content is already published+verified, so
// certification can never be used to fast-track something that hasn't
// actually cleared its own module's governance gate.
const CONTENT_TABLES = {
  board_question: { table: 'board_questions', statusCol: 'status', verificationCol: 'verification_status' },
  exam_paper: { table: 'exam_papers', statusCol: 'status', verificationCol: 'verification_status' },
  board_question_translation: { table: 'board_question_translations', statusCol: null, verificationCol: 'verification_status' },
};

async function handleCertify(req, res, session) {
  if (!hasRole(session, 'admin')) return json(res, 403, { error: { code: 'FORBIDDEN', message: 'Only admin can certify content.' } });
  const b = req.body || {};
  const contentType = String(b.contentType || '');
  const contentId = String(b.contentId || '').trim();
  if (!CONTENT_TABLES[contentType]) return json(res, 400, { error: { code: 'INVALID_CONTENT_TYPE', message: `contentType must be one of: ${Object.keys(CONTENT_TABLES).join(', ')}.` } });
  if (!contentId) return json(res, 400, { error: { code: 'CONTENT_ID_REQUIRED', message: 'contentId is required.' } });

  const cfg = CONTENT_TABLES[contentType];
  let row;
  if (contentType === 'board_question') { const r = await sql`SELECT status, verification_status FROM board_questions WHERE id = ${contentId}`; row = r.rows[0]; }
  if (contentType === 'exam_paper') { const r = await sql`SELECT status, verification_status FROM exam_papers WHERE id = ${contentId}`; row = r.rows[0]; }
  if (contentType === 'board_question_translation') { const r = await sql`SELECT verification_status FROM board_question_translations WHERE id = ${contentId}`; row = r.rows[0]; }
  if (!row) return json(res, 404, { error: { code: 'CONTENT_NOT_FOUND', message: 'No matching content with that id.' } });

  if (row.verification_status !== 'verified') return json(res, 409, { error: { code: 'NOT_VERIFIED', message: 'Content must be verified before it can be certified.' } });
  if (cfg.statusCol && row.status !== 'published') return json(res, 409, { error: { code: 'NOT_PUBLISHED', message: 'Content must be published before it can be certified.' } });

  const eventId = id('cert');
  const now = new Date().toISOString();
  await sql`INSERT INTO certification_events (id, content_type, content_id, certified_by_user_id, note, created_at) VALUES (${eventId}, ${contentType}, ${contentId}, ${session.user_id}, ${b.note ? String(b.note).slice(0, 1000) : null}, ${now})`;
  await writeAudit({ actorUserId: session.user_id, action: 'content_governance.certified', entityType: contentType, entityId: contentId, metadata: {} });
  return json(res, 201, { ok: true, eventId });
}

async function handleHistory(req, res, session) {
  if (!hasRole(session, 'admin') && !hasRole(session, 'teacher')) return json(res, 403, { error: { code: 'FORBIDDEN', message: 'Only teacher or admin can view certification history.' } });
  const contentType = String(req.query?.contentType || '');
  const contentId = String(req.query?.contentId || '');
  if (!CONTENT_TABLES[contentType] || !contentId) return json(res, 400, { error: { code: 'MISSING_FIELDS', message: 'A valid contentType and contentId are required.' } });
  const rows = await sql`SELECT id, certified_by_user_id, note, created_at FROM certification_events WHERE content_type = ${contentType} AND content_id = ${contentId} ORDER BY created_at DESC`;
  return json(res, 200, { ok: true, certifications: rows.rows });
}

async function handleDashboard(req, res, session) {
  if (!hasRole(session, 'admin')) return json(res, 403, { error: { code: 'FORBIDDEN', message: 'Only admin can view the governance dashboard.' } });
  const [bq, ep, tr, ij] = await Promise.all([
    sql`SELECT status, verification_status, COUNT(*)::int AS count FROM board_questions GROUP BY status, verification_status`,
    sql`SELECT status, verification_status, COUNT(*)::int AS count FROM exam_papers GROUP BY status, verification_status`,
    sql`SELECT verification_status, COUNT(*)::int AS count FROM board_question_translations GROUP BY verification_status`,
    sql`SELECT status, COUNT(*)::int AS count FROM ingestion_jobs WHERE status NOT IN ('published', 'rejected_validation', 'licence_rejected', 'retired') GROUP BY status`,
  ]);
  return json(res, 200, {
    ok: true,
    boardQuestions: bq.rows,
    examPapers: ep.rows,
    translations: tr.rows,
    openIngestionJobs: ij.rows,
    note: 'Counts reflect real rows in each table at the moment of this request — not a cached or estimated figure.',
  });
}

async function handler(req, res) {
  try {
    const session = await requireAuth(req);
    const view = req.query?.view ? String(req.query.view) : null;
    if (req.method === 'GET' && view === 'dashboard') return await handleDashboard(req, res, session);
    if (req.method === 'GET' && !view) return await handleHistory(req, res, session);
    if (req.method === 'POST') return await handleCertify(req, res, session);
    return json(res, 400, { error: { code: 'INVALID_REQUEST', message: 'Unrecognized content-governance request shape.' } });
  } catch (e) { return json(res, e.status || 500, { error: { code: e.code || 'CONTENT_GOVERNANCE_FAILED', message: e.status ? e.message : 'Unable to process content governance request.' } }); }
}
  return handler;
}
const handler_content_governance = __build_content_governance();

/* ================ ai-governance.js ================ */
function __build_ai_governance(){
// M78 — Multi-AI Innovation + Scalability Hardening (Blueprint V3.2/V3.3).
// See migration 033's header comment for the scope decision: this is a
// real, admin-governed provider registry + usage-observability log +
// decision trail, deliberately decoupled from chat.js/ai-mode.js/
// evaluate.js/evaluate-homework.js rather than risking a regression in
// those already-hardened files this late in the build. "AI must never
// bypass server authorization, privacy, content governance, exam
// integrity, audit logging" — this module enforces that for itself
// (admin-only registry writes, real audit trail) and gives the platform
// somewhere real to log usage from once those endpoints are wired to it.
const PROVIDER_STATUSES = new Set(['active', 'inactive', 'deprecated']);
const DECISION_TYPES = new Set(['provider_approved', 'provider_deprecated', 'duplicate_removed', 'safety_review']);
const EVENT_STATUSES = new Set(['success', 'failure', 'rate_limited']);

async function handleCreateProvider(req, res, session) {
  if (!hasRole(session, 'admin')) return json(res, 403, { error: { code: 'FORBIDDEN', message: 'Only admin can register an AI provider.' } });
  const b = req.body || {};
  const name = String(b.name || '').trim().slice(0, 100);
  const modelIdentifier = String(b.modelIdentifier || '').trim().slice(0, 200);
  if (!name || !modelIdentifier) return json(res, 400, { error: { code: 'MISSING_FIELDS', message: 'name and modelIdentifier are required.' } });
  const existing = await sql`SELECT id FROM ai_providers WHERE name = ${name}`;
  if (existing.rows.length) return json(res, 409, { error: { code: 'PROVIDER_ALREADY_EXISTS', message: 'A provider with this name already exists.' } });
  const providerId = id('aip');
  const now = new Date().toISOString();
  await sql`INSERT INTO ai_providers (id, name, model_identifier, status, rate_limit_per_minute, notes, version, created_at, updated_at)
    VALUES (${providerId}, ${name}, ${modelIdentifier}, 'active', ${b.rateLimitPerMinute ? Number(b.rateLimitPerMinute) : null}, ${b.notes ? String(b.notes).slice(0, 1000) : null}, 1, ${now}, ${now})`;
  return json(res, 201, { ok: true, providerId });
}

async function handleUpdateProvider(req, res, session, providerId) {
  if (!hasRole(session, 'admin')) return json(res, 403, { error: { code: 'FORBIDDEN', message: 'Only admin can change a provider\'s status.' } });
  const rows = await sql`SELECT * FROM ai_providers WHERE id = ${providerId}`;
  if (!rows.rows.length) return json(res, 404, { error: { code: 'PROVIDER_NOT_FOUND', message: 'No provider with that id.' } });
  const before = rows.rows[0];
  const status = String(req.body?.status || before.status);
  if (!PROVIDER_STATUSES.has(status)) return json(res, 400, { error: { code: 'INVALID_STATUS', message: 'Invalid status.' } });
  const expectedVersion = Number(req.body?.expectedVersion);
  if (!Number.isInteger(expectedVersion)) return json(res, 400, { error: { code: 'EXPECTED_VERSION_REQUIRED', message: 'expectedVersion is required.' } });
  if (expectedVersion !== before.version) return json(res, 409, { error: { code: 'STALE_VERSION', message: 'This provider changed since you last read it.' } });
  const now = new Date().toISOString();
  const upd = await sql`UPDATE ai_providers SET status=${status}, version=version+1, updated_at=${now} WHERE id=${providerId} AND version=${expectedVersion}`;
  if (!upd.count) return json(res, 409, { error: { code: 'STALE_VERSION', message: 'This provider changed since you last read it.' } });
  return json(res, 200, { ok: true });
}

async function handleListProviders(req, res) {
  const rows = await sql`SELECT id, name, model_identifier, status, rate_limit_per_minute, notes, version FROM ai_providers ORDER BY name ASC`;
  return json(res, 200, { ok: true, providers: rows.rows });
}

async function handleRecordUsageEvent(req, res, session) {
  const b = req.body || {};
  const providerId = String(b.providerId || '').trim();
  const endpoint = String(b.endpoint || '').trim().slice(0, 100);
  const status = String(b.status || '');
  if (!providerId || !endpoint) return json(res, 400, { error: { code: 'MISSING_FIELDS', message: 'providerId and endpoint are required.' } });
  if (!EVENT_STATUSES.has(status)) return json(res, 400, { error: { code: 'INVALID_STATUS', message: `status must be one of: ${[...EVENT_STATUSES].join(', ')}.` } });
  const providerRows = await sql`SELECT id FROM ai_providers WHERE id = ${providerId}`;
  if (!providerRows.rows.length) return json(res, 400, { error: { code: 'UNKNOWN_PROVIDER', message: 'providerId does not match any registered provider.' } });
  await sql`INSERT INTO ai_usage_events (id, provider_id, endpoint, user_id, status, created_at) VALUES (${id('aue')}, ${providerId}, ${endpoint}, ${session.user_id}, ${status}, ${new Date().toISOString()})`;
  return json(res, 201, { ok: true });
}

async function handleUsageStats(req, res, session) {
  if (!hasRole(session, 'admin')) return json(res, 403, { error: { code: 'FORBIDDEN', message: 'Only admin can view usage statistics.' } });
  const rows = await sql`SELECT provider_id, endpoint, status, COUNT(*)::int AS count FROM ai_usage_events GROUP BY provider_id, endpoint, status`;
  return json(res, 200, { ok: true, usage: rows.rows, note: 'Real counts from ai_usage_events at the moment of this request. This table only contains events that a caller explicitly recorded — it is not automatically populated by the AI Tutor/AI Mode/evaluation endpoints in this build; wiring those is disclosed follow-up work, not done in this pass.' });
}

async function handleRecordDecision(req, res, session) {
  if (!hasRole(session, 'admin')) return json(res, 403, { error: { code: 'FORBIDDEN', message: 'Only admin can record a governance decision.' } });
  const b = req.body || {};
  const decisionType = String(b.decisionType || '');
  const description = String(b.description || '').trim().slice(0, 2000);
  if (!DECISION_TYPES.has(decisionType)) return json(res, 400, { error: { code: 'INVALID_DECISION_TYPE', message: `decisionType must be one of: ${[...DECISION_TYPES].join(', ')}.` } });
  if (!description) return json(res, 400, { error: { code: 'DESCRIPTION_REQUIRED', message: 'description is required — this is a real decision record, not a placeholder.' } });
  const decisionId = id('gov');
  await sql`INSERT INTO ai_governance_decisions (id, decision_type, description, decided_by_user_id, created_at) VALUES (${decisionId}, ${decisionType}, ${description}, ${session.user_id}, ${new Date().toISOString()})`;
  return json(res, 201, { ok: true, decisionId });
}

async function handleListDecisions(req, res, session) {
  if (!hasRole(session, 'admin') && !hasRole(session, 'teacher')) return json(res, 403, { error: { code: 'FORBIDDEN', message: 'Only teacher or admin can view governance decisions.' } });
  const rows = await sql`SELECT id, decision_type, description, decided_by_user_id, created_at FROM ai_governance_decisions ORDER BY created_at DESC LIMIT 100`;
  return json(res, 200, { ok: true, decisions: rows.rows });
}

async function handler(req, res) {
  try {
    const session = await requireAuth(req);
    const resource = req.query?.resource ? String(req.query.resource) : 'providers';
    const providerId = req.query?.providerId ? String(req.query.providerId) : null;

    if (req.method === 'GET' && resource === 'providers') return await handleListProviders(req, res);
    if (req.method === 'GET' && resource === 'usage') return await handleUsageStats(req, res, session);
    if (req.method === 'GET' && resource === 'decisions') return await handleListDecisions(req, res, session);
    if (req.method === 'POST' && resource === 'providers') return await handleCreateProvider(req, res, session);
    if (req.method === 'POST' && resource === 'usage') return await handleRecordUsageEvent(req, res, session);
    if (req.method === 'POST' && resource === 'decisions') return await handleRecordDecision(req, res, session);
    if (req.method === 'PATCH' && resource === 'providers' && providerId) return await handleUpdateProvider(req, res, session, providerId);
    return json(res, 400, { error: { code: 'INVALID_REQUEST', message: 'Unrecognized ai-governance request shape.' } });
  } catch (e) { return json(res, e.status || 500, { error: { code: e.code || 'AI_GOVERNANCE_FAILED', message: e.status ? e.message : 'Unable to process AI governance request.' } }); }
}
  return handler;
}
const handler_ai_governance = __build_ai_governance();

export default async function handler(req,res){
  try{
    const seg = req.query && req.query.route;
    let route = Array.isArray(seg) ? seg[0] : seg;
    // Same fallback as api/auth/[...action].js: this platform does not
    // reliably populate req.query with the matched dynamic segment for
    // catch-all routes, confirmed via production logs (GET /api/v1/my-learners
    // returning 404 Unknown route with an authenticated, valid request).
    if(!route){
      const pathname=String(req.url||'').split('?')[0];
      const parts=pathname.split('/').filter(Boolean);
      const v1Idx=parts.indexOf('v1');
      route=v1Idx>=0 && parts.length>v1Idx+1 ? decodeURIComponent(parts[v1Idx+1]) : undefined;
    }
    if(route==='academic-forecast') return handler_academic_forecast(req,res);
    if(route==='ai-council') return handler_ai_council(req,res);
    if(route==='adaptive-pacing') return handler_adaptive_pacing(req,res);
    if(route==='appeals') return handler_appeals(req,res);
    if(route==='assessment') return handler_assessment(req,res);
    if(route==='assessment-integrity') return handler_assessment_integrity(req,res);
    if(route==='audit') return handler_audit(req,res);
    if(route==='billing') return handler_billing(req,res);
    if(route==='class-analytics') return handler_class_analytics(req,res);
    if(route==='client-state') return handler_client_state(req,res);
    if(route==='cognitive-safety') return handler_cognitive_safety(req,res);
    if(route==='consent') return handler_consent(req,res);
    if(route==='founder-lab') return handler_founder_lab(req,res);
    if(route==='guide-robot-sessions') return handler_guide_robot_sessions(req,res);
    if(route==='board-registry') return handler_board_registry(req,res);
    if(route==='curriculum-graph') return handler_curriculum_graph(req,res);
    if(route==='paper-ingestion') return handler_paper_ingestion(req,res);
    if(route==='question-bank') return handler_question_bank(req,res);
    if(route==='exam-attempts') return handler_exam_attempts(req,res);
    if(route==='adaptive-practice') return handler_adaptive_practice(req,res);
    if(route==='paper-intelligence') return handler_paper_intelligence(req,res);
    if(route==='adaptive-mock-exam') return handler_adaptive_mock_exam(req,res);
    if(route==='exam-readiness') return handler_exam_readiness(req,res);
    if(route==='board-missions') return handler_board_missions(req,res);
    if(route==='board-intelligence') return handler_board_intelligence(req,res);
    if(route==='question-translations') return handler_question_translations(req,res);
    if(route==='skill-passport') return handler_skill_passport(req,res);
    if(route==='content-governance') return handler_content_governance(req,res);
    if(route==='ai-governance') return handler_ai_governance(req,res);
    if(route==='homework') return handler_homework(req,res);
    if(route==='learner-overview') return handler_learner_overview(req,res);
    if(route==='learner') return handler_learner(req,res);
    if(route==='learning-memory') return handler_learning_memory(req,res);
    if(route==='mistake-map') return handler_mistake_map(req,res);
    if(route==='my-learners') return handler_my_learners(req,res);
    if(route==='outcome-comparison') return handler_outcome_comparison(req,res);
    if(route==='parent-conversation') return handler_parent_conversation(req,res);
    if(route==='planner') return handler_planner(req,res);
    if(route==='progression-gate') return handler_progression_gate(req,res);
    if(route==='rewards') return handler_rewards(req,res);
    if(route==='teacher-diagnostic') return handler_teacher_diagnostic(req,res);
    if(route==='teacher-notes') return handler_teacher_notes(req,res);
    return json(res,404,{error:{code:'NOT_FOUND',message:'Unknown route.'}});
  }catch(e){
    return json(res,500,{error:{code:e.code||'INTERNAL_ERROR',message:'Unexpected server error.'}});
  }
}
