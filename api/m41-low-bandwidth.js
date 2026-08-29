// BAA M41 — authenticated low-bandwidth preference persistence.
// Stores explicit data-saver choices and uses optimistic concurrency so an
// offline/stale client cannot silently overwrite a newer preference.
import { sql } from './_lib/db.js';
import { json } from './_lib/security.js';
import { requireAuth, requireLearnerAccess } from './_lib/auth.js';

export const config = { runtime: 'nodejs' };
const MODES = new Set(['auto', 'text', 'audio', 'lite']);
const DEFAULTS = { schemaVersion: 1, enabled: false, contentMode: 'auto' };

function noStore(res) { res.setHeader('Cache-Control', 'private, no-store, max-age=0'); }
function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}
function normalize(body) {
  if (typeof body?.enabled !== 'boolean' || !MODES.has(body?.contentMode)) return null;
  return { schemaVersion: 1, enabled: body.enabled, contentMode: body.contentMode };
}
function asIso(value) {
  return value ? new Date(value).toISOString() : null;
}

export default async function handler(req, res) {
  noStore(res);
  try {
    const session = await requireAuth(req);
    const learnerId = String(req.query?.learnerId || '').trim();
    if (!learnerId) return json(res, 400, { ok: false, error: { code: 'LEARNER_ID_REQUIRED', message: 'learnerId is required.' } });
    await requireLearnerAccess(session, learnerId);

    if (req.method === 'GET') {
      const result = await sql`
        SELECT enabled, content_mode, updated_at
        FROM learner_low_bandwidth_preferences
        WHERE learner_id=${learnerId}
      `;
      const row = result.rows[0];
      return json(res, 200, {
        ok: true,
        learnerId,
        preference: row ? { schemaVersion: 1, enabled: Boolean(row.enabled), contentMode: row.content_mode } : DEFAULTS,
        updatedAt: asIso(row?.updated_at)
      });
    }

    if (req.method === 'PUT') {
      const body = parseBody(req);
      const preference = normalize(body);
      if (!preference) return json(res, 400, { ok: false, error: { code: 'INVALID_LOW_BANDWIDTH_MODE', message: 'enabled must be boolean and contentMode must be auto, text, audio, or lite.' } });

      const expectedUpdatedAt = body?.expectedUpdatedAt ? asIso(body.expectedUpdatedAt) : null;
      if (body?.expectedUpdatedAt && !expectedUpdatedAt) {
        return json(res, 400, { ok: false, error: { code: 'INVALID_EXPECTED_UPDATED_AT', message: 'expectedUpdatedAt must be a valid timestamp.' } });
      }

      const current = await sql`
        SELECT enabled, content_mode, updated_at
        FROM learner_low_bandwidth_preferences
        WHERE learner_id=${learnerId}
        LIMIT 1
      `;
      const currentRow = current.rows[0];
      if (expectedUpdatedAt && currentRow && asIso(currentRow.updated_at) !== expectedUpdatedAt) {
        return json(res, 409, {
          ok: false,
          error: {
            code: 'LOW_BANDWIDTH_CONFLICT',
            message: 'A newer low-bandwidth preference exists. Reload before saving again.'
          },
          current: {
            schemaVersion: 1,
            enabled: Boolean(currentRow.enabled),
            contentMode: currentRow.content_mode,
            updatedAt: asIso(currentRow.updated_at)
          }
        });
      }

      const result = await sql`
        INSERT INTO learner_low_bandwidth_preferences(learner_id, enabled, content_mode, updated_at)
        VALUES(${learnerId}, ${preference.enabled}, ${preference.contentMode}, NOW())
        ON CONFLICT(learner_id) DO UPDATE
          SET enabled=EXCLUDED.enabled, content_mode=EXCLUDED.content_mode, updated_at=NOW()
        RETURNING enabled, content_mode, updated_at
      `;
      const row = result.rows[0];
      return json(res, 200, {
        ok: true,
        learnerId,
        preference: { schemaVersion: 1, enabled: Boolean(row.enabled), contentMode: row.content_mode },
        updatedAt: asIso(row.updated_at)
      });
    }

    return json(res, 405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'GET or PUT required.' } }, { Allow: 'GET, PUT' });
  } catch (err) {
    noStore(res);
    const status = Number(err?.status) || (err?.code === 'DATABASE_NOT_CONFIGURED' ? 503 : 500);
    return json(res, status, { ok: false, error: { code: err?.code || 'LOW_BANDWIDTH_SERVICE_FAILED', message: err?.status ? err.message : 'Low-bandwidth preference service unavailable.' } });
  }
}
