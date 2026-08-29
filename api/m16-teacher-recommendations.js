import { json, writeAudit } from './_lib/security.js';
import { requireAuth, hasRole } from './_lib/auth.js';
import { sql } from './_lib/db.js';

export const config = { runtime: 'nodejs' };
const clean = (v, max = 160) => String(v ?? '').trim().slice(0, max);
const noStore = { 'Cache-Control': 'private, no-store, max-age=0' };
const MIN_EVIDENCE = 3;

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'GET required.' } }, { Allow: 'GET', ...noStore });
  try {
    const session = await requireAuth(req);
    const isAdmin = hasRole(session, 'admin');
    const isTeacher = hasRole(session, 'teacher');
    if (!isTeacher && !isAdmin) return json(res, 403, { error: { code: 'FORBIDDEN', message: 'Teacher or administrator role required.' } }, noStore);
    const learnerId = clean(req.query?.learnerId, 120);
    if (!learnerId) return json(res, 400, { error: { code: 'INVALID_LEARNER', message: 'learnerId is required.' } }, noStore);

    const accessRows = isAdmin
      ? await sql`SELECT l.id FROM learners l WHERE l.id=${learnerId} LIMIT 1`
      : await sql`
          SELECT cm.learner_id AS id
          FROM class_members cm
          JOIN classes c ON c.id=cm.class_id
          WHERE cm.learner_id=${learnerId}
            AND cm.status='active'
            AND c.teacher_user_id=${session.user_id}
            AND c.archived_at IS NULL
          LIMIT 1`;
    if (!accessRows.rows.length) return json(res, 404, { error: { code: 'LEARNER_NOT_FOUND', message: 'Learner not found or not accessible.' } }, noStore);

    const rows = await sql`
      SELECT le.subject, le.chapter, le.concept,
             COUNT(*)::int AS evidence_count,
             COUNT(*) FILTER (WHERE le.correctness='incorrect')::int AS incorrect_count,
             COUNT(*) FILTER (WHERE le.correctness='partially_correct')::int AS partial_count,
             MAX(le.created_at) AS last_seen
      FROM learning_evidence le
      WHERE le.learner_id=${learnerId}
        AND le.correctness IN ('incorrect','partially_correct','uncertain')
      GROUP BY le.subject, le.chapter, le.concept
      HAVING COUNT(*) >= ${MIN_EVIDENCE}
      ORDER BY incorrect_count DESC, evidence_count DESC, last_seen DESC
      LIMIT 10`;

    const recommendations = rows.rows.map((r, index) => {
      const incorrect = Number(r.incorrect_count || 0);
      const evidence = Number(r.evidence_count || 0);
      const priority = incorrect >= 3 || evidence >= 4 ? 'high' : 'medium';
      return {
        id: `teacher_rec:${r.subject || 'unknown'}:${r.concept || 'unspecified'}`,
        subject: r.subject || null,
        chapter: r.chapter || null,
        concept: r.concept || 'Unspecified concept',
        priority,
        assignmentType: priority === 'high' ? 'targeted_remediation' : 'targeted_practice',
        reason: `${incorrect} incorrect and ${Number(r.partial_count || 0)} partially-correct recorded evidence item(s) across ${evidence} recorded evidence item(s).`,
        evidenceCount: evidence,
        lastSeen: r.last_seen,
        rank: index + 1,
        humanAction: 'Teacher reviews and decides whether to assign.'
      };
    });

    await writeAudit({ actorUserId: session.user_id, action: 'teacher.recommendations.view', entityType: 'learner', entityId: learnerId, metadata: { recommendationCount: recommendations.length, role: isAdmin ? 'admin' : 'teacher', minEvidence: MIN_EVIDENCE } });
    return json(res, 200, {
      ok: true,
      learnerId,
      recommendations,
      evidenceGate: { minEvidence: MIN_EVIDENCE, sparseEvidenceExcluded: true },
      source: 'server_learning_evidence',
      limitation: 'Recommendations are evidence-based instructional suggestions, not diagnoses or automatic assignments.'
    }, noStore);
  } catch (e) {
    return json(res, e.status || 500, { error: { code: e.code || 'TEACHER_RECOMMENDATIONS_FAILED', message: e.status ? e.message : 'Unable to load teacher recommendations.' } }, noStore);
  }
}
