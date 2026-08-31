import { sql } from './_lib/db.js';
import { json } from './_lib/security.js';
import { requireAuth, requireLearnerAccess } from './_lib/auth.js';

export const config = { runtime: 'nodejs' };
const MIN_CONCEPT_EVIDENCE = 3;

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function confidenceBand(evidenceCount, conceptCount) {
  if (evidenceCount < 4 || conceptCount < 2) return 'insufficient_evidence';
  if (evidenceCount < 8 || conceptCount < 4) return 'low';
  if (evidenceCount < 16 || conceptCount < 7) return 'medium';
  return 'high';
}
function noStore(res) { res.setHeader('Cache-Control', 'private, no-store, max-age=0'); }
function forecastWarning(predicted) { if (predicted < 60) return 'high'; if (predicted < 75) return 'medium'; return 'low'; }

async function upcomingForecasts(learnerId) {
  const catalog = await sql`
    SELECT a.id, a.title, a.subject, a.chapter, a.total_marks, COUNT(aq.question_id)::int AS question_count
    FROM assessments a JOIN assessment_questions aq ON aq.assessment_id=a.id
    WHERE NOT EXISTS (SELECT 1 FROM assessment_attempts aa WHERE aa.learner_id=${learnerId} AND aa.assessment_id=a.id AND aa.status IN ('submitted','evaluated','completed'))
    GROUP BY a.id ORDER BY a.subject NULLS LAST, a.chapter NULLS LAST, a.title LIMIT 20`;
  if (!catalog.rows.length) return [];
  const questions = await sql`
    SELECT aq.assessment_id, q.id AS question_id, q.concept, q.marks, q.subject, q.chapter, lm.evidence_count, lm.correct_count, lm.status
    FROM assessment_questions aq JOIN questions q ON q.id=aq.question_id
    LEFT JOIN learning_memory lm ON lm.learner_id=${learnerId} AND lm.subject=q.subject AND lm.concept=q.concept
    WHERE aq.assessment_id = ANY(${catalog.rows.map(row => row.id)})`;
  const byAssessment = new Map();
  for (const row of questions.rows) { if (!byAssessment.has(row.assessment_id)) byAssessment.set(row.assessment_id, []); byAssessment.get(row.assessment_id).push(row); }
  return catalog.rows.map(assessment => {
    const rows = byAssessment.get(assessment.id) || [];
    const known = rows.filter(row => Number(row.evidence_count || 0) >= MIN_CONCEPT_EVIDENCE);
    if (!known.length || known.length < Math.max(1, Math.ceil(rows.length * 0.5))) return {
      assessmentId: assessment.id, title: assessment.title, subject: assessment.subject, chapter: assessment.chapter,
      status: 'insufficient_evidence', predictedPercentage: null, predictedRange: null, warningLevel: 'insufficient_evidence',
      evidence: { questions: rows.length, evidenceBackedQuestions: known.length, minimumConceptEvidence: MIN_CONCEPT_EVIDENCE },
      message: 'Not enough concept evidence to forecast this assessment yet.'
    };
    const weighted = known.reduce((sum, row) => sum + clamp(Number(row.correct_count || 0) / Number(row.evidence_count || 1), 0, 1) * Math.max(1, Number(row.marks || 1)), 0);
    const weightTotal = known.reduce((sum, row) => sum + Math.max(1, Number(row.marks || 1)), 0);
    const predicted = clamp((weighted / Math.max(1, weightTotal)) * 100, 0, 100);
    const band = confidenceBand(known.reduce((sum, row) => sum + Number(row.evidence_count || 0), 0), new Set(known.map(row => `${row.subject || ''}\u001f${row.concept || ''}`)).size);
    const margin = band === 'high' ? 5 : band === 'medium' ? 10 : 15;
    return {
      assessmentId: assessment.id, title: assessment.title, subject: assessment.subject, chapter: assessment.chapter, status: 'forecast',
      predictedPercentage: Math.round(predicted * 10) / 10,
      predictedRange: { low: Math.round(clamp(predicted - margin, 0, 100) * 10) / 10, high: Math.round(clamp(predicted + margin, 0, 100) * 10) / 10 },
      warningLevel: forecastWarning(predicted), confidence: band,
      evidence: { questions: rows.length, evidenceBackedQuestions: known.length, concepts: new Set(known.map(row => `${row.subject || ''}\u001f${row.concept || ''}`)).size, minimumConceptEvidence: MIN_CONCEPT_EVIDENCE },
      scope: 'academic_forecast_only'
    };
  });
}

