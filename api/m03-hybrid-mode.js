import { sql } from './_lib/db.js';
import { json, writeAudit } from './_lib/security.js';
import { requireAuth, requireLearnerAccess } from './_lib/auth.js';

export const config = { runtime: 'nodejs' };
const MAX_STEPS = 14;
const MAX_LEARNER_ID_CHARS = 120;
const MAX_VERSION_CHARS = 64;
const VALID_TYPES = new Set(['learn', 'practice', 'review', 'assessment', 'tutor', 'custom']);
const VALID_SOURCES = new Set(['ai', 'custom']);
const VALID_PRIORITIES = new Set(['student', 'balanced', 'ai']);
const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

function text(value, max = 180) { return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : ''; }
function normalizePath(value) {
  if (!value || typeof value !== 'object' || value.mode !== 'hybrid') return null;
  const priority = VALID_PRIORITIES.has(value.priority) ? value.priority : 'balanced';
  if (!Array.isArray(value.steps) || value.steps.length > MAX_STEPS) return null;
  const steps = value.steps.map((step) => {
    const title = text(step?.title, 120);
    const minutes = Number(step?.minutes);
    const type = text(step?.type, 20);
    const source = text(step?.source, 20);
    if (!title || !Number.isInteger(minutes) || minutes < 5 || minutes > 120 || !VALID_TYPES.has(type) || !VALID_SOURCES.has(source)) return null;
    return { id: text(step?.id, 100) || `${source}-${title}`, title, minutes, type, source, completed: Boolean(step?.completed), included: step?.included !== false, reason: text(step?.reason, 240) };
  });
  if (steps.some((step) => !step)) return null;
  return { schemaVersion: 1, mode: 'hybrid', priority, conflictPolicy: text(value.conflictPolicy, 180), steps, totalMinutes: steps.filter(s => s.included).reduce((sum, s) => sum + s.minutes, 0) };
}

function conflict(res, updatedAt) {
  return json(res, 409, { error: { code: 'HYBRID_MODE_CONFLICT', message: 'This Hybrid Mode path changed in another session. Reload before saving.', updatedAt } }, NO_STORE);
}

function parseExpectedUpdatedAt(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > MAX_VERSION_CHARS) return '__too_long__';
  const parsed = new Date(value.trim());
  return Number.isNaN(parsed.getTime()) ? '__invalid__' : parsed.toISOString();
}

export default async function handler(req, res) {
  try {
    const session = await requireAuth(req);
    const learnerId = req.query?.learnerId;
    if (typeof learnerId !== 'string' || !learnerId.trim()) return json(res, 400, { error: { code: 'LEARNER_ID_REQUIRED', message: 'learnerId is required.' } }, NO_STORE);
    if (learnerId.trim().length > MAX_LEARNER_ID_CHARS) return json(res, 400, { error: { code: 'LEARNER_ID_TOO_LONG', message: `learnerId must be ${MAX_LEARNER_ID_CHARS} characters or fewer.` } }, NO_STORE);
    const normalizedLearnerId = learnerId.trim();
    await requireLearnerAccess(session, normalizedLearnerId);
    if (req.method === 'GET') {
      const result = await sql`SELECT path, updated_at FROM hybrid_learning_paths WHERE learner_id=${normalizedLearnerId}`;
      const row = result.rows[0];
      return json(res, 200, { ok: true, learnerId: normalizedLearnerId, path: row?.path || { schemaVersion: 1, mode: 'hybrid', steps: [], totalMinutes: 0 }, updatedAt: row?.updated_at || null }, NO_STORE);
    }
    if (req.method === 'PUT') {
      const path = normalizePath(req.body);
      if (!path) return json(res, 400, { error: { code: 'INVALID_HYBRID_PATH', message: 'A valid bounded Hybrid Mode path is required.' } }, NO_STORE);
      const expectedUpdatedAt = parseExpectedUpdatedAt(req.body?.expectedUpdatedAt);
      if (expectedUpdatedAt === '__too_long__') return json(res, 400, { error: { code: 'VALUE_TOO_LONG', message: `expectedUpdatedAt must be ${MAX_VERSION_CHARS} characters or fewer.` } }, NO_STORE);
      if (expectedUpdatedAt === '__invalid__') return json(res, 400, { error: { code: 'INVALID_EXPECTED_UPDATED_AT', message: 'expectedUpdatedAt must be a valid timestamp.' } }, NO_STORE);

      const current = await sql`SELECT updated_at FROM hybrid_learning_paths WHERE learner_id=${normalizedLearnerId}`;
      const currentUpdatedAt = current.rows[0]?.updated_at || null;
      if (currentUpdatedAt && (!expectedUpdatedAt || new Date(expectedUpdatedAt).getTime() !== new Date(currentUpdatedAt).getTime())) return conflict(res, currentUpdatedAt);
      if (!currentUpdatedAt && expectedUpdatedAt) return conflict(res, null);

      let saved;
      if (currentUpdatedAt) {
        saved = await sql`UPDATE hybrid_learning_paths SET path=${JSON.stringify(path)}::jsonb, updated_at=NOW() WHERE learner_id=${normalizedLearnerId} AND updated_at=${currentUpdatedAt} RETURNING updated_at`;
        if (!saved.rows[0]) {
          const latest = await sql`SELECT updated_at FROM hybrid_learning_paths WHERE learner_id=${normalizedLearnerId}`;
          return conflict(res, latest.rows[0]?.updated_at || null);
        }
      } else {
        saved = await sql`INSERT INTO hybrid_learning_paths(learner_id, path, updated_at) VALUES(${normalizedLearnerId}, ${JSON.stringify(path)}::jsonb, NOW()) ON CONFLICT(learner_id) DO NOTHING RETURNING updated_at`;
        if (!saved.rows[0]) {
          const latest = await sql`SELECT updated_at FROM hybrid_learning_paths WHERE learner_id=${normalizedLearnerId}`;
          return conflict(res, latest.rows[0]?.updated_at || null);
        }
      }
      const updatedAt = saved.rows[0]?.updated_at || null;
      await writeAudit({ actorUserId: session.user_id, action: 'HYBRID_MODE_PATH_SAVED', entityType: 'learner', entityId: normalizedLearnerId, metadata: { stepCount: path.steps.length, expectedUpdatedAt } });
      return json(res, 200, { ok: true, learnerId: normalizedLearnerId, path, updatedAt }, NO_STORE);
    }
    if (req.method === 'DELETE') {
      await sql`DELETE FROM hybrid_learning_paths WHERE learner_id=${normalizedLearnerId}`;
      await writeAudit({ actorUserId: session.user_id, action: 'HYBRID_MODE_PATH_CLEARED', entityType: 'learner', entityId: normalizedLearnerId, metadata: {} });
      return json(res, 200, { ok: true, learnerId: normalizedLearnerId }, NO_STORE);
    }
    return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'GET, PUT or DELETE required.' } }, { Allow: 'GET, PUT, DELETE', ...NO_STORE });
  } catch (e) {
    return json(res, e.status || 500, { error: { code: e.code || 'HYBRID_MODE_API_FAILED', message: e.status ? e.message : 'Hybrid Mode service unavailable.' } }, NO_STORE);
  }
}
