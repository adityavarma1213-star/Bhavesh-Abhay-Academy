import { sql } from './_lib/db.js';
import { json } from './_lib/security.js';
import { requireAuth, requireLearnerAccess } from './_lib/auth.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'GET required.' } }, { Allow: 'GET', 'Cache-Control': 'no-store' });
    }
    const session = await requireAuth(req);
    const learnerId = String(req.query?.learnerId || '').trim();
    await requireLearnerAccess(session, learnerId);

    const result = await sql`
      SELECT concept,
             COUNT(*)::int AS evidence_count,
             COUNT(*) FILTER (WHERE confidence IN ('low','human_review_required'))::int AS low_confidence_count
      FROM learning_evidence
      WHERE learner_id=${learnerId}
      GROUP BY concept
      ORDER BY concept ASC
    `;

    const concepts = result.rows.map(row => ({
      concept: row.concept,
      evidenceCount: Number(row.evidence_count || 0),
      confidence: Number(row.low_confidence_count || 0) > 0
        ? 'low'
        : Number(row.evidence_count || 0) >= 6 ? 'high'
        : Number(row.evidence_count || 0) >= 3 ? 'medium'
        : 'insufficient_evidence'
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
      explanation: band === 'insufficient_evidence'
        ? 'BAA needs at least 3 evidence rows for a concept before it contributes to the confidence meter.'
        : band === 'low'
          ? 'At least one tracked concept contains low-confidence or human-review-required evidence.'
          : band === 'medium'
            ? 'Tracked concepts have enough evidence to judge, but some still have fewer than 6 evidence rows.'
            : 'Most tracked concepts have at least 6 evidence rows and no low-confidence AI evidence.'
    }, { 'Cache-Control': 'no-store' });
  } catch (e) {
    return json(res, e.status || 500, {
      error: { code: e.code || 'CONFIDENCE_API_FAILED', message: e.status ? e.message : 'Confidence service unavailable.' }
    }, { 'Cache-Control': 'no-store' });
  }
}