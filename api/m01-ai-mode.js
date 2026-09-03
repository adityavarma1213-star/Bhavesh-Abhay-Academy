// BAA OS — M01 authoritative AI Mode adapter.
// Server-owned evidence is the only source for concept state/counts.
import baseHandler from './ai-mode.js';
import { sql } from './_lib/db.js';
import { requireAuth, requireLearnerAccess } from './_lib/auth.js';
import { json } from './_lib/security.js';

export const config = { runtime: 'nodejs' };
const MIN_EVIDENCE = 3;
const MEMORY_PAGE_SIZE = 500;
const AI_CONTEXT_CONCEPT_LIMIT = 40;
const MAX_LEARNER_ID_CHARS = 100;

function cleanText(value, max = 120) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function readLearnerId(value) {
  if (typeof value !== 'string') return '';
  const normalized = value.trim();
  if (!normalized) return '';
  if (normalized.length > MAX_LEARNER_ID_CHARS) {
    const error = new Error('Learner identifier exceeds the allowed length.');
    error.status = 400;
    error.code = 'LEARNER_ID_TOO_LONG';
    throw error;
  }
  return normalized;
}

function stateFor(row) {
  const count = Number(row?.evidence_count || 0);
  if (!row || count < MIN_EVIDENCE) return 'insufficient_evidence';
  if (row.status === 'mastered') return 'mastered';
  if (row.status === 'needs_revision') return 'needs_revision';
  return Number(row.correct_count || 0) / count < 0.4 ? 'struggling' : 'learning';
}

function confidenceFor(count) {
  const n = Number(count || 0);
  if (n >= 5) return 'high';
  if (n >= MIN_EVIDENCE) return 'medium';
  return 'insufficient_evidence';
}

function noStore(res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
}

async function loadAllMemory(learnerId) {
  const rows = [];
  let cursor = null;
  for (;;) {
    const page = cursor
      ? await sql`SELECT id, concept, status, evidence_count, correct_count, last_updated
          FROM learning_memory
          WHERE learner_id=${learnerId}
            AND (last_updated < ${cursor.lastUpdated}
              OR (last_updated = ${cursor.lastUpdated} AND id < ${cursor.id}))
          ORDER BY last_updated DESC, id DESC
          LIMIT ${MEMORY_PAGE_SIZE}`
      : await sql`SELECT id, concept, status, evidence_count, correct_count, last_updated
          FROM learning_memory
          WHERE learner_id=${learnerId}
          ORDER BY last_updated DESC, id DESC
          LIMIT ${MEMORY_PAGE_SIZE}`;
    const batch = Array.isArray(page?.rows) ? page.rows : [];
    rows.push(...batch);
    if (batch.length < MEMORY_PAGE_SIZE) break;
    const last = batch[batch.length - 1];
    cursor = { lastUpdated: last.last_updated, id: last.id };
  }
  return rows;
}

export default async function handler(req, res) {
  try {
    const session = await requireAuth(req);
    const learnerId = readLearnerId(req.query?.learnerId);
    await requireLearnerAccess(session, learnerId);
    noStore(res);

    const [memoryRows, goalsResult, prefsResult, assessmentsResult] = await Promise.all([
      loadAllMemory(learnerId),
      sql`SELECT text FROM planner_goals WHERE learner_id=${learnerId} ORDER BY created_at DESC LIMIT 1`,
      sql`SELECT available_minutes_per_day FROM planner_preferences WHERE learner_id=${learnerId} LIMIT 1`,
      sql`SELECT title, subject, TO_CHAR(date, 'YYYY-MM-DD') AS date FROM planner_upcoming_assessments WHERE learner_id=${learnerId} AND date >= CURRENT_DATE ORDER BY date ASC LIMIT 8`,
    ]);

    const concepts = memoryRows.map((row) => ({
      concept: cleanText(row.concept, 80),
      state: stateFor(row),
      confidence: confidenceFor(row.evidence_count),
      evidenceCount: Number(row.evidence_count || 0),
    })).filter((row) => row.concept);

    // Keep the AI context bounded, but never let the database's newest/highest-evidence
    // rows decide which learning needs are visible. Weakness is the primary selection key.
    const priority = { struggling: 0, needs_revision: 1, learning: 2, insufficient_evidence: 3, mastered: 4 };
    concepts.sort((a, b) => (priority[a.state] ?? 9) - (priority[b.state] ?? 9)
      || b.evidenceCount - a.evidenceCount
      || a.concept.localeCompare(b.concept));
    const prioritizedConcepts = concepts.slice(0, AI_CONTEXT_CONCEPT_LIMIT);

    const goal = cleanText(req.body?.goal, 120) || cleanText(goalsResult.rows[0]?.text, 120);
    if (!goal) return json(res, 400, { error: { code: 'GOAL_REQUIRED', message: 'Add a learning goal before asking AI Mode to build a path.' } });

    const authoritativeBody = {
      goal,
      concepts: prioritizedConcepts,
      evidenceGate: {
        minimumEvidence: MIN_EVIDENCE,
        rule: 'Concept states and confidence are characterized only after the minimum evidence threshold is met.',
        contextSelection: `Complete learning-memory history is inspected; at most ${AI_CONTEXT_CONCEPT_LIMIT} concepts are supplied to AI, prioritized by learning need.`,
      },
      availableMinutesPerDay: Number(prefsResult.rows[0]?.available_minutes_per_day || 30),
      upcomingAssessments: assessmentsResult.rows,
      previousPlan: req.body?.previousPlan || null,
    };

    req.json = async () => authoritativeBody;
    return baseHandler(req, res);
  } catch (e) {
    noStore(res);
    return json(res, e.status || 500, { error: { code: e.code || 'AI_MODE_EVIDENCE_API_FAILED', message: e.status ? e.message : 'AI Mode evidence service unavailable.' } });
  }
}
