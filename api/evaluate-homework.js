// api/evaluate-homework.js
// BAA OS — Module 8: AI Homework Scanner — evaluation endpoint (M8-B1/B2).
//
// CHECKPOINT: M8-B1 established the dedicated endpoint and text-only
// evaluation. M8-B2 formalizes and validates the structured result schema,
// confidence, and human-review flagging. Deliberately a SEPARATE file from
// api/evaluate.js (Section B subjective-answer grading): that endpoint
// grades one question against a fixed marks/rubric; this one evaluates a
// student's free-form homework text, which has no single question, no
// marks, and often several sub-answers in one submission. Reusing the same
// endpoint would force one of the two shapes to be faked.
//
// Runs as a Vercel Edge Function, following the exact same proven pattern
// as api/chat.js and api/evaluate.js: API key stays server-side, input is
// validated server-side, transient upstream failures are retried, and a
// a validated structured JSON result is returned in one shot (no streaming needed —
// the page shows the whole evaluation at once, same reasoning as
// api/evaluate.js).
//
// IMAGE SCOPE (M8-B1/B2): text-only. js/baa-homework.js's privacy convention
// never persists raw image bytes, and M8-A2 only stores honest image
// METADATA (mime type, sizes, dimensions) — never the photo itself. This
// endpoint accepts that same metadata for context in its response only
// (so an "image attached" submission gets an honest note that the image
// itself was not evaluated) but never receives or requires image bytes.
// Actual image evaluation is out of scope for M8-B1/B2 (roadmap: image/PDF
// evaluation is a later checkpoint).
//
// HONEST DATA RULE (same convention as api/evaluate.js and
// js/baa-homework.js): this endpoint never fabricates an evaluation. If
// the model's output can't be parsed, or upstream fails, or the server is
// missing its API key, the caller gets an honest, distinguishable error —
// never a made-up result dressed up as real.

export const config = { runtime: 'edge' };

// Same model as api/chat.js and api/evaluate.js — see those files for why.
const MODEL = 'gemini-3.5-flash-lite';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const MAX_OUTPUT_TOKENS = 1024;
const MAX_TEXT_CHARS = 8000; // matches js/baa-homework.js MAX_TEXT_LENGTH
const MAX_SUBJECT_CHARS = 80; // matches homework-scanner.html hwSubjectInput maxlength
const MIN_MEANINGFUL_TEXT_CHARS = 3;
const MAX_CONTROL_CHAR_RATIO = 0.05;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;

const ALLOWED_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp']; // matches js/baa-homework.js

// ---------- Best-effort in-memory rate limiter (see api/chat.js / api/evaluate.js) ----------
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 30; // same budget as api/evaluate.js — evaluation calls are shorter than chat turns
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

// Validates the request body and re-validates text before it is sent to Gemini.
// The browser already limits PDF extraction to 8,000 characters, but the server
// must enforce the same boundary because client-side limits are advisory only.
// This same validation applies to every homework text payload, including text
// extracted from PDFs, so the client does not need to add a new request field.
function validateHomeworkText(text) {
  if (typeof text !== 'string' || !text.trim()) return { error: 'text is required' };
  const trimmed = text.trim();
  if (trimmed.length < MIN_MEANINGFUL_TEXT_CHARS) return { error: 'text is too short to evaluate' };
  if (trimmed.length > MAX_TEXT_CHARS) return { error: 'TEXT_TOO_LONG' };

  // Reject embedded NUL/control characters and obviously corrupted payloads.
  // Newlines, carriage returns and tabs are valid homework text; other C0
  // controls are not useful to the evaluator and can indicate malformed input.
  let controlCount = 0;
  for (const char of trimmed) {
    const code = char.charCodeAt(0);
    if ((code >= 0 && code <= 8) || (code >= 11 && code <= 12) || (code >= 14 && code <= 31) || code === 127) {
      controlCount++;
    }
  }
  if (controlCount > 0 && controlCount / trimmed.length > MAX_CONTROL_CHAR_RATIO) {
    return { error: 'INVALID_TEXT_CONTENT' };
  }

  const visibleChars = trimmed.replace(/[\s\p{C}]/gu, '').length;
  if (visibleChars < MIN_MEANINGFUL_TEXT_CHARS) return { error: 'text is too short to evaluate' };
  return { text: trimmed };
}

function validateBody(body) {
  const { text, subjectHint, imageAttached } = body || {};
  const textResult = validateHomeworkText(text);
  if (textResult.error) return textResult;

  let cleanSubjectHint = null;
  if (subjectHint !== undefined && subjectHint !== null) {
    if (typeof subjectHint !== 'string') return { error: 'subjectHint must be a string' };
    const trimmedHint = subjectHint.trim();
    if (trimmedHint.length > MAX_SUBJECT_CHARS) return { error: 'subjectHint is too long' };
    cleanSubjectHint = trimmedHint || null;
  }

  if (imageAttached !== undefined && typeof imageAttached !== 'boolean') {
    return { error: 'imageAttached must be a boolean' };
  }

  return {
    text: textResult.text,
    subjectHint: cleanSubjectHint,
    imageAttached: imageAttached === true,
  };
}

function buildPrompt(text, subjectHint, imageAttached) {
  return (
    `You are an academic evaluator for BAA (Bhavesh Abhay Academy), reviewing a school student's ` +
    `homework submission. The submission is free-form: it may contain one question or several, and ` +
    `there is no fixed marking scheme.\n\n` +
    (subjectHint ? `SUBJECT / TOPIC (student-provided label): ${subjectHint}\n\n` : '') +
    `STUDENT'S HOMEWORK SUBMISSION (text):\n${text}\n\n` +
    (imageAttached
      ? `NOTE: the student also attached a photo with this submission. You have NOT been given the ` +
        `photo's contents — evaluate the text only, and do not claim to have seen or evaluated the image.\n\n`
      : '') +
    `Evaluate the submission and respond with ONLY a single JSON object (no markdown fences, no extra ` +
    `text before or after) with exactly these fields:\n` +
    `{\n` +
    `  "schemaVersion": 1,\n` +
    `  "evaluationType": "text_only",\n` +
    `  "overallAssessment": "strong" | "good" | "needs_improvement" | "incomplete" | "uncertain",\n` +
    `  "summary": "<2-4 sentences, written directly to the student, describing how they did>",\n` +
    `  "strengths": ["<short phrase per thing done well, empty array if genuinely none>"],\n` +
    `  "mistakes": ["<short phrase per specific error or gap found, empty array if none>"],\n` +
    `  "suggestions": ["<short, concrete, encouraging next step, empty array if none needed>"],\n` +
    `  "confidence": "high" | "medium" | "low",\n` +
    `  "humanReviewRequired": <true|false>,\n` +
    `  "humanReviewReasons": ["<brief reason, empty array if no review is needed>"],\n` +
    `  "imageEvaluated": false,\n` +
    `  "learningSignals": [{ "concept": "<concept explicitly evidenced by the submission or subject label>", "outcome": "strong" | "good" | "needs_improvement" | "incomplete" | "uncertain", "errorType": "<stable, concise error category or null>", "confidence": "high" | "medium" | "low" }]\n` +
    `}\n\n` +
    `RULES:\n` +
    `- Do NOT invent a numeric score or percentage — this submission has no fixed marking scheme, so a ` +
    `precise score would be fabricated. Use only "overallAssessment" to summarize quality.\n` +
    `- If the text is ambiguous, looks incomplete, is hard to interpret without the (unseen) image, or ` +
    `you are otherwise not confident, set "confidence" to "low" or "medium" and "humanReviewRequired" ` +
    `to true rather than guessing.\n` +
    `- schemaVersion must be exactly 1 and evaluationType must be exactly "text_only".\n` +
    `- imageEvaluated must be false because this checkpoint does not receive image pixels.\n` +
    `- learningSignals are evidence-gated metadata for the existing Learning Memory / Mistake Archeology system. Include only concepts clearly present in the submission or the supplied subject/topic label; never invent a concept or student history.\n` +
    `- learningSignals must be an array with at most 5 items. Each item must use one of the listed outcome values. Use errorType only when a concrete recurring-type error is actually supported by the submission; otherwise use null.\n` +
    `- If confidence is low, the assessment is uncertain, the summary is missing, or human review is otherwise needed, set humanReviewRequired to true and provide concise humanReviewReasons.\n` +
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

// Extracts the first {...} JSON object from the model's text output. Same
// defensive approach as api/evaluate.js.
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

const VALID_ASSESSMENTS = ['strong', 'good', 'needs_improvement', 'incomplete', 'uncertain'];
const VALID_CONFIDENCE = ['high', 'medium', 'low'];
const SCHEMA_VERSION = 1;
const EVALUATION_TYPE = 'text_only';
const MAX_RESULT_TEXT_CHARS = 1000;
const MAX_LIST_ITEM_CHARS = 300;
const VALID_LEARNING_OUTCOMES = ['strong', 'good', 'needs_improvement', 'incomplete', 'uncertain'];

function cleanList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim().slice(0, MAX_LIST_ITEM_CHARS))
    .filter(Boolean)
    .slice(0, 10);
}

function cleanLearningSignals(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 5).map((item) => {
    if (!item || typeof item !== 'object') return null;
    const concept = typeof item.concept === 'string' ? item.concept.trim().slice(0, 120) : '';
    const outcome = VALID_LEARNING_OUTCOMES.includes(item.outcome) ? item.outcome : 'uncertain';
    const errorType = item.errorType === null || item.errorType === undefined
      ? null
      : (typeof item.errorType === 'string' ? item.errorType.trim().slice(0, 120) : null);
    const confidence = VALID_CONFIDENCE.includes(item.confidence) ? item.confidence : 'low';
    if (!concept) return null;
    return { concept, outcome, errorType: errorType || null, confidence };
  }).filter(Boolean);
}

function buildHumanReviewReasons(parsed, imageAttached) {
  const reasons = [];
  const confidence = VALID_CONFIDENCE.includes(parsed?.confidence) ? parsed.confidence : 'low';
  const assessment = VALID_ASSESSMENTS.includes(parsed?.overallAssessment) ? parsed.overallAssessment : 'uncertain';
  if (confidence === 'low') reasons.push('AI confidence is low.');
  if (assessment === 'uncertain') reasons.push('The evaluation is uncertain.');
  if (imageAttached) reasons.push('A photo was attached but its contents were not evaluated in this text-only checkpoint.');
  if (typeof parsed?.summary !== 'string' || !parsed.summary.trim()) reasons.push('The evaluator did not provide a usable summary.');
  if (parsed?.humanReviewRequired === true && reasons.length === 0) reasons.push('The evaluator explicitly requested human review.');
  return reasons.slice(0, 5);
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
  const { text, subjectHint, imageAttached } = validated;

  const payload = {
    contents: [{ role: 'user', parts: [{ text: buildPrompt(text, subjectHint, imageAttached) }] }],
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
  } catch {
    // Evaluation failure -> the frontend must show an honest "couldn't
    // evaluate" state, never a fabricated result. See js/baa-homework.js
    // evaluateSubmission's catch path.
    return jsonError(502, 'AI evaluation service is temporarily unavailable');
  }

  if (!upstream.ok) {
    let detail = 'AI evaluation service error';
    try {
      const errBody = await upstream.json();
      const errObj = Array.isArray(errBody) ? errBody[0]?.error : errBody?.error;
      detail = errObj?.message || detail;
    } catch { /* ignore parse failure */ }
    return jsonError(upstream.status === 429 ? 429 : 502, detail);
  }

  let data;
  try {
    data = await upstream.json();
  } catch {
    return jsonError(502, 'AI evaluation service returned an unreadable response');
  }

  const responseText = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  const parsed = extractJson(responseText);

  if (!parsed) {
    // Do not fabricate an assessment if we cannot parse the model's output.
    return new Response(JSON.stringify({
      overallAssessment: 'uncertain',
      summary: 'The AI evaluator did not return a readable result for this submission.',
      strengths: [],
      mistakes: [],
      suggestions: [],
      confidence: 'low',
      humanReviewRequired: true,
    }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }

  const result = {
    schemaVersion: SCHEMA_VERSION,
    evaluationType: EVALUATION_TYPE,
    overallAssessment: VALID_ASSESSMENTS.includes(parsed.overallAssessment) ? parsed.overallAssessment : 'uncertain',
    summary: typeof parsed.summary === 'string' ? parsed.summary.trim().slice(0, MAX_RESULT_TEXT_CHARS) : '',
    strengths: cleanList(parsed.strengths),
    mistakes: cleanList(parsed.mistakes),
    suggestions: cleanList(parsed.suggestions),
    confidence: VALID_CONFIDENCE.includes(parsed.confidence) ? parsed.confidence : 'low',
    humanReviewRequired: !!parsed.humanReviewRequired,
    humanReviewReasons: [],
    imageEvaluated: false,
    learningSignals: cleanLearningSignals(parsed.learningSignals),
  };
  result.humanReviewReasons = buildHumanReviewReasons(parsed, imageAttached);
  if (result.humanReviewReasons.length) result.humanReviewRequired = true;
  if (!result.summary) result.humanReviewRequired = true;

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}
