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

export const config = { runtime: 'edge' };

// Same model as api/chat.js — see that file's comment for why. Section B
// does not change the model; keeping evaluation and tutoring on the same
// model also means their behavior/cost profile stays consistent.
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

// ---------- Best-effort in-memory rate limiter (see api/chat.js) ----------
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 30; // evaluation calls are shorter than chat turns
const rateLimitBuckets = new Map();

function getAllowedOrigin() {
  return process.env.ALLOWED_ORIGIN || '*';
}
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': getAllowedOrigin(),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}
function jsonError(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}
function getClientIp(req) {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}
function isRateLimited(ip) {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(ip) || [];
  const recent = bucket.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  rateLimitBuckets.set(ip, recent);
  if (rateLimitBuckets.size > 5000) rateLimitBuckets.clear();
  return recent.length > RATE_LIMIT_MAX_REQUESTS;
}

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
    `Evaluate the student's answer and respond with ONLY a single JSON object (no markdown fences, no ` +
    `extra text before or after) with exactly these fields:\n` +
    `{\n` +
    `  "score": <number, 0 to ${question.marks}, may be a decimal>,\n` +
    `  "maxScore": ${question.marks},\n` +
    `  "correctness": "correct" | "partially_correct" | "incorrect" | "uncertain",\n` +
    `  "explanation": "<2-4 sentences explaining the score, written for the student>",\n` +
    `  "errors": ["<short phrase per specific error found, empty array if none>"],\n` +
    `  "missingConcepts": ["<short phrase per concept the answer should have used but didn't>"],\n` +
    `  "suggestedImprovement": "<one short, encouraging, concrete suggestion, or null>",\n` +
    `  "confidence": "high" | "medium" | "low",\n` +
    `  "humanReviewRequired": <true|false>\n` +
    `}\n\n` +
    `RULES:\n` +
    `- ${isMath
        ? 'For math/step-based answers, evaluate METHOD, STEPS, and FINAL ANSWER separately in your reasoning. ' +
          'A correct method with one small arithmetic slip is "partially_correct" with most of the marks, NOT the same as a wrong method — do not treat them as equivalent.'
        : 'Judge correctness, relevance, completeness, and reasoning quality — not just keyword matching.'}\n` +
    `- Give PARTIAL credit (a score strictly between 0 and ${question.marks}) whenever the answer is partially right. Do not just give full marks or zero unless that is genuinely warranted.\n` +
    `- If you are not confident in your judgement (ambiguous answer, handwriting-style transcription issues, ` +
    `a genuinely borderline case), set "confidence" to "low" or "medium" and "humanReviewRequired" to true. ` +
    `Do not present an uncertain judgement as a guaranteed fact.\n` +
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

// Extracts the first {...} JSON object from the model's text output.
// Gemini is instructed to return raw JSON, but we defensively strip any
// accidental markdown fences before parsing.
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
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (req.method !== 'POST') {
    return jsonError(405, 'Method not allowed');
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return jsonError(500, 'Server is missing GEMINI_API_KEY');
  }

  const ip = getClientIp(req);
  if (isRateLimited(ip)) {
    return jsonError(429, 'Too many evaluation requests — please wait a moment and try again.');
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, 'Invalid JSON body');
  }

  const validated = validateBody(body);
  if (validated.error) {
    return jsonError(400, validated.error);
  }
  const { question, studentAnswer } = validated;

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
    console.log('[DEBUG evaluate] upstream exception:', err && err.message);
    // Evaluation failure -> the frontend flags this question for human
    // review instead of showing a broken score. See js/baa-assessment.js
    // gradeWithAI's catch path.
    return jsonError(502, 'AI evaluation service is temporarily unavailable');
  }

  if (!upstream.ok) {
    let detail = 'AI evaluation service error';
    try {
      const errBody = await upstream.json();
      const errObj = Array.isArray(errBody) ? errBody[0]?.error : errBody?.error;
      detail = errObj?.message || detail;
      console.log('[DEBUG evaluate] Gemini non-200:', JSON.stringify(errBody));
    } catch { /* ignore parse failure */ }
    return jsonError(upstream.status === 429 ? 429 : 502, detail);
  }

  let data;
  try {
    data = await upstream.json();
  } catch {
    return jsonError(502, 'AI evaluation service returned an unreadable response');
  }

  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  const parsed = extractJson(text);

  if (!parsed) {
    // Do not fabricate a score if we cannot parse the model's output.
    return new Response(JSON.stringify({
      score: null,
      maxScore: question.marks,
      correctness: 'uncertain',
      explanation: 'The AI evaluator did not return a readable result for this answer.',
      errors: [],
      missingConcepts: [],
      suggestedImprovement: null,
      confidence: 'low',
      humanReviewRequired: true,
    }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
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
    confidence: ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'low',
    humanReviewRequired: parsed.score === null || parsed.score === undefined
      ? true : (!!parsed.humanReviewRequired || parsed.confidence === 'low'),
  };

  if (result.score === null) result.humanReviewRequired = true;

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}
