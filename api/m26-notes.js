import { json, writeAudit } from './_lib/security.js';
import { requireAuth, hasRole } from './_lib/auth.js';
import { sql } from './_lib/db.js';

export const config = { runtime: 'nodejs' };
const MIN_EVIDENCE = 3;
const VALID_CORRECTNESS = new Set(['correct', 'partially_correct', 'incorrect']);
const EVIDENCE_PAGE_SIZE = 500;
const clean = (v, max = 160) => String(v ?? '').trim().slice(0, max);

async function loadAllEvidence(learnerId) {
  const rows = [];
  let cursor = null;
  for (;;) {
    const result = cursor
      ? await sql`
          SELECT subject, chapter, concept, correctness, created_at, id
          FROM learning_evidence
          WHERE learner_id=${learnerId}
            AND (created_at < ${cursor.createdAt} OR (created_at=${cursor.createdAt} AND id < ${cursor.id}))
          ORDER BY created_at DESC, id DESC
          LIMIT ${EVIDENCE_PAGE_SIZE}`
      : await sql`
          SELECT subject, chapter, concept, correctness, created_at, id
          FROM learning_evidence
          WHERE learner_id=${learnerId}
          ORDER BY created_at DESC, id DESC
          LIMIT ${EVIDENCE_PAGE_SIZE}`;
    const batch = Array.isArray(result?.rows) ? result.rows : [];
    rows.push(...batch);
    if (batch.length < EVIDENCE_PAGE_SIZE) break;
    const last = batch[batch.length - 1];
    cursor = { createdAt: last.created_at, id: last.id };
  }
  return rows;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  if (req.method !== 'GET') return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'GET required.' } }, { Allow: 'GET' });
  try {
    const session = await requireAuth(req);
    const isAdmin = hasRole(session, 'admin');
    const isTeacher = hasRole(session, 'teacher');
    if (!isTeacher && !isAdmin) return json(res, 403, { error: { code: 'FORBIDDEN', message: 'Teacher or administrator role required.' } });

    const learnerId = clean(req.query?.learnerId, 120);
    if (!learnerId) return json(res, 400, { error: { code: 'INVALID_LEARNER', message: 'learnerId is required.' } });

    const accessRows = isAdmin
      ? await sql`SELECT id FROM learners WHERE id=${learnerId} LIMIT 1`
      : await sql`
          SELECT cm.learner_id AS id
          FROM class_members cm
          JOIN classes c ON c.id=cm.class_id
          WHERE cm.learner_id=${learnerId}
            AND cm.status='active'
            AND c.teacher_user_id=${session.user_id}
            AND c.archived_at IS NULL
          LIMIT 1`;
    if (!accessRows.rows.length) return json(res, 404, { error: { code: 'LEARNER_NOT_FOUND', message: 'Learner not found or not accessible.' } });

    const [evidenceRows, attempts] = await Promise.all([
      loadAllEvidence(learnerId),
      sql`
        SELECT assessment_title, score, max_score, completed_at
        FROM assessment_attempts
        WHERE learner_id=${learnerId}
          AND status IN ('submitted','evaluated','completed')
        ORDER BY completed_at DESC NULLS LAST, created_at DESC
        LIMIT 5`
    ]);

    const rows = evidenceRows.filter(row => VALID_CORRECTNESS.has(row.correctness));
    const invalidEvidenceCount = evidenceRows.length - rows.length;
    if (!rows.length && !attempts.rows.length) {
      await writeAudit({ actorUserId: session.user_id, action: 'teacher.notes.draft_view', entityType: 'learner', entityId: learnerId, metadata: { evidenceCount: 0, invalidEvidenceExcluded: invalidEvidenceCount, insufficientEvidence: true, minimumEvidence: MIN_EVIDENCE } });
      return json(res, 200, {
        ok: true,
        learnerId,
        draft: 'Teacher note draft: There is not enough recorded academic evidence yet to create a factual progress note.',
        evidenceCount: 0,
        invalidEvidenceExcluded: invalidEvidenceCount,
        evidenceGate: { minimumEvidencePerConcept: MIN_EVIDENCE, sparseConceptsNotCharacterized: true, validCorrectnessStates: [...VALID_CORRECTNESS] },
        limitation: 'Deterministic evidence summary only; teacher review is required before saving or sharing.'
      });
    }

    const groups = new Map();
    for (const row of rows) {
      const key = `${row.subject || 'General'}::${row.concept || 'Unspecified concept'}`;
      const g = groups.get(key) || { subject: row.subject || 'General', concept: row.concept || 'Unspecified concept', correct: 0, concern: 0, total: 0 };
      g.total += 1;
      if (row.correctness === 'correct') g.correct += 1;
      if (['incorrect','partially_correct'].includes(row.correctness)) g.concern += 1;
      groups.set(key, g);
    }
    const ordered = [...groups.values()].sort((a,b) => (b.concern-a.concern) || (b.total-a.total));
    const strengths = ordered.filter(g => g.total >= MIN_EVIDENCE && g.correct > g.concern).slice(0,3);
    const attention = ordered.filter(g => g.total >= MIN_EVIDENCE && g.concern > 0).slice(0,3);
    const lines = ['Teacher note — evidence-backed academic summary.'];
    if (strengths.length) lines.push(`Strengths supported by recorded evidence: ${strengths.map(g => `${g.subject} / ${g.concept}`).join(', ')}.`);
    else lines.push('No clear evidence-backed strength pattern was identified from concepts with enough evidence.');
    if (attention.length) lines.push(`Areas needing attention: ${attention.map(g => `${g.subject} / ${g.concept}`).join(', ')}.`);
    else lines.push('No recorded evidence currently indicates a specific area needing attention from concepts with enough evidence.');
    const recent = attempts.rows[0];
    if (recent) {
      const title = clean(recent.assessment_title || 'recent assessment', 120);
      const score = Number(recent.score), max = Number(recent.max_score);
      lines.push(Number.isFinite(score) && Number.isFinite(max) && max > 0 ? `Most recent completed assessment: ${title} — ${score}/${max}.` : `Most recent completed assessment: ${title}.`);
    }
    lines.push(`Evidence reviewed: ${rows.length} valid learning-evidence item(s)${attempts.rows.length ? ` and ${attempts.rows.length} recent assessment attempt(s)` : ''}.`);
    if (invalidEvidenceCount) lines.push(`${invalidEvidenceCount} invalid or unscored evidence item(s) were excluded from characterization.`);
    lines.push(`Concept strengths/attention are characterized only when each concept has at least ${MIN_EVIDENCE} valid evidence items.`);
    lines.push('Teacher review required before saving or sharing.');

    await writeAudit({ actorUserId: session.user_id, action: 'teacher.notes.draft_view', entityType: 'learner', entityId: learnerId, metadata: { evidenceCount: rows.length, invalidEvidenceExcluded: invalidEvidenceCount, assessmentCount: attempts.rows.length, role: isAdmin ? 'admin' : 'teacher', minimumEvidence: MIN_EVIDENCE } });
    return json(res, 200, { ok: true, learnerId, draft: lines.join(' '), evidenceCount: rows.length, invalidEvidenceExcluded: invalidEvidenceCount, assessmentCount: attempts.rows.length, evidenceGate: { minimumEvidencePerConcept: MIN_EVIDENCE, sparseConceptsNotCharacterized: true, validCorrectnessStates: [...VALID_CORRECTNESS] }, source: 'server_learning_evidence', limitation: 'Deterministic evidence summary only; teacher review is required before saving or sharing.' });
  } catch (e) {
    return json(res, e.status || 500, { error: { code: e.code || 'M26_NOTES_FAILED', message: e.status ? e.message : 'Unable to generate the evidence-backed teacher note draft.' } });
  }
}
