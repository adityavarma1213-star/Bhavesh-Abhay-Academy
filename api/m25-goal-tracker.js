import { json } from './_lib/security.js';
import { requireAuth, requireLearnerAccess } from './_lib/auth.js';
import { sql } from './_lib/db.js';

export const config = { runtime: 'nodejs' };

const STOP_WORDS = new Set([
  'the','and','for','with','from','this','that','learn','learning','study','understand',
  'improve','goal','goals','better','more','practice','complete','finish','master'
]);

function tokens(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(/\s+/)
    .filter(t => t.length >= 3 && !STOP_WORDS.has(t));
}

function goalProgress(goalText, evidenceRows) {
  const goalTokens = new Set(tokens(goalText));
  const grouped = new Map();
  for (const row of evidenceRows) {
    const concept = String(row.concept || row.chapter || '').trim();
    if (!concept) continue;
    const conceptTokens = tokens(`${concept} ${row.subject || ''}`);
    const matches = conceptTokens.filter(token => goalTokens.has(token));
    if (!matches.length) continue;
    const key = `${row.subject || 'Unknown'}::${concept}`;
    const item = grouped.get(key) || { subject: row.subject || 'Unknown', concept, total: 0, correct: 0 };
    item.total += 1;
    if (row.correctness === 'correct') item.correct += 1;
    grouped.set(key, item);
  }

  const concepts = [...grouped.values()].map(item => ({
    ...item,
    accuracy: item.total ? Math.round((item.correct / item.total) * 100) : 0,
  }));
  const evidenceCount = concepts.reduce((sum, item) => sum + item.total, 0);
  const accuracy = evidenceCount
    ? Math.round(concepts.reduce((sum, item) => sum + item.correct, 0) / evidenceCount * 100)
    : null;
  const status = accuracy == null ? 'no_evidence' : accuracy < 60 ? 'struggling' : accuracy < 80 ? 'needs_revision' : 'on_track';
  const nextAction = status === 'no_evidence'
    ? 'Build evidence by completing a relevant assessment or practice activity.'
    : status === 'struggling'
      ? 'Schedule targeted practice on the weakest matched concept.'
      : status === 'needs_revision'
        ? 'Use a short revision task, then reassess the matched concept.'
        : 'Maintain progress with spaced practice and a later check.';

  return { status, accuracy, evidenceCount, matchedConcepts: concepts, nextAction };
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'GET required.' } }, { Allow: 'GET', 'Cache-Control': 'no-store' });
  }

  try {
    const session = await requireAuth(req);
    const learnerId = String(req.query?.learnerId || '');
    await requireLearnerAccess(session, learnerId);

    const [goals, evidence, upcoming] = await Promise.all([
      sql`SELECT id,text,created_at FROM planner_goals WHERE learner_id=${learnerId} ORDER BY created_at ASC LIMIT 50`,
      sql`SELECT subject,chapter,concept,correctness,created_at
          FROM learning_evidence WHERE learner_id=${learnerId}
          ORDER BY created_at DESC LIMIT 500`,
      sql`SELECT title,subject,date,assessment_id
          FROM planner_upcoming_assessments
          WHERE learner_id=${learnerId} AND date>=CURRENT_DATE
          ORDER BY date ASC LIMIT 12`,
    ]);

    const goalResults = goals.rows.map(goal => {
      const progress = goalProgress(goal.text, evidence.rows);
      const nextAssessment = upcoming.rows.find(item => {
        const text = `${goal.text} ${progress.matchedConcepts.map(c => c.concept).join(' ')}`.toLowerCase();
        return item.subject && text.includes(String(item.subject).toLowerCase());
      }) || null;
      return {
        id: goal.id,
        text: goal.text,
        createdAt: goal.created_at,
        ...progress,
        nextAssessment: nextAssessment ? {
          title: nextAssessment.title,
          subject: nextAssessment.subject,
          date: nextAssessment.date,
          assessmentId: nextAssessment.assessment_id || null,
        } : null,
      };
    });

    return json(res, 200, {
      ok: true,
      learnerId,
      goals: goalResults,
      evidencePoints: evidence.rows.length,
      source: 'server_planner_goals_and_learning_evidence',
      limitations: ['Goal progress is an evidence-linked academic heuristic; it does not claim to predict outcomes or measure motivation.'],
    }, { 'Cache-Control': 'no-store' });
  } catch (error) {
    return json(res, error.status || 500, {
      error: {
        code: error.code || 'GOAL_TRACKER_FAILED',
        message: error.status ? error.message : 'Unable to load goal progress.',
      },
    }, { 'Cache-Control': 'no-store' });
  }
}

export default handler;