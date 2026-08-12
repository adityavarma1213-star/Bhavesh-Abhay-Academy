import { sql } from '../_lib/db.js';
import { requireAuth, requireLearnerAccess } from '../_lib/auth.js';
import { json, id, writeAudit } from '../_lib/security.js';
import { gradeDeterministic, verifyAssessmentVerdict } from '../_lib/assessment-verdict.js';
import { beginOfflineOperation, completeOfflineOperation, rejectOfflineOperation } from '../_lib/offline-sync.js';
export const config={runtime:'nodejs'};

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

export default async function handler(req,res){
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
