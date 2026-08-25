import { json, id, writeAudit } from './_lib/security.js';
import { requireAuth, hasRole } from './_lib/auth.js';
import { sql } from './_lib/db.js';

export const config = { runtime: 'nodejs' };
const ROLES = ['admin', 'teacher'];
const PROVIDER = /^[a-z0-9][a-z0-9._-]{1,63}$/i;
const BASE_URL = /^https:\/\/[^\s]+$/i;

function allowed(session) { return ROLES.some(role => hasRole(session, role)); }
function clean(v, max = 200) { return String(v ?? '').trim().slice(0, max); }

export default async function handler(req, res) {
  try {
    const session = await requireAuth(req);
    if (!allowed(session)) return json(res, 403, { error: { code: 'FORBIDDEN', message: 'Teacher or administrator role required.' } });

    if (req.method === 'GET') {
      const rows = await sql`SELECT id, provider, base_url AS "baseUrl", status, last_sync_at AS "lastSyncAt", last_error AS "lastError", metadata, created_at AS "createdAt", updated_at AS "updatedAt" FROM erp_connections WHERE owner_user_id=${session.user_id} ORDER BY created_at DESC`;
      return json(res, 200, { ok: true, connections: rows.rows });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const action = clean(body.action);
      if (action === 'configure') {
        const provider = clean(body.provider).toLowerCase();
        const baseUrl = clean(body.baseUrl, 1000);
        if (!PROVIDER.test(provider)) return json(res, 400, { error: { code: 'INVALID_PROVIDER', message: 'provider must be a simple provider identifier.' } });
        if (!BASE_URL.test(baseUrl)) return json(res, 400, { error: { code: 'INVALID_BASE_URL', message: 'baseUrl must be an HTTPS URL.' } });
        const connectionId = clean(body.id) || id('erp');
        const credentialRef = clean(body.credentialRef, 240) || null;
        const metadata = body.metadata && typeof body.metadata === 'object' ? body.metadata : {};
        await sql`INSERT INTO erp_connections(id,owner_user_id,provider,base_url,credential_ref,status,metadata) VALUES(${connectionId},${session.user_id},${provider},${baseUrl},${credentialRef},${credentialRef ? 'configured' : 'not_configured'},${JSON.stringify(metadata)}::jsonb) ON CONFLICT(id) DO UPDATE SET provider=EXCLUDED.provider,base_url=EXCLUDED.base_url,credential_ref=EXCLUDED.credential_ref,status=EXCLUDED.status,metadata=EXCLUDED.metadata,updated_at=NOW() WHERE erp_connections.owner_user_id=${session.user_id}`;
        await writeAudit({ actorUserId: session.user_id, action: 'erp.connection.configure', entityType: 'erp_connection', entityId: connectionId, metadata: { provider } });
        return json(res, 201, { ok: true, id: connectionId, status: credentialRef ? 'configured' : 'not_configured', provider });
      }
      if (action === 'sync') {
        const connectionId = clean(body.connectionId);
        const entityType = clean(body.entityType || 'students').toLowerCase();
        if (!connectionId) return json(res, 400, { error: { code: 'INVALID_CONNECTION', message: 'connectionId is required.' } });
        const connection = await sql`SELECT id,provider,status FROM erp_connections WHERE id=${connectionId} AND owner_user_id=${session.user_id} LIMIT 1`;
        if (!connection.rows.length) return json(res, 404, { error: { code: 'ERP_CONNECTION_NOT_FOUND', message: 'ERP connection not found.' } });
        const runId = id('erpsync');
        await sql`INSERT INTO erp_sync_runs(id,connection_id,direction,entity_type,status,error_message) VALUES(${runId},${connectionId},'pull',${entityType},'failed','EXTERNAL_PROVIDER_REQUIRED: vendor credentials and provider adapter are required for live ERP synchronization.')`;
        await sql`UPDATE erp_connections SET status=CASE WHEN credential_ref IS NULL THEN 'not_configured' ELSE 'error' END,last_error='EXTERNAL_PROVIDER_REQUIRED',updated_at=NOW() WHERE id=${connectionId}`;
        await writeAudit({ actorUserId: session.user_id, action: 'erp.sync.request', entityType: 'erp_sync_run', entityId: runId, metadata: { connectionId, entityType } });
        return json(res, 202, { ok: true, runId, status: 'failed', error: { code: 'EXTERNAL_PROVIDER_REQUIRED', message: 'The ERP boundary is wired, but a live vendor adapter and credentials are required before records can be synchronized.' } });
      }
      return json(res, 400, { error: { code: 'INVALID_ACTION', message: 'Supported actions: configure, sync.' } });
    }
    return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'GET or POST required.' } }, { Allow: 'GET, POST' });
  } catch (e) {
    return json(res, e.status || 500, { error: { code: e.code || 'ERP_FAILED', message: e.status ? e.message : 'Unable to process ERP integration.' } });
  }
}
