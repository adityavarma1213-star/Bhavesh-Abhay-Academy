import { json, writeAudit } from './_lib/security.js';
import { requireAuth, hasRole } from './_lib/auth.js';
import { sql } from './_lib/db.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  try {
    const session = await requireAuth(req);
    if (!hasRole(session, 'teacher') && !hasRole(session, 'admin')) return json(res, 403, { error: { code: 'FORBIDDEN', message: 'Teacher or administrator role required.' } });
    if (req.method !== 'GET') return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'GET required.' } }, { Allow: 'GET' });
    const classId = String(req.query?.classId || '').trim();
    if (!classId) return json(res, 400, { error: { code: 'INVALID_CLASS', message: 'classId is required.' } });
    const classRows = await sql`SELECT id,name FROM classes WHERE id=${classId} LIMIT 1`;
    if (!classRows.rows.length) return json(res, 404, { error: { code: 'CLASS_NOT_FOUND', message: 'Class not found.' } });
    const rows = await sql`
      SELECT cm.learner_id AS "studentId",
        CASE
          WHEN COUNT(aa.id)=0 THEN 'insufficient_evidence'
          WHEN AVG(CASE WHEN aa.max_score>0 THEN aa.score*100.0/aa.max_score END) < 50 THEN 'struggling'
          WHEN AVG(CASE WHEN aa.max_score>0 THEN aa.score*100.0/aa.max_score END) < 75 THEN 'needs_revision'
          WHEN AVG(CASE WHEN aa.max_score>0 THEN aa.score*100.0/aa.max_score END) < 90 THEN 'learning'
          ELSE 'mastered'
        END AS state,
        COUNT(aa.id)::int AS attempts,
        COALESCE(ROUND(AVG(CASE WHEN aa.max_score>0 THEN aa.score*100.0/aa.max_score END)::numeric,1),0) AS average_percentage
      FROM class_members cm
      LEFT JOIN assessment_attempts aa ON aa.learner_id=cm.learner_id AND aa.status='submitted'
      WHERE cm.class_id=${classId}
      GROUP BY cm.learner_id
      ORDER BY cm.learner_id`;
    const groups = { reteach: [], practice: [], extend: [], insufficientEvidence: [] };
    const students = rows.rows.map(r => ({ studentId: r.studentId, state: r.state, attempts: Number(r.attempts), averagePercentage: Number(r.average_percentage) }));
    for (const student of students) {
      if (['struggling','needs_revision'].includes(student.state)) groups.reteach.push(student.studentId);
      else if (student.state === 'learning') groups.practice.push(student.studentId);
      else if (['mastered','strong'].includes(student.state)) groups.extend.push(student.studentId);
      else groups.insufficientEvidence.push(student.studentId);
    }
    await writeAudit({ actorUserId: session.user_id, action: 'teacher.diagnostic.view', entityType: 'class', entityId: classId, metadata: { studentCount: students.length } });
    return json(res, 200, { ok: true, class: { id: classId, name: classRows.rows[0].name }, students, groups, limitation: 'Grouping is evidence-based instructional support, not a psychological diagnosis.' });
  } catch (e) {
    return json(res, e.status || 500, { error: { code: e.code || 'TEACHER_DIAGNOSTIC_FAILED', message: e.status ? e.message : 'Unable to load teacher diagnostic evidence.' } });
  }
}
