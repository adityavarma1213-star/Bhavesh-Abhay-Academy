import { json, writeAudit } from './_lib/security.js';
import { requireAuth, hasRole } from './_lib/auth.js';
import { sql } from './_lib/db.js';

export const config = { runtime: 'nodejs' };
const VALID_CORRECTNESS = new Set(['correct', 'partially_correct', 'incorrect']);

function noStore(res) {
  if (typeof res?.setHeader === 'function') res.setHeader('Cache-Control', 'private, no-store, max-age=0');
}

export default async function handler(req, res) {
  noStore(res);
  try {
    const session = await requireAuth(req);
    const isAdmin = hasRole(session, 'admin');
    const isTeacher = hasRole(session, 'teacher');
    if (!isTeacher && !isAdmin) return json(res, 403, { error: { code: 'FORBIDDEN', message: 'Teacher or administrator role required.' } });
    if (req.method !== 'GET') return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'GET required.' } }, { Allow: 'GET' });
    const classId = String(req.query?.classId || '').trim();
    if (!classId) return json(res, 400, { error: { code: 'INVALID_CLASS', message: 'classId is required.' } });

    const classRows = isAdmin
      ? await sql`SELECT id,name FROM classes WHERE id=${classId} LIMIT 1`
      : await sql`SELECT id,name FROM classes WHERE id=${classId} AND teacher_user_id=${session.user_id} AND archived_at IS NULL LIMIT 1`;
    if (!classRows.rows.length) return json(res, 404, { error: { code: 'CLASS_NOT_FOUND', message: 'Class not found or not accessible.' } });

    // Diagnostic grouping is derived from canonical scored learner evidence.
    // Unknown/unscored rows are deliberately excluded from both the evidence
    // denominator and correct numerator so uncertainty cannot become a false
    // weakness signal. The three-row gate applies to valid evidence only.
    const rows = await sql`
      WITH class_roster AS (
        SELECT learner_id
        FROM class_members
        WHERE class_id=${classId} AND status='active'
      ),
      evidence AS (
        SELECT le.learner_id,
               COUNT(*) FILTER (WHERE le.correctness IN ('correct','partially_correct','incorrect'))::int AS evidence_count,
               COUNT(*) FILTER (WHERE le.correctness='correct')::int AS correct_count,
               COUNT(*) FILTER (WHERE le.correctness IS NULL OR le.correctness NOT IN ('correct','partially_correct','incorrect'))::int AS excluded_evidence_count
        FROM learning_evidence le
        INNER JOIN class_roster cr ON cr.learner_id=le.learner_id
        GROUP BY le.learner_id
      ),
      attempts AS (
        SELECT aa.learner_id, COUNT(*)::int AS attempt_count
        FROM assessment_attempts aa
        INNER JOIN class_roster cr ON cr.learner_id=aa.learner_id
        WHERE aa.status IN ('submitted','evaluated','completed')
          AND aa.score IS NOT NULL
          AND aa.max_score > 0
        GROUP BY aa.learner_id
      )
      SELECT cm.learner_id AS "studentId",
        CASE
          WHEN COALESCE(e.evidence_count,0) < 3 THEN 'insufficient_evidence'
          WHEN e.correct_count * 100.0 / e.evidence_count < 50 THEN 'struggling'
          WHEN e.correct_count * 100.0 / e.evidence_count < 75 THEN 'needs_revision'
          WHEN e.correct_count * 100.0 / e.evidence_count < 90 THEN 'learning'
          ELSE 'mastered'
        END AS state,
        COALESCE(a.attempt_count,0)::int AS attempts,
        CASE WHEN COALESCE(e.evidence_count,0) >= 3
          THEN ROUND((e.correct_count * 100.0 / e.evidence_count)::numeric,1)
          ELSE NULL
        END AS average_percentage,
        COALESCE(e.evidence_count,0)::int AS evidence_count,
        COALESCE(e.excluded_evidence_count,0)::int AS excluded_evidence_count
      FROM class_members cm
      LEFT JOIN evidence e ON e.learner_id=cm.learner_id
      LEFT JOIN attempts a ON a.learner_id=cm.learner_id
      WHERE cm.class_id=${classId} AND cm.status='active'
      GROUP BY cm.learner_id,e.evidence_count,e.correct_count,e.excluded_evidence_count,a.attempt_count
      ORDER BY cm.learner_id`;

    const groups = { reteach: [], practice: [], extend: [], insufficientEvidence: [] };
    const students = rows.rows.map(r => ({
      studentId: r.studentId,
      state: r.state,
      attempts: Number(r.attempts),
      averagePercentage: r.average_percentage == null ? null : Number(r.average_percentage),
      evidenceCount: Number(r.evidence_count),
      excludedEvidenceCount: Number(r.excluded_evidence_count)
    }));
    for (const student of students) {
      if (['struggling','needs_revision'].includes(student.state)) groups.reteach.push(student.studentId);
      else if (student.state === 'learning') groups.practice.push(student.studentId);
      else if (['mastered','strong'].includes(student.state)) groups.extend.push(student.studentId);
      else groups.insufficientEvidence.push(student.studentId);
    }
    await writeAudit({
      actorUserId: session.user_id,
      action: 'teacher.diagnostic.view',
      entityType: 'class',
      entityId: classId,
      metadata: {
        studentCount: students.length,
        role: isAdmin ? 'admin' : 'teacher',
        evidenceGate: 3,
        acceptedCorrectness: [...VALID_CORRECTNESS],
        excludedEvidenceCount: students.reduce((sum, s) => sum + s.excludedEvidenceCount, 0),
        groupCounts: {
          reteach: groups.reteach.length,
          practice: groups.practice.length,
          extend: groups.extend.length,
          insufficientEvidence: groups.insufficientEvidence.length
        }
      }
    });
    return json(res, 200, {
      ok: true,
      class: { id: classId, name: classRows.rows[0].name },
      students,
      groups,
      evidenceGate: {
        minimumValidEvidence: 3,
        acceptedCorrectness: [...VALID_CORRECTNESS]
      },
      evidenceRule: 'Learners require at least 3 valid canonical learning-evidence rows before instructional strength/weakness grouping is assigned. Unknown or unscored evidence is excluded.',
      assessmentRule: "Completed assessment counts include submitted, evaluated, and completed attempts with valid scores.",
      limitation: 'Grouping is evidence-based instructional support, not a psychological diagnosis.'
    });
  } catch (e) {
    return json(res, e.status || 500, { error: { code: e.code || 'TEACHER_DIAGNOSTIC_FAILED', message: e.status ? e.message : 'Unable to load teacher diagnostic evidence.' } });
  }
}
