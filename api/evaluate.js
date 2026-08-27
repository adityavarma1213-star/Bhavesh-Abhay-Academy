// api/evaluate.js
// BAA OS — Section B: Subjective Answer Evaluation backend.
// Runs as a Vercel Edge Function, same pattern as api/chat.js: keeps the
// Gemini API key server-side, validates input, rate-limits, retries
// transient failures — but returns a single structured JSON evaluation
// object instead of a stream, since the assessment player needs the whole
// result before it can show the student their score.
//
// Only called for questions that CANNOT be graded deterministically
// (short answer, long answer, math, step-based, written response). MCQ and
// True/False are graded entirely client-side in js/baa-assessment.js.

export const config = { runtime: 'nodejs' };

import { requireAuth } from './_lib/auth.js';
import { consumeAiRateLimit } from './_lib/ai-rate-limit.js';
import { issueAssessmentVerdict } from './_lib/assessment-verdict.js';

const MODEL = 'gemini-3.5-flash-lite';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const MAX_OUTPUT_TOKENS = 1024;
const MAX_ANSWER_CHARS = 4000;
const MAX_QUESTION_CHARS = 2000;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;

const VALID_QUESTION_TYPES = new Set([
  'short_answer', 'long_answer', 'math', 'step_based', 'written_response',
]);

function validateBody(body) {
  const { question, studentAnswer } = body || {};
  if (!question || typeof question !== 'object') return { error: 'question object is required' };
  if (typeof question.text !== 'string' || !question.text.trim()) return { error: 'question.text is required' };
  if (question.text.length > MAX_QUESTION_CHARS) return { error: 'question.text is too long' };
  if (!VALID_QUESTION_TYPES.has(question.type)) {
    return { error: `question.type must be one of: ${[...VALID_QUESTION_TYPES].join(', ')}` };
  }
  if (typeof question.marks !== 'number' || question.marks <= 0 || question.marks > 20) {
    return { error: 'question.marks must be a number between 1 and 20' };
  }
  if (typeof studentAnswer !== 'string' || !studentAnswer.trim()) {
    return { error: 'studentAnswer is required' };
  }
  if (studentAnswer.length > MAX_ANSWER_CHARS) return { error: 'studentAnswer is too long' };
  return { question, studentAnswer: studentAnswer.trim() };
}

function buildPrompt(question, studentAnswer) {
  const isMath = question.type === 'math' || question.type === 'step_based';
  return (
    `You are an academic evaluator for BAA (Bhavesh Abhay Academy), grading a school student's answer.\n\n` +
    `QUESTION (${question.type}, worth ${question.marks} marks):\n${question.text}\n\n` +
    (question.modelAnswer ? `MODEL ANSWER / MARKING GUIDE:\n${question.modelAnswer}\n\n` : '') +
    `STUDENT'S ANSWER:\n${studentAnswer}\n\n` +
    `Evaluate the student's answer and respond with ONLY a single JSON object (no markdown fences, no extra text before or after) with exactly these fields:\n` +
    `{\n` +
    `  "score": <number, 0 to ${question.marks}, may be a decimal>,\n` +
    `  "maxScore": ${question.marks},\n` +
    `  "correctness": "correct" | "partially_correct" | "incorrect" | "uncertain",\n` +
    `  "explanation": "<2-4 sentences explaining the score, written for the student>",\n` +
    `  "errors": ["<short phrase per specific error found, empty array if none>"],\n` +
    `  "missingConcepts": ["<short phrase per concept the answer should have used but didn't>"],\n` +
    `  "suggestedImprovement": "<one short, encouraging, concrete suggestion, or null>",\n` +
    `  "rubric": [{"criterion":"<criterion name>","score":<number>,"maxScore":<number>,"evidence":"<brief evidence from the answer>"}],\n` +
    `  "confidence": "high" | "medium" | "low",\n` +
    `  "humanReviewRequired": <true|false>\n` +
    `}\n\n` +
    `RULES:\n` +
    `- ${isMath
        ? 'For math/step-based answers, evaluate METHOD, STEPS, and FINAL ANSWER separately in your reasoning. A correct method with one small arithmetic slip is "partially_correct" with most of the marks, NOT the same as a wrong method — do not treat them as equivalent.'
        : 'Judge correctness, relevance, completeness, and reasoning quality — not just keyword matching.'}\n` +
    `- Give PARTIAL credit (a score strictly between 0 and ${question.marks}) whenever the answer is partially right. Do not just give full marks or zero unless that is genuinely warranted.\n` +
    `- If you are not confident in your judgement (ambiguous answer, handwriting-style transcription issues, a genuinely borderline case), set "confidence" to "low" or "medium" and "humanReviewRequired" to true. Do not present an uncertain judgement as a guaranteed fact.\n` +
    `- The rubric must break the mark into 1-4 concrete criteria appropriate to the question. Criterion scores must be numeric, non-negative, and never exceed maxScore. Rubric scores should add up to the overall score within a small rounding tolerance. Evidence must point only to what the student actually wrote.\n` +
    `- If the student's answer contains a genuine spelling or terminology error that matters for academic correctness, list it in "errors" with a short, specific description. Do not invent or nitpick harmless stylistic variations.\n` +
    `- Never invent facts about the student or claim history you were not given.\n` +
    `- Keep the tone constructive — a mistake is information, not a failure.\n` +
    `- Respond with ONLY the JSON object.`
  );
}

