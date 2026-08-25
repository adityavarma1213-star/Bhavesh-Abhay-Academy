import { json, id, writeAudit } from './_lib/security.js';
import { requireAuth, hasRole } from './_lib/auth.js';
import { sql } from './_lib/db.js';

export const config = { runtime: 'nodejs' };

function clean(v, max = 240) { return String(v ?? '').trim().slice(0, max); }
function buildPrompts(topic, state) {
  return [
    `Ask what felt easiest about ${topic}.`,
    `Ask what part of ${topic} felt difficult without assigning blame.`,
    `Ask whether the current ${state} feels manageable.`,
    'Agree on one small next step together.',
  ];
}
async function requireParentLearner(session, learnerId) {
  const rows = await sql`SELECT 1 FROM parent_learner WHERE parent_user_id=${session.user_id} AND learner_id=${learnerId} AND status='active' LIMIT 1`;
  if (!rows.rows.length) return false;
  return true;
}

export default async function handler(req, res) {
  try {
    const session = await requireAuth(req);
    if (!hasRole(session, 'parent')) return json(res, 403, { error: { code: 'FORBIDDEN', message: 'Parent role required.' } });
    if (req.method === 'GET') {
      const learnerId = clean(req.query?.learnerId, 128);
      if (!learnerId) return json(res, 400, { error: { code: 'INVALID_LEARNER', message: 'learnerId is required.' } });
      if (!await requireParentLearner(session, learnerId)) return json(res, 403, { error: { code: 'LEARNER_ACCESS_DENIED', message: 'Parent is not linked to this learner.' } });
      const rows = await sql`SELECT id, learner_id AS "learnerId", topic, state, prompts, created_at AS "createdAt" FROM parent_conversation_prompts WHERE learner_id=${learnerId} AND parent_user_id=${session.user_id} ORDER BY created_at DESC LIMIT 20`;
      return json(res, 200, { ok: true, conversations: rows.rows });
    }
    if (req.method !== 'POST') return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'GET or POST required.' } }, { Allow: 'GET, POST' });
    const learnerId = clean(req.body?.learnerId, 128);
    const topic = clean(req.body?.topic || 'the recent study work');
    const state = clean(req.body?.state || 'learning', 120);
    if (!learnerId) return json(res, 400, { error: { code: 'INVALID_LEARNER', message: 'learnerId is required.' } });
    if (!await requireParentLearner(session, learnerId)) return json(res, 403, { error: { code: 'LEARNER_ACCESS_DENIED', message: 'Parent is not linked to this learner.' } });
    const prompts = buildPrompts(topic, state);
    const conversationId = id('parentconv');
    await sql`INSERT INTO parent_conversation_prompts(id,parent_user_id,learner_id,topic,state,prompts) VALUES(${conversationId},${session.user_id},${learnerId},${topic},${state},${JSON.stringify(prompts)}::jsonb)`;
    await writeAudit({ actorUserId: session.user_id, action: 'parent.conversation.generate', entityType: 'parent_conversation_prompts', entityId: conversationId, metadata: { learnerId } });
    return json(res, 201, { ok: true, id: conversationId, learnerId, topic, state, prompts, limitation: 'Conversation prompts are supportive guidance, not diagnosis or clinical advice.' });
  } catch (e) {
    return json(res, e.status || 500, { error: { code: e.code || 'PARENT_CONVERSATION_FAILED', message: e.status ? e.message : 'Unable to create parent conversation prompts.' } });
  }
}
