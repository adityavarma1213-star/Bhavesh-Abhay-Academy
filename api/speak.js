// api/speak.js
// BAA OS — AI Tutor voice backend (Text-to-Speech)
// Runs as a Vercel Edge Function, same runtime and conventions as api/chat.js,
// but is a fully separate endpoint — nothing here touches chat.js's streaming,
// retry, or rate-limit state. Takes { text, voice }, calls Gemini's native TTS
// model, converts the raw PCM it returns into a playable WAV file, and sends
// that back as a single audio/wav response (no client-side WAV encoding needed).

export const config = { runtime: 'nodejs' };

import { requireAuth } from './_lib/auth.js';
import { consumeAiRateLimit } from './_lib/ai-rate-limit.js';

// ---------- Configuration ----------
const MODEL = 'gemini-3.1-flash-tts-preview';
const GEMINI_TTS_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const MAX_TEXT_CHARS = 3000;
const MAX_REQUEST_BODY_BYTES = 32 * 1024;
const REQUEST_TIMEOUT_MS = 25_000;
const MAX_RETRIES = 2;

const SAMPLE_RATE = 24000;
const CHANNELS = 1;
const BIT_DEPTH = 16;

const ALLOWED_VOICES = new Set([
  'Zephyr','Puck','Charon','Kore','Fenrir','Leda','Orus','Aoede','Callirrhoe',
  'Autonoe','Enceladus','Iapetus','Umbriel','Algieba','Despina','Erinome',
  'Algenib','Rasalgethi','Laomedeia','Achernar','Alnilam','Schedar','Gacrux',
  'Pulcherrima','Achird','Zubenelgenubi','Vindemiatrix','Sadachbia',
  'Sadaltager','Sulafat',
]);
const DEFAULT_VOICE = 'Achird';

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

async function readJsonBounded(req) {
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_REQUEST_BODY_BYTES) {
    try { await req.body?.cancel?.(); } catch (_) {}
    return { ok: false, error: 'REQUEST_BODY_TOO_LARGE' };
  }
  if (!req.body || typeof req.body.getReader !== 'function') {
    try { return { ok: true, body: await req.json() }; }
    catch (_) { return { ok: false, error: 'INVALID_JSON' }; }
  }
  const reader = req.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      const chunk = part.value instanceof Uint8Array ? part.value : new Uint8Array(part.value || []);
      total += chunk.byteLength;
      if (total > MAX_REQUEST_BODY_BYTES) {
        try { await reader.cancel(); } catch (_) {}
        return { ok: false, error: 'REQUEST_BODY_TOO_LARGE' };
      }
      chunks.push(chunk);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try { return { ok: true, body: JSON.parse(new TextDecoder().decode(bytes)) }; }
    catch (_) { return { ok: false, error: 'INVALID_JSON' }; }
  } catch (_) {
    try { await reader.cancel(); } catch (_) {}
    return { ok: false, error: 'INVALID_JSON' };
  }
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

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
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
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
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);
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
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return jsonError(req, 405, 'Method not allowed');

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return jsonError(req, 500, 'Server is missing GEMINI_API_KEY');

  let session;
  try { session = await requireAuth(req); } catch (e) {
    return jsonError(req, e.status || 401, e.message || 'Authentication required.');
  }
  let rate;
  try { rate = await consumeAiRateLimit('speak', session.user_id || getClientIp(req), { windowSeconds: 300, maxRequests: 20 }); }
  catch { return jsonError(req, 503, 'AI rate-limit service is temporarily unavailable.'); }
  if (rate.limited) return jsonError(req, 429, 'Too many voice requests — please wait a moment.');

  const parsed = await readJsonBounded(req);
  if (!parsed.ok) {
    return jsonError(req, 400, parsed.error === 'REQUEST_BODY_TOO_LARGE'
      ? 'Request body is too large.'
      : 'Invalid JSON body');
  }

  const { text, voice } = parsed.body || {};
  if (typeof text !== 'string' || !text.trim()) return jsonError(req, 400, 'text is required');
  const clippedText = text.trim().slice(0, MAX_TEXT_CHARS);
  const voiceName = (typeof voice === 'string' && ALLOWED_VOICES.has(voice)) ? voice : DEFAULT_VOICE;

  const payload = {
    contents: [{ parts: [{ text: clippedText }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
    },
  };

  let upstream;
  try { upstream = await callGeminiTtsWithRetry(payload, apiKey); }
  catch (err) { return jsonError(req, 502, err.message || 'Failed to reach the voice service'); }

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
  try { data = await upstream.json(); }
  catch { return jsonError(req, 502, 'Voice service returned an unreadable response'); }

  const inlineData = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData
    || data?.candidates?.[0]?.content?.parts?.[0]?.inline_data;
  const base64Pcm = inlineData?.data;
  if (!base64Pcm) return jsonError(req, 502, "The AI didn't return any audio — try again.");

  let pcmBytes;
  try { pcmBytes = base64ToBytes(base64Pcm); }
  catch { return jsonError(req, 502, 'Voice service returned invalid audio data'); }
  const wavBytes = pcmToWav(pcmBytes);

  return new Response(wavBytes, {
    status: 200,
    headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store', ...corsHeaders(req) },
  });
}