async function callGeminiWithRetry(payload, apiKey, attempt = 0) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok && res.status >= 500 && attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      return callGeminiWithRetry(payload, apiKey, attempt + 1);
    }
    return res;
  } catch (err) {
    clearTimeout(timeout);
    const isAbort = err.name === 'AbortError';
    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      return callGeminiWithRetry(payload, apiKey, attempt + 1);
    }
    throw new Error(isAbort ? 'upstream timeout' : 'upstream network error');
  }
}

function extractJson(text) {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

function clampScore(score, maxScore) {
  const n = Number(score);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(maxScore, n));
}

export default async function handler(req) {
  // Evaluation results contain learner answers, rubric evidence and AI
  // verdicts. They must never be retained by browser/intermediary caches.
  const responseHeaders = { 'Cache-Control': 'private, no-store, max-age=0' };
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...responseHeaders, ...corsHeaders() } });
  }
  if (req.method !== 'POST') {
    return jsonError(405, 'Method not allowed', responseHeaders);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return jsonError(500, 'Server is missing GEMINI_API_KEY', responseHeaders);
  }

  let session;
  try { session = await requireAuth(req); } catch (e) {
    return jsonError(e.status || 401, e.message || 'Authentication required.', responseHeaders);
  }
  let rate;
  try { rate = await consumeAiRateLimit('evaluate', session.user_id || getClientIp(req), { windowSeconds: 300, maxRequests: 30 }); }
  catch { return jsonError(503, 'AI rate-limit service is temporarily unavailable.', responseHeaders); }
  if (rate.limited) return jsonError(429, 'Too many evaluation requests — please wait a moment and try again.', responseHeaders);

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, 'Invalid JSON body', responseHeaders);
  }

  const validated = validateBody(body);
  if (validated.error) {
    return jsonError(400, validated.error, responseHeaders);
  }
  const { question, studentAnswer } = validated;
  const attemptId = body?.attemptId;
  const questionId = body?.questionId;
  if (!attemptId || !questionId) return jsonError(400, 'attemptId and questionId are required for a server-verifiable assessment verdict', responseHeaders);

  const payload = {
    contents: [{ role: 'user', parts: [{ text: buildPrompt(question, studentAnswer) }] }],
    generationConfig: {
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingLevel: 'low' },
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  };

  let upstream;
  try {
    upstream = await callGeminiWithRetry(payload, apiKey);
  } catch (err) {
    return jsonError(502, 'AI evaluation service is temporarily unavailable', responseHeaders);
  }

  if (!upstream.ok) {
    let detail = 'AI evaluation service error';
    try {
      const errBody = await upstream.json();
      const errObj = Array.isArray(errBody) ? errBody[0]?.error : errBody?.error;
      detail = errObj?.message || detail;
    } catch { /* ignore parse failure */ }
    return jsonError(upstream.status === 429 ? 429 : 502, detail, responseHeaders);
  }

  let data;
  try {
    data = await upstream.json();
  } catch {
    return jsonError(502, 'AI evaluation service returned an unreadable response', responseHeaders);
  }

  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  const parsed = extractJson(text);

  if (!parsed) {
    return new Response(JSON.stringify({
      score: null, maxScore: question.marks, correctness: 'uncertain',
      explanation: 'The AI evaluator did not return a readable result for this answer.',
      errors: [], missingConcepts: [], suggestedImprovement: null, confidence: 'low',
      humanReviewRequired: true, verdictToken: null,
    }), { status: 200, headers: { 'Content-Type': 'application/json', ...responseHeaders, ...corsHeaders() } });
  }

  const result = {
    score: clampScore(parsed.score, question.marks),
    maxScore: question.marks,
    correctness: ['correct', 'partially_correct', 'incorrect', 'uncertain'].includes(parsed.correctness)
      ? parsed.correctness : 'uncertain',
    explanation: typeof parsed.explanation === 'string' ? parsed.explanation.slice(0, 1000) : '',
    errors: Array.isArray(parsed.errors) ? parsed.errors.slice(0, 10).map(String) : [],
    missingConcepts: Array.isArray(parsed.missingConcepts) ? parsed.missingConcepts.slice(0, 10).map(String) : [],
    suggestedImprovement: typeof parsed.suggestedImprovement === 'string' ? parsed.suggestedImprovement.slice(0, 400) : null,
    rubric: Array.isArray(parsed.rubric)
      ? parsed.rubric.slice(0, 4).map((item) => ({
          criterion: typeof item?.criterion === 'string' ? item.criterion.slice(0, 120) : 'Criterion',
          score: clampScore(Number(item?.score), Number(item?.maxScore) || question.marks),
          maxScore: Math.max(0, Math.min(question.marks, Number(item?.maxScore) || question.marks)),
          evidence: typeof item?.evidence === 'string' ? item.evidence.slice(0, 300) : '',
        })).filter(item => item.maxScore > 0)
      : [],
    confidence: ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'low',
    humanReviewRequired: parsed.score === null || parsed.score === undefined
      ? true : (!!parsed.humanReviewRequired || parsed.confidence === 'low'),
  };

  if (result.score === null) result.humanReviewRequired = true;
  const verdictToken = issueAssessmentVerdict({
    attemptId, questionId, gradingMode: 'ai', score: result.score, maxScore: result.maxScore,
    correctness: result.correctness, errors: result.errors, missingConcepts: result.missingConcepts,
    confidence: result.confidence, humanReviewRequired: result.humanReviewRequired,
  });
  result.verdictToken = verdictToken;
  if (!verdictToken) result.humanReviewRequired = true;

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...responseHeaders, ...corsHeaders() },
  });
}
