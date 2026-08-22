// BAA G4 server-enforced authentication + authorization.
import { sql } from './db.js';
import { hashToken, clientIp } from './security.js';

export async function currentSession(req) {
  const auth=String(req.headers.authorization||'');
  const bearer=auth.startsWith('Bearer ')?auth.slice(7).trim():null;
  const cookieHeader=String(req.headers.cookie||'');
  const cookieMatch=cookieHeader.match(/(?:^|;\s*)baa_session=([^;]+)/);
  const rawToken=bearer || (cookieMatch ? decodeURIComponent(cookieMatch[1]) : null);
  if (!rawToken) return null;
  const tokenHash=hashToken(rawToken);
  const result=await sql`SELECT s.id AS session_id,s.user_id,s.expires_at,u.display_name,u.email,
                                  COALESCE(array_agg(ur.role) FILTER (WHERE ur.role IS NOT NULL),'{}') AS roles
                           FROM auth_sessions s
                           JOIN users u ON u.id=s.user_id
                           LEFT JOIN user_roles ur ON ur.user_id=u.id
                           WHERE s.token_hash=${tokenHash}
                             AND s.revoked_at IS NULL
                             AND s.expires_at > NOW()
                             AND u.deactivated_at IS NULL
                           GROUP BY s.id,u.id`;
  // db.js wraps postgres.js results as { rows: [...] }.
  const rows = Array.isArray(result?.rows) ? result.rows : [];
  if (!rows.length) return null;
  return {...rows[0], tokenHash, ip:clientIp(req)};
}

export async function requireAuth(req) {
  const session=await currentSession(req);
  if (!session) {
    const err=new Error('Authentication required.'); err.status=401; err.code='AUTH_REQUIRED'; throw err;
  }
  return session;
}

export function hasRole(session, role) { return session.roles.includes(role); }

export async function canAccessLearner(session, learnerId) {
  if (!learnerId) return false;
  if (hasRole(session,'admin')) return true;
  if (session.roles.includes('student')) {
    const r=await sql`SELECT 1 FROM learners WHERE id=${learnerId} AND user_id=${session.user_id} AND deactivated_at IS NULL LIMIT 1`;
    if (r.rows.length) return true;
  }
  if (session.roles.includes('parent')) {
    const r=await sql`SELECT 1 FROM parent_learner WHERE parent_user_id=${session.user_id} AND learner_id=${learnerId} AND status='active' LIMIT 1`;
    if (r.rows.length) return true;
  }
  if (session.roles.includes('teacher')) {
    const r=await sql`SELECT 1 FROM teacher_learner WHERE teacher_user_id=${session.user_id} AND learner_id=${learnerId} AND status='active' LIMIT 1`;
    if (r.rows.length) return true;
  }
  return false;
}

export async function requireLearnerAccess(session, learnerId) {
  if (!(await canAccessLearner(session, learnerId))) {
    const err=new Error('You are not authorized to access this learner.'); err.status=403; err.code='LEARNER_FORBIDDEN'; throw err;
  }
}
