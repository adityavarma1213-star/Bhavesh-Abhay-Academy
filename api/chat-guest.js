// BAA OS — guest AI Tutor backend
// Purpose: the public Student OS is intentionally a no-account prototype.
// Authenticated requests continue using /api/chat; unauthenticated requests
// are routed here by vercel.json. This keeps the existing secure account path
// intact while making the prototype AI Tutor actually usable.

export const config = { runtime: 'nodejs' };

import { consumeAiRateLimit } from './_lib/ai-rate-limit.js';

const MODEL = 'gemini-3.5-flash-lite';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?alt=sse`;
const MAX_OUTPUT_TOKENS = 2048;
const MAX_MESSAGE_CHARS = 4000;
const MAX_HISTORY_MESSAGES = 20;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_IMAGE_BASE64_CHARS = 7_000_000;

function getClientIp(req) {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

function corsHeaders(req) {
  return {
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

function jsonError(req, status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
  });
}

function sanitizeName(name) {
  if (typeof name !== 'string') return 'Explorer';
  const cleaned = name.replace(/[^a-zA-Z0-9 '-]/g, '').trim().slice(0, 40);
  return cleaned || 'Explorer';
}

function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return { error: 'messages must be a non-empty array' };
  if (messages.length > 500) return { error: 'conversation payload malformed — please start a new conversation' };
  const trimmed = messages.slice(-MAX_HISTORY_MESSAGES);
  for (const m of trimmed) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) return { error: 'each message needs role "user" or "assistant"' };
    if (typeof m.content !== 'string' || !m.content.trim()) return { error: 'each message needs non-empty string content' };
    if (m.content.length > MAX_MESSAGE_CHARS) return { error: `message exceeds ${MAX_MESSAGE_CHARS} characters` };
    if (m.image != null) {
      if (typeof m.image !== 'object') return { error: 'image must be an object with mimeType and data' };
      if (!ALLOWED_IMAGE_MIME_TYPES.has(m.image.mimeType)) return { error: 'unsupported image format — use PNG, JPEG, or WEBP' };
      if (typeof m.image.data !== 'string' || !m.image.data.trim()) return { error: 'image data is missing' };
      if (m.image.data.length > MAX_IMAGE_BASE64_CHARS) return { error: 'image is too large — please upload a smaller or more compressed image' };
    }
  }
  return { messages: trimmed };
}

function toGeminiContents(messages) {
  return messages.map((m) => {
    const parts = [];
    if (m.image?.mimeType && m.image?.data) parts.push({ inlineData: { mimeType: m.image.mimeType, data: m.image.data } });
    parts.push({ text: m.content });
    return { role: m.role === 'assistant' ? 'model' : 'user', parts };
  });
}

async function callGeminiWithRetry(payload, apiKey, attempt = 0) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok && response.status >= 500 && attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, 400 * Math.pow(2, attempt)));
      return callGeminiWithRetry(payload, apiKey, attempt + 1);
    }
    return response;
  } catch (err) {
    clearTimeout(timeout);
    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, 400 * Math.pow(2, attempt)));
      return callGeminiWithRetry(payload, apiKey, attempt + 1);
    }
    throw new Error(err?.name === 'AbortError' ? 'upstream timeout' : 'upstream network error');
  }
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return jsonError(req, 405, 'Method not allowed');

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return jsonError(req, 500, 'Server is missing GEMINI_API_KEY');

  let rate;
  try {
    rate = await consumeAiRateLimit('chat-guest', getClientIp(req), { windowSeconds: 300, maxRequests: 20 });
  } catch {
    return jsonError(req, 503, 'AI rate-limit service is temporarily unavailable.');
  }
  if (rate.limited) return jsonError(req, 429, 'Too many requests — please wait a moment and try again.');

  let body;
  try { body = await req.json(); } catch { return jsonError(req, 400, 'Invalid JSON body'); }

  const { messages, studentName, learningContext, mode, explainLikeMode, responseLanguage } = body || {};
  const validated = validateMessages(messages);
  if (validated.error) return jsonError(req, 400, validated.error);

  const safeMode = mode === 'mentor' ? 'mentor' : 'tutor';
  const allowedExplainLike = new Set(['default', 'child', 'story', 'everyday', 'exam', 'visual']);
  const safeExplainLike = allowedExplainLike.has(explainLikeMode) ? explainLikeMode : 'default';
  const languageNames = { en: 'English', hi: 'Hindi', mr: 'Marathi', gu: 'Gujarati', bn: 'Bengali', ta: 'Tamil', te: 'Telugu', kn: 'Kannada' };
  const safeLanguage = Object.prototype.hasOwnProperty.call(languageNames, responseLanguage) ? responseLanguage : 'en';
  const safeName = sanitizeName(studentName);
  const safeContext = typeof learningContext === 'string' && learningContext.trim() ? learningContext.trim().slice(0, 1200) : '';

  const explain = {
    child: 'Explain simply for a younger learner; simplify language without changing facts.',
    story: 'Use one short story analogy and clearly label it as an analogy.',
    everyday: 'Use one familiar everyday-life analogy and state its limits.',
    exam: 'Use an exam-focused explanation with key idea, common trap, worked example, and check question.',
    visual: 'Use a concrete visual or spatial analogy described in words; do not claim an image was generated.',
  }[safeExplainLike] || '';

  const tutorPrompt = `You are the BAA AI Tutor, talking to a school student named ${safeName}. Your job is to help the student understand so they can answer it themselves next time. Do not invent grades, achievements, weaknesses, schedules, or personal facts. Be warm, age-appropriate, concise, and professionally bounded. Do not diagnose, shame, manipulate, or create dependency. For math and numeric answers, show enough working to make errors visible. If unsure, say so rather than guessing. Use markdown when helpful and LaTeX for math. Do not give the final answer immediately by default: guide with a question or hint first, then escalate to a worked example and full solution when the student is genuinely stuck or explicitly chooses the answer. End with a small follow-up question or practice nudge.`;
  const mentorPrompt = `You are the BAA AI Mentor for a school student named ${safeName}. Give practical academic guidance, realistic next steps, and encouragement grounded in supplied evidence. You are not a therapist, doctor, parent, teacher, or best friend. Do not diagnose, manipulate, shame, pressure, or create dependency. Do not invent personal facts. Keep the tone warm, age-appropriate, and professionally bounded.`;
  let systemPrompt = safeMode === 'mentor' ? mentorPrompt : tutorPrompt;
  if (explain) systemPrompt += `\n\nEXPLAIN LIKE MODE — ${explain}`;
  if (safeLanguage !== 'en') systemPrompt += `\n\nRESPONSE LANGUAGE — Reply in ${languageNames[safeLanguage]}. Preserve mathematical notation, code syntax, proper nouns, and essential technical terms accurately.`;
  if (safeContext) systemPrompt += `\n\nASSESSMENT EVIDENCE — ${safeContext}\nUse this only when relevant. It is an evidence signal, not a diagnosis.`;

  const payload = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: toGeminiContents(validated.messages),
    generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS, thinkingConfig: { thinkingLevel: 'low' } },
    safetySettings: [{ category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' }],
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(': connected\n\n'));
      let upstream;
      try { upstream = await callGeminiWithRetry(payload, apiKey); }
      catch (err) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: { message: err.message || 'Failed to reach the AI service' } })}\n\n`));
        controller.close();
        return;
      }
      if (!upstream.ok) {
        let detail = 'AI service error';
        try {
          const errBody = await upstream.json();
          const errObj = Array.isArray(errBody) ? errBody[0]?.error : errBody?.error;
          detail = errObj?.message || detail;
        } catch {}
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: { message: detail } })}\n\n`));
        controller.close();
        return;
      }
      const reader = upstream.body?.getReader();
      if (!reader) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: { message: 'AI service returned no stream' } })}\n\n`));
        controller.close();
        return;
      }
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
      } catch {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: { message: 'stream interrupted' } })}\n\n`));
      } finally {
        try { reader.releaseLock(); } catch {}
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no', ...corsHeaders(req) },
  });
}
