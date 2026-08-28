// BAA M55 — server-side Student Data Trust / Fresh-Start controls.
// Permanent learner-data deletion is explicit, authenticated, audited and
// transactional. Local browser reset remains available in baa-fresh-start.js.
import { requireAuth, hasRole } from './_lib/auth.js';
import { json, id } from './_lib/security.js';
import { sql, withTransaction } from './_lib/db.js';

export const config = { runtime: 'nodejs' };

function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}

function noStore(res) {
  if (typeof res?.setHeader === 'function') res.setHeader('Cache-Control', 'private, no-store, max-age=0');
}

async function resolveLearner(session, requestedId) {
  if (hasRole(session, 'student')) {
    const own = await sql`SELECT id, user_id FROM learners WHERE user_id=${session.user_id} AND deactivated_at IS NULL LIMIT 1`;
    if (!own.rows.length) {
      const err = new Error('No active learner profile is linked to this account.'); err.status = 404; err.code = 'LEARNER_NOT_FOUND'; throw err;
    }
    if (requestedId && requestedId !== own.rows[0].id && !hasRole(session, 'admin')) {
      const err = new Error('You can only delete your own learner data.'); err.status = 403; err.code = 'LEARNER_FORBIDDEN'; throw err;
    }
    return own.rows[0];
  }
  if (hasRole(session, 'admin') && requestedId) {
    const result = await sql`SELECT id, user_id FROM learners WHERE id=${requestedId} AND deactivated_at IS NULL LIMIT 1`;
    if (!result.rows.length) {
      const err = new Error('Learner not found.'); err.status = 404; err.code = 'LEARNER_NOT_FOUND'; throw err;
    }
    return result.rows[0];
  }
  const err = new Error('Student or admin authorization is required.'); err.status = 403; err.code = 'ROLE_FORBIDDEN'; throw err;
}

export default async function handler(req, res) {
  noStore(res);
  try {
    const session = await requireAuth(req);
    if (req.method === 'GET') {
      const learner = await resolveLearner(session, String(req.query?.learnerId || '').trim() || null);
      return json(res, 200, { ok: true, learnerId: learner.id, destructiveDeletionAvailable: true, confirmationRequired: true });
    }
    if (req.method !== 'POST') return json(res, 405, { ok:false, error:{code:'METHOD_NOT_ALLOWED',message:'Use GET or POST.'} });
    const input = body(req);
    if (input.action !== 'delete') return json(res, 400, { ok:false, error:{code:'INVALID_ACTION',message:'Use action=delete.'} });
    if (input.confirm !== true) return json(res, 400, { ok:false, error:{code:'DELETE_CONFIRMATION_REQUIRED',message:'Explicit confirmation is required before permanent learner-data deletion.'} });

    const learner = await resolveLearner(session, String(input.learnerId || '').trim() || null);
    const deletedAt = new Date().toISOString();
    const auditId = id('audit');

    await withTransaction(async tx => {
      await tx`INSERT INTO audit_log (id, actor_user_id, action, entity_type, entity_id, metadata, created_at)
               VALUES (${auditId}, ${session.user_id}, 'student_data_delete', 'learner', ${learner.id},
                       ${JSON.stringify({ scope:'learner_cascade', requestedByRole:session.roles, deletedAt })}, NOW())`;
      await tx`DELETE FROM learners WHERE id=${learner.id}`;
      if (learner.user_id === session.user_id) {
        await tx`DELETE FROM users WHERE id=${session.user_id}`;
      }
    });

    return json(res, 200, { ok:true, deleted:true, learnerId:learner.id, accountDeleted:learner.user_id === session.user_id });
  } catch (err) {
    const status = Number(err?.status) || (err?.code === 'DATABASE_NOT_CONFIGURED' ? 503 : 500);
    return json(res, status, { ok:false, error:{code:err?.code || 'SERVER_ERROR',message:err?.message || 'Unable to process the data-trust request.'} });
  }
}
