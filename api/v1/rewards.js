// BAA M30 — server-authoritative Achievement & Rewards endpoint.
// Rewards are derived from authenticated learner assessment/evidence data.
// Client-supplied reward numbers are intentionally ignored.
import { json } from '../_lib/security.js';
import { requireAuth, requireLearnerAccess } from '../_lib/auth.js';
import { sql } from '../_lib/db.js';

export const config = { runtime: 'nodejs' };
const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

const BADGES = [
  { id: 'first_attempt', name: 'First Step', icon: '🌱', description: 'Complete your first assessment.' },
  { id: 'five_attempts', name: 'Getting Consistent', icon: '🔥', description: 'Complete 5 assessments.' },
  { id: 'fifty_answers', name: 'Practice Builder', icon: '🧩', description: 'Answer 50 assessed questions.' },
  { id: 'hundred_correct', name: 'Accuracy Builder', icon: '🎯', description: 'Reach 100 correct assessed answers.' },
  { id: 'first_mastery', name: 'Concept Mastery', icon: '🏆', description: 'Reach evidence-backed mastery in a concept.' },
  { id: 'five_masteries', name: 'Mastery Momentum', icon: '⭐', description: 'Reach evidence-backed mastery in 5 concepts.' },
];

async function deriveRewards(learnerId) {
  const [attempts, evidence, memory] = await Promise.all([
    sql`SELECT COUNT(*)::int AS count
        FROM assessment_attempts
        WHERE learner_id=${learnerId}
          AND status IN ('submitted','evaluated','completed')`,
    sql`SELECT COUNT(*)::int AS answered,
               COUNT(*) FILTER (WHERE correctness='correct')::int AS correct
        FROM learning_evidence
        WHERE learner_id=${learnerId}`,
    sql`SELECT COUNT(DISTINCT concept)::int AS mastered
        FROM learning_memory
        WHERE learner_id=${learnerId}
          AND status IN ('mastered','strong')`,
  ]);

  const completedAttempts = Number(attempts.rows[0]?.count || 0);
  const answeredQuestions = Number(evidence.rows[0]?.answered || 0);
  const correctAnswers = Number(evidence.rows[0]?.correct || 0);
  const masteredConcepts = Number(memory.rows[0]?.mastered || 0);
  const xp = completedAttempts * 10 + correctAnswers * 5 + masteredConcepts * 25;

  const thresholds = {
    first_attempt: completedAttempts >= 1,
    five_attempts: completedAttempts >= 5,
    fifty_answers: answeredQuestions >= 50,
    hundred_correct: correctAnswers >= 100,
    first_mastery: masteredConcepts >= 1,
    five_masteries: masteredConcepts >= 5,
  };
  const earnedBadgeIds = BADGES.filter(badge => thresholds[badge.id]).map(badge => badge.id);
  const earnedBadges = BADGES.filter(badge => thresholds[badge.id]);

  return {
    xp,
    completedAttempts,
    answeredQuestions,
    correctAnswers,
    masteredConcepts,
    earnedBadgeIds,
    earnedBadges,
    badges: BADGES.map(badge => ({ ...badge, earned: Boolean(thresholds[badge.id]) })),
    source: 'server_assessment_evidence',
    methodology: 'Activity rewards are derived only from authenticated assessment attempts, learning evidence, and evidence-backed Learning Memory states. They are motivational rewards, not academic marks.',
  };
}

export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    if (!['GET', 'PUT'].includes(req.method)) {
      return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'GET or PUT required.' } }, { Allow: 'GET, PUT', ...NO_STORE });
    }
    const session = await requireAuth(req);
    const learnerId = String(req.query?.learnerId || '').trim();
    if (!learnerId) return json(res, 400, { error: { code: 'LEARNER_ID_REQUIRED', message: 'learnerId is required.' } }, NO_STORE);
    await requireLearnerAccess(session, learnerId);

    const rewards = await deriveRewards(learnerId);
    return json(res, 200, {
      ok: true,
      learnerId,
      rewards,
      evaluatedAt: new Date().toISOString(),
      limitations: ['Rewards are derived from recorded academic activity and do not change assessment marks or mastery decisions.'],
    }, NO_STORE);
  } catch (error) {
    const status = Number(error?.status) || (error?.code === 'DATABASE_NOT_CONFIGURED' ? 503 : 500);
    return json(res, status, { error: { code: error?.code || 'REWARDS_SERVICE_FAILED', message: error?.status ? error.message : 'Unable to derive rewards.' } }, NO_STORE);
  }
}