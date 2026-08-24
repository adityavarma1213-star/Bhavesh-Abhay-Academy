// BAA M55 — server-side account deletion endpoint.
// Authentication is server-authoritative; the client cannot choose which
// account is deleted. The database function performs the destructive work
// atomically and cascades learner-owned data through the canonical schema.
import { requireAuth } from '../_lib/auth.js';
import { sql } from '../_lib/db.js';
import { json, writeAudit } from '../_lib/security.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if (req.method !== 'DELETE' && req.method !== 'POST') {
    return json(res, 405, {
      error: { code: 'METHOD_NOT_ALLOWED', message: 'DELETE or POST required.' }
    }, { Allow: 'DELETE, POST' });
  }

  try {
    const session = await requireAuth(req);
    const confirmation = String(req.body?.confirmation || '').trim().toUpperCase();
    if (confirmation !== 'DELETE MY ACCOUNT') {
      return json(res, 400, {
        error: {
          code: 'DELETE_CONFIRMATION_REQUIRED',
          message: 'Type DELETE MY ACCOUNT to confirm permanent account deletion.'
        }
      });
    }

    const result = await sql`SELECT baa_delete_user_account(${session.user_id}) AS deletion`;
    const deletion = result.rows[0]?.deletion;
    if (!deletion?.deleted) {
      return json(res, 500, {
        error: { code: 'ACCOUNT_DELETE_FAILED', message: 'Account deletion did not complete.' }
      });
    }

    try {
      await writeAudit({
        actorUserId: null,
        action: 'account.delete.completed',
        entityType: 'user_account_deletion',
        entityId: session.user_id,
        metadata: { learnerCount: Number(deletion.learnerCount || 0) }
      });
    } catch (_) {
      // Deletion has already committed; never block it on audit output.
    }

    res.setHeader('Set-Cookie', 'baa_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
    return json(res, 200, {
      ok: true,
      deleted: true,
      learnerCount: Number(deletion.learnerCount || 0),
      message: 'The authenticated account and its learner-owned server data were deleted.'
    });
  } catch (e) {
    const status = e.status || (e.code === 'DATABASE_NOT_CONFIGURED' ? 503 : 500);
    return json(res, status, {
      error: {
        code: e.code || 'ACCOUNT_DELETE_FAILED',
        message: e.status ? e.message : 'Unable to complete account deletion.'
      }
    });
  }
}
