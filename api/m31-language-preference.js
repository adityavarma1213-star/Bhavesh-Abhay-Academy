// BAA M31 — authenticated learner Tutor response-language preference.
// The server validates the same bounded language catalogue used by the UI.
import { sql, withTransaction } from './_lib/db.js';
import { json } from './_lib/security.js';
import { requireAuth, requireLearnerAccess } from './_lib/auth.js';

export const config = { runtime: 'nodejs' };
const LANGUAGES = new Set(['en','hi','mr','gu','bn','ta','te','kn']);

function noStore(res) { res.setHeader('Cache-Control', 'private, no-store, max-age=0'); }
function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}
function iso(value) { return value ? new Date(value).toISOString() : null; }

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
        ok:true, learnerId,
        preference:{ schemaVersion:1, code: row?.language_code || 'en' },
        updatedAt: iso(row?.updated_at)
      });
    }

    if (req.method === 'PUT') {
      const payload = body(req) || {};
      const code = String(payload.code || '').trim().toLowerCase();
      if (!LANGUAGES.has(code)) {
        return json(res, 400, { ok:false, error:{ code:'INVALID_LANGUAGE', message:'Unsupported Tutor response language.' } });
      }
      const expectedRaw = payload.expectedUpdatedAt;
      const expected = expectedRaw == null ? null : String(expectedRaw).trim();
      if (expected && Number.isNaN(Date.parse(expected))) {
        return json(res, 400, { ok:false, error:{ code:'INVALID_VERSION', message:'expectedUpdatedAt must be a valid timestamp.' } });
      }

      const result = await withTransaction(async tx => {
        const current = await tx`
          SELECT language_code, updated_at
          FROM learner_language_preferences
          WHERE learner_id=${learnerId}
          FOR UPDATE
        `;
        const row = current[0];
        const currentUpdatedAt = iso(row?.updated_at);
        if (expected && currentUpdatedAt && expected !== currentUpdatedAt) {
          return { conflict:true, current:{ code:row.language_code, updatedAt:currentUpdatedAt } };
        }
        if (expected && !currentUpdatedAt) {
          return { conflict:true, current:null };
        }
        const saved = await tx`
          INSERT INTO learner_language_preferences(learner_id, language_code, updated_at)
          VALUES(${learnerId}, ${code}, NOW())
          ON CONFLICT(learner_id) DO UPDATE
            SET language_code=EXCLUDED.language_code, updated_at=NOW()
          RETURNING language_code, updated_at
        `;
        const savedRow = saved[0];
        return { conflict:false, row:savedRow };
      });

      if (result.conflict) {
        return json(res, 409, {
          ok:false,
          error:{ code:'LANGUAGE_PREFERENCE_CONFLICT', message:'Language preference changed elsewhere. Refresh before saving again.' },
          current: result.current
        });
      }
      return json(res, 200, {
        ok:true, learnerId,
        preference:{ schemaVersion:1, code:result.row.language_code },
        updatedAt:iso(result.row.updated_at)
      });
    }

    return json(res, 405, { ok:false, error:{ code:'METHOD_NOT_ALLOWED', message:'GET or PUT required.' } }, { Allow:'GET, PUT' });
  } catch (err) {
    noStore(res);
    const status = Number(err?.status) || (err?.code === 'DATABASE_NOT_CONFIGURED' ? 503 : 500);
    return json(res, status, { ok:false, error:{ code:err?.code || 'LANGUAGE_PREFERENCE_FAILED', message:err?.status ? err.message : 'Language preference service unavailable.' } });
  }
}
