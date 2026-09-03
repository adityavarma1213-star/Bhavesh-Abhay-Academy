import { json } from './_lib/security.js';
import { requireAuth, requireLearnerAccess } from './_lib/auth.js';
import { sql } from './_lib/db.js';

export const config = { runtime: 'nodejs' };

const MIN_EVIDENCE = 3;
const PAGE_SIZE = 500;
const DEFAULT_GOAL_LIMIT = 50;
const MAX_GOAL_LIMIT = 100;
const MAX_GOAL_CURSOR_CHARS = 512;
const MAX_GOAL_CURSOR_FIELD_CHARS = 128;
const VALID_CORRECTNESS = new Set(['correct','partially_correct','incorrect']);
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
    if (!VALID_CORRECTNESS.has(row.correctness)) continue;
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
    evidenceSufficient: item.total >= MIN_EVIDENCE,
    accuracy: item.total ? Math.round((item.correct / item.total) * 100) : 0,
  }));
  const evidenceBackedConcepts = concepts.filter(item => item.evidenceSufficient);
  const evidenceCount = evidenceBackedConcepts.reduce((sum, item) => sum + item.total, 0);
  const accuracy = evidenceCount
    ? Math.round(evidenceBackedConcepts.reduce((sum, item) => sum + item.correct, 0) / evidenceCount * 100)
    : null;
  const status = accuracy == null ? 'insufficient_evidence' : accuracy < 60 ? 'struggling' : accuracy < 80 ? 'needs_revision' : 'on_track';
  const nextAction = status === 'insufficient_evidence'
    ? 'Build at least three tagged evidence points on a relevant concept before drawing a progress conclusion.'
    : status === 'struggling'
      ? 'Schedule targeted practice on the weakest matched concept.'
      : status === 'needs_revision'
        ? 'Use a short revision task, then reassess the matched concept.'
        : 'Maintain progress with spaced practice and a later check.';

  return { status, accuracy, evidenceCount, matchedConcepts: evidenceBackedConcepts, sparseConcepts: concepts.filter(item => !item.evidenceSufficient), nextAction };
}

async function loadAllEvidence(learnerId) {
  const rows = [];
  let cursor = null;
  for (;;) {
    const page = cursor
      ? await sql`SELECT subject,chapter,concept,correctness,created_at,id
          FROM learning_evidence
          WHERE learner_id=${learnerId}
            AND (created_at < ${cursor.createdAt}
              OR (created_at = ${cursor.createdAt} AND id < ${cursor.id}))
          ORDER BY created_at DESC,id DESC
          LIMIT ${PAGE_SIZE}`
      : await sql`SELECT subject,chapter,concept,correctness,created_at,id
          FROM learning_evidence
          WHERE learner_id=${learnerId}
          ORDER BY created_at DESC,id DESC
          LIMIT ${PAGE_SIZE}`;
    const batch = Array.isArray(page?.rows) ? page.rows : [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    const last = batch[batch.length - 1];
    cursor = { createdAt: last.created_at, id: last.id };
  }
  return rows;
}

function parseGoalCursor(value) {
  if (!value) return null;
  const raw = String(value);
  if (raw.length > MAX_GOAL_CURSOR_CHARS) return null;
  try {
    const decoded = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (!decoded || typeof decoded !== 'object' || typeof decoded.createdAt !== 'string' || typeof decoded.id !== 'string') return null;
    if (decoded.createdAt.length > MAX_GOAL_CURSOR_FIELD_CHARS || decoded.id.length > MAX_GOAL_CURSOR_FIELD_CHARS) return null;
    const createdAt = new Date(decoded.createdAt);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { createdAt: decoded.createdAt, id: decoded.id };
  } catch (_) {
    return null;
  }
}

function encodeGoalCursor(row) {
  return Buffer.from(JSON.stringify({ createdAt: new Date(row.created_at).toISOString(), id: row.id })).toString('base64url');
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'GET required.' } }, { Allow: 'GET', 'Cache-Control': 'no-store' });
  }

  try {
    const session = await requireAuth(req);
    const learnerId = String(req.query?.learnerId || '');
    await requireLearnerAccess(session, learnerId);

    const rawLimit = Number(req.query?.goalLimit || DEFAULT_GOAL_LIMIT);
    const goalLimit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.floor(rawLimit), 1), MAX_GOAL_LIMIT) : DEFAULT_GOAL_LIMIT;
    const cursor = parseGoalCursor(req.query?.goalCursor);
    if (req.query?.goalCursor && !cursor) {
      return json(res, 400, { error: { code: 'INVALID_GOAL_CURSOR', message: 'goalCursor is invalid.' } }, { 'Cache-Control': 'private, no-store, max-age=0' });
    }

    const [goals, evidence, upcoming] = await Promise.all([
      cursor
        ? await sql`SELECT id,text,created_at FROM planner_goals
            WHERE learner_id=${learnerId}
              AND (created_at > ${cursor.createdAt}
                OR (created_at = ${cursor.createdAt} AND id > ${cursor.id}))
            ORDER BY created_at ASC,id ASC LIMIT ${goalLimit + 1}`
        : await sql`SELECT id,text,created_at FROM planner_goals
            WHERE learner_id=${learnerId}
            ORDER BY created_at ASC,id ASC LIMIT ${goalLimit + 1}`,
      loadAllEvidence(learnerId),
      sql`SELECT title,subject,date,assessment_id
          FROM planner_upcoming_assessments
          WHERE learner_id=${learnerId} AND date>=CURRENT_DATE
          ORDER BY date ASC LIMIT 12`,
    ]);

    const goalRows = Array.isArray(goals.rows) ? goals.rows : [];
    const hasMore = goalRows.length > goalLimit;
    const visibleGoals = hasMore ? goalRows.slice(0, goalLimit) : goalRows;

    const goalResults = visibleGoals.map(goal => {
      const progress = goalProgress(goal.text, evidence);
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

    const excludedEvidenceCount = evidence.length - evidence.filter(row => VALID_CORRECTNESS.has(row.correctness)).length;
    return json(res, 200, {
      ok: true,
      learnerId,
      goals: goalResults,
      goalPagination: {
        limit: goalLimit,
        hasMore,
        nextCursor: hasMore ? encodeGoalCursor(goalRows[goalRows.length - 1]) : null,
      },
      evidencePoints: evidence.length - excludedEvidenceCount,
      excludedEvidenceCount,
      evidenceGate: { minEvidence: MIN_EVIDENCE, validCorrectnessStates: [...VALID_CORRECTNESS] },
      source: 'server_planner_goals_and_learning_evidence',
      limitations: ['Goal progress is reported only from matched concepts with at least three valid tagged evidence points.', 'Unscored or unknown correctness values are excluded from progress calculations.', 'This is an evidence-linked academic heuristic; it does not claim to predict outcomes or measure motivation.', 'Evidence is read with keyset pagination so older records are not silently dropped at an arbitrary row limit.', 'Goal history is keyset-paginated so older planner goals are not silently dropped at an arbitrary row limit.'],
    }, { 'Cache-Control': 'private, no-store, max-age=0' });
  } catch (error) {
    return json(res, error.status || 500, {
      error: {
        code: error.code || 'GOAL_TRACKER_FAILED',
        message: error.status ? error.message : 'Unable to load goal progress.',
      },
    }, { 'Cache-Control': 'private, no-store, max-age=0' });
  }
}

export default handler;
