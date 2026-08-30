import { json, id, writeAudit } from './_lib/security.js';
import { requireAuth, hasRole } from './_lib/auth.js';
import { sql } from './_lib/db.js';

export const config = { runtime: 'nodejs' };
const ROLES = ['admin', 'teacher'];
const PROVIDER = /^[a-z0-9][a-z0-9._-]{1,63}$/i;
const BASE_URL = /^https:\/\/[^\s]+$/i;
const ENTITY_TYPES = new Set(['students', 'attendance', 'classes', 'results', 'teachers']);
const DIRECTIONS = new Set(['pull', 'push']);
const TEST_TIMEOUT_MS = 8000;
function allowed(session) { return ROLES.some(role => hasRole(session, role)); }
function clean(v, max = 200) { return String(v ?? '').trim().slice(0, max); }
function noStore(res) { if (typeof res?.setHeader === 'function') res.setHeader('Cache-Control', 'private, no-store, max-age=0'); }
function body(req) { if (req.body && typeof req.body === 'object') return req.body; try { return JSON.parse(req.body || '{}'); } catch { return {}; } }

function safeProviderUrl(value) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase().replace(/[\[\]]/g, '');
    if (host === 'localhost' || host.endsWith('.localhost') || host === 'metadata.google.internal' || host === 'metadata') return false;
    if (host === '0.0.0.0' || host === '::' || host === '::1' || host === '127.0.0.1') return false;
    const ipv4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipv4) {
      const octets = ipv4.slice(1).map(Number);
      if (octets.some(n => n < 0 || n > 255)) return false;
      const [a,b] = octets;
      if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return false;
    }
    return true;
  } catch { return false; }
}

async function testConnection(baseUrl, credentialRef) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);
  try {
    const headers = { Accept: 'application/json' };
    if (credentialRef) headers['X-BAA-Credential-Ref'] = credentialRef;
    const response = await fetch(baseUrl, { method: 'GET', headers, signal: controller.signal, redirect: 'manual' });
    return { ok: response.ok, httpStatus: response.status, redirected: response.status >= 300 && response.status < 400 };
  } catch (error) {
    return { ok: false, httpStatus: null, timeout: error?.name === 'AbortError' };
  } finally { clearTimeout(timer); }
}

