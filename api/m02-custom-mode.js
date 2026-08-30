import { sql } from './_lib/db.js';
import { json, writeAudit } from './_lib/security.js';
import { requireAuth, requireLearnerAccess } from './_lib/auth.js';

export const config = { runtime: 'nodejs' };
const MAX_STEPS = 20;
const MAX_TITLE = 120;
const MIN_MINUTES = 5;
const MAX_MINUTES = 180;
const VALID_TYPES = new Set(['learn', 'practice', 'review', 'assessment', 'tutor']);

function cleanText(value, max = MAX_TITLE) { return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''; }
function normalizeSteps(value) {
  if (!Array.isArray(value) || value.length > MAX_STEPS) return null;
  const steps = [];
  for (const raw of value) {
    const title = cleanText(raw?.title), minutes = Number(raw?.minutes), type = cleanText(raw?.type, 20);
    if (!title || !Number.isInteger(minutes) || minutes < MIN_MINUTES || minutes > MAX_MINUTES || !VALID_TYPES.has(type)) return null;
    steps.push({ id: cleanText(raw?.id, 80) || crypto.randomUUID(), title, minutes, type, completed: Boolean(raw?.completed) });
  }
  return steps;
}
function noStore(res) { res.setHeader('Cache-Control', 'private, no-store, max-age=0'); }

export default async function handler(req, res) {
  try {
    const session = await requireAuth(req);
    const learnerId = String(req.query?.learnerId || '').trim();
    await requireLearnerAccess(session, learnerId);
    noStore(res);

    if (req.method === 'GET') {
      const result = await sql`SELECT path, updated_at FROM custom_learning_paths WHERE learner_id=${learnerId}`;
      const row = result.rows[0];
      return json(res, 200, { ok: true, learnerId, path: row?.path || { schemaVersion: 1, mode: 'custom', steps: [] }, updatedAt: row?.updated_at || null });
    }

    if (req.method === 'PUT') {
      const steps = normalizeSteps(req.body?.steps);
      if (!steps) return json(res, 400, { error: { code: 'INVALID_CUSTOM_PATH', message: 'A valid custom path with up to 20 bounded steps is required.' } });
      const expectedUpdatedAt = req.body?.expectedUpdatedAt ? String(req.body.expectedUpdatedAt).trim() : null;
      const path = { schemaVersion: 1, mode: 'custom', steps };

      const current = await sql`SELECT updated_at FROM custom_learning_paths WHERE learner_id=${learnerId}`;
      const currentUpdatedAt = current.rows[0]?.updated_at || null;
      if (currentUpdatedAt && (!expectedUpdatedAt || new Date(expectedUpdatedAt).getTime() !== new Date(currentUpdatedAt).getTime())) {
        return json(res, 409, { error: { code: 'CUSTOM_MODE_CONFLICT', message: 'This learning path changed in another session. Reload before saving.', updatedAt: currentUpdatedAt } });
      }
      if (!currentUpdatedAt && expectedUpdatedAt) {
        return json(res, 409, { error: { code: 'CUSTOM_MODE_CONFLICT', message: 'This learning path was created in another session. Reload before saving.', updatedAt: null } });
      }

      if (currentUpdatedAt) {
        await sql`UPDATE custom_learning_paths SET path=${JSON.stringify(path)}::jsonb, updated_at=NOW() WHERE learner_id=${learnerId} AND updated_at=${currentUpdatedAt}`;
      } else {
        await sql`INSERT INTO custom_learning_paths(learner_id, path, updated_at) VALUES(${learnerId}, ${JSON.stringify(path)}::jsonb, NOW()) ON CONFLICT(learner_id) DO UPDATE SET path=EXCLUDED.path, updated_at=NOW()`;
      }
      const saved = await sql`SELECT updated_at FROM custom_learning_paths WHERE learner_id=${learnerId}`;
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
