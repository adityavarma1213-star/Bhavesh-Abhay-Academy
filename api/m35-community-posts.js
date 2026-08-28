import { json, writeAudit } from './_lib/security.js';
import { requireAuth } from './_lib/auth.js';
import { sql } from './_lib/db.js';

export const config = { runtime: 'nodejs' };
const noStore = { 'Cache-Control': 'private, no-store, max-age=0' };
const BLOCKED = ['self-harm', 'suicide', 'sexual exploitation', 'buy drugs'];
const clean = (value, max) => String(value ?? '').trim().slice(0, max);

function moderate(text) {
  const value = clean(text, 4000);
  if (!value) return { ok: false, code: 'INVALID_POST', message: 'Post text is required.' };
  const lower = value.toLowerCase();
  if (BLOCKED.some(term => lower.includes(term))) {
    return { ok: false, code: 'POST_BLOCKED_BY_SAFETY_FILTER', message: 'This post was blocked by the community safety filter.' };
  }
  return { ok: true, text: value };
}

function postId(userId) {
  return `post_${Date.now().toString(36)}_${String(userId).slice(0, 8)}_${Math.random().toString(36).slice(2, 8)}`;
}

export default async function handler(req, res) {
  try {
    const session = await requireAuth(req);
    if (req.method === 'GET') {
      const groupId = clean(req.query?.groupId, 120) || 'general';
      const result = await sql`
        SELECT p.id, p.group_id AS "groupId", p.body AS text, p.status,
               p.created_at AS "createdAt", p.author_user_id AS "authorUserId"
        FROM community_posts p
        WHERE p.group_id = ${groupId} AND p.status = 'visible'
        ORDER BY p.created_at DESC
        LIMIT 100
      `;
      return json(res, 200, { ok: true, posts: result.rows || [] }, noStore);
    }
    if (req.method !== 'POST') {
      return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'GET or POST required.' } }, { Allow: 'GET, POST', ...noStore });
    }

    const checked = moderate(req.body?.text);
    if (!checked.ok) return json(res, 422, { error: { code: checked.code, message: checked.message } }, noStore);
    const groupId = clean(req.body?.groupId, 120) || 'general';
    const id = postId(session.user_id);
    const inserted = await sql`
      INSERT INTO community_posts (id, author_user_id, group_id, body)
      VALUES (${id}, ${session.user_id}, ${groupId}, ${checked.text})
      RETURNING id, group_id AS "groupId", body AS text, status, created_at AS "createdAt"
    `;
    await writeAudit({
      actorUserId: session.user_id,
      action: 'COMMUNITY_POST_CREATED',
      entityType: 'community_post',
      entityId: id,
      metadata: { groupId },
    });
    return json(res, 201, { ok: true, post: inserted.rows[0] }, noStore);
  } catch (error) {
    return json(res, error.status || 500, {
      error: { code: error.code || 'COMMUNITY_POSTS_FAILED', message: error.status ? error.message : 'Unable to access community posts.' }
    }, noStore);
  }
}