export default async function handler(req, res) {
  noStore(res);
  try {
    const session = await requireAuth(req);
    if (!allowed(session)) return json(res, 403, { error: { code: 'FORBIDDEN', message: 'Teacher or administrator role required.' } });
    if (req.method === 'GET') {
      const rows = await sql`SELECT id, provider, base_url AS "baseUrl", status, last_sync_at AS "lastSyncAt", last_error AS "lastError", metadata, created_at AS "createdAt", updated_at AS "updatedAt" FROM erp_connections WHERE owner_user_id=${session.user_id} ORDER BY created_at DESC`;
      return json(res, 200, { ok: true, connections: rows.rows });
    }
    if (req.method === 'POST') {
      const b = body(req);
      const action = clean(b.action || req.query?.action);
      if (action === 'configure') {
        const provider = clean(b.provider).toLowerCase();
        const baseUrl = clean(b.baseUrl, 1000);
        if (!PROVIDER.test(provider)) return json(res, 400, { error: { code: 'INVALID_PROVIDER', message: 'provider must be a simple provider identifier.' } });
        if (!BASE_URL.test(baseUrl) || !safeProviderUrl(baseUrl)) return json(res, 400, { error: { code: 'INVALID_BASE_URL', message: 'baseUrl must be a public HTTPS URL.' } });
        const connectionId = clean(b.id) || id('erp');
        const credentialRef = clean(b.credentialRef, 240) || null;
        const metadata = b.metadata && typeof b.metadata === 'object' ? b.metadata : {};
        await sql`INSERT INTO erp_connections(id,owner_user_id,provider,base_url,credential_ref,status,metadata) VALUES(${connectionId},${session.user_id},${provider},${baseUrl},${credentialRef},${credentialRef ? 'configured' : 'not_configured'},${JSON.stringify(metadata)}::jsonb) ON CONFLICT(id) DO UPDATE SET provider=EXCLUDED.provider,base_url=EXCLUDED.base_url,credential_ref=EXCLUDED.credential_ref,status=EXCLUDED.status,metadata=EXCLUDED.metadata,updated_at=NOW() WHERE erp_connections.owner_user_id=${session.user_id}`;
        await writeAudit({ actorUserId: session.user_id, action: 'erp.connection.configure', entityType: 'erp_connection', entityId: connectionId, metadata: { provider, credentialConfigured: Boolean(credentialRef) } });
        return json(res, 201, { ok: true, id: connectionId, status: credentialRef ? 'configured' : 'not_configured', provider });
      }
      if (action === 'test') {
        const connectionId = clean(b.connectionId || req.query?.id);
        if (!connectionId) return json(res, 400, { error: { code: 'ERP_CONNECTION_ID_REQUIRED', message: 'connectionId/id is required.' } });
        const connection = await sql`SELECT id,provider,base_url AS "baseUrl",credential_ref AS "credentialRef" FROM erp_connections WHERE id=${connectionId} AND owner_user_id=${session.user_id} LIMIT 1`;
        if (!connection.rows.length) return json(res, 404, { error: { code: 'ERP_CONNECTION_NOT_FOUND', message: 'ERP connection not found.' } });
        if (!safeProviderUrl(connection.rows[0].baseUrl)) return json(res, 400, { error: { code: 'INVALID_BASE_URL', message: 'Stored ERP baseUrl is not an allowed public HTTPS URL.' } });
        const result = await testConnection(connection.rows[0].baseUrl, connection.rows[0].credentialRef);
        const status = result.ok ? 'configured' : 'error';
        await sql`UPDATE erp_connections SET status=${status},last_error=${result.ok ? null : (result.redirected ? 'ERP_PROVIDER_REDIRECT_BLOCKED' : result.timeout ? 'ERP_PROVIDER_TIMEOUT' : 'ERP_PROVIDER_UNREACHABLE')},updated_at=NOW() WHERE id=${connectionId} AND owner_user_id=${session.user_id}`;
        await writeAudit({ actorUserId: session.user_id, action: 'erp.connection.test', entityType: 'erp_connection', entityId: connectionId, metadata: { provider: connection.rows[0].provider, ok: result.ok, httpStatus: result.httpStatus, timeout: Boolean(result.timeout), redirectBlocked: Boolean(result.redirected) } });
        if (!result.ok) return json(res, 502, { ok: false, error: { code: result.redirected ? 'ERP_PROVIDER_REDIRECT_BLOCKED' : result.timeout ? 'ERP_PROVIDER_TIMEOUT' : 'ERP_PROVIDER_UNREACHABLE', message: result.redirected ? 'ERP provider redirected the connection test; redirects are blocked for security.' : result.timeout ? 'ERP provider connection timed out.' : `ERP provider did not accept the connection test${result.httpStatus ? ` (HTTP ${result.httpStatus})` : ''}.` } });
        return json(res, 200, { ok: true, connectionId, provider: connection.rows[0].provider, reachable: true, httpStatus: result.httpStatus });
      }
      if (action === 'sync') {
        const connectionId = clean(b.connectionId || req.query?.id);
        const direction = clean(b.direction || 'pull').toLowerCase();
        const entityType = clean(b.entityType || 'students').toLowerCase();
        if (!connectionId || !DIRECTIONS.has(direction) || !ENTITY_TYPES.has(entityType)) return json(res, 400, { error: { code: 'INVALID_SYNC_REQUEST', message: 'connectionId/id, valid direction and valid entityType are required.' } });
        const connection = await sql`SELECT id,provider,status FROM erp_connections WHERE id=${connectionId} AND owner_user_id=${session.user_id} LIMIT 1`;
        if (!connection.rows.length) return json(res, 404, { error: { code: 'ERP_CONNECTION_NOT_FOUND', message: 'ERP connection not found.' } });
        const runId = id('erpsync');
        await sql`INSERT INTO erp_sync_runs(id,connection_id,direction,entity_type,status,error_message) VALUES(${runId},${connectionId},${direction},${entityType},'failed','EXTERNAL_PROVIDER_REQUIRED: vendor credentials and provider adapter are required for live ERP synchronization.')`;
        await sql`UPDATE erp_connections SET status=CASE WHEN credential_ref IS NULL THEN 'not_configured' ELSE 'error' END,last_error='EXTERNAL_PROVIDER_REQUIRED',updated_at=NOW() WHERE id=${connectionId}`;
        await writeAudit({ actorUserId: session.user_id, action: 'erp.sync.request', entityType: 'erp_sync_run', entityId: runId, metadata: { connectionId, direction, entityType } });
        return json(res, 202, { ok: true, runId, status: 'failed', error: { code: 'EXTERNAL_PROVIDER_REQUIRED', message: 'The ERP boundary is wired, but a live vendor adapter and credentials are required before records can be synchronized.' } });
      }
      return json(res, 400, { error: { code: 'INVALID_ACTION', message: 'Supported actions: configure, test, sync.' } });
    }
    return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'GET or POST required.' } }, { Allow: 'GET, POST' });
  } catch (e) {
    return json(res, e.status || 500, { error: { code: e.code || 'ERP_FAILED', message: e.status ? e.message : 'Unable to process ERP integration.' } });
  }
}
