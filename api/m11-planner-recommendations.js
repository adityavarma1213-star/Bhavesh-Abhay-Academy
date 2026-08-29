import { json } from './_lib/security.js';
import { requireAuth, requireLearnerAccess } from './_lib/auth.js';
import { sql } from './_lib/db.js';

export const config = { runtime: 'nodejs' };

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const MIN_EVIDENCE = 3;
const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

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
    const evidenceSufficient = item.total >= MIN_EVIDENCE;
    const state = !evidenceSufficient
      ? 'insufficient_evidence'
      : accuracy < 60 || recentIncorrect >= 3
        ? 'struggling'
        : accuracy < 80
          ? 'needs_revision'
          : 'learning';
    return { ...item, accuracy, state, evidenceSufficient };
  });
}

async function getPolicy(learnerId) {
  const result = await sql`
    SELECT planner_enabled, planner_daily_minutes
    FROM parent_ai_policies
    WHERE learner_id=${learnerId}
    LIMIT 1
  `;
  const row = result.rows[0];
  return {
    plannerEnabled: row?.planner_enabled !== false,
    plannerDailyMinutes: clamp(Number.isFinite(Number(row?.planner_daily_minutes)) ? Number(row.planner_daily_minutes) : 30, 0, 480),
  };
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'GET required.' } }, { Allow: 'GET', ...NO_STORE });
  }

  try {
    const session = await requireAuth(req);
    const learnerId = String(req.query?.learnerId || '').trim().slice(0, 100);
    await requireLearnerAccess(session, learnerId);

    const policy = await getPolicy(learnerId);
    if (!policy.plannerEnabled) {
      return json(res, 403, {
        error: {
          code: 'AI_PLANNER_DISABLED_BY_PARENT_POLICY',
          message: 'AI Planner is disabled by the active parent approval policy for this learner.',
        },
      }, NO_STORE);
    }

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
    let remainingMinutes = policy.plannerDailyMinutes;

    for (const state of states) {
      if (remainingMinutes <= 0) break;
      if (!state.evidenceSufficient) continue;
      const exam = upcoming.rows.find(x => x.subject && x.subject === state.subject);
      const goal = goals.rows.find(x => String(x.text || '').toLowerCase().includes(String(state.concept).toLowerCase()));
      const daysUntil = exam ? Math.ceil((new Date(`${exam.date}T00:00:00Z`).getTime() - Date.now()) / 86400000) : null;
      const priority = state.state === 'struggling' ? 'high' : (exam && daysUntil <= 14 ? 'high' : 'medium');
      const estimatedMinutes = Math.min(clamp(state.state === 'struggling' ? 20 : 15, 10, 30), remainingMinutes);
      if (estimatedMinutes <= 0) break;
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
        estimatedMinutes,
        reasons,
        evidenceCount: state.total,
        accuracy: state.accuracy,
        source: 'server_learning_evidence',
      });
      remainingMinutes -= estimatedMinutes;
    }

    recommendations.sort((a, b) => (a.priority === 'high' ? -1 : 1) - (b.priority === 'high' ? -1 : 1));
    return json(res, 200, {
      ok: true,
      learnerId,
      recommendations: recommendations.slice(0, 12),
      evidencePoints: evidence.rows.length,
      evidenceGate: { minEvidence: MIN_EVIDENCE, sparseConceptsExcluded: states.filter(x => !x.evidenceSufficient).length },
      plannerDailyMinutes: policy.plannerDailyMinutes,
      scheduledMinutes: policy.plannerDailyMinutes - remainingMinutes,
      source: 'server_learning_evidence',
      limitations: ['Recommendations require at least three tagged evidence points per concept.', 'Recommendations are evidence-based study guidance, not diagnosis or prediction of outcomes.'],
    }, NO_STORE);
  } catch (error) {
    return json(res, error.status || 500, {
      error: {
        code: error.code || 'PLANNER_RECOMMENDATIONS_FAILED',
        message: error.status ? error.message : 'Unable to generate planner recommendations.',
      },
    }, NO_STORE);
  }
}

export default handler;
