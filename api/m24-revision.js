import { json } from './_lib/security.js';
import { requireAuth, requireLearnerAccess } from './_lib/auth.js';
import { sql } from './_lib/db.js';

export const config = { runtime: 'nodejs' };
const MIN_EVIDENCE = 3;
const MAX_LEARNER_ID_CHARS = 120;
const VALID_CORRECTNESS = ['correct', 'partially_correct', 'incorrect'];
const intervalFor = (incorrect, partial, evidence) => incorrect >= 2 ? 1 : partial >= 1 ? 3 : evidence >= 6 ? 30 : evidence >= MIN_EVIDENCE ? 14 : 7;

function parseLearnerId(value) {
  if (typeof value !== 'string' || !value.trim()) return { value: '', error: 'LEARNER_ID_REQUIRED' };
  const trimmed = value.trim();
  if (trimmed.length > MAX_LEARNER_ID_CHARS) return { value: '', error: 'LEARNER_ID_TOO_LONG' };
  return { value: trimmed, error: null };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'GET required.' } }, { Allow: 'GET', 'Cache-Control': 'private, no-store, max-age=0' });
  try {
    const session = await requireAuth(req);
    const parsedLearner = parseLearnerId(req.query?.learnerId);
    if (parsedLearner.error) {
      return json(res, 400, {
        error: {
          code: parsedLearner.error,
          message: parsedLearner.error === 'LEARNER_ID_TOO_LONG'
            ? `learnerId must be at most ${MAX_LEARNER_ID_CHARS} characters.`
            : 'learnerId is required.',
        },
      }, { 'Cache-Control': 'private, no-store, max-age=0' });
    }
    const learnerId = parsedLearner.value;
    await requireLearnerAccess(session, learnerId);
    const rows = await sql`
      SELECT le.subject, le.chapter, le.concept,
             COUNT(*)::int AS evidence_count,
             COUNT(*) FILTER (WHERE le.correctness='incorrect')::int AS incorrect_count,
             COUNT(*) FILTER (WHERE le.correctness='partially_correct')::int AS partial_count,
             MAX(le.created_at) AS last_seen
      FROM learning_evidence le
      WHERE le.learner_id=${learnerId}
        AND le.correctness IN ('correct','partially_correct','incorrect')
      GROUP BY le.subject, le.chapter, le.concept
      ORDER BY last_seen DESC`;
    const now = Date.now();
    const plan = rows.rows.map(r => {
      const evidence = Number(r.evidence_count || 0);
      const incorrect = Number(r.incorrect_count || 0);
      const partial = Number(r.partial_count || 0);
      const interval = intervalFor(incorrect, partial, evidence);
      const last = Date.parse(r.last_seen || '');
      const days = Number.isFinite(last) ? Math.max(0, Math.floor((now-last)/86400000)) : 0;
      const state = evidence < MIN_EVIDENCE ? 'insufficient_evidence' : incorrect >= 2 ? 'struggling' : partial >= 1 ? 'needs_revision' : 'stable';
      return { concept:r.concept || 'Unspecified concept', subject:r.subject || null, chapter:r.chapter || null, status:state, evidenceCount:evidence, reviewIntervalDays:interval, due:days>=interval, lastSeen:r.last_seen, reason:evidence < MIN_EVIDENCE ? `Not enough evidence yet (${evidence}/${MIN_EVIDENCE} required) to characterize revision need.` : `Review interval selected from ${state} server evidence.` };
    });
    return json(res, 200, { ok:true, learnerId, plan, evidenceGate:{ minimumEvidence:MIN_EVIDENCE, sparseEvidenceStatus:'insufficient_evidence', validCorrectnessStates:VALID_CORRECTNESS }, source:'server_learning_evidence', limitation:'Revision timing is an evidence-based product heuristic, not a medically or scientifically validated timing claim.' }, { 'Cache-Control': 'private, no-store, max-age=0' });
  } catch (e) {
    return json(res, e.status || 500, { error: { code:e.code || 'REVISION_FAILED', message:e.status ? e.message : 'Unable to load revision evidence.' } }, { 'Cache-Control': 'private, no-store, max-age=0' });
  }
}