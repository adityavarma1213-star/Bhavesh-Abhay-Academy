import { json, id, writeAudit } from './_lib/security.js';
import { requireAuth, hasRole } from './_lib/auth.js';
import { sql } from './_lib/db.js';

export const config = { runtime: 'nodejs' };
const MIN_EVIDENCE = 3;
const HISTORY_PAGE_SIZE = 20;
const EVIDENCE_PAGE_SIZE = 500;
const MAX_CURSOR_CHARS = 512;
const MAX_CURSOR_FIELD_CHARS = 128;
function clean(v, max = 240) { return String(v ?? '').trim().slice(0, max); }
function parseCursor(value) {
  if (!value) return null;
  const raw = String(value);
  if (raw.length > MAX_CURSOR_CHARS) {
    const e = new Error('Invalid conversation cursor.'); e.status = 400; e.code = 'INVALID_CONVERSATION_CURSOR'; throw e;
  }
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    const createdAt = String(parsed?.createdAt ?? '').trim();
    const idValue = String(parsed?.id ?? '').trim();
    if (!createdAt || !idValue || createdAt.length > MAX_CURSOR_FIELD_CHARS || idValue.length > MAX_CURSOR_FIELD_CHARS) throw new Error();
    return { createdAt, id: idValue };
  } catch {
    const e = new Error('Invalid conversation cursor.'); e.status = 400; e.code = 'INVALID_CONVERSATION_CURSOR'; throw e;
  }
}
function encodeCursor(row) { return Buffer.from(JSON.stringify({ createdAt: String(row.createdAt), id: String(row.id) }), 'utf8').toString('base64url'); }
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
  return rows.rows.length > 0;
}
async function loadLearningContext(learnerId) {
  const byConcept = new Map();
  let cursorCreatedAt = null;
  let cursorId = null;
  let evidenceCount = 0;
  for (;;) {
    const rows = cursorCreatedAt
      ? await sql`SELECT id, concept, subject, topic, correctness, created_at AS "createdAt" FROM learning_evidence WHERE learner_id=${learnerId} AND (created_at,id)<(${cursorCreatedAt},${cursorId}) ORDER BY created_at DESC,id DESC LIMIT ${EVIDENCE_PAGE_SIZE}`
      : await sql`SELECT id, concept, subject, topic, correctness, created_at AS "createdAt" FROM learning_evidence WHERE learner_id=${learnerId} ORDER BY created_at DESC,id DESC LIMIT ${EVIDENCE_PAGE_SIZE}`;
    if (!rows.rows.length) break;
    for (const row of rows.rows) {
      evidenceCount += 1;
      const key = `${row.subject || 'Unknown'}::${row.concept || 'recent study work'}`;
      const item = byConcept.get(key) || { concept: row.concept || 'recent study work', subject: row.subject || '', topic: row.topic || '', total: 0, correct: 0, incorrect: 0, partial: 0, uncertain: 0, lastSeen: row.createdAt };
      item.total += 1;
      if (row.correctness === 'correct') item.correct += 1;
      else if (row.correctness === 'incorrect') item.incorrect += 1;
      else if (row.correctness === 'partially_correct') item.partial += 1;
      else item.uncertain += 1;
      if (!item.topic && row.topic) item.topic = row.topic;
      if (String(row.createdAt) > String(item.lastSeen)) item.lastSeen = row.createdAt;
      byConcept.set(key, item);
    }
    if (rows.rows.length < EVIDENCE_PAGE_SIZE) break;
    const last = rows.rows[rows.rows.length - 1];
    cursorCreatedAt = last.createdAt;
    cursorId = last.id;
  }
  if (!evidenceCount) return { evidenceCount: 0, topic: 'the recent study work', state: 'insufficient evidence', evidence: [] };
  const concepts = [...byConcept.values()].sort((a, b) => (b.total - a.total) || String(b.lastSeen).localeCompare(String(a.lastSeen)));
  const focus = concepts[0];
  const evidenceSufficient = focus.total >= MIN_EVIDENCE;
  const accuracy = focus.total ? focus.correct / focus.total : 0;
  let state = 'insufficient evidence';
  if (evidenceSufficient) {
    if (accuracy >= 0.8) state = 'on track';
    else if (accuracy < 0.5 || focus.incorrect >= 2) state = 'needs support';
    else if (focus.partial || focus.uncertain) state = 'needs clarification';
    else state = 'learning';
  }
  return {
    evidenceCount,
    topic: clean(focus.topic || focus.concept || 'the recent study work', 160),
    state,
    evidence: concepts.slice(0, 8).map(item => ({ concept: item.concept, subject: item.subject, evidenceCount: item.total, accuracy: item.total >= MIN_EVIDENCE ? Math.round((item.correct / item.total) * 100) : null, evidenceSufficient: item.total >= MIN_EVIDENCE }))
  };
}
function noStore(res) { res.setHeader('Cache-Control', 'private, no-store, max-age=0'); }