export default async function handler(req, res) {
  noStore(res);
  try {
    const session = await requireAuth(req);
    const learnerId = String(req.query?.learnerId || '').trim();
    await requireLearnerAccess(session, learnerId);
    if (req.method !== 'GET') return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'GET required.' } }, { Allow: 'GET' });
    const attempts = await sql`
      SELECT id, score, max_score, end_time FROM assessment_attempts
      WHERE learner_id=${learnerId} AND status IN ('submitted','evaluated','completed') AND score IS NOT NULL AND max_score > 0
      ORDER BY COALESCE(end_time, start_time) DESC LIMIT 20`;
    const memory = await sql`
      SELECT subject, concept, status, evidence_count, correct_count FROM learning_memory
      WHERE learner_id=${learnerId} AND status IN ('mastered','learning','needs_revision')
      ORDER BY last_updated DESC LIMIT 200`;
    const evidence = await sql`SELECT COUNT(*)::int AS count FROM learning_evidence WHERE learner_id=${learnerId}`;
    const evidenceCount = Number(evidence.rows[0]?.count || 0);
    const allConceptRows = memory.rows;
    const conceptRows = allConceptRows.filter(row => Number(row.evidence_count || 0) >= MIN_CONCEPT_EVIDENCE);
    const conceptNamespaces = new Set(conceptRows.map(row => `${row.subject || ''}\u001f${row.concept || ''}`));
    const band = confidenceBand(evidenceCount, conceptNamespaces.size);
    const upcoming = String(req.query?.includeUpcoming || '').toLowerCase() === 'true' ? await upcomingForecasts(learnerId) : [];
    if (attempts.rows.length < 2 || conceptNamespaces.size < 2 || band === 'insufficient_evidence') return json(res, 200, {
      ok: true, learnerId, status: 'insufficient_evidence',
      message: 'BAA needs more completed assessments and at least 3 evidence points on at least 2 concepts before making an academic forecast.',
      readiness: null, gradeTrajectory: null, milestone: null, confidence: band,
      evidence: { assessments: attempts.rows.length, trackedConcepts: allConceptRows.length, evidenceBackedConcepts: conceptNamespaces.size, rawEvidence: evidenceCount, minimumConceptEvidence: MIN_CONCEPT_EVIDENCE },
      upcomingForecasts: upcoming, scope: 'academic_forecast_only'
    });
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
    const milestone = readiness >= 80 ? 'Current evidence is consistent with strong readiness for the next milestone.' : readiness >= 60 ? 'Current evidence suggests you are building toward the next milestone; targeted revision could improve readiness.' : 'Current evidence suggests more targeted practice is needed before the next milestone.';
    return json(res, 200, {
      ok: true, learnerId, status: 'forecast', readiness,
      gradeTrajectory: { currentPercentage: Math.round(current * 10) / 10, previousAverage: Math.round(previousAvg * 10) / 10, direction },
      milestone, confidence: band,
      evidence: { assessments: attempts.rows.length, trackedConcepts: allConceptRows.length, evidenceBackedConcepts: conceptNamespaces.size, mastered, needsRevision, rawEvidence: evidenceCount, minimumConceptEvidence: MIN_CONCEPT_EVIDENCE },
      upcomingForecasts: upcoming, scope: 'academic_forecast_only',
      limitation: 'This is an evidence-based academic estimate, not a diagnosis or guarantee of future outcomes.'
    });
  } catch (e) {
    return json(res, e.status || 500, { error: { code: e.code || 'PREDICTION_API_FAILED', message: e.status ? e.message : 'Prediction service unavailable.' } });
  }
}