// api/ai-mode.js
// BAA OS — Module 1, M1-A1: AI Mode planning pathway.
// This checkpoint adds only the server-side AI-directed plan contract.
// It does NOT implement Custom Mode, Hybrid Mode, persistent server memory,
// billing, teacher routing, or production database persistence.
// Separate file keeps the new orchestration boundary isolated from the
// existing Tutor/evaluation endpoints and makes the contract testable.
//
// Security: API keys remain server-side. Inputs are bounded and revalidated.
// Honesty: the endpoint never invents learner evidence; it only receives the
// bounded evidence summary supplied by the client and asks the model to build
// a plan from that evidence.

export const config = { runtime: 'edge' };

const MODEL = 'gemini-3.5-flash-lite';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const MAX_GOAL_CHARS = 120;
const MAX_CONCEPTS = 20;
const MAX_STEPS = 7;
const MAX_PREVIOUS_STEPS = 7;
const MAX_OUTPUT_TOKENS = 1400;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const VALID_CONFIDENCE = new Set(['high', 'medium', 'low', 'insufficient_evidence']);
const VALID_STATE = new Set([
  'mastered', 'strong', 'learning', 'needs_revision',
  'struggling', 'insufficient_evidence'
]);

const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 12;
const rateLimitBuckets = new Map();

function corsHeaders(req) {
  return {
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

function jsonResponse(req, status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
  });
}

function jsonError(req, status, code, message) {
  return jsonResponse(req, status, { error: { code, message } });
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

function cleanText(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

export function validateBody(body) {
  if (!body || typeof body !== 'object') {
    return { error: { code: 'INVALID_BODY', message: 'Request body must be an object.' } };
  }

  const goal = cleanText(body.goal, MAX_GOAL_CHARS);
  if (!goal) {
    return { error: { code: 'GOAL_REQUIRED', message: 'A learning goal is required.' } };
  }

  if (!Array.isArray(body.concepts) || body.concepts.length > MAX_CONCEPTS) {
    return { error: { code: 'INVALID_CONCEPTS', message: `concepts must be an array of at most ${MAX_CONCEPTS} items.` } };
  }

  const concepts = body.concepts.map((c) => {
    if (!c || typeof c !== 'object') return null;
    const concept = cleanText(c.concept, 80);
    const state = cleanText(c.state, 30);
    const confidence = cleanText(c.confidence, 30);
    const evidenceCount = Number(c.evidenceCount);
    if (!concept || !VALID_STATE.has(state) || !VALID_CONFIDENCE.has(confidence)) return null;
    if (!Number.isInteger(evidenceCount) || evidenceCount < 0 || evidenceCount > 1000) return null;
    return { concept, state, confidence, evidenceCount };
  });

  if (concepts.some((c) => c === null)) {
    return { error: { code: 'INVALID_CONCEPT', message: 'Each concept needs valid concept, state, confidence and evidenceCount values.' } };
  }

  const minutes = Number(body.availableMinutesPerDay);
  if (!Number.isFinite(minutes) || minutes < 5 || minutes > 180) {
    return { error: { code: 'INVALID_TIME', message: 'availableMinutesPerDay must be between 5 and 180.' } };
  }

  const upcoming = Array.isArray(body.upcomingAssessments)
    ? body.upcomingAssessments.slice(0, 8).map((a) => ({
        title: cleanText(a?.title, 120),
        subject: cleanText(a?.subject, 60) || null,
        date: cleanText(a?.date, 10),
      })).filter((a) => a.title && /^\d{4}-\d{2}-\d{2}$/.test(a.date))
    : [];

  const previousPlan = validatePreviousPlan(body.previousPlan);
  if (body.previousPlan != null && !previousPlan) {
    return { error: { code: 'INVALID_PREVIOUS_PLAN', message: 'previousPlan is not a valid AI Mode plan.' } };
  }

  return {
    goal,
    concepts,
    availableMinutesPerDay: Math.round(minutes),
    upcomingAssessments: upcoming,
    previousPlan,
  };
}


function validatePreviousPlan(value) {
  if (value == null) return null;
  if (!value || typeof value !== 'object') return null;
  if (value.schemaVersion !== 1 || value.mode !== 'ai' || !Array.isArray(value.steps)) return null;
  if (value.steps.length < 1 || value.steps.length > MAX_PREVIOUS_STEPS) return null;

  const steps = value.steps.map((step) => ({
    title: cleanText(step?.title, 120),
    minutes: Number(step?.minutes),
    type: cleanText(step?.type, 20),
  }));

  if (steps.some((step) =>
    !step.title ||
    !Number.isInteger(step.minutes) ||
    step.minutes < 5 ||
    step.minutes > 120 ||
    !['learn', 'practice', 'review', 'assessment', 'tutor'].includes(step.type)
  )) return null;

  return {
    summary: cleanText(value.summary, 240),
    steps,
    totalMinutes: Number(value.totalMinutes) || steps.reduce((sum, step) => sum + step.minutes, 0),
  };
}

function buildPrompt(input) {
  const evidenceLines = input.concepts.length
    ? input.concepts.map((c) =>
        `- ${c.concept}: state=${c.state}, confidence=${c.confidence}, evidenceCount=${c.evidenceCount}`
      ).join('\n')
    : '- No concept evidence is available yet.';

  const assessmentLines = input.upcomingAssessments.length
    ? input.upcomingAssessments.map((a) =>
        `- ${a.title}${a.subject ? ` (${a.subject})` : ''} on ${a.date}`
      ).join('\n')
    : '- No upcoming assessments supplied.';

  return `You are BAA's AI Mode planner. Create a short, actionable academic path using ONLY the learner evidence and goal supplied below.

GOAL:
${input.goal}

REAL LEARNING EVIDENCE:
${evidenceLines}

AVAILABLE DAILY TIME:
${input.availableMinutesPerDay} minutes

UPCOMING ASSESSMENTS:
${assessmentLines}

PREVIOUS AI MODE PLAN (if adapting):
${input.previousPlan
    ? JSON.stringify(input.previousPlan)
    : 'No previous plan supplied. Create the first plan.'}

Return ONLY JSON:
{
  "schemaVersion": 1,
  "mode": "ai",
  "summary": "one short sentence",
  "steps": [
    {
      "title": "short action",
      "minutes": 5,
      "type": "learn" | "practice" | "review" | "assessment" | "tutor",
      "reason": "evidence-backed reason"
    }
  ]
}

RULES:
- Create 1 to ${MAX_STEPS} steps.
- Total minutes must not exceed the learner's daily available time.
- Prioritize struggling/needs_revision concepts over mastered concepts.
- If evidence is insufficient, say so in the reason and use a low-risk learning/tutor step; do not claim mastery.
- Use upcoming assessment dates only as scheduling context.
- If a previous plan is supplied, adapt it to the latest evidence rather than blindly repeating it.
- Keep useful steps when evidence still supports them and replace or reorder steps when current evidence indicates a better path.
- Do not invent grades, history, strengths, weaknesses, or personal facts.
- Do not create medical, psychological, or disciplinary claims.
- This is a learning plan, not a diagnosis.
- Keep each step concise and practical.
- Return JSON only.`;
}

async function callGemini(payload, apiKey, attempt = 0) {
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
      return callGemini(payload, apiKey, attempt + 1);
    }
    return res;
  } catch (err) {
    clearTimeout(timeout);
    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      return callGemini(payload, apiKey, attempt + 1);
    }
    throw new Error(err?.name === 'AbortError' ? 'upstream timeout' : 'upstream network error');
  }
}

function extractJson(text) {
  const cleaned = String(text || '').replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return null; }
}

export function normalizePlan(raw, input) {
  if (!raw || typeof raw !== 'object' || raw.schemaVersion !== 1 || raw.mode !== 'ai') {
    return { error: { code: 'INVALID_AI_PLAN', message: 'AI returned an invalid plan schema.' } };
  }
  if (!Array.isArray(raw.steps) || raw.steps.length < 1 || raw.steps.length > MAX_STEPS) {
    return { error: { code: 'INVALID_AI_PLAN', message: 'AI returned an invalid step list.' } };
  }

  const allowedTypes = new Set(['learn', 'practice', 'review', 'assessment', 'tutor']);
  let total = 0;
  const steps = [];
  for (const step of raw.steps) {
    const title = cleanText(step?.title, 120);
    const reason = cleanText(step?.reason, 240);
    const minutes = Number(step?.minutes);
    const type = cleanText(step?.type, 20);
    if (!title || !reason || !allowedTypes.has(type) || !Number.isInteger(minutes) || minutes < 5 || minutes > 120) {
      return { error: { code: 'INVALID_AI_STEP', message: 'AI returned an invalid plan step.' } };
    }
    total += minutes;
    steps.push({ title, minutes, type, reason });
  }
  if (total > input.availableMinutesPerDay) {
    return { error: { code: 'PLAN_EXCEEDS_TIME', message: 'AI plan exceeds the learner time budget.' } };
  }

  return {
    plan: {
      schemaVersion: 1,
      mode: 'ai',
      summary: cleanText(raw.summary, 240) || 'Your AI Mode learning path is ready.',
      steps,
      totalMinutes: total,
      generatedAt: new Date().toISOString(),
      evidenceBound: true,
      adaptedFromPreviousPlan: Boolean(input.previousPlan),
    },
  };
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return jsonError(req, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return jsonError(req, 503, 'AI_CONFIGURATION_MISSING', 'AI Mode is not configured on the server yet.');

  const ip = getClientIp(req);
  if (isRateLimited(ip)) return jsonError(req, 429, 'RATE_LIMITED', 'Too many AI Mode requests. Please wait a moment.');

  let body;
  try { body = await req.json(); } catch {
    return jsonError(req, 400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }

  const validated = validateBody(body);
  if (validated.error) return jsonError(req, 400, validated.error.code, validated.error.message);

  const payload = {
    contents: [{ role: 'user', parts: [{ text: buildPrompt(validated) }] }],
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
  try { upstream = await callGemini(payload, apiKey); }
  catch { return jsonError(req, 502, 'AI_UPSTREAM_UNAVAILABLE', 'AI Mode is temporarily unavailable.'); }

  if (!upstream.ok) {
    return jsonError(req, upstream.status >= 500 ? 502 : 400, 'AI_UPSTREAM_ERROR', 'AI Mode could not generate a plan right now.');
  }

  let data;
  try { data = await upstream.json(); } catch {
    return jsonError(req, 502, 'AI_INVALID_RESPONSE', 'AI Mode returned an unreadable response.');
  }

  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  const raw = extractJson(text);
  const normalized = normalizePlan(raw, validated);
  if (normalized.error) return jsonError(req, 502, normalized.error.code, normalized.error.message);

  return jsonResponse(req, 200, normalized.plan);
}
