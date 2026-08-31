import { json, writeAudit } from './_lib/security.js';
import { requireAuth, requireLearnerAccess } from './_lib/auth.js';
import { sql } from './_lib/db.js';

export const config={runtime:'nodejs'};
const clean=(v,max=120)=>String(v??'').trim().slice(0,max);
export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  if(req.method!=='GET')return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET required.'}},{Allow:'GET','Cache-Control':'private, no-store, max-age=0'});
  try{
    const session=await requireAuth(req),learnerId=clean(req.query?.learnerId);
    await requireLearnerAccess(session,learnerId);
    const attempts=await sql`SELECT COUNT(*) FILTER (WHERE status IN ('submitted','evaluated','completed'))::int AS completed FROM assessment_attempts WHERE learner_id=${learnerId}`;
    const evidence=await sql`SELECT COUNT(*)::int AS answered,COUNT(*) FILTER (WHERE correctness='correct')::int AS correct,COUNT(DISTINCT (COALESCE(subject,'') || ':' || concept))::int AS concepts FROM learning_evidence WHERE learner_id=${learnerId}`;
    // Concept labels can recur in different subjects. Keep each curriculum
    // namespace isolated so one subject cannot contaminate another's insight.
    const weak=await sql`SELECT COUNT(*)::int AS weak FROM (
      SELECT COALESCE(subject,'') AS subject, concept
      FROM learning_evidence
      WHERE learner_id=${learnerId}
      GROUP BY COALESCE(subject,''), concept
      HAVING COUNT(*) >= 3
         AND COUNT(*) FILTER (WHERE correctness='correct') < COUNT(*) * 0.5
    ) q`;
    const strong=await sql`SELECT COUNT(*)::int AS strong FROM (
      SELECT COALESCE(subject,'') AS subject, concept
      FROM learning_evidence
      WHERE learner_id=${learnerId}
      GROUP BY COALESCE(subject,''), concept
      HAVING COUNT(*) >= 3
         AND COUNT(*) FILTER (WHERE correctness='correct') >= COUNT(*) * 0.8
    ) q`;
    const reward=await sql`SELECT xp,completed_attempts AS "completedAttempts",answered_questions AS "answeredQuestions",correct_answers AS "correctAnswers",mastered_concepts AS "masteredConcepts" FROM learner_rewards WHERE learner_id=${learnerId} LIMIT 1`;
    const a=attempts.rows[0]||{},e=evidence.rows[0]||{},w=weak.rows[0]||{},s=strong.rows[0]||{},r=reward.rows[0]||{};
    const answered=Number(e.answered||0),correct=Number(e.correct||0);
    const accuracy=answered?Number((correct/answered*100).toFixed(1)):null;
    await writeAudit({actorUserId:session.user_id,action:'INSIGHTS_VIEW',entityType:'learner',entityId:learnerId,metadata:{answered,accuracy,completedAssessments:Number(a.completed||0)}});
    return json(res,200,{ok:true,learnerId,metrics:{completedAssessments:Number(a.completed||0),answeredQuestions:answered,accuracyPercent:accuracy,weakConceptCount:Number(w.weak||0),strongConceptCount:Number(s.strong||0),trackedConceptCount:Number(e.concepts||0),xp:r.xp==null?null:Number(r.xp)},evidenceQuality:answered?'measured':'insufficient_evidence',limitations:['Concept-level weak/strong counts require at least 3 evidence rows for that concept within its subject namespace.','Metrics are derived from server assessment evidence.','Submitted, evaluated, and completed assessment states are counted as completed outcomes.','Missing evidence is not treated as a weakness.','Insights are learning-support signals, not psychological or future-outcome predictions.']});
  }catch(e){return json(res,e.status||500,{error:{code:e.code||'INSIGHTS_FAILED',message:e.status?e.message:'Unable to load learning insights.'}},{'Cache-Control':'private, no-store, max-age=0'});}
}
