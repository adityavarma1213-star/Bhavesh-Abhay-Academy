import { sql } from './_lib/db.js';
import { json } from './_lib/security.js';
import { requireAuth, requireLearnerAccess } from './_lib/auth.js';

export const config = { runtime: 'nodejs' };

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

function confidenceBand(evidenceCount, conceptCount) {
  if (evidenceCount < 4 || conceptCount < 2) return 'insufficient_evidence';
  if (evidenceCount < 8 || conceptCount < 4) return 'low';
  if (evidenceCount < 16 || conceptCount < 7) return 'medium';
  return 'high';
}

function noStore(res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
}

export default async function handler(req, res) {
  noStore(res);
  try {
    const session = await requireAuth(req);
    const learnerId = String(req.query?.learnerId || '').trim();
    await requireLearnerAccess(session, learnerId);
    if (req.method !== 'GET') {
      return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'GET required.' } }, { Allow: 'GET' });
    }

    const attempts = await sql`
      SELECT id, score, max_score, end_time
      FROM assessment_attempts
      WHERE learner_id=${learnerId}
        AND status IN ('submitted','evaluated')
        AND score IS NOT NULL
        AND max_score > 0
      ORDER BY COALESCE(end_time, start_time) DESC
      LIMIT 20
    `;
    const memory = await sql`
      SELECT concept, status, evidence_count, correct_count
      FROM learning_memory
      WHERE learner_id=${learnerId}
        AND status IN ('mastered','learning','needs_revision')
      ORDER BY last_updated DESC
      LIMIT 200
    `;
    const evidence = await sql`
      SELECT COUNT(*)::int AS count
      FROM learning_evidence
      WHERE learner_id=${learnerId}
    `;

    const evidenceCount = Number(evidence.rows[0]?.count || 0);
    const conceptRows = memory.rows;
    const band = confidenceBand(evidenceCount, conceptRows.length);
    if (attempts.rows.length < 2 || conceptRows.length < 2 || band === 'insufficient_evidence') {
      return json(res, 200, {
        ok: true,
        learnerId,
        status: 'insufficient_evidence',
        message: 'BAA needs more completed assessments and concept evidence before making an academic forecast.',
        readiness: null,
        gradeTrajectory: null,
        milestone: null,
        confidence: band,
        evidence: { assessments: attempts.rows.length, trackedConcepts: conceptRows.length, rawEvidence: evidenceCount },
        scope: 'academic_forecast_only',
      });
    }

    const percentages = attempts.rows.map(row => Number(row.score) / Number(row.max_score) * 100);
    const current = percentages[0];
    const previous = percentages.slice(1, 5);
    const previousAvg = previous.length ? previous.reduce((sum, value) => sum + value, 0) / previous.length : current;
    const delta = current - previousAvg;
    const mastered = conceptRows.filter(row => row.status === 'mastered').length;
    const needsRevision = conceptRows.filter(row => row.status === 'needs_revision').length;
    const masteryRate = mastered / conceptRows.length;
    let readiness = Math.round(clamp((masteryRate * 70) + (current * 0.3), 0, 100));
    if (delta > 3) readiness = Math.min(100, readiness + 5);
    if (delta < -3) readiness = Math.max(0, readiness - 5);

    const direction = delta > 3 ? 'improving' : delta < -3 ? 'declining' : 'stable';
    const milestone = readiness >= 80
      ? 'Current evidence is consistent with strong readiness for the next milestone.'
      : readiness >= 60
        ? 'Current evidence suggests you are building toward the next milestone; targeted revision could improve readiness.'
        : 'Current evidence suggests more targeted practice is needed before the next milestone.';

    return json(res, 200, {
      ok: true,
      learnerId,
      status: 'forecast',
      readiness,
      gradeTrajectory: {
        currentPercentage: Math.round(current * 10) / 10,
        previousAverage: Math.round(previousAvg * 10) / 10,
        direction,
      },
      milestone,
      confidence: band,
      evidence: {
        assessments: attempts.rows.length,
        trackedConcepts: conceptRows.length,
        mastered,
        needsRevision,
        rawEvidence: evidenceCount,
      },
      scope: 'academic_forecast_only',
      limitation: 'This is an evidence-based academic estimate, not a diagnosis or guarantee of future outcomes.',
    });
  } catch (e) {
    return json(res, e.status || 500, {
      error: { code: e.code || 'PREDICTION_API_FAILED', message: e.status ? e.message : 'Prediction service unavailable.' }
    });
  }
}
