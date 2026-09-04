// BAA M08 — authenticated durable homework synchronization boundary.
// Persists structured submission snapshots only. Raw image/PDF bytes are never stored here.
// AI evaluation data is accepted only when its server-issued verdict token binds it
// to the same submission id, homework text, and signed evaluation controls.
import { sql } from '../_lib/db.js';
import { json, writeAudit } from '../_lib/security.js';
import { requireAuth, requireLearnerAccess } from '../_lib/auth.js';
import { hashHomeworkText, verifyHomeworkVerdict } from '../_lib/assessment-verdict.js';

export const config = { runtime: 'nodejs' };
const MAX_SUBMISSIONS = 100;
const MAX_TEXT_CHARS = 8000;
const MAX_SUBJECT_CHARS = 200;
const MAX_JSON_BYTES = 900000;
const MAX_LEARNER_ID_CHARS = 120;
const ALLOWED_STATUSES = new Set(['received', 'evaluating', 'evaluated', 'evaluation_failed']);
const ALLOWED_ASSESSMENTS = new Set(['strong', 'good', 'needs_improvement', 'incomplete', 'uncertain']);
const ALLOWED_CONFIDENCE = new Set(['high', 'medium', 'low']);

function noStore(res) { res.setHeader('Cache-Control', 'private, no-store, max-age=0'); }
function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}
function cleanString(value, max) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length > max) {
    const error = new Error(`Value must be at most ${max} characters.`);
    error.status = 400;
    error.code = 'VALUE_TOO_LONG';
    throw error;
  }
  return trimmed;
}
function cleanAttachment(a) {
  if (!a || typeof a !== 'object' || !['image', 'pdf'].includes(a.type)) return null;
  const mime = cleanString(a.mimeType, 100);
  if (!mime) return null;
  const out = { type: a.type, mimeType: mime };
  for (const key of ['originalSizeBytes', 'compressedSizeBytes', 'width', 'height', 'pageCount', 'extractedChars']) {
    if (a[key] != null && Number.isFinite(Number(a[key])) && Number(a[key]) >= 0) out[key] = Math.floor(Number(a[key]));
  }
  if (a.fileName) out.fileName = cleanString(a.fileName, 200);
  return out;
}
function cleanLearningSignals(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 5).filter(x => x && typeof x === 'object').map(x => ({
    concept: cleanString(x.concept, 120),
    outcome: cleanString(x.outcome, 60),
    errorType: x.errorType == null ? null : cleanString(x.errorType, 120),
    confidence: cleanString(x.confidence, 20),
  })).filter(x => x.concept);
}
function cleanEvaluation(e, submissionId, text) {
  if (!e || typeof e !== 'object') return null;
  if (!ALLOWED_ASSESSMENTS.has(e.overallAssessment) || !ALLOWED_CONFIDENCE.has(e.confidence)) return null;
  const token = cleanString(e.verdictToken, 2000);
  const verification = verifyHomeworkVerdict(token, { submissionId, textHash: hashHomeworkText(text) });
  if (!verification.ok) return null;
  const verdict = verification.verdict;
  const signedLearningSignals = cleanLearningSignals(verdict.learningSignals);
  const suppliedLearningSignals = cleanLearningSignals(e.learningSignals);
  if (verdict.overallAssessment !== e.overallAssessment || verdict.confidence !== e.confidence) return null;
  if (Boolean(verdict.humanReviewRequired) !== Boolean(e.humanReviewRequired)) return null;
  if (JSON.stringify(signedLearningSignals) !== JSON.stringify(suppliedLearningSignals)) return null;
  const list = (v, maxItems, maxChars) => Array.isArray(v)
    ? v.filter(x => typeof x === 'string').map(x => cleanString(x, maxChars)).slice(0, maxItems)
    : [];
  return {
    schemaVersion: 1,
    evaluationType: e.evaluationType === 'image_or_text' ? 'image_or_text' : 'text',
    overallAssessment: e.overallAssessment,
    summary: cleanString(e.summary, 1000) || '',
    strengths: list(e.strengths, 10, 300),
    mistakes: list(e.mistakes, 10, 300),
    suggestions: list(e.suggestions, 10, 300),
    confidence: e.confidence,
    humanReviewRequired: Boolean(verdict.humanReviewRequired),
    humanReviewReasons: list(e.humanReviewReasons, 5, 300),
    imageEvaluated: Boolean(e.imageEvaluated),
    learningSignals: signedLearningSignals,
    verdictToken: token,
  };
}
function cleanSubmission(input) {
  if (!input || typeof input !== 'object') return null;
  const idValue = cleanString(input.id, 120);
  const text = cleanString(input.text, MAX_TEXT_CHARS);
  if (!idValue || !text || text.length < 3) return null;
  const submittedAt = new Date(input.submittedAt || 0);
  if (Number.isNaN(submittedAt.getTime())) return null;
  const attachments = Array.isArray(input.attachments) ? input.attachments.slice(0, 3).map(cleanAttachment).filter(Boolean) : [];
  const requestedStatus = ALLOWED_STATUSES.has(input.status) ? input.status : 'received';
  const evaluation = cleanEvaluation(input.evaluation, idValue, text);
  const status = requestedStatus === 'evaluated' && !evaluation ? 'evaluation_failed' : requestedStatus;
  return {
    id: idValue,
    submittedAt: submittedAt.toISOString(),
    inputType: cleanString(input.inputType, 40) || 'text',
    text,
    subjectHint: cleanString(input.subjectHint, MAX_SUBJECT_CHARS),
    attachments,
    status,
    evaluation,
    lastEvaluationError: evaluation ? null : cleanString(input.lastEvaluationError, 300),
  };
}

