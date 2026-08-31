import { json, writeAudit } from './_lib/security.js';
import { requireAuth } from './_lib/auth.js';

export const config = { runtime: 'nodejs' };

const PROVIDER_URL = String(process.env.BAA_COMPETITIONS_PROVIDER_URL || '').trim();
const PROVIDER_TOKEN = String(process.env.BAA_COMPETITIONS_PROVIDER_TOKEN || '').trim();
const TIMEOUT_MS = 8000;
const MAX_RESULTS = 100;

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
    // Provider configuration is server-controlled, but reject literal IP hosts so
    // private/loopback IPv6 forms cannot bypass the existing hostname policy.
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

async function fetchProvider(req) {
  if (!PROVIDER_URL) {
    return { configured: false, results: [], message: 'Competition provider is not configured. Live contest data is unavailable.' };
  }

  let base;
  try {
    base = new URL(PROVIDER_URL);
  } catch {
    return { configured: true, results: [], message: 'Competition provider URL is invalid.' };
  }
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
      headers: {
        Accept: 'application/json',
        ...(PROVIDER_TOKEN ? { Authorization: `Bearer ${PROVIDER_TOKEN}` } : {}),
      },
      signal: controller.signal,
      redirect: 'manual',
    });
    if (response.status >= 300 && response.status < 400) {
      return { configured: true, results: [], message: 'Competition provider redirect blocked for security.' };
    }
    if (!response.ok) {
      return { configured: true, results: [], message: `Competition provider returned HTTP ${response.status}.` };
    }
    const body = await response.json();
    const source = Array.isArray(body) ? body : Array.isArray(body?.results) ? body.results : Array.isArray(body?.competitions) ? body.competitions : [];
    const results = source.map(normalizeCompetition).filter(Boolean).filter(x => x.name && x.url).slice(0, MAX_RESULTS);
    return { configured: true, results, message: null };
  } catch (error) {
    return {
      configured: true,
      results: [],
      message: error?.name === 'AbortError' ? 'Competition provider timed out.' : 'Competition provider could not be reached.',
    };
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  noStore(res);
  if (req.method !== 'GET') {
    return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'GET required.' } }, { Allow: 'GET' });
  }
  try {
    const session = await requireAuth(req);
    const payload = await fetchProvider(req);
    if (payload.configured && payload.results.length) {
      await writeAudit({
        actorUserId: session.user_id,
        action: 'competition.search',
        entityType: 'competition_provider',
        entityId: 'm49',
        metadata: { resultCount: payload.results.length },
      }).catch(() => {});
    }
    return json(res, 200, {
      ok: true,
      providerConfigured: payload.configured,
      live: payload.configured && payload.results.length > 0,
      results: payload.results,
      sourcePolicy: { providerUrlRequiresHttps: true, providerHostMustBeDnsName: true, resultUrlsRequireHttps: true, providerRedirectsBlocked: true },
      message: payload.message,
    });
  } catch (e) {
    return json(res, e.status || 500, {
      error: { code: e.code || 'COMPETITION_SEARCH_FAILED', message: e.status ? e.message : 'Unable to load competition data.' },
    });
  }
}
