import { json, id, writeAudit } from './_lib/security.js';
import { requireAuth, hasRole } from './_lib/auth.js';
import { sql } from './_lib/db.js';
import { lookup } from 'node:dns/promises';
import net from 'node:net';

export const config = { runtime: 'nodejs' };
const ROLES = ['admin', 'teacher'];
const PROVIDER = /^[a-z0-9][a-z0-9._-]{1,63}$/i;
const BASE_URL = /^https:\/\/[^\s]+$/i;
const ENTITY_TYPES = new Set(['students', 'attendance', 'classes', 'results', 'teachers']);
const DIRECTIONS = new Set(['pull', 'push']);
const TEST_TIMEOUT_MS = 8000;
const MAX_METADATA_BYTES = 16 * 1024;
function allowed(session) { return ROLES.some(role => hasRole(session, role)); }
function clean(v, max = 200) {
  if (v == null) return '';
  const value = String(v).trim();
  if (value.length > max) {
    const error = new Error(`Value must be at most ${max} characters.`);
    error.status = 400;
    error.code = 'VALUE_TOO_LONG';
    throw error;
  }
  return value;
}
function noStore(res) { if (typeof res?.setHeader === 'function') res.setHeader('Cache-Control', 'private, no-store, max-age=0'); }
function body(req) { if (req.body && typeof req.body === 'object') return req.body; try { return JSON.parse(req.body || '{}'); } catch { return {}; } }
function boundedMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  try {
    const serialized = JSON.stringify(value);
    const byteLength = typeof TextEncoder === 'function' ? new TextEncoder().encode(serialized).byteLength : Buffer.byteLength(serialized, 'utf8');
    if (byteLength > MAX_METADATA_BYTES) return null;
    return JSON.parse(serialized);
  } catch { return null; }
}

function isPrivateIpv4(host) {
  const octets = host.split('.').map(Number);
  if (octets.length !== 4 || octets.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a,b] = octets;
  return a === 0 || a === 10 || (a === 100 && b >= 64 && b <= 127) || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}
function ipv6ToBigInt(value) {
  const clean = value.split('%')[0].toLowerCase();
  const parts = clean.split('::');
  if (parts.length > 2) return null;
  const left = parts[0] ? parts[0].split(':') : [];
  const right = parts.length === 2 && parts[1] ? parts[1].split(':') : [];
  if (left.some(x => !x || !/^[0-9a-f]{1,4}$/.test(x)) || right.some(x => !x || !/^[0-9a-f]{1,4}$/.test(x))) return null;
  const missing = 8 - left.length - right.length;
  if ((parts.length === 1 && missing !== 0) || (parts.length === 2 && missing < 1)) return null;
  const words = [...left, ...Array(Math.max(0, missing)).fill('0'), ...right];
  if (words.length !== 8) return null;
  return words.reduce((n, w) => (n << 16n) + BigInt(parseInt(w, 16)), 0n);
}
function isPrivateIp(address) {
  if (net.isIPv4(address)) return isPrivateIpv4(address);
  if (!net.isIPv6(address)) return true;
  const mapped = address.toLowerCase().replace(/^::ffff:/, '');
  if (net.isIPv4(mapped)) return isPrivateIpv4(mapped);
  const n = ipv6ToBigInt(address);
  if (n === null) return true;
  const top7 = n >> 121n;
  const top10 = n >> 118n;
  const top64 = n >> 64n;
  return n === 0n || n === 1n || top7 === 0b1111110n || top7 === 0b1111111n || top10 === 0b1111111010n || top64 === 0n;
}
async function resolvesToPublicDnsHost(hostname) {
  if (net.isIP(hostname)) return !isPrivateIp(hostname);
  try {
    const answers = await lookup(hostname, { all: true, verbatim: true });
    if (!answers.length) return false;
    return answers.every(answer => !isPrivateIp(answer.address));
  } catch { return false; }
}
function safeProviderUrl(value) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase().replace(/[\[\]]/g, '');
    if (net.isIP(host)) return false;
    if (host === 'localhost' || host.endsWith('.localhost') || host === 'metadata.google.internal' || host === 'metadata') return false;
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
        if (!BASE_URL.test(baseUrl) || !safeProviderUrl(baseUrl)) return json(res, 400, { error: { code: 'INVALID_BASE_URL', message: 'baseUrl must be a public HTTPS DNS URL.' } });
        if (!(await resolvesToPublicDnsHost(new URL(baseUrl).hostname))) return json(res, 400, { error: { code: 'INVALID_BASE_URL', message: 'baseUrl hostname must resolve exclusively to public addresses.' } });
        const connectionId = clean(b.id) || id('erp');
        const credentialRef = clean(b.credentialRef, 240) || null;
        const metadata = boundedMetadata(b.metadata);
        if (metadata === null) return json(res, 400, { error: { code: 'INVALID_METADATA', message: 'metadata must be a JSON object no larger than 16 KiB.' } });
        await sql`INSERT INTO erp_connections(id,owner_user_id,provider,base_url,credential_ref,status,metadata) VALUES(${connectionId},${session.user_id},${provider},${baseUrl},${credentialRef},${credentialRef ? 'configured' : 'not_configured'},${JSON.stringify(metadata)}::jsonb) ON CONFLICT(id) DO UPDATE SET provider=EXCLUDED.provider,base_url=EXCLUDED.base_url,credential_ref=EXCLUDED.credential_ref,status=EXCLUDED.status,metadata=EXCLUDED.metadata,updated_at=NOW() WHERE erp_connections.owner_user_id=${session.user_id}`;
        await writeAudit({ actorUserId: session.user_id, action: 'erp.connection.configure', entityType: 'erp_connection', entityId: connectionId, metadata: { provider, credentialConfigured: Boolean(credentialRef) } });
        return json(res, 201, { ok: true, id: connectionId, status: credentialRef ? 'configured' : 'not_configured', provider });
      }
      if (action === 'test') {
        const connectionId = clean(b.connectionId || req.query?.id);
        if (!connectionId) return json(res, 400, { error: { code: 'ERP_CONNECTION_ID_REQUIRED', message: 'connectionId/id is required.' } });
        const connection = await sql`SELECT id,provider,base_url AS "baseUrl",credential_ref AS "credentialRef" FROM erp_connections WHERE id=${connectionId} AND owner_user_id=${session.user_id} LIMIT 1`;
        if (!connection.rows.length) return json(res, 404, { error: { code: 'ERP_CONNECTION_NOT_FOUND', message: 'ERP connection not found.' } });
        if (!safeProviderUrl(connection.rows[0].baseUrl) || !(await resolvesToPublicDnsHost(new URL(connection.rows[0].baseUrl).hostname))) return json(res, 400, { error: { code: 'INVALID_BASE_URL', message: 'Stored ERP baseUrl must use a public HTTPS DNS hostname.' } });
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
