import { sql } from '../_lib/db.js';
import { requireAuth, requireLearnerAccess } from '../_lib/auth.js';
import { json, writeAudit } from '../_lib/security.js';
export const config={runtime:'nodejs'};

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

export default async function handler(req,res){
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