export default async function handler(req, res) {
  noStore(res);
  try {
    const session = await requireAuth(req);
    const learnerId = String(req.query?.learnerId || '').trim();
    if (!learnerId) return json(res, 400, { ok: false, error: { code: 'LEARNER_ID_REQUIRED', message: 'learnerId is required.' } });
    if (learnerId.length > MAX_LEARNER_ID_CHARS) {
      return json(res, 400, { ok: false, error: { code: 'LEARNER_ID_TOO_LONG', message: `learnerId must be at most ${MAX_LEARNER_ID_CHARS} characters.` } });
    }
    await requireLearnerAccess(session, learnerId);

    if (req.method === 'GET') {
      const result = await sql`SELECT id, submitted_at, updated_at, payload FROM homework_submissions WHERE learner_id=${learnerId} ORDER BY submitted_at DESC LIMIT ${MAX_SUBMISSIONS}`;
      return json(res, 200, { ok: true, learnerId, submissions: result.rows.map(r => ({ ...(r.payload || {}), id: r.id, submittedAt: r.submitted_at })) });
    }

    if (req.method === 'PUT') {
      const body = parseBody(req);
      const raw = Array.isArray(body.submissions) ? body.submissions : [];
      if (raw.length > MAX_SUBMISSIONS) return json(res, 400, { ok: false, error: { code: 'TOO_MANY_SUBMISSIONS', message: `At most ${MAX_SUBMISSIONS} submissions may be synchronized.` } });
      const normalized = raw.map(cleanSubmission);
      if (normalized.some(x => !x)) return json(res, 400, { ok: false, error: { code: 'INVALID_SUBMISSION', message: 'One or more homework submissions are invalid.' } });
      const bytes = Buffer.byteLength(JSON.stringify(normalized), 'utf8');
      if (bytes > MAX_JSON_BYTES) return json(res, 413, { ok: false, error: { code: 'PAYLOAD_TOO_LARGE', message: 'Homework synchronization payload is too large.' } });

      for (const submission of normalized) {
        await sql`
          INSERT INTO homework_submissions(id, learner_id, submitted_at, updated_at, payload)
          VALUES(${submission.id}, ${learnerId}, ${submission.submittedAt}, NOW(), ${JSON.stringify(submission)})
          ON CONFLICT(id) DO UPDATE SET
            updated_at=NOW(),
            payload=EXCLUDED.payload,
            submitted_at=EXCLUDED.submitted_at
          WHERE homework_submissions.learner_id=${learnerId}
        `;
      }
      await writeAudit({ actorUserId: session.user_id, action: 'HOMEWORK_SUBMISSIONS_SYNCED', entityType: 'learner', entityId: learnerId, metadata: { count: normalized.length } });
      return json(res, 200, { ok: true, learnerId, synced: normalized.length });
    }

    return json(res, 405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'GET or PUT required.' } }, { Allow: 'GET, PUT' });
  } catch (err) {
    noStore(res);
    const status = Number(err?.status) || (err?.code === 'DATABASE_NOT_CONFIGURED' ? 503 : 500);
    return json(res, status, { ok: false, error: { code: err?.code || 'HOMEWORK_SERVICE_FAILED', message: err?.status ? err.message : 'Homework service unavailable.' } });
  }
}