import { sql } from './_lib/db.js';
import { json } from './_lib/security.js';
import { requireAuth, requireLearnerAccess } from './_lib/auth.js';

export const config = { runtime: 'nodejs' };
const VALID_CORRECTNESS = ['correct', 'partially_correct', 'incorrect'];
const MAX_LEARNER_ID = 120;
const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

function readLearnerId(req) {
  const raw = String(req.query?.learnerId || '').trim();
  if (!raw) return { error: { code: 'LEARNER_ID_REQUIRED', message: 'learnerId is required.' } };
  if (raw.length > MAX_LEARNER_ID) return { error: { code: 'LEARNER_ID_TOO_LONG', message: `learnerId must be at most ${MAX_LEARNER_ID} characters.` } };
  return { value: raw };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'GET required.' } }, { Allow: 'GET', ...NO_STORE });
    }
    const session = await requireAuth(req);
    const parsedLearnerId = readLearnerId(req);
    if (parsedLearnerId.error) return json(res, 400, { error: parsedLearnerId.error }, NO_STORE);
    const learnerId = parsedLearnerId.value;
    await requireLearnerAccess(session, learnerId);

    const result = await sql`
      SELECT subject, concept,
             COUNT(*)::int AS evidence_count,
             COUNT(*) FILTER (WHERE confidence IN ('low','human_review_required'))::int AS low_confidence_count
      FROM learning_evidence
      WHERE learner_id=${learnerId}
        AND correctness IN ('correct','partially_correct','incorrect')
      GROUP BY subject, concept
      ORDER BY subject ASC NULLS LAST, concept ASC
    `;

    const concepts = result.rows.map(row => ({
      subject: row.subject || null,
      concept: row.concept,
      evidenceCount: Number(row.evidence_count || 0),
      confidence: Number(row.evidence_count || 0) < 3
        ? 'insufficient_evidence'
        : Number(row.low_confidence_count || 0) > 0
          ? 'low'
          : Number(row.evidence_count || 0) >= 6 ? 'high' : 'medium'
    }));
    const eligible = concepts.filter(c => ['high','medium','low'].includes(c.confidence));
    const band = !eligible.length ? 'insufficient_evidence'
      : eligible.some(c => c.confidence === 'low') ? 'low'
      : eligible.some(c => c.confidence === 'medium') ? 'medium'
      : 'high';

    return json(res, 200, {
      ok: true,
      learnerId,
      band,
      eligibleConcepts: eligible.length,
      totalTrackedConcepts: concepts.length,
      concepts,
      scope: 'academic_evidence_confidence_only',
      evidenceGate: {
        minimumEvidence: 3,
        validCorrectnessStates: VALID_CORRECTNESS,
        invalidEvidenceExcluded: 'Learning evidence with unknown or unscored correctness does not contribute to confidence.'
      },
      explanation: band === 'insufficient_evidence'
        ? 'BAA needs at least 3 valid evidence rows for a subject-and-concept pair before it contributes to the confidence meter.'
        : band === 'low'
          ? 'At least one tracked subject-and-concept pair contains low-confidence or human-review-required evidence.'
          : band === 'medium'
            ? 'Tracked concepts have enough evidence to judge, but some still have fewer than 6 evidence rows.'
            : 'Most tracked concepts have at least 6 evidence rows and no low-confidence AI evidence.'
    }, NO_STORE);
  } catch (e) {
    return json(res, e.status || 500, {
      error: { code: e.code || 'CONFIDENCE_API_FAILED', message: e.status ? e.message : 'Confidence service unavailable.' }
    }, NO_STORE);
  }
}