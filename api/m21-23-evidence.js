import { json } from './_lib/security.js';
import { requireAuth, requireLearnerAccess } from './_lib/auth.js';
import { sql } from './_lib/db.js';

export const config = { runtime: 'nodejs' };
const clean = (v, max = 180) => String(v ?? '').trim().slice(0, max);
const MIN_EVIDENCE = 3;
const PAGE_SIZE = 500;
const pct = (correct, total) => total > 0 ? correct / total : 0;

async function loadAllEvidence(learnerId) {
  const rows = [];
  let cursor = null;
  for (;;) {
    const page = cursor
      ? await sql`
          SELECT id, subject, concept, correctness, created_at AS "createdAt"
          FROM learning_evidence
          WHERE learner_id=${learnerId}
            AND (created_at < ${cursor.createdAt}
              OR (created_at = ${cursor.createdAt} AND id < ${cursor.id}))
          ORDER BY created_at DESC, id DESC
          LIMIT ${PAGE_SIZE}`
      : await sql`
          SELECT id, subject, concept, correctness, created_at AS "createdAt"
          FROM learning_evidence
          WHERE learner_id=${learnerId}
          ORDER BY created_at DESC, id DESC
          LIMIT ${PAGE_SIZE}`;
    const batch = Array.isArray(page?.rows) ? page.rows : [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    const last = batch[batch.length - 1];
    cursor = { createdAt: last.createdAt, id: last.id };
  }
  return rows;
}

function aggregate(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = `${row.subject || 'Unknown'}::${row.concept || 'Unspecified'}`;
    if (!map.has(key)) map.set(key, { subject: row.subject || null, concept: row.concept || 'Unspecified', evidenceCount: 0, correctCount: 0, incorrectCount: 0, uncertainCount: 0, lastSeen: row.createdAt || null });
    const item = map.get(key);
    item.evidenceCount += 1;
    if (row.correctness === 'correct') item.correctCount += 1;
    else if (row.correctness === 'incorrect' || row.correctness === 'partially_correct') item.incorrectCount += 1;
    else item.uncertainCount += 1;
    if (!item.lastSeen || new Date(row.createdAt) > new Date(item.lastSeen)) item.lastSeen = row.createdAt;
  }
  return [...map.values()].map(x => ({ ...x, accuracy: pct(x.correctCount, x.evidenceCount), insufficientEvidence: x.evidenceCount < MIN_EVIDENCE }));
}

async function loadPracticeQuestions(learnerId) {
  return sql`
    WITH eligible_concepts AS (
      SELECT subject, concept,
             COUNT(*)::int AS evidence_count,
             COUNT(*) FILTER (WHERE correctness = 'correct')::int AS correct_count
      FROM learning_evidence
      WHERE learner_id=${learnerId}
      GROUP BY subject, concept
      HAVING COUNT(*) >= ${MIN_EVIDENCE}
    )
    SELECT q.id, q.subject, q.chapter, q.topic, q.concept, q.difficulty, q.type, q.marks,
           q.time_estimate_sec AS "timeEstimateSec", q.text, q.options
    FROM questions q
    JOIN eligible_concepts e
      ON q.subject IS NOT DISTINCT FROM e.subject
     AND q.concept IS NOT DISTINCT FROM e.concept
    ORDER BY
      (e.correct_count::double precision / NULLIF(e.evidence_count, 0)) ASC,
      e.evidence_count DESC,
      q.subject, q.chapter, q.concept, q.id
    LIMIT 20`;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  if (req.method !== 'GET') return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'GET required.' } }, { Allow: 'GET' });
  try {
    const session = await requireAuth(req);
    const learnerId = clean(req.query?.learnerId, 120);
    await requireLearnerAccess(session, learnerId);
    const [evidenceRows, questionResult] = await Promise.all([
      loadAllEvidence(learnerId),
      loadPracticeQuestions(learnerId)
    ]);
    const concepts = aggregate(evidenceRows);
    const weaknesses = concepts.filter(x => x.evidenceCount >= MIN_EVIDENCE && x.accuracy < 0.6)
      .sort((a,b) => a.accuracy-b.accuracy || b.evidenceCount-a.evidenceCount)
      .map(x => ({ ...x, status: 'needs_revision', reason: `Recorded evidence is below the weakness threshold (${x.correctCount}/${x.evidenceCount} correct).` }));
    const strengths = concepts.filter(x => x.evidenceCount >= MIN_EVIDENCE && x.accuracy >= 0.8)
      .sort((a,b) => b.accuracy-a.accuracy || b.evidenceCount-a.evidenceCount)
      .map(x => ({ ...x, status: 'strong', reason: `Recorded evidence shows ${x.correctCount}/${x.evidenceCount} correct.` }));
    const prioritizedConcepts = concepts.filter(x => x.evidenceCount >= MIN_EVIDENCE)
      .sort((a,b) => a.accuracy-b.accuracy || b.evidenceCount-a.evidenceCount)
      .map(x => ({ subject: x.subject, concept: x.concept, accuracy: x.accuracy, evidenceCount: x.evidenceCount }));
    return json(res, 200, { ok: true, learnerId, evidenceCount: evidenceRows.length, weaknesses, strengths, prioritizedConcepts, practiceQuestions: questionResult.rows, evidenceGate: { minimumEvidence: MIN_EVIDENCE, sparseEvidenceStatus: 'insufficient_evidence' }, limitation: 'M21–M23 summarize recorded academic evidence only; they do not diagnose ability, motivation, personality, or psychological traits. Evidence is read with keyset pagination so older records are not silently dropped at an arbitrary row limit.' });
  } catch (e) {
    return json(res, e.status || 500, { error: { code: e.code || 'M21_23_EVIDENCE_FAILED', message: e.status ? e.message : 'Unable to load learning evidence.' } });
  }
}
