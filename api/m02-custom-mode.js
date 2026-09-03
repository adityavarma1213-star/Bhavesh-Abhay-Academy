import { randomUUID } from 'node:crypto';
import { sql } from './_lib/db.js';
import { json, writeAudit } from './_lib/security.js';
import { requireAuth, requireLearnerAccess } from './_lib/auth.js';

export const config = { runtime: 'nodejs' };
const MAX_STEPS = 20;
const MAX_TITLE = 120;
const MAX_LEARNER_ID = 100;
const MAX_STEP_ID = 80;
const MAX_TYPE = 20;
const MIN_MINUTES = 5;
const MAX_MINUTES = 180;
const VALID_TYPES = new Set(['learn', 'practice', 'review', 'assessment', 'tutor']);

function cleanText(value, max = MAX_TITLE) { return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''; }
function boundedText(value, max) {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > max ? null : normalized;
}
function requireLearnerId(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_LEARNER_ID) return null;
  return normalized;
}
function normalizeSteps(value) {
  if (!Array.isArray(value) || value.length > MAX_STEPS) return null;
  const steps = [];
  const usedIds = new Set();
  for (const raw of value) {
    const title = boundedText(raw?.title, MAX_TITLE);
    const minutes = Number(raw?.minutes);
    const type = boundedText(raw?.type, MAX_TYPE);
    if (!title || !Number.isInteger(minutes) || minutes < MIN_MINUTES || minutes > MAX_MINUTES || !VALID_TYPES.has(type)) return null;
    let id = boundedText(raw?.id, MAX_STEP_ID) || randomUUID();
    if (usedIds.has(id)) return null;
    usedIds.add(id);
    steps.push({ id, title, minutes, type, completed: Boolean(raw?.completed) });
  }
  return steps;
}
function noStore(res) { res.setHeader('Cache-Control', 'private, no-store, max-age=0'); }

function conflict(res, updatedAt) {
  return json(res, 409, { error: { code: 'CUSTOM_MODE_CONFLICT', message: 'This learning path changed in another session. Reload before saving.', updatedAt } });
}

export default async function handler(req, res) {
  try {
    const session = await requireAuth(req);
    const learnerId = requireLearnerId(req.query?.learnerId);
    if (!learnerId) return json(res, 400, { error: { code: 'LEARNER_ID_INVALID', message: 'A valid learner identifier is required.' } });
    await requireLearnerAccess(session, learnerId);
    noStore(res);

    if (req.method === 'GET') {
      const result = await sql`SELECT path, updated_at FROM custom_learning_paths WHERE learner_id=${learnerId}`;
      const row = result.rows[0];
      return json(res, 200, { ok: true, learnerId, path: row?.path || { schemaVersion: 1, mode: 'custom', steps: [] }, updatedAt: row?.updated_at || null });
    }

    if (req.method === 'PUT') {
      const steps = normalizeSteps(req.body?.steps);
      if (!steps) return json(res, 400, { error: { code: 'INVALID_CUSTOM_PATH', message: 'A valid custom path with up to 20 bounded steps and unique step ids is required.' } });
      const expectedUpdatedAt = req.body?.expectedUpdatedAt ? String(req.body.expectedUpdatedAt).trim() : null;
      const path = { schemaVersion: 1, mode: 'custom', steps };

      const current = await sql`SELECT updated_at FROM custom_learning_paths WHERE learner_id=${learnerId}`;
      const currentUpdatedAt = current.rows[0]?.updated_at || null;
      if (currentUpdatedAt && (!expectedUpdatedAt || new Date(expectedUpdatedAt).getTime() !== new Date(currentUpdatedAt).getTime())) {
        return conflict(res, currentUpdatedAt);
      }
      if (!currentUpdatedAt && expectedUpdatedAt) {
        return conflict(res, null);
      }

      let saved;
      if (currentUpdatedAt) {
        saved = await sql`UPDATE custom_learning_paths SET path=${JSON.stringify(path)}::jsonb, updated_at=NOW() WHERE learner_id=${learnerId} AND updated_at=${currentUpdatedAt} RETURNING updated_at`;
        if (!saved.rows[0]) {
          const latest = await sql`SELECT updated_at FROM custom_learning_paths WHERE learner_id=${learnerId}`;
          return conflict(res, latest.rows[0]?.updated_at || null);
        }
      } else {
        saved = await sql`INSERT INTO custom_learning_paths(learner_id, path, updated_at) VALUES(${learnerId}, ${JSON.stringify(path)}::jsonb, NOW()) ON CONFLICT(learner_id) DO NOTHING RETURNING updated_at`;
        if (!saved.rows[0]) {
          const latest = await sql`SELECT updated_at FROM custom_learning_paths WHERE learner_id=${learnerId}`;
          return conflict(res, latest.rows[0]?.updated_at || null);
        }
      }

      const updatedAt = saved.rows[0]?.updated_at || null;
      await writeAudit({ actorUserId: session.user_id, action: 'CUSTOM_MODE_PATH_SAVED', entityType: 'learner', entityId: learnerId, metadata: { stepCount: steps.length, expectedUpdatedAt } });
      return json(res, 200, { ok: true, learnerId, path, updatedAt });
    }

    if (req.method === 'DELETE') {
      await sql`DELETE FROM custom_learning_paths WHERE learner_id=${learnerId}`;
      await writeAudit({ actorUserId: session.user_id, action: 'CUSTOM_MODE_PATH_CLEARED', entityType: 'learner', entityId: learnerId, metadata: {} });
      return json(res, 200, { ok: true, learnerId, path: { schemaVersion: 1, mode: 'custom', steps: [] }, updatedAt: null });
    }
    return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'GET, PUT or DELETE required.' } }, { Allow: 'GET, PUT, DELETE' });
  } catch (e) {
    noStore(res);
    return json(res, e.status || 500, { error: { code: e.code || 'CUSTOM_MODE_API_FAILED', message: e.status ? e.message : 'Custom Mode service unavailable.' } });
  }
}
