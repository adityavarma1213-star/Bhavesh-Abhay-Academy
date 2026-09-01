import { json, writeAudit } from './_lib/security.js';
import { requireAuth } from './_lib/auth.js';
import { sql } from './_lib/db.js';

export const config = { runtime: 'nodejs' };
const noStore = { 'Cache-Control': 'private, no-store, max-age=0' };
const clean = (value, max) => String(value ?? '').trim().slice(0, max);

function clampLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 100;
  return Math.min(Math.max(Math.floor(parsed), 1), 100);
}

function readCursor(query) {
  const createdAt = clean(query?.cursorCreatedAt, 80);
  const id = clean(query?.cursorId, 80);
  if (!createdAt && !id) return null;
  if (!createdAt || !id) {
    const error = new Error('cursorCreatedAt and cursorId are both required.');
    error.status = 400;
    error.code = 'INVALID_CURSOR';
    throw error;
  }
  const parsed = new Date(createdAt);
  if (Number.isNaN(parsed.getTime())) {
    const error = new Error('cursorCreatedAt must be a valid timestamp.');
    error.status = 400;
    error.code = 'INVALID_CURSOR';
    throw error;
  }
  return { createdAt: parsed.toISOString(), id };
}

async function requireModerator(req) {
  const session = await requireAuth(req);
  const roles = Array.isArray(session.roles) ? session.roles : [];
  if (!roles.includes('teacher') && !roles.includes('admin')) {
    const error = new Error('Community moderation requires teacher or admin access.');
    error.status = 403;
    error.code = 'MODERATOR_ROLE_REQUIRED';
    throw error;
  }
  return session;
}

export default async function handler(req, res) {
  try {
    const session = await requireModerator(req);
    if (req.method === 'GET') {
      const limit = clampLimit(req.query?.limit);
      const cursor = readCursor(req.query);
      const result = cursor
        ? await sql`
            SELECT r.id, r.post_id AS "postId", r.reported_text AS "reportedText",
                   r.reason, r.status, r.created_at AS "createdAt",
                   r.reviewed_at AS "reviewedAt", r.reviewed_by_user_id AS "reviewedByUserId"
            FROM community_reports r
            WHERE r.status = 'open'
              AND (r.created_at, r.id) > (${cursor.createdAt}::timestamptz, ${cursor.id})
            ORDER BY r.created_at ASC, r.id ASC
            LIMIT ${limit + 1}
          `
        : await sql`
            SELECT r.id, r.post_id AS "postId", r.reported_text AS "reportedText",
                   r.reason, r.status, r.created_at AS "createdAt",
                   r.reviewed_at AS "reviewedAt", r.reviewed_by_user_id AS "reviewedByUserId"
            FROM community_reports r
            WHERE r.status = 'open'
            ORDER BY r.created_at ASC, r.id ASC
            LIMIT ${limit + 1}
          `;
      const rows = result.rows || [];
      const hasMore = rows.length > limit;
      const reports = hasMore ? rows.slice(0, limit) : rows;
      const last = reports[reports.length - 1];
      const nextCursor = hasMore && last
        ? { cursorCreatedAt: new Date(last.createdAt).toISOString(), cursorId: last.id }
        : null;
      return json(res, 200, { ok: true, reports, nextCursor }, noStore);
    }
    if (req.method !== 'PATCH') {
      return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'GET or PATCH required.' } }, { Allow: 'GET, PATCH', ...noStore });
    }
    const reportId = clean(req.body?.reportId, 80);
    const status = clean(req.body?.status, 20).toLowerCase();
    if (!reportId || !['reviewed', 'dismissed'].includes(status)) {
      return json(res, 422, { error: { code: 'INVALID_MODERATION_ACTION', message: 'reportId and reviewed/dismissed status are required.' } }, noStore);
    }

    const report = await sql`
      SELECT id, post_id AS "postId", status
      FROM community_reports
      WHERE id = ${reportId}
      LIMIT 1
    `;
    if (!report.rows.length) return json(res, 404, { error: { code: 'REPORT_NOT_FOUND', message: 'Community report was not found.' } }, noStore);
    if (report.rows[0].status !== 'open') return json(res, 409, { error: { code: 'REPORT_ALREADY_REVIEWED', message: 'Community report is already closed.' } }, noStore);

    const updated = await sql`
      UPDATE community_reports
      SET status = ${status}, reviewed_at = NOW(), reviewed_by_user_id = ${session.user_id}
      WHERE id = ${reportId}
      RETURNING id, post_id AS "postId", reason, status, reviewed_at AS "reviewedAt", reviewed_by_user_id AS "reviewedByUserId"
    `;

    const postId = report.rows[0].postId;
    if (status === 'reviewed' && postId) {
      await sql`UPDATE community_posts SET status='hidden', updated_at=NOW() WHERE id=${postId}`;
    }
    await writeAudit({
      actorUserId: session.user_id,
      action: status === 'reviewed' ? 'COMMUNITY_POST_MODERATED' : 'COMMUNITY_REPORT_DISMISSED',
      entityType: 'community_report',
      entityId: reportId,
      metadata: { postId, status },
    });
    return json(res, 200, { ok: true, report: updated.rows[0], postHidden: status === 'reviewed' && Boolean(postId) }, noStore);
  } catch (error) {
    return json(res, error.status || 500, {
      error: { code: error.code || 'COMMUNITY_MODERATION_FAILED', message: error.status ? error.message : 'Unable to process community moderation.' }
    }, noStore);
  }
}
