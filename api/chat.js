// api/chat.js
// BAA OS — AI Tutor backend
// Runs as a Vercel Edge Function. Keeps the Gemini API key server-side,
// validates and trims incoming conversations, applies basic rate limiting,
// retries transient failures, and streams the model's reply back to the
// browser as Server-Sent Events (SSE).

export const config = { runtime: 'edge' };

// ---------- Configuration ----------
// gemini-3.6-flash is Google's current GA, production-ready Flash model
// (as of mid-2026) and remains on the free tier. gemini-2.5-flash has begun
// returning 404s ahead of its official Oct 16, 2026 shutdown, so we no
// longer use it. Swap to 'gemini-3.5-flash-lite' for an even
// cheaper/faster tutor if you need higher throughput (also free tier).
const MODEL = 'gemini-3.6-flash';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?alt=sse`;
const MAX_OUTPUT_TOKENS = 2048;
const MAX_MESSAGE_CHARS = 4000;             // per-message cap
const MAX_HISTORY_MESSAGES = 20;            // how many turns of memory we forward to the model
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;

// Best-effort in-memory rate limiter. Edge functions are ephemeral and can run
// across many isolated instances, so this only throttles *within* an
// instance's lifetime — it is a safety net, not a hard guarantee. Google's own
// free-tier quota (requests/minute/day) is enforced upstream regardless — see
// DEPLOYMENT.md for current limits.
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const RATE_LIMIT_MAX_REQUESTS = 20;
const rateLimitBuckets = new Map();

function getAllowedOrigin(req) {
  // Set ALLOWED_ORIGIN in Vercel env vars to your GitHub Pages URL, e.g.
  // "https://yourusername.github.io". Falls back to "*" (open) if unset —
  // tighten this before going fully live.
  return process.env.ALLOWED_ORIGIN || '*';
}

function corsHeaders(req) {
  return {
    'Access-Control-Allow-Origin': getAllowedOrigin(req),
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
  // Opportunistic cleanup so the map doesn't grow forever within an instance
  if (rateLimitBuckets.size > 5000) rateLimitBuckets.clear();
  return recent.length > RATE_LIMIT_MAX_REQUESTS;
}

function sanitizeName(name) {
  if (typeof name !== 'string') return 'Explorer';
  const cleaned = name.replace(/[^a-zA-Z0-9 '-]/g, '').trim().slice(0, 40);
  return cleaned || 'Explorer';
}

function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { error: 'messages must be a non-empty array' };
  }
  if (messages.length > MAX_HISTORY_MESSAGES * 2) {
    return { error: 'conversation too long' };
  }
  for (const m of messages) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) {
      return { error: 'each message needs role "user" or "assistant"' };
    }
    if (typeof m.content !== 'string' || !m.content.trim()) {
      return { error: 'each message needs non-empty string content' };
    }
    if (m.content.length > MAX_MESSAGE_CHARS) {
      return { error: `message exceeds ${MAX_MESSAGE_CHARS} characters` };
    }
  }
  // Keep only the most recent turns so token usage stays bounded.
  const trimmed = messages.slice(-MAX_HISTORY_MESSAGES);
  return { messages: trimmed };
}

// Gemini uses role "model" where our own history (and Anthropic-style
// convention) uses "assistant" — translate on the way out.
function toGeminiContents(messages) {
  return messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
}

async function callGeminiWithRetry(payload, apiKey, attempt = 0) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    console.log('[DEBUG] Gemini HTTP status:', response.status, '(attempt', attempt, ')');

    // Retry on transient server-side failures only (not on 4xx — those are our bug).
    if (!response.ok && response.status >= 500 && attempt < MAX_RETRIES) {
      clearTimeout(timeout);
      await new Promise((r) => setTimeout(r, 400 * Math.pow(2, attempt)));
      return callGeminiWithRetry(payload, apiKey, attempt + 1);
    }

    clearTimeout(timeout);
    return response;
  } catch (err) {
    clearTimeout(timeout);
    console.log('[DEBUG] Exception in fetch to Gemini - name:', err && err.name);
    console.log('[DEBUG] Exception in fetch to Gemini - message:', err && err.message);
    console.log('[DEBUG] Exception in fetch to Gemini - stack:', err && err.stack);
    const isAbort = err.name === 'AbortError';
    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, 400 * Math.pow(2, attempt)));
      return callGeminiWithRetry(payload, apiKey, attempt + 1);
    }
    throw new Error(isAbort ? 'upstream timeout' : 'upstream network error');
  }
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  if (req.method !== 'POST') {
    return jsonError(req, 405, 'Method not allowed');
  }

  console.log('[DEBUG] Request received:', req.method, req.url);

  const apiKey = process.env.GEMINI_API_KEY;
  console.log('[DEBUG] GEMINI_API_KEY exists:', apiKey ? 'YES' : 'NO');
  if (!apiKey) {
    return jsonError(req, 500, 'Server is missing GEMINI_API_KEY');
  }

  const ip = getClientIp(req);
  if (isRateLimited(ip)) {
    return jsonError(req, 429, 'Too many requests — please wait a moment and try again.');
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonError(req, 400, 'Invalid JSON body');
  }

  const { messages, studentName } = body || {};
  const validated = validateMessages(messages);
  if (validated.error) {
    return jsonError(req, 400, validated.error);
  }

  const safeName = sanitizeName(studentName);
  const systemPrompt =
    `You are a warm, encouraging AI tutor inside a student learning app called BAA OS, ` +
    `talking to a school student named ${safeName}. Keep answers short (3-5 sentences), ` +
    `simple, age-appropriate, and end with a small encouraging nudge or a follow-up question. ` +
    `Use markdown for structure when it helps (e.g. **bold**, short lists, \`code\`, or fenced ` +
    `code blocks). For math, write expressions in LaTeX using $...$ for inline and $$...$$ for ` +
    `block equations.`;

  const payload = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: toGeminiContents(validated.messages),
    generationConfig: {
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      thinkingConfig: {
        thinkingLevel: 'low',
      },
      // Note: temperature/top_p/top_k are deprecated for the Gemini 3.x
      // family (Google recommends the model's default of 1.0) — omitted
      // intentionally, not an oversight.
    },
    safetySettings: [
      // Keep Google's default child-safety blocking; only relax categories
      // that commonly false-positive on ordinary schoolwork topics.
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  };

  console.log('[DEBUG] Model name:', MODEL);
  console.log('[DEBUG] Request URL:', GEMINI_API_URL);
  console.log('[DEBUG] Request payload:', JSON.stringify(payload));

  // --- Return the streaming Response immediately. We do NOT await Gemini
  // here — Vercel Edge Functions must send an initial response quickly
  // (the platform will kill the invocation with "did not return an initial
  // response" if we sit here awaiting a slow upstream call first). Instead,
  // the Gemini call — including retries — happens inside the ReadableStream's
  // start(), after the Response has already been handed back to the platform.
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Send an immediate SSE comment (lines starting with ':' are ignored
      // by SSE parsers, including the frontend's) so real bytes hit the wire
      // right away. This satisfies Vercel Edge's requirement to begin
      // sending a response within 25 seconds, independent of how long the
      // upstream Gemini call ends up taking.
      controller.enqueue(encoder.encode(': connected\n\n'));

      let upstream;
      try {
        upstream = await callGeminiWithRetry(payload, apiKey);
      } catch (err) {
        console.log('[DEBUG] Exception calling Gemini - name:', err && err.name);
        console.log('[DEBUG] Exception calling Gemini - message:', err && err.message);
        console.log('[DEBUG] Exception calling Gemini - stack:', err && err.stack);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: { message: err.message || 'Failed to reach the AI service' } })}\n\n`)
        );
        controller.close();
        return;
      }

      if (!upstream.ok) {
        let detail = 'AI service error';
        try {
          const errBody = await upstream.json();
          console.log('[DEBUG] Gemini non-200 response body:', JSON.stringify(errBody));
          // Gemini errors can come back as an object or a single-element array.
          const errObj = Array.isArray(errBody) ? errBody[0]?.error : errBody?.error;
          detail = errObj?.message || detail;
        } catch (parseErr) {
          console.log('[DEBUG] Gemini non-200 response body: <failed to parse as JSON>', parseErr && parseErr.message);
          /* ignore parse failure, use default message */
        }
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: { message: detail } })}\n\n`)
        );
        controller.close();
        return;
      }

      // Re-stream Gemini's SSE events straight through to the browser. The
      // frontend parses each `data:` line's JSON for candidates[0].content.parts.
      console.log('[DEBUG] Streaming started');
      const reader = upstream.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
      } catch (e) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: { message: 'stream interrupted' } })}\n\n`)
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      ...corsHeaders(req),
    },
  });
}
