import { sql } from './_lib/db.js';
import { json } from './_lib/security.js';
import { requireAuth, requireLearnerAccess } from './_lib/auth.js';

export const config = { runtime: 'nodejs' };
const MAX_STEPS = 14;
const VALID_TYPES = new Set(['learn', 'practice', 'review', 'assessment', 'tutor', 'custom']);
const VALID_SOURCES = new Set(['ai', 'custom']);
const VALID_PRIORITIES = new Set(['student', 'balanced', 'ai']);

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

export default async function handler(req, res) {
  try {
    const session = await requireAuth(req);
    const learnerId = String(req.query?.learnerId || '').trim();
    await requireLearnerAccess(session, learnerId);
    if (req.method === 'GET') {
      const result = await sql`SELECT path, updated_at FROM hybrid_learning_paths WHERE learner_id=${learnerId}`;
      const row = result.rows[0];
      return json(res, 200, { ok: true, learnerId, path: row?.path || { schemaVersion: 1, mode: 'hybrid', steps: [], totalMinutes: 0 }, updatedAt: row?.updated_at || null });
    }
    if (req.method === 'PUT') {
      const path = normalizePath(req.body);
      if (!path) return json(res, 400, { error: { code: 'INVALID_HYBRID_PATH', message: 'A valid bounded Hybrid Mode path is required.' } });
      await sql`
        INSERT INTO hybrid_learning_paths(learner_id, path, updated_at)
        VALUES(${learnerId}, ${JSON.stringify(path)}::jsonb, NOW())
        ON CONFLICT(learner_id) DO UPDATE SET path=EXCLUDED.path, updated_at=NOW()
      `;
      return json(res, 200, { ok: true, learnerId, path });
    }
    if (req.method === 'DELETE') {
      await sql`DELETE FROM hybrid_learning_paths WHERE learner_id=${learnerId}`;
      return json(res, 200, { ok: true, learnerId });
    }
    return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'GET, PUT or DELETE required.' } }, { Allow: 'GET, PUT, DELETE' });
  } catch (e) {
    return json(res, e.status || 500, { error: { code: e.code || 'HYBRID_MODE_API_FAILED', message: e.status ? e.message : 'Hybrid Mode service unavailable.' } });
  }
}
