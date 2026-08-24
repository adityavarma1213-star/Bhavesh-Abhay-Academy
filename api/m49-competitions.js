import { json, writeAudit } from './_lib/security.js';
import { requireAuth } from './_lib/auth.js';

export const config = { runtime: 'nodejs' };

const PROVIDER_URL = String(process.env.BAA_COMPETITIONS_PROVIDER_URL || '').trim();
const PROVIDER_TOKEN = String(process.env.BAA_COMPETITIONS_PROVIDER_TOKEN || '').trim();
const TIMEOUT_MS = 8000;

function cleanText(value, max = 240) {
  return String(value ?? '').trim().slice(0, max);
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
    url: /^https:\/\//i.test(url) ? url : null,
    eligibility: item.eligibility && typeof item.eligibility === 'object' ? item.eligibility : {},
  };
}

async function fetchProvider(req) {
  if (!PROVIDER_URL) {
    return { configured: false, results: [], message: 'Competition provider is not configured. Live contest data is unavailable.' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const params = new URLSearchParams();
    for (const key of ['country', 'level', 'category']) {
      const value = cleanText(req.query?.[key], 80);
      if (value) params.set(key, value);
    }
    const target = `${PROVIDER_URL}${PROVIDER_URL.includes('?') ? '&' : '?'}${params.toString()}`;
    const response = await fetch(target, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(PROVIDER_TOKEN ? { Authorization: `Bearer ${PROVIDER_TOKEN}` } : {}),
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      return { configured: true, results: [], message: `Competition provider returned HTTP ${response.status}.` };
    }
    const body = await response.json();
    const source = Array.isArray(body) ? body : Array.isArray(body?.results) ? body.results : Array.isArray(body?.competitions) ? body.competitions : [];
    const results = source.map(normalizeCompetition).filter(Boolean).filter(x => x.name && x.url);
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
      message: payload.message,
    });
  } catch (e) {
    return json(res, e.status || 500, {
      error: { code: e.code || 'COMPETITION_SEARCH_FAILED', message: e.status ? e.message : 'Unable to load competition data.' },
    });
  }
}
