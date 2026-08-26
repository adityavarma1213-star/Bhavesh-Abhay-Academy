import { json } from './_lib/security.js';
import { requireAuth, requireLearnerAccess } from './_lib/auth.js';
import { sql } from './_lib/db.js';

export const config = { runtime: 'nodejs' };
const clean = (v, max = 180) => String(v ?? '').trim().slice(0, max);
const pct = (correct, total) => total > 0 ? correct / total : 0;

function aggregate(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = `${row.subject || 'Unknown'}::${row.concept || 'Unspecified'}`;
    if (!map.has(key)) map.set(key, {
      subject: row.subject || null,
      concept: row.concept || 'Unspecified',
      evidenceCount: 0,
      correctCount: 0,
      incorrectCount: 0,
      uncertainCount: 0,
      lastSeen: row.createdAt || null
    });
    const item = map.get(key);
    item.evidenceCount += 1;
    if (row.correctness === 'correct') item.correctCount += 1;
    else if (row.correctness === 'incorrect' || row.correctness === 'partially_correct') item.incorrectCount += 1;
    else item.uncertainCount += 1;
    if (!item.lastSeen || new Date(row.createdAt) > new Date(item.lastSeen)) item.lastSeen = row.createdAt;
  }
  return [...map.values()].map(x => ({
    ...x,
    accuracy: pct(x.correctCount, x.evidenceCount),
    insufficientEvidence: x.evidenceCount < 2
  }));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'GET required.' } }, { Allow: 'GET' });
  try {
    const session = await requireAuth(req);
    const learnerId = clean(req.query?.learnerId, 120);
    await requireLearnerAccess(session, learnerId);
    const limit = Math.min(Math.max(Number(req.query?.limit || 500), 1), 1000);
    const result = await sql`
      SELECT subject, concept, correctness, created_at AS "createdAt"
      FROM learning_evidence
      WHERE learner_id=${learnerId}
      ORDER BY created_at DESC
      LIMIT ${limit}`;
    const concepts = aggregate(result.rows);
    const weaknesses = concepts
      .filter(x => x.evidenceCount >= 2 && x.accuracy < 0.6)
      .sort((a,b) => a.accuracy-b.accuracy || b.evidenceCount-a.evidenceCount)
      .map(x => ({ ...x, status: 'needs_revision', reason: `Recorded evidence is below the weakness threshold (${x.correctCount}/${x.evidenceCount} correct).` }));
    const strengths = concepts
      .filter(x => x.evidenceCount >= 2 && x.accuracy >= 0.8)
      .sort((a,b) => b.accuracy-a.accuracy || b.evidenceCount-a.evidenceCount)
      .map(x => ({ ...x, status: 'strong', reason: `Recorded evidence shows ${x.correctCount}/${x.evidenceCount} correct.` }));
    const prioritizedConcepts = concepts
      .filter(x => x.evidenceCount >= 2)
      .sort((a,b) => a.accuracy-b.accuracy || b.evidenceCount-a.evidenceCount)
      .map(x => ({ subject: x.subject, concept: x.concept, accuracy: x.accuracy, evidenceCount: x.evidenceCount }));
    return json(res, 200, {
      ok: true,
      learnerId,
      evidenceCount: result.rows.length,
      weaknesses,
      strengths,
      prioritizedConcepts,
      limitation: 'M21–M23 summarize recorded academic evidence only; they do not diagnose ability, motivation, personality, or psychological traits.'
    });
  } catch (e) {
    return json(res, e.status || 500, { error: { code: e.code || 'M21_23_EVIDENCE_FAILED', message: e.status ? e.message : 'Unable to load learning evidence.' } });
  }
}
