import { json, writeAudit } from './_lib/security.js';
import { requireAuth } from './_lib/auth.js';
import { sql } from './_lib/db.js';

export const config = { runtime: 'nodejs' };
const noStore = { 'Cache-Control': 'private, no-store, max-age=0' };
const REASONS = new Set(['safety','harassment','spam','other']);
const clean = (value, max) => String(value ?? '').trim().slice(0, max);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'POST required.' } }, { Allow: 'POST', ...noStore });
  }
  try {
    const session = await requireAuth(req);
    const postId = clean(req.body?.postId, 160) || null;
    const reportedText = clean(req.body?.reportedText, 4000);
    const reason = clean(req.body?.reason, 32).toLowerCase();
    if (!reportedText) return json(res, 422, { error: { code: 'INVALID_REPORT', message: 'Reported text is required.' } }, noStore);
    if (!REASONS.has(reason)) return json(res, 422, { error: { code: 'INVALID_REPORT_REASON', message: 'A supported report reason is required.' } }, noStore);
    const duplicate = await sql`SELECT id FROM community_reports WHERE reporter_user_id=${session.user_id} AND COALESCE(post_id,'')=COALESCE(${postId},'') AND status='open' AND created_at > NOW() - INTERVAL '24 hours' LIMIT 1`;
    if (duplicate.rows.length) return json(res, 409, { error: { code: 'REPORT_ALREADY_OPEN', message: 'A report for this post is already open.' } }, noStore);
    const inserted = await sql`INSERT INTO community_reports (reporter_user_id,post_id,reported_text,reason) VALUES (${session.user_id},${postId},${reportedText},${reason}) RETURNING id,created_at AS "createdAt",status`;
    await writeAudit({ actorUserId: session.user_id, action: 'COMMUNITY_REPORT_CREATED', entityType: 'community_report', entityId: String(inserted.rows[0].id), metadata: { postId, reason } });
    return json(res, 201, { ok: true, report: inserted.rows[0] }, noStore);
  } catch (error) {
    return json(res, error.status || 500, { error: { code: error.code || 'COMMUNITY_REPORT_FAILED', message: error.status ? error.message : 'Unable to submit the community report.' } }, noStore);
  }
}