export default async function handler(req, res) {
  noStore(res);
  try {
    const session = await requireAuth(req);
    if (!hasRole(session, 'parent')) return json(res, 403, { error: { code: 'FORBIDDEN', message: 'Parent role required.' } });
    if (req.method === 'GET') {
      const learnerId = clean(req.query?.learnerId, 128);
      if (!learnerId) return json(res, 400, { error: { code: 'INVALID_LEARNER', message: 'learnerId is required.' } });
      if (!await requireParentLearner(session, learnerId)) return json(res, 403, { error: { code: 'LEARNER_ACCESS_DENIED', message: 'Parent is not linked to this learner.' } });
      const cursor = parseCursor(req.query?.cursor);
      const rows = cursor
        ? await sql`SELECT id, learner_id AS "learnerId", topic, state, prompts, created_at AS "createdAt" FROM parent_conversation_prompts WHERE learner_id=${learnerId} AND parent_user_id=${session.user_id} AND (created_at,id)<(${cursor.createdAt},${cursor.id}) ORDER BY created_at DESC,id DESC LIMIT ${HISTORY_PAGE_SIZE + 1}`
        : await sql`SELECT id, learner_id AS "learnerId", topic, state, prompts, created_at AS "createdAt" FROM parent_conversation_prompts WHERE learner_id=${learnerId} AND parent_user_id=${session.user_id} ORDER BY created_at DESC,id DESC LIMIT ${HISTORY_PAGE_SIZE + 1}`;
      const conversations = rows.rows.slice(0, HISTORY_PAGE_SIZE);
      const hasMore = rows.rows.length > HISTORY_PAGE_SIZE;
      const nextCursor = hasMore && conversations.length ? encodeCursor(conversations[conversations.length - 1]) : null;
      return json(res, 200, { ok: true, conversations, pagination: { limit: HISTORY_PAGE_SIZE, hasMore, nextCursor } });
    }
    if (req.method !== 'POST') return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'GET or POST required.' } }, { Allow: 'GET, POST' });
    const learnerId = clean(req.body?.learnerId, 128);
    if (!learnerId) return json(res, 400, { error: { code: 'INVALID_LEARNER', message: 'learnerId is required.' } });
    if (!await requireParentLearner(session, learnerId)) return json(res, 403, { error: { code: 'LEARNER_ACCESS_DENIED', message: 'Parent is not linked to this learner.' } });
    const context = await loadLearningContext(learnerId);
    const topic = context.topic;
    const state = context.state;
    const prompts = buildPrompts(topic, state);
    const conversationId = id('parentconv');
    await sql`INSERT INTO parent_conversation_prompts(id,parent_user_id,learner_id,topic,state,prompts) VALUES(${conversationId},${session.user_id},${learnerId},${topic},${state},${JSON.stringify(prompts)}::jsonb)`;
    await writeAudit({ actorUserId: session.user_id, action: 'parent.conversation.generate', entityType: 'parent_conversation_prompts', entityId: conversationId, metadata: { learnerId, evidenceCount: context.evidenceCount, evidence: context.evidence } });
    return json(res, 201, { ok: true, id: conversationId, learnerId, topic, state, evidenceCount: context.evidenceCount, evidence: context.evidence, prompts, evidenceGate: { minEvidence: MIN_EVIDENCE, sparseEvidenceIsNotCharacterized: true }, limitation: 'Conversation prompts are supportive guidance, not diagnosis or clinical advice. Learning state is derived from recorded academic evidence; it does not measure emotion or wellbeing.' });
  } catch (e) {
    return json(res, e.status || 500, { error: { code: e.code || 'PARENT_CONVERSATION_FAILED', message: e.status ? e.message : 'Unable to create parent conversation prompts.' } });
  }
}
