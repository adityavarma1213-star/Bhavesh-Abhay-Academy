import { beginOfflineOperation, completeOfflineOperation, rejectOfflineOperation } from '../_lib/offline-sync.js';
import { gradeDeterministic, verifyAssessmentVerdict, verifyHomeworkVerdict, hashHomeworkText } from '../_lib/assessment-verdict.js';
import { json, id, writeAudit, clientIp, verifyPassword } from '../_lib/security.js';
import { requireAuth, hasRole, requireLearnerAccess } from '../_lib/auth.js';
import { sql } from '../_lib/db.js';

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
  if(!memberIds.length) return {class:cls,members:[],concepts:[],summary:{learners:0,evidence:0,accuracy:null}};
  const evidence=await sql`SELECT subject,chapter,topic,concept,COUNT(*)::int AS total,COUNT(*) FILTER(WHERE correctness='correct')::int AS correct,COUNT(DISTINCT learner_id)::int AS learners
    FROM learning_evidence WHERE learner_id=ANY(${memberIds}) GROUP BY subject,chapter,topic,concept ORDER BY subject,chapter,topic,concept`;
  const summary=await sql`SELECT COUNT(DISTINCT learner_id)::int AS learners,COUNT(*)::int AS evidence,ROUND(100.0*SUM(CASE WHEN correctness='correct' THEN 1 ELSE 0 END)/NULLIF(COUNT(*),0),1) AS accuracy FROM learning_evidence WHERE learner_id=ANY(${memberIds})`;
  return {class:cls,members:members.rows,concepts:evidence.rows.map(r=>({...r,accuracy:r.total?Math.round(Number(r.correct)*1000/Number(r.total))/10:null})),summary:summary.rows[0]||{}};
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


const MIN_EVIDENCE_FOR_JUDGEMENT = 3;
const RECENT_WINDOW = 5;
const MASTERED_THRESHOLD = 0.8;
const LEARNING_THRESHOLD = 0.5;
const MISTAKE_PATTERN_THRESHOLD = 3;

async function deriveAndPersist(learnerId) {
  const evidence = await sql`SELECT id,concept,subject,topic,correctness,error_type,attempt_id,question_id,created_at
    FROM learning_evidence WHERE learner_id=${learnerId} ORDER BY created_at ASC`;
  const rows = evidence.rows;
  const now = new Date().toISOString();

  // ---- learning_memory: one row per concept, derived from all evidence for that concept ----
  const byConcept = new Map();
  for (const r of rows) {
    if (!byConcept.has(r.concept)) byConcept.set(r.concept, []);
    byConcept.get(r.concept).push(r);
  }
  for (const [concept, allForConcept] of byConcept) {
    const evidenceCount = allForConcept.length;
    const correctCount = allForConcept.filter(e => e.correctness === 'correct').length;
    let status;
    if (evidenceCount < MIN_EVIDENCE_FOR_JUDGEMENT) {
      status = 'insufficient_evidence';
    } else {
      const recent = allForConcept.slice(-RECENT_WINDOW);
      const correctRate = recent.filter(e => e.correctness === 'correct').length / recent.length;
      status = correctRate >= MASTERED_THRESHOLD ? 'mastered' : correctRate >= LEARNING_THRESHOLD ? 'learning' : 'needs_revision';
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

  // ---- mistake_patterns: group incorrect/erroring evidence by (concept, error_type) ----
  const byPatternKey = new Map();
  for (const r of rows) {
    if (r.correctness === 'correct' || !r.error_type) continue;
    const key = `${r.concept}::${r.error_type}`;
    if (!byPatternKey.has(key)) byPatternKey.set(key, { concept: r.concept, subject: r.subject, errorType: r.error_type, occurrences: [] });
    byPatternKey.get(key).occurrences.push(r);
  }
  for (const p of byPatternKey.values()) {
    const status = p.occurrences.length >= MISTAKE_PATTERN_THRESHOLD ? 'possible_misconception' : 'watching';
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

  return getSnapshot(learnerId);
}

async function getSnapshot(learnerId) {
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

async function handler(req, res) {
  let offlineOp=null;
  try {
    const s = await requireAuth(req);
    const learnerId = String(req.query?.learnerId || '');
    await requireLearnerAccess(s, learnerId);
    if(req.method==='PUT'){ offlineOp=await beginOfflineOperation(req,{learnerId,endpoint:'learning-memory'}); if(offlineOp.duplicate) return json(res,200,offlineOp.response); }

    if (req.method === 'GET') {
      return json(res, 200, { ok: true, snapshot: await getSnapshot(learnerId) });
    }

    if (req.method === 'PUT') {
      // The client's learningMemory/mistakePatterns body (if any) is intentionally not read:
      // both are DERIVED tables (see db/schema.sql) and are recomputed here from
      // server-verified learning_evidence instead, so this sync can never be used to
      // write an unearned "mastered" status or hide a real mistake pattern.
      const snapshot = await deriveAndPersist(learnerId);
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
    if(route==='assessment') return handler_assessment(req,res);
    if(route==='audit') return handler_audit(req,res);
    if(route==='billing') return handler_billing(req,res);
    if(route==='class-analytics') return handler_class_analytics(req,res);
    if(route==='consent') return handler_consent(req,res);
    if(route==='homework') return handler_homework(req,res);
    if(route==='learner-overview') return handler_learner_overview(req,res);
    if(route==='learner') return handler_learner(req,res);
    if(route==='learning-memory') return handler_learning_memory(req,res);
    if(route==='my-learners') return handler_my_learners(req,res);
    if(route==='planner') return handler_planner(req,res);
    if(route==='progression-gate') return handler_progression_gate(req,res);
    if(route==='rewards') return handler_rewards(req,res);
    if(route==='teacher-notes') return handler_teacher_notes(req,res);
    return json(res,404,{error:{code:'NOT_FOUND',message:'Unknown route.'}});
  }catch(e){
    return json(res,500,{error:{code:e.code||'INTERNAL_ERROR',message:'Unexpected server error.'}});
  }
}
