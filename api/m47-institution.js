import { json } from './_lib/security.js';
import { requireAuth, hasRole } from './_lib/auth.js';
import { sql } from './_lib/db.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  try {
    const session = await requireAuth(req);
    if (!hasRole(session, 'admin') && !hasRole(session, 'teacher')) return json(res, 403, { error: { code: 'FORBIDDEN', message: 'Teacher or administrator role required.' } });
    if (req.method !== 'GET') return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'GET required.' } }, { Allow: 'GET' });

    const classId = String(req.query?.classId || '').trim();
    if (!classId) return json(res, 400, { error: { code: 'INVALID_CLASS', message: 'classId is required.' } });

    const classRows = await sql`SELECT id,name FROM classes WHERE id=${classId} LIMIT 1`;
    if (!classRows.rows.length) return json(res, 404, { error: { code: 'CLASS_NOT_FOUND', message: 'Class not found.' } });

    const [students, attempts, results] = await Promise.all([
      sql`SELECT COUNT(*)::int AS count FROM class_members WHERE class_id=${classId}`,
      sql`SELECT COUNT(*)::int AS attempts, COUNT(DISTINCT aa.learner_id)::int AS learners, COALESCE(AVG(CASE WHEN aa.max_score>0 THEN aa.score*100.0/aa.max_score END),0)::numeric AS average_percentage FROM class_members cm JOIN assessment_attempts aa ON aa.learner_id=cm.learner_id WHERE cm.class_id=${classId} AND aa.status='submitted'`,
      sql`SELECT a.subject,a.chapter,COUNT(*)::int AS evidence_count,COUNT(*) FILTER (WHERE ar.correctness='correct')::int AS correct_count,COUNT(DISTINCT aa.learner_id)::int AS learners FROM class_members cm JOIN assessment_attempts aa ON aa.learner_id=cm.learner_id JOIN assessment_results ar ON ar.attempt_id=aa.id JOIN assessments a ON a.id=aa.assessment_id WHERE cm.class_id=${classId} AND aa.status='submitted' GROUP BY a.subject,a.chapter ORDER BY a.subject,a.chapter`,
    ]);

    const topics = results.rows.map(row => ({
      subject: row.subject || null,
      chapter: row.chapter || null,
      evidenceCount: Number(row.evidence_count),
      learners: Number(row.learners),
      accuracy: Number(row.evidence_count) ? Math.round(Number(row.correct_count) * 100 / Number(row.evidence_count)) : null,
    }));
    const average = attempts.rows[0]?.average_percentage == null ? null : Math.round(Number(attempts.rows[0].average_percentage) * 10) / 10;
    return json(res, 200, { ok: true, class: { id: classId, name: classRows.rows[0].name }, summary: { students: Number(students.rows[0]?.count || 0), learnersWithAttempts: Number(attempts.rows[0]?.learners || 0), attempts: Number(attempts.rows[0]?.attempts || 0), averagePercentage: average }, topics });
  } catch (e) {
    return json(res, e.status || 500, { error: { code: e.code || 'INSTITUTION_ANALYTICS_FAILED', message: e.status ? e.message : 'Unable to load institution analytics.' } });
  }
}
