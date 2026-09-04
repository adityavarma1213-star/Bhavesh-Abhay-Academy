import { json } from './_lib/security.js';
import { requireAuth, requireLearnerAccess } from './_lib/auth.js';
import { sql } from './_lib/db.js';

export const config = { runtime: 'nodejs' };

// Stored evidence is already schema-bounded. Do not silently truncate
// authoritative academic labels here: truncation can merge two distinct
// concepts that share the same prefix and corrupt learning-state grouping.
const clean = (v) => String(v ?? '').trim();
const display = (v, max = 100) => clean(v).slice(0, max);
const human = v => display(v, 100).replace(/[-_]+/g, ' ');
const VALID_CORRECTNESS = ['correct', 'partially_correct', 'incorrect'];
const PAGE_SIZE = 500;
function requiredBounded(value, max, code, message) {
  const text = String(value ?? '').trim();
  if (!text) { const error = new Error(message); error.status = 400; error.code = code; throw error; }
  if (text.length > max) { const error = new Error(message); error.status = 400; error.code = code; throw error; }
  return text;
}

function confidence(count, hasReviewFlag) {
  if (count < 3) return { level: 'insufficient', label: 'Not enough evidence' };
  if (hasReviewFlag) return { level: 'low', label: 'Low evidence confidence' };
  if (count >= 6) return { level: 'high', label: 'High evidence confidence' };
  return { level: 'medium', label: 'Moderate evidence confidence' };
}

function deriveState(rows) {
  if (rows.length < 3) return 'insufficient_evidence';
  const recent = rows.slice(0, 5);
  const correct = recent.filter(r => r.correctness === 'correct').length;
  const rate = correct / recent.length;
  if (rate >= 0.8) return 'mastered';
  if (rate >= 0.6) return 'learning';
  if (rate <= 0.25) return 'struggling';
  return 'needs_revision';
}

async function loadAllEvidence(learnerId) {
  const rows = [];
  let cursor = null;
  for (;;) {
    const result = cursor
      ? await sql`
          SELECT id, concept, subject, topic, correctness, confidence, error_type, created_at
          FROM learning_evidence
          WHERE learner_id = ${learnerId}
            AND correctness IN ('correct', 'partially_correct', 'incorrect')
            AND (created_at < ${cursor.createdAt} OR (created_at = ${cursor.createdAt} AND id < ${cursor.id}))
          ORDER BY created_at DESC, id DESC
          LIMIT ${PAGE_SIZE}
        `
      : await sql`
          SELECT id, concept, subject, topic, correctness, confidence, error_type, created_at
          FROM learning_evidence
          WHERE learner_id = ${learnerId}
            AND correctness IN ('correct', 'partially_correct', 'incorrect')
          ORDER BY created_at DESC, id DESC
          LIMIT ${PAGE_SIZE}
        `;
    const batch = Array.isArray(result?.rows) ? result.rows : [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    const last = batch[batch.length - 1];
    cursor = { createdAt: last.created_at, id: last.id };
  }
  return rows;
}

export default async function handler(req, res) {
  const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };
  if (req.method !== 'GET') return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'GET required.' } }, { Allow: 'GET', ...NO_STORE });
  try {
    const session = await requireAuth(req);
    const learnerId = requiredBounded(req.query?.learnerId, 120, 'LEARNER_ID_TOO_LONG', 'learnerId is required and must be 120 characters or fewer.');
    await requireLearnerAccess(session, learnerId);

    const rows = await loadAllEvidence(learnerId);
    const grouped = new Map();
    for (const row of rows) {
      const concept = clean(row.concept);
      const subject = clean(row.subject);
      if (!concept) continue;
      // Group by the complete stored values so similarly-prefixed concepts
      // cannot be collapsed merely because a display helper has a length cap.
      const key = `${subject}\u001f${concept}`;
      if (!grouped.has(key)) grouped.set(key, { concept, subject, evidence: [] });
      grouped.get(key).evidence.push(row);
    }

    const concepts = [...grouped.values()].map(({ concept, subject, evidence }) => {
      const state = deriveState(evidence);
      const correct = evidence.filter(r => r.correctness === 'correct').length;
      const reviewFlag = evidence.some(r => ['low', 'human_review_required'].includes(String(r.confidence || '').toLowerCase()));
      const conf = confidence(evidence.length, reviewFlag);
      const recent = evidence.slice(0, 5);
      const recentCorrect = recent.filter(r => r.correctness === 'correct').length;
      const rate = recent.length ? Math.round((recentCorrect / recent.length) * 100) : null;
      const errorTypes = [...new Set(recent.map(r => display(r.error_type, 80)).filter(Boolean))].slice(0, 4);
      return {
        concept,
        conceptLabel: human(concept),
        subject,
        topic: display(evidence[0]?.topic, 100),
        state,
        evidenceCount: evidence.length,
        correctCount: correct,
        recentAccuracy: rate,
        confidence: conf,
        repeatedErrorTypes: errorTypes,
        lastUpdated: evidence[0]?.created_at || null,
        explanation: evidence.length < 3
          ? `Only ${evidence.length} recorded evidence item${evidence.length === 1 ? '' : 's'} exists for this concept in ${subject || 'this subject'}; BAA will not draw a firm conclusion yet.`
          : `The ${recent.length} most recent evidence items show ${recentCorrect}/${recent.length} correct (${rate}%). Across all ${evidence.length} recorded items, ${correct} are correct.`
      };
    }).sort((a, b) => String(b.lastUpdated || '').localeCompare(String(a.lastUpdated || '')));

    const summary = {
      hasAnyEvidence: rows.length > 0,
      totalEvidence: rows.length,
      trackedConcepts: concepts.length,
      mastered: concepts.filter(c => c.state === 'mastered').length,
      learning: concepts.filter(c => c.state === 'learning').length,
      needsRevision: concepts.filter(c => c.state === 'needs_revision').length,
      struggling: concepts.filter(c => c.state === 'struggling').length,
      insufficientEvidence: concepts.filter(c => c.state === 'insufficient_evidence').length,
    };

    return json(res, 200, {
      ok: true,
      learnerId,
      summary,
      concepts,
      methodology: 'Learning Memory is derived only from authenticated learner-scoped academic evidence already stored in PostgreSQL. Invalid or unscored evidence is excluded from learning-state calculations. Evidence is grouped by subject and concept so identically named concepts in different curriculum namespaces remain isolated. It never invents evidence or treats missing evidence as weakness.',
      limitations: [
        'Academic learning signals only; no psychological or emotional profiling.',
        'Question-level evidence is included only when the corresponding server evidence rows exist.',
        'Concept evidence is isolated by subject to avoid cross-subject state contamination.',
        'This endpoint processes the complete stored evidence history rather than silently truncating at an arbitrary row limit.',
        'This endpoint does not claim that a production database is provisioned merely because the source path exists.'
      ]
    }, NO_STORE);
  } catch (e) {
    return json(res, e.status || 500, { error: { code: e.code || 'LEARNING_MEMORY_FAILED', message: e.status ? e.message : 'Unable to load learning memory.' } }, NO_STORE);
  }
}