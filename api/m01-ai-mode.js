// BAA OS — M01 authoritative AI Mode adapter.
// Keeps the existing Gemini/plan validation implementation in api/ai-mode.js,
// but replaces client-supplied learning evidence with server-owned evidence.
// The client may supply the learner's goal; concepts, mastery state and
// evidence counts come from authenticated PostgreSQL state.
import baseHandler from './ai-mode.js';
import { sql } from './_lib/db.js';
import { requireAuth, requireLearnerAccess } from './_lib/auth.js';
import { json } from './_lib/security.js';

export const config = { runtime: 'nodejs' };

function cleanText(value, max = 120) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function stateFor(row) {
  if (!row || Number(row.evidence_count || 0) < 1) return 'insufficient_evidence';
  if (row.status === 'mastered') return 'mastered';
  if (row.status === 'needs_revision') return 'needs_revision';
  if (Number(row.correct_count || 0) / Number(row.evidence_count || 1) < 0.4) return 'struggling';
  return 'learning';
}

function confidenceFor(count) {
  const n = Number(count || 0);
  if (n >= 5) return 'high';
  if (n >= 2) return 'medium';
  if (n >= 1) return 'low';
  return 'insufficient_evidence';
}

export default async function handler(req, res) {
  try {
    const session = await requireAuth(req);
    const learnerId = cleanText(req.query?.learnerId, 100);
    await requireLearnerAccess(session, learnerId);

    const [memoryResult, goalsResult, prefsResult, assessmentsResult] = await Promise.all([
      sql`
        SELECT concept, status, evidence_count, correct_count
        FROM learning_memory
        WHERE learner_id=${learnerId}
        ORDER BY evidence_count DESC, last_updated DESC
        LIMIT 20
      `,
      sql`
        SELECT text
        FROM planner_goals
        WHERE learner_id=${learnerId}
        ORDER BY created_at DESC
        LIMIT 1
      `,
      sql`
        SELECT available_minutes_per_day
        FROM planner_preferences
        WHERE learner_id=${learnerId}
        LIMIT 1
      `,
      sql`
        SELECT title, subject, TO_CHAR(date, 'YYYY-MM-DD') AS date
        FROM planner_upcoming_assessments
        WHERE learner_id=${learnerId} AND date >= CURRENT_DATE
        ORDER BY date ASC
        LIMIT 8
      `,
    ]);

    const concepts = memoryResult.rows.map((row) => ({
      concept: cleanText(row.concept, 80),
      state: stateFor(row),
      confidence: confidenceFor(row.evidence_count),
      evidenceCount: Number(row.evidence_count || 0),
    })).filter((row) => row.concept);

    const goal = cleanText(req.body?.goal, 120) || cleanText(goalsResult.rows[0]?.text, 120);
    if (!goal) return json(res, 400, { error: { code: 'GOAL_REQUIRED', message: 'Add a learning goal before asking AI Mode to build a path.' } });

    const authoritativeBody = {
      goal,
      concepts,
      availableMinutesPerDay: Number(prefsResult.rows[0]?.available_minutes_per_day || 30),
      upcomingAssessments: assessmentsResult.rows,
      previousPlan: req.body?.previousPlan || null,
    };

    // ai-mode.js reads req.json(); override only that input while preserving
    // the authenticated request/session and existing response/security path.
    req.json = async () => authoritativeBody;
    return baseHandler(req, res);
  } catch (e) {
    return json(res, e.status || 500, { error: { code: e.code || 'AI_MODE_EVIDENCE_API_FAILED', message: e.status ? e.message : 'AI Mode evidence service unavailable.' } });
  }
}
