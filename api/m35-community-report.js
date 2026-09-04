import { json, writeAudit } from './_lib/security.js';
import { requireAuth } from './_lib/auth.js';
import { sql } from './_lib/db.js';

export const config = { runtime: 'nodejs' };
const noStore = { 'Cache-Control': 'private, no-store, max-age=0' };
const REASONS = new Set(['safety','harassment','spam','other']);
const MAX_POST_ID_CHARS = 160;
const MAX_REPORTED_TEXT_CHARS = 4000;
const MAX_REASON_CHARS = 32;

function bounded(value, max, code, message, required = false) {
  if (typeof value !== 'string') {
    if (!required && (value == null || value === '')) return '';
    const error = new Error(message); error.status = 422; error.code = code; throw error;
  }
  const normalized = value.trim();
  if (required && !normalized) { const error = new Error(message); error.status = 422; error.code = code; throw error; }
  if (normalized.length > max) { const error = new Error(message); error.status = 422; error.code = code; throw error; }
  return normalized;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'POST required.' } }, { Allow: 'POST', ...noStore });
  }
  try {
    const session = await requireAuth(req);
    const postId = bounded(req.body?.postId, MAX_POST_ID_CHARS, 'POST_ID_TOO_LONG', `postId must be ${MAX_POST_ID_CHARS} characters or fewer.`, true) || null;
    const submittedText = bounded(req.body?.reportedText, MAX_REPORTED_TEXT_CHARS, 'REPORTED_TEXT_TOO_LONG', `reportedText must be ${MAX_REPORTED_TEXT_CHARS} characters or fewer.`);
    const reason = bounded(req.body?.reason, MAX_REASON_CHARS, 'REPORT_REASON_TOO_LONG', `reason must be ${MAX_REASON_CHARS} characters or fewer.`).toLowerCase();
    if (!REASONS.has(reason)) return json(res, 422, { error: { code: 'INVALID_REPORT_REASON', message: 'A supported report reason is required.' } }, noStore);

    const postResult = await sql`
      SELECT id, body
      FROM community_posts
      WHERE id=${postId} AND status='visible'
      LIMIT 1
    `;
    const post = postResult.rows[0];
    if (!post) return json(res, 404, { error: { code: 'POST_NOT_FOUND', message: 'The reported community post could not be found.' } }, noStore);

    // The server is authoritative for report evidence. The browser may include
    // a stale preview for compatibility, but it can never choose what text is
    // persisted in the moderation record.
    const reportedText = typeof post.body === 'string' ? post.body : '';
    const submittedTextMismatch = submittedText && submittedText !== reportedText;

    const duplicate = await sql`SELECT id FROM community_reports WHERE reporter_user_id=${session.user_id} AND COALESCE(post_id,'')=COALESCE(${postId},'') AND status='open' AND created_at > NOW() - INTERVAL '24 hours' LIMIT 1`;
    if (duplicate.rows.length) return json(res, 409, { error: { code: 'REPORT_ALREADY_OPEN', message: 'A report for this post is already open.' } }, noStore);

    const inserted = await sql`
      INSERT INTO community_reports (reporter_user_id,post_id,reported_text,reason)
      VALUES (${session.user_id},${postId},${reportedText},${reason})
      RETURNING id,created_at AS "createdAt",status
    `;
    await writeAudit({
      actorUserId: session.user_id,
      action: 'COMMUNITY_REPORT_CREATED',
      entityType: 'community_report',
      entityId: String(inserted.rows[0].id),
      metadata: { postId, reason, submittedTextMismatch: Boolean(submittedTextMismatch) },
    });
    return json(res, 201, { ok: true, report: inserted.rows[0] }, noStore);
  } catch (error) {
    return json(res, error.status || 500, { error: { code: error.code || 'COMMUNITY_REPORT_FAILED', message: error.status ? error.message : 'Unable to submit the community report.' } }, noStore);
  }
}
