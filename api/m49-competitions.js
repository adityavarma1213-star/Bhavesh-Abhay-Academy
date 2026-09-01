import { json, writeAudit } from './_lib/security.js';
import { requireAuth } from './_lib/auth.js';

export const config = { runtime: 'nodejs' };

const PROVIDER_URL = String(process.env.BAA_COMPETITIONS_PROVIDER_URL || '').trim();
const PROVIDER_TOKEN = String(process.env.BAA_COMPETITIONS_PROVIDER_TOKEN || '').trim();
const TIMEOUT_MS = 8000;
const MAX_RESULTS = 100;
const MAX_PROVIDER_BYTES = 1024 * 1024;

function noStore(res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
}

function cleanText(value, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}

function isHttpsUrl(value) {
  return typeof value === 'string' && /^https:\/\//i.test(value);
}

function isSafeProviderUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    if (url.hostname.includes(':')) return false;
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost') || host === 'metadata.google.internal' || host === 'metadata') return false;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      const octets = host.split('.').map(Number);
      if (octets.some(n => n < 0 || n > 255)) return false;
      const [a, b] = octets;
      if (a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function normalizeCompetition(item) {
  if (!item || typeof item !== 'object') return null;
  const url = cleanText(item.url || item.sourceUrl, 1000);
  return {
    id: cleanText(item.id || item.slug, 120),
    name: cleanText(item.name || item.title, 240),
    provider: cleanText(item.provider || item.organizer, 160),
    category: cleanText(item.category || item.subject, 120),
    level: cleanText(item.level || item.grade, 120),
    country: cleanText(item.country, 80) || null,
    registrationDeadline: cleanText(item.registrationDeadline || item.deadline, 40) || null,
    eventDate: cleanText(item.eventDate || item.date, 40) || null,
    url: isHttpsUrl(url) ? url : null,
    eligibility: item.eligibility && typeof item.eligibility === 'object' ? item.eligibility : {},
  };
}

async function readJsonWithinLimit(response) {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_PROVIDER_BYTES) {
    return { ok: false, code: 'PAYLOAD_TOO_LARGE' };
  }
  const reader = response.body?.getReader?.();
  if (!reader) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_PROVIDER_BYTES) return { ok: false, code: 'PAYLOAD_TOO_LARGE' };
    try { return { ok: true, body: JSON.parse(text) }; } catch { return { ok: false, code: 'INVALID_JSON' }; }
  }
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_PROVIDER_BYTES) {
        await reader.cancel().catch(() => {});
        return { ok: false, code: 'PAYLOAD_TOO_LARGE' };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock?.();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    return { ok: true, body: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { ok: false, code: 'INVALID_JSON' };
  }
}

async function fetchProvider(req) {
  if (!PROVIDER_URL) {
    return { configured: false, results: [], message: 'Competition provider is not configured. Live contest data is unavailable.' };
  }

  let base;
  try { base = new URL(PROVIDER_URL); }
  catch { return { configured: true, results: [], message: 'Competition provider URL is invalid.' }; }
  if (!isSafeProviderUrl(base.toString())) {
    return { configured: true, results: [], message: 'Competition provider URL must use HTTPS and a DNS hostname.' };
  }

  for (const key of ['country', 'level', 'category']) {
    const value = cleanText(req.query?.[key], 80);
    if (value) base.searchParams.set(key, value);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(base.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json', ...(PROVIDER_TOKEN ? { Authorization: `Bearer ${PROVIDER_TOKEN}` } : {}) },
      signal: controller.signal,
      redirect: 'manual',
    });
    if (response.status >= 300 && response.status < 400) return { configured: true, results: [], message: 'Competition provider redirect blocked for security.' };
    if (!response.ok) return { configured: true, results: [], message: `Competition provider returned HTTP ${response.status}.` };
    const parsed = await readJsonWithinLimit(response);
    if (!parsed.ok) {
      return { configured: true, results: [], message: parsed.code === 'PAYLOAD_TOO_LARGE' ? 'Competition provider response exceeded the 1 MiB safety limit.' : 'Competition provider returned invalid JSON.' };
    }
    const body = parsed.body;
    const source = Array.isArray(body) ? body : Array.isArray(body?.results) ? body.results : Array.isArray(body?.competitions) ? body.competitions : [];
    const results = source.map(normalizeCompetition).filter(Boolean).filter(x => x.name && x.url).slice(0, MAX_RESULTS);
    return { configured: true, results, message: null };
  } catch (error) {
    return { configured: true, results: [], message: error?.name === 'AbortError' ? 'Competition provider timed out.' : 'Competition provider could not be reached.' };
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  noStore(res);
  if (req.method !== 'GET') return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'GET required.' } }, { Allow: 'GET' });
  try {
    const session = await requireAuth(req);
    const payload = await fetchProvider(req);
    if (payload.configured && payload.results.length) {
      await writeAudit({ actorUserId: session.user_id, action: 'competition.search', entityType: 'competition_provider', entityId: 'm49', metadata: { resultCount: payload.results.length } }).catch(() => {});
    }
    return json(res, 200, {
      ok: true,
      providerConfigured: payload.configured,
      live: payload.configured && payload.results.length > 0,
      results: payload.results,
      sourcePolicy: { providerUrlRequiresHttps: true, providerHostMustBeDnsName: true, resultUrlsRequireHttps: true, providerRedirectsBlocked: true, maxProviderResponseBytes: MAX_PROVIDER_BYTES },
      message: payload.message,
    });
  } catch (e) {
    return json(res, e.status || 500, { error: { code: e.code || 'COMPETITION_SEARCH_FAILED', message: e.status ? e.message : 'Unable to load competition data.' } });
  }
}
