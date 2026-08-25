import { json } from './_lib/security.js';
import { requireAuth, requireLearnerAccess } from './_lib/auth.js';
import { sql } from './_lib/db.js';

export const config = { runtime: 'nodejs' };

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

function stateForEvidence(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const key = `${row.subject || 'Unknown'}::${row.concept || row.chapter || 'General'}`;
    const item = grouped.get(key) || {
      subject: row.subject || 'Unknown',
      concept: row.concept || row.chapter || 'General',
      total: 0,
      correct: 0,
      recent: [],
    };
    item.total += 1;
    if (row.correctness === 'correct') item.correct += 1;
    item.recent.push(row.correctness);
    if (item.recent.length > 8) item.recent.shift();
    grouped.set(key, item);
  }
  return [...grouped.values()].map(item => {
    const accuracy = item.total ? Math.round((item.correct / item.total) * 100) : 0;
    const recentIncorrect = item.recent.filter(x => x !== 'correct').length;
    const state = accuracy < 60 || recentIncorrect >= 3 ? 'struggling' : accuracy < 80 ? 'needs_revision' : 'learning';
    return { ...item, accuracy, state };
  });
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'GET required.' } }, { Allow: 'GET' });
  }

  try {
    const session = await requireAuth(req);
    const learnerId = String(req.query?.learnerId || '');
    await requireLearnerAccess(session, learnerId);

    const [evidence, upcoming, goals] = await Promise.all([
      sql`SELECT subject,chapter,concept,correctness,created_at
          FROM learning_evidence
          WHERE learner_id=${learnerId}
          ORDER BY created_at DESC
          LIMIT 300`,
      sql`SELECT title,subject,date,assessment_id
          FROM planner_upcoming_assessments
          WHERE learner_id=${learnerId} AND date>=CURRENT_DATE
          ORDER BY date ASC
          LIMIT 12`,
      sql`SELECT text FROM planner_goals WHERE learner_id=${learnerId} ORDER BY created_at ASC LIMIT 20`,
    ]);

    const states = stateForEvidence(evidence.rows);
    const recommendations = [];

    for (const state of states) {
      if (state.state === 'learning' && state.total < 2) continue;
      const exam = upcoming.rows.find(x => x.subject && x.subject === state.subject);
      const goal = goals.rows.find(x => String(x.text || '').toLowerCase().includes(String(state.concept).toLowerCase()));
      const daysUntil = exam ? Math.ceil((new Date(`${exam.date}T00:00:00Z`).getTime() - Date.now()) / 86400000) : null;
      const priority = state.state === 'struggling' ? 'high' : (exam && daysUntil <= 14 ? 'high' : 'medium');
      const reasons = [
        `${state.accuracy}% observed accuracy from ${state.total} evidence points.`,
        state.state === 'struggling' ? 'Recent evidence shows repeated incorrect or unresolved responses.' : 'Evidence indicates this concept can benefit from targeted revision.',
      ];
      if (exam) reasons.push(`Upcoming assessment: ${exam.title}.`);
      if (goal) reasons.push(`Supports learner goal: ${goal.text}.`);

      recommendations.push({
        type: state.state === 'struggling' ? 'targeted_practice' : 'revision',
        subject: state.subject,
        concept: state.concept,
        priority,
        estimatedMinutes: clamp(state.state === 'struggling' ? 20 : 15, 10, 30),
        reasons,
        evidenceCount: state.total,
        accuracy: state.accuracy,
        source: 'server_learning_evidence',
      });
    }

    recommendations.sort((a, b) => (a.priority === 'high' ? -1 : 1) - (b.priority === 'high' ? -1 : 1));
    return json(res, 200, {
      ok: true,
      learnerId,
      recommendations: recommendations.slice(0, 12),
      evidencePoints: evidence.rows.length,
      source: 'server_learning_evidence',
      limitations: ['Recommendations are evidence-based study guidance, not diagnosis or prediction of outcomes.'],
    });
  } catch (error) {
    return json(res, error.status || 500, {
      error: {
        code: error.code || 'PLANNER_RECOMMENDATIONS_FAILED',
        message: error.status ? error.message : 'Unable to generate planner recommendations.',
      },
    });
  }
}

export default handler;
