// BAA G4/G6 security helpers: password hashing, session tokens, headers and audit.
import crypto from 'node:crypto';
import { sql } from './db.js';

const PASSWORD_ITERATIONS = 310000;
const PASSWORD_KEYLEN = 32;
const PASSWORD_DIGEST = 'sha256';

export function id(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`;
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(String(password), salt, PASSWORD_ITERATIONS, PASSWORD_KEYLEN, PASSWORD_DIGEST).toString('hex');
  return `pbkdf2-${PASSWORD_DIGEST}-${PASSWORD_ITERATIONS}$${salt}$${hash}`;
}

export function verifyPassword(password, encoded) {
  try {
    const [meta, salt, expected] = String(encoded).split('$');
    if (!meta || !salt || !expected) return false;
    const iterations = Number(meta.split('-').pop());
    const actual = crypto.pbkdf2Sync(String(password), salt, iterations, PASSWORD_KEYLEN, PASSWORD_DIGEST);
    const expectedBuf = Buffer.from(expected, 'hex');
    return expectedBuf.length === actual.length && crypto.timingSafeEqual(expectedBuf, actual);
  } catch { return false; }
}

export function randomToken() { return crypto.randomBytes(32).toString('base64url'); }
export function hashToken(token) { return crypto.createHash('sha256').update(String(token)).digest('hex'); }

export function securityHeaders(extra={}) {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    ...extra,
  };
}

export function json(res, status, body, extra={}) {
  return res.status(status).set(securityHeaders(extra)).json(body);
}

export function cookie(name, value, options={}) {
  const parts=[`${name}=${value}`,'Path=/','HttpOnly','Secure','SameSite=Lax'];
  if (options.maxAge != null) parts.push(`Max-Age=${Math.max(0,Math.floor(options.maxAge))}`);
  if (options.expires) parts.push(`Expires=${new Date(options.expires).toUTCString()}`);
  return parts.join('; ');
}

export async function writeAudit({actorUserId=null, action, entityType, entityId, metadata={}}) {
  if (!process.env.POSTGRES_URL && !process.env.POSTGRES_URL_NON_POOLING) return;
  await sql`INSERT INTO audit_log (id, actor_user_id, action, entity_type, entity_id, metadata, created_at)
            VALUES (${id('audit')}, ${actorUserId}, ${action}, ${entityType}, ${entityId}, ${JSON.stringify(metadata)}, NOW())`;
}

export function clientIp(req) {
  const forwarded=String(req.headers['x-forwarded-for']||'').split(',')[0].trim();
  return forwarded || String(req.headers['x-real-ip']||'unknown');
}
