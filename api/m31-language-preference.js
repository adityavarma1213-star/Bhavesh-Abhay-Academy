// BAA M31 — authenticated learner Tutor response-language preference.
// The server validates the same bounded language catalogue used by the UI.
import { sql } from './_lib/db.js';
import { json } from './_lib/security.js';
import { requireAuth, requireLearnerAccess } from './_lib/auth.js';

export const config = { runtime: 'nodejs' };
const LANGUAGES = new Set(['en','hi','mr','gu','bn','ta','te','kn']);

function noStore(res) { res.setHeader('Cache-Control', 'private, no-store, max-age=0'); }
function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}
function iso(value) {
  return value ? new Date(value).toISOString() : null;
}

export default async function handler(req, res) {
  noStore(res);
  try {
    const session = await requireAuth(req);
    const learnerId = String(req.query?.learnerId || '').trim();
    if (!learnerId) return json(res, 400, { ok:false, error:{ code:'LEARNER_ID_REQUIRED', message:'learnerId is required.' } });
    await requireLearnerAccess(session, learnerId);

    if (req.method === 'GET') {
      const result = await sql`
        SELECT language_code, updated_at
        FROM learner_language_preferences
        WHERE learner_id=${learnerId}
        LIMIT 1
      `;
      const row = result.rows[0];
      return json(res, 200, {
        ok:true,
        learnerId,
        preference:{ schemaVersion:1, code: row?.language_code || 'en' },
        updatedAt: iso(row?.updated_at)
      });
    }

    if (req.method === 'PUT') {
      const code = String(body(req)?.code || '').trim().toLowerCase();
      if (!LANGUAGES.has(code)) {
        return json(res, 400, { ok:false, error:{ code:'INVALID_LANGUAGE', message:'Unsupported Tutor response language.' } });
      }
      const result = await sql`
        INSERT INTO learner_language_preferences(learner_id, language_code, updated_at)
        VALUES(${learnerId}, ${code}, NOW())
        ON CONFLICT(learner_id) DO UPDATE
          SET language_code=EXCLUDED.language_code, updated_at=NOW()
        RETURNING language_code, updated_at
      `;
      const row = result.rows[0];
      return json(res, 200, {
        ok:true,
        learnerId,
        preference:{ schemaVersion:1, code:row.language_code },
        updatedAt:iso(row.updated_at)
      });
    }

    return json(res, 405, { ok:false, error:{ code:'METHOD_NOT_ALLOWED', message:'GET or PUT required.' } }, { Allow:'GET, PUT' });
  } catch (err) {
    noStore(res);
    const status = Number(err?.status) || (err?.code === 'DATABASE_NOT_CONFIGURED' ? 503 : 500);
    return json(res, status, { ok:false, error:{ code:err?.code || 'LANGUAGE_PREFERENCE_FAILED', message:err?.status ? err.message : 'Language preference service unavailable.' } });
  }
}
