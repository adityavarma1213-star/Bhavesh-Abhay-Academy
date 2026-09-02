import { json } from './_lib/security.js';
import { requireAuth, requireLearnerAccess } from './_lib/auth.js';
import { sql } from './_lib/db.js';

export const config = { runtime: 'nodejs' };
const TYPES = new Set(['concept_gap','calculation','reading','procedure','careless','unknown']);
const MIN_COMMON_EVIDENCE = 3;
const VALID_CORRECTNESS = ['incorrect','partially_correct'];
const PAGE_SIZE = 500;
const clean = (v, max = 160) => String(v ?? '').trim().slice(0, max);

async function loadAllMistakeEvidence(learnerId, subject, chapter) {
  const rows = [];
  let cursor = null;
  for (;;) {
    const page = cursor
      ? await sql`
          SELECT le.id, le.subject, le.chapter, le.concept, le.question_id AS "questionId",
                 le.attempt_id AS "attemptId", le.correctness, le.finding_details AS "findingDetails",
                 le.created_at AS "createdAt",
                 ar.confidence, ar.human_review_required AS "humanReviewRequired",
                 ar.evaluation_failed AS "evaluationFailed"
          FROM learning_evidence le
          LEFT JOIN assessment_results ar
            ON ar.attempt_id=le.attempt_id AND ar.question_id=le.question_id
          WHERE le.learner_id=${learnerId}
            AND le.correctness IN ('incorrect','partially_correct')
            AND (${subject}='' OR le.subject=${subject})
            AND (${chapter}='' OR le.chapter=${chapter})
            AND (le.created_at < ${cursor.createdAt} OR (le.created_at=${cursor.createdAt} AND le.id < ${cursor.id}))
          ORDER BY le.created_at DESC, le.id DESC
          LIMIT ${PAGE_SIZE}`
      : await sql`
          SELECT le.id, le.subject, le.chapter, le.concept, le.question_id AS "questionId",
                 le.attempt_id AS "attemptId", le.correctness, le.finding_details AS "findingDetails",
                 le.created_at AS "createdAt",
                 ar.confidence, ar.human_review_required AS "humanReviewRequired",
                 ar.evaluation_failed AS "evaluationFailed"
          FROM learning_evidence le
          LEFT JOIN assessment_results ar
            ON ar.attempt_id=le.attempt_id AND ar.question_id=le.question_id
          WHERE le.learner_id=${learnerId}
            AND le.correctness IN ('incorrect','partially_correct')
            AND (${subject}='' OR le.subject=${subject})
            AND (${chapter}='' OR le.chapter=${chapter})
          ORDER BY le.created_at DESC, le.id DESC
          LIMIT ${PAGE_SIZE}`;
    const batch = Array.isArray(page?.rows) ? page.rows : [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    const last = batch[batch.length - 1];
    cursor = { createdAt: last.createdAt, id: last.id };
  }
  return rows;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  if (req.method !== 'GET') return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'GET required.' } }, { Allow: 'GET' });
  try {
    const session = await requireAuth(req);
    const learnerId = clean(req.query?.learnerId, 120);
    await requireLearnerAccess(session, learnerId);
    const subject = clean(req.query?.subject, 120);
    const chapter = clean(req.query?.chapter, 160);
    const requestedLimit = Number(req.query?.limit ?? 200);
    if (!Number.isFinite(requestedLimit) || !Number.isInteger(requestedLimit) || requestedLimit < 1) {
      return json(res, 400, { error: { code: 'INVALID_LIMIT', message: 'limit must be a positive integer.' } });
    }
    const limit = Math.min(requestedLimit, 500);

    const rows = await loadAllMistakeEvidence(learnerId, subject, chapter);

    const map = {};
    const conceptMap = {};
    for (const row of rows) {
      const details = Array.isArray(row.findingDetails) ? row.findingDetails : [];
      const labels = details.length ? details : ['general_error'];
      for (const raw of labels) {
        const label = clean(raw, 180) || 'general_error';
        const reasonType = TYPES.has(label) ? label : (label.toLowerCase().includes('concept') ? 'concept_gap' : 'unknown');
        const key = `${row.subject || 'Unknown'}::${row.chapter || 'Unspecified'}::${reasonType}`;
        if (!map[key]) map[key] = { subject: row.subject || null, chapter: row.chapter || null, reasonType, count: 0, questions: new Set(), lastSeen: null, reviewRequired: 0 };
        map[key].count += 1;
        if (row.questionId) map[key].questions.add(row.questionId);
        if (!map[key].lastSeen || new Date(row.createdAt) > new Date(map[key].lastSeen)) map[key].lastSeen = row.createdAt;
        if (row.humanReviewRequired || row.evaluationFailed) map[key].reviewRequired += 1;

        const concept = clean(row.concept, 180) || 'Unspecified concept';
        const ckey = `${row.subject || 'Unknown'}::${row.chapter || 'Unspecified'}::${concept}`;
        if (!conceptMap[ckey]) conceptMap[ckey] = { subject: row.subject || null, chapter: row.chapter || null, concept, count: 0, reasonTypes: new Set(), lastSeen: null };
        conceptMap[ckey].count += 1;
        conceptMap[ckey].reasonTypes.add(reasonType);
        if (!conceptMap[ckey].lastSeen || new Date(row.createdAt) > new Date(conceptMap[ckey].lastSeen)) conceptMap[ckey].lastSeen = row.createdAt;
      }
    }
    const groups = Object.values(map).map(g => ({ ...g, questions: g.questions.size, confidence: g.reviewRequired ? 'review_required' : 'evidence_based' })).sort((a,b) => b.count-a.count || String(a.subject).localeCompare(String(b.subject)));
    const commonMistakes = Object.values(conceptMap)
      .filter(g => g.count >= MIN_COMMON_EVIDENCE)
      .map(g => ({ ...g, reasonTypes: [...g.reasonTypes] }))
      .sort((a,b) => b.count-a.count || String(a.concept).localeCompare(String(b.concept)))
      .slice(0, 25);
    const reasonSummary = groups.reduce((out,g) => { out[g.reasonType]=(out[g.reasonType]||0)+g.count; return out; }, {});
    return json(res, 200, {
      ok: true,
      learnerId,
      filters: { subject: subject || null, chapter: chapter || null },
      groups: groups.slice(0, limit),
      commonMistakes,
      reasonSummary,
      evidenceCount: rows.length,
      evidenceGate: { minimumCommonEvidence: MIN_COMMON_EVIDENCE, sparseEvidenceIsNotCommonPattern: true, validCorrectnessStates: VALID_CORRECTNESS },
      limitation: 'Mistake archeology reports recorded incorrect or partially-correct evidence across the complete stored evidence history; it does not diagnose psychological causes.'
    });
  } catch (e) {
    return json(res, e.status || 500, { error: { code: e.code || 'MISTAKE_ANALYTICS_FAILED', message: e.status ? e.message : 'Unable to load mistake analytics.' } });
  }
}