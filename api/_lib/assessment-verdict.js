// Server-verifiable assessment verdicts.
// Client-supplied correctness/score is never trusted for gating/scoring.
import crypto from 'node:crypto';

const VERDICT_TTL_SECONDS = 15 * 60;
const CLOCK_SKEW_SECONDS = 60;

function secret() {
  return String(process.env.ASSESSMENT_VERDICT_SECRET || '').trim();
}

function b64url(value) {
  return Buffer.from(value).toString('base64url');
}

function sign(payloadB64) {
  const key = secret();
  if (!key) return null;
  return crypto.createHmac('sha256', key).update(payloadB64).digest('base64url');
}

function verifyEnvelope(payload, now) {
  const iat = Number(payload?.iat);
  const exp = Number(payload?.exp);
  if (!Number.isInteger(iat) || !Number.isInteger(exp)) return { ok: false, code: 'VERDICT_INVALID' };
  if (exp <= iat || exp > iat + VERDICT_TTL_SECONDS) return { ok: false, code: 'VERDICT_INVALID' };
  if (iat > now + CLOCK_SKEW_SECONDS) return { ok: false, code: 'VERDICT_INVALID' };
  if (now > exp) return { ok: false, code: 'VERDICT_EXPIRED' };
  return { ok: true };
}

export function issueAssessmentVerdict({ attemptId, questionId, gradingMode, score, maxScore, correctness, errors = [], missingConcepts = [], confidence = 'low', humanReviewRequired = false }) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = {
    attemptId: String(attemptId), questionId: String(questionId), gradingMode: String(gradingMode),
    score: score == null ? null : Number(score), maxScore: Number(maxScore), correctness: String(correctness),
    errors: Array.isArray(errors) ? errors.slice(0, 10).map(x => String(x).slice(0, 180)) : [],
    missingConcepts: Array.isArray(missingConcepts) ? missingConcepts.slice(0, 10).map(x => String(x).slice(0, 180)) : [],
    confidence: String(confidence), humanReviewRequired: !!humanReviewRequired,
    iat: issuedAt, exp: issuedAt + VERDICT_TTL_SECONDS,
  };
  const encoded = b64url(JSON.stringify(payload));
  const sig = sign(encoded);
  if (!sig) return null;
  return `${encoded}.${sig}`;
}

export function verifyAssessmentVerdict(token, { attemptId, questionId } = {}) {
  const key = secret();
  if (!key || typeof token !== 'string') return { ok: false, code: 'VERDICT_UNAVAILABLE' };
  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false, code: 'VERDICT_INVALID' };
  const [encoded, suppliedSig] = parts;
  const expectedSig = sign(encoded);
  if (!expectedSig) return { ok: false, code: 'VERDICT_UNAVAILABLE' };
  const a = Buffer.from(suppliedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, code: 'VERDICT_INVALID' };
  let payload;
  try { payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')); }
  catch { return { ok: false, code: 'VERDICT_INVALID' }; }
  const envelope = verifyEnvelope(payload, Math.floor(Date.now() / 1000));
  if (!envelope.ok) return envelope;
  if (attemptId != null && String(payload.attemptId) !== String(attemptId)) return { ok: false, code: 'VERDICT_ATTEMPT_MISMATCH' };
  if (questionId != null && String(payload.questionId) !== String(questionId)) return { ok: false, code: 'VERDICT_QUESTION_MISMATCH' };
  return { ok: true, verdict: payload };
}

export function normalizeAutoAnswer(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function gradeDeterministic(rawAnswer, correctAnswer, maxScore) {
  const correct = normalizeAutoAnswer(rawAnswer) === normalizeAutoAnswer(correctAnswer);
  return {
    score: correct ? Number(maxScore) : 0,
    maxScore: Number(maxScore),
    correctness: correct ? 'correct' : 'incorrect',
    isCorrect: correct,
    confidence: 'high',
    humanReviewRequired: false,
  };
}

// ---- Homework Scanner (M8) verdicts ----
// Same trust boundary as assessment verdicts, adapted to what M8 actually produces:
// there is no numeric score to re-derive (the endpoint deliberately never invents one —
// see api/evaluate-homework.js), so the thing worth signing is "this exact evaluation
// blob was genuinely produced by the evaluator for this exact submitted text", not a score.
// textHash binds the verdict to the specific text that was graded, so a client cannot
// swap in different homework text after the fact while keeping a favorable evaluation.
export function hashHomeworkText(text) {
  return crypto.createHash('sha256').update(String(text ?? '')).digest('base64url');
}

export function issueHomeworkVerdict({ submissionId, textHash, overallAssessment, confidence = 'low', humanReviewRequired = false, learningSignals = [] }) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = {
    submissionId: String(submissionId), textHash: String(textHash),
    overallAssessment: String(overallAssessment), confidence: String(confidence),
    humanReviewRequired: !!humanReviewRequired,
    learningSignals: Array.isArray(learningSignals) ? learningSignals.slice(0, 5) : [],
    iat: issuedAt, exp: issuedAt + VERDICT_TTL_SECONDS,
  };
  const encoded = b64url(JSON.stringify(payload));
  const sig = sign(encoded);
  if (!sig) return null;
  return `${encoded}.${sig}`;
}

export function verifyHomeworkVerdict(token, { submissionId, textHash } = {}) {
  const key = secret();
  if (!key || typeof token !== 'string') return { ok: false, code: 'VERDICT_UNAVAILABLE' };
  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false, code: 'VERDICT_INVALID' };
  const [encoded, suppliedSig] = parts;
  const expectedSig = sign(encoded);
  if (!expectedSig) return { ok: false, code: 'VERDICT_UNAVAILABLE' };
  const a = Buffer.from(suppliedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, code: 'VERDICT_INVALID' };
  let payload;
  try { payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')); }
  catch { return { ok: false, code: 'VERDICT_INVALID' }; }
  const envelope = verifyEnvelope(payload, Math.floor(Date.now() / 1000));
  if (!envelope.ok) return envelope;
  if (submissionId != null && String(payload.submissionId) !== String(submissionId)) return { ok: false, code: 'VERDICT_SUBMISSION_MISMATCH' };
  if (textHash != null && String(payload.textHash) !== String(textHash)) return { ok: false, code: 'VERDICT_TEXT_MISMATCH' };
  return { ok: true, verdict: payload };
}
