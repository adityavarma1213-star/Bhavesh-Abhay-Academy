// api/speak.js
// BAA OS — AI Tutor voice backend (Text-to-Speech)
// Runs as a Vercel Edge Function, same runtime and conventions as api/chat.js,
// but is a fully separate endpoint — nothing here touches chat.js's streaming,
// retry, or rate-limit state. Takes { text, voice }, calls Gemini's native TTS
// model, converts the raw PCM it returns into a playable WAV file, and sends
// that back as a single audio/wav response (no client-side WAV encoding needed).

export const config = { runtime: 'edge' };

// ---------- Configuration ----------
// Gemini's TTS-capable model. Streaming TTS exists for this model, but a
// tutor answer is short (a few sentences) and the frontend already shows the
// TEXT instantly via chat.js's stream — TTS only needs to produce one finished
// audio clip afterwards, so a single non-streaming call is simpler and has
// fewer failure modes than re-plumbing SSE audio chunks on the frontend.
const MODEL = 'gemini-3.1-flash-tts-preview';
const GEMINI_TTS_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const MAX_TEXT_CHARS = 3000;         // keep in sync with MAX_SPEAK_CHARS in the frontend
const REQUEST_TIMEOUT_MS = 25_000;
const MAX_RETRIES = 2;               // Gemini TTS occasionally 500s on a small % of requests (documented) — retry those

// PCM format Gemini TTS always returns for this model.
const SAMPLE_RATE = 24000;
const CHANNELS = 1;
const BIT_DEPTH = 16;

// Whitelist of Gemini's prebuilt voice names. The frontend's VOICE_PRESETS map
// user-facing labels (Friendly, Male, Teacher…) to one of these — we re-check
// here server-side so a tampered request can't pass an arbitrary string into
// the Gemini call.
const ALLOWED_VOICES = new Set([
  'Zephyr','Puck','Charon','Kore','Fenrir','Leda','Orus','Aoede','Callirrhoe',
  'Autonoe','Enceladus','Iapetus','Umbriel','Algieba','Despina','Erinome',
  'Algenib','Rasalgethi','Laomedeia','Achernar','Alnilam','Schedar','Gacrux',
  'Pulcherrima','Achird','Zubenelgenubi','Vindemiatrix','Sadachbia',
  'Sadaltager','Sulafat',
]);
const DEFAULT_VOICE = 'Achird';

// Best-effort in-memory rate limiter — same caveat as chat.js: only throttles
// within one warm Edge instance, not a hard global guarantee. Kept as its own
// bucket/map so voice traffic can never starve or be starved by chat traffic.
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 15; // TTS output tokens cost ~20x text tokens — tighter than chat's 20/5min
const rateLimitBuckets = new Map();

function getAllowedOrigin(req) {
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
  if (rateLimitBuckets.size > 5000) rateLimitBuckets.clear();
  return recent.length > RATE_LIMIT_MAX_REQUESTS;
}

// ---------- Base64 <-> bytes (Edge runtime has atob/btoa but no Buffer) ----------
function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Prepend a 44-byte RIFF/WAVE header to raw PCM bytes so the browser's
// <audio> element can play it directly with no client-side decoding step.
function pcmToWav(pcmBytes, sampleRate = SAMPLE_RATE, channels = CHANNELS, bitDepth = BIT_DEPTH) {
  const blockAlign = channels * (bitDepth / 8);
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcmBytes.length;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  function writeStr(offset, str) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);         // fmt chunk size
  view.setUint16(20, 1, true);          // PCM format
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  const wavBytes = new Uint8Array(buffer);
  wavBytes.set(pcmBytes, 44);
  return wavBytes;
}

async function callGeminiTtsWithRetry(payload, apiKey, attempt = 0) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(GEMINI_TTS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    // Retry on transient 5xx — Gemini TTS documents an "occasional text token
    // returns" failure mode that surfaces as a 500 on a small % of requests.
    if (!response.ok && response.status >= 500 && attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, 400 * Math.pow(2, attempt)));
      return callGeminiTtsWithRetry(payload, apiKey, attempt + 1);
    }
    return response;
  } catch (err) {
    clearTimeout(timeout);
    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, 400 * Math.pow(2, attempt)));
      return callGeminiTtsWithRetry(payload, apiKey, attempt + 1);
    }
    throw new Error(err && err.name === 'AbortError' ? 'upstream timeout' : 'upstream network error');
  }
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== 'POST') {
    return jsonError(req, 405, 'Method not allowed');
  }

  const apiKey = process.env.GEMINI_API_KEY; // same key as api/chat.js — no new secret to add
  if (!apiKey) {
    return jsonError(req, 500, 'Server is missing GEMINI_API_KEY');
  }

  const ip = getClientIp(req);
  if (isRateLimited(ip)) {
    return jsonError(req, 429, 'Too many voice requests — please wait a moment.');
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonError(req, 400, 'Invalid JSON body');
  }

  const { text, voice } = body || {};
  if (typeof text !== 'string' || !text.trim()) {
    return jsonError(req, 400, 'text is required');
  }
  const clippedText = text.trim().slice(0, MAX_TEXT_CHARS);
  const voiceName = (typeof voice === 'string' && ALLOWED_VOICES.has(voice)) ? voice : DEFAULT_VOICE;

  const payload = {
    contents: [{ parts: [{ text: clippedText }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName } },
      },
    },
  };

  let upstream;
  try {
    upstream = await callGeminiTtsWithRetry(payload, apiKey);
  } catch (err) {
    return jsonError(req, 502, err.message || 'Failed to reach the voice service');
  }

  if (!upstream.ok) {
    let detail = 'Voice service error';
    try {
      const errBody = await upstream.json();
      const errObj = Array.isArray(errBody) ? errBody[0]?.error : errBody?.error;
      detail = errObj?.message || detail;
    } catch { /* ignore parse failure, use default message */ }
    return jsonError(req, upstream.status || 502, detail);
  }

  let data;
  try {
    data = await upstream.json();
  } catch {
    return jsonError(req, 502, 'Voice service returned an unreadable response');
  }

  const inlineData = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData
    || data?.candidates?.[0]?.content?.parts?.[0]?.inline_data;
  const base64Pcm = inlineData?.data;

  if (!base64Pcm) {
    return jsonError(req, 502, "The AI didn't return any audio — try again.");
  }

  const pcmBytes = base64ToBytes(base64Pcm);
  const wavBytes = pcmToWav(pcmBytes);

  return new Response(wavBytes, {
    status: 200,
    headers: {
      'Content-Type': 'audio/wav',
      'Cache-Control': 'no-store',
      ...corsHeaders(req),
    },
  });
}
