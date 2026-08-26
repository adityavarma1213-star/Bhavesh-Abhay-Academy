import { json } from './_lib/security.js';
import { requireAuth, requireLearnerAccess } from './_lib/auth.js';
import { sql } from './_lib/db.js';

export const config = { runtime: 'nodejs' };
const clean = (v, max = 160) => String(v ?? '').trim().slice(0, max);
const intervalFor = (incorrect, partial, evidence) => incorrect >= 2 ? 1 : partial >= 1 ? 3 : evidence >= 6 ? 30 : evidence >= 3 ? 14 : 7;

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'GET required.' } }, { Allow: 'GET' });
  try {
    const session = await requireAuth(req);
    const learnerId = clean(req.query?.learnerId, 120);
    await requireLearnerAccess(session, learnerId);
    const rows = await sql`
      SELECT le.subject, le.chapter, le.concept,
             COUNT(*)::int AS evidence_count,
             COUNT(*) FILTER (WHERE le.correctness='incorrect')::int AS incorrect_count,
             COUNT(*) FILTER (WHERE le.correctness='partially_correct')::int AS partial_count,
             MAX(le.created_at) AS last_seen
      FROM learning_evidence le
      WHERE le.learner_id=${learnerId}
      GROUP BY le.subject, le.chapter, le.concept
      ORDER BY last_seen DESC
      LIMIT 200`;
    const now = Date.now();
    const plan = rows.rows.map(r => {
      const evidence = Number(r.evidence_count || 0);
      const incorrect = Number(r.incorrect_count || 0);
      const partial = Number(r.partial_count || 0);
      const interval = intervalFor(incorrect, partial, evidence);
      const last = Date.parse(r.last_seen || '');
      const days = Number.isFinite(last) ? Math.max(0, Math.floor((now-last)/86400000)) : 0;
      const state = incorrect >= 2 ? 'struggling' : partial >= 1 ? 'needs_revision' : evidence < 3 ? 'learning' : 'stable';
      return { concept:r.concept || 'Unspecified concept', subject:r.subject || null, chapter:r.chapter || null, status:state, evidenceCount:evidence, reviewIntervalDays:interval, due:days>=interval, lastSeen:r.last_seen, reason:`Review interval selected from ${state} server evidence.` };
    });
    return json(res, 200, { ok:true, learnerId, plan, source:'server_learning_evidence', limitation:'Revision timing is an evidence-based product heuristic, not a medically or scientifically validated timing claim.' });
  } catch (e) {
    return json(res, e.status || 500, { error: { code:e.code || 'REVISION_FAILED', message:e.status ? e.message : 'Unable to load revision evidence.' } });
  }
}
