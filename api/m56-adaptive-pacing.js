// BAA M56 — authenticated server pacing recommendation contract.
// The recommendation is deterministic and uses only explicit workload inputs.
// It does not infer private life events or persist sensitive wellbeing data.
import { requireAuth } from './_lib/auth.js';
import { json } from './_lib/security.js';

export const config = { runtime: 'nodejs' };

function noStore(res) {
  if (typeof res?.setHeader === 'function') res.setHeader('Cache-Control', 'private, no-store, max-age=0');
}

function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}

function recommend(input) {
  const available = Number(input.availableMinutes);
  const planned = Number(input.plannedMinutes);
  const energy = Number(input.energyLevel);
  if (![available, planned, energy].every(Number.isFinite) || available < 0 || planned < 0 || energy < 1 || energy > 5) {
    return null;
  }
  let action = 'maintain';
  if (planned > available) action = 'reduce_scope';
  else if (energy <= 2) action = 'reduce_intensity';
  else if (available - planned >= 30) action = 'optional_extension';
  const reason = action === 'reduce_scope'
    ? 'Planned work exceeds available time.'
    : action === 'reduce_intensity'
      ? 'Self-reported energy is low.'
      : 'Current inputs support the planned workload.';
  return { ok: true, action, reason };
}

export default async function handler(req, res) {
  noStore(res);
  try {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST.' } });
    await requireAuth(req);
    const result = recommend(body(req));
    if (!result) return json(res, 400, { ok: false, error: { code: 'INVALID_PACING_VALUES', message: 'availableMinutes and plannedMinutes must be non-negative numbers; energyLevel must be between 1 and 5.' } });
    return json(res, 200, result);
  } catch (err) {
    const status = Number(err?.status) || (err?.code === 'DATABASE_NOT_CONFIGURED' ? 503 : 500);
    return json(res, status, { ok: false, error: { code: err?.code || 'PACING_SERVICE_FAILED', message: err?.status ? err.message : 'Adaptive pacing service unavailable.' } });
  }
}
