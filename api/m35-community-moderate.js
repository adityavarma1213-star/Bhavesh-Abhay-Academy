import { json } from './_lib/security.js';
import { requireAuth } from './_lib/auth.js';

export const config = { runtime: 'nodejs' };

const BLOCKED = [
  'self-harm',
  'suicide',
  'sexual exploitation',
  'buy drugs',
];

function moderate(text) {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'INVALID_POST' };
  const low = text.toLowerCase();
  if (BLOCKED.some(term => low.includes(term))) {
    return { ok: false, error: 'POST_BLOCKED_BY_SAFETY_FILTER' };
  }
  return { ok: true, error: null };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'POST required.' } }, { Allow: 'POST', 'Cache-Control': 'no-store' });
  }
  try {
    await requireAuth(req);
    const result = moderate(req.body?.text);
    if (!result.ok) {
      return json(res, 422, { ok: false, error: { code: result.error, message: 'Post rejected by the community safety filter.' } }, { 'Cache-Control': 'no-store' });
    }
    return json(res, 200, { ok: true, error: null, moderation: 'server_safety_filter_passed' }, { 'Cache-Control': 'no-store' });
  } catch (error) {
    return json(res, error.status || 500, { error: { code: error.code || 'COMMUNITY_MODERATION_FAILED', message: error.status ? error.message : 'Community moderation is temporarily unavailable.' } }, { 'Cache-Control': 'no-store' });
  }
}
