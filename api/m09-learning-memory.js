import { json } from './_lib/security.js';
import { requireAuth, requireLearnerAccess } from './_lib/auth.js';
import { sql } from './_lib/db.js';

export const config = { runtime: 'nodejs' };

const clean = (v, max = 160) => String(v ?? '').trim().slice(0, max);
const human = v => clean(v, 100).replace(/[-_]+/g, ' ');

function confidence(count, hasReviewFlag) {
  if (count < 3) return { level: 'insufficient', label: 'Not enough evidence' };
  if (hasReviewFlag) return { level: 'low', label: 'Low evidence confidence' };
  if (count >= 6) return { level: 'high', label: 'High evidence confidence' };
  return { level: 'medium', label: 'Moderate evidence confidence' };
}

function deriveState(rows) {
  if (rows.length < 3) return 'insufficient_evidence';
  const recent = rows.slice(0, 5);
  const correct = recent.filter(r => r.correctness === 'correct').length;
  const rate = correct / recent.length;
  if (rate >= 0.8) return 'mastered';
  if (rate >= 0.6) return 'learning';
  if (rate <= 0.25) return 'struggling';
  return 'needs_revision';
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'GET required.' } }, { Allow: 'GET', 'Cache-Control': 'private, no-store, max-age=0' });
  try {
    const session = await requireAuth(req);
    const learnerId = clean(req.query?.learnerId, 120);
    await requireLearnerAccess(session, learnerId);

    const result = await sql`
      SELECT id, concept, subject, topic, correctness, confidence, error_type, created_at
      FROM learning_evidence
      WHERE learner_id = ${learnerId}
      ORDER BY created_at DESC
      LIMIT 1000
    `;
    const rows = result.rows || [];
    const grouped = new Map();
    for (const row of rows) {
      const concept = clean(row.concept, 120);
      if (!concept) continue;
      if (!grouped.has(concept)) grouped.set(concept, []);
      grouped.get(concept).push(row);
    }

    const concepts = [...grouped.entries()].map(([concept, evidence]) => {
      const state = deriveState(evidence);
      const correct = evidence.filter(r => r.correctness === 'correct').length;
      const reviewFlag = evidence.some(r => ['low', 'human_review_required'].includes(String(r.confidence || '').toLowerCase()));
      const conf = confidence(evidence.length, reviewFlag);
      const recent = evidence.slice(0, 5);
      const recentCorrect = recent.filter(r => r.correctness === 'correct').length;
      const rate = recent.length ? Math.round((recentCorrect / recent.length) * 100) : null;
      const errorTypes = [...new Set(recent.map(r => clean(r.error_type, 80)).filter(Boolean))].slice(0, 4);
      return {
        concept,
        conceptLabel: human(concept),
        subject: clean(evidence[0]?.subject, 80),
        topic: clean(evidence[0]?.topic, 100),
        state,
        evidenceCount: evidence.length,
        correctCount: correct,
        recentAccuracy: rate,
        confidence: conf,
        repeatedErrorTypes: errorTypes,
        lastUpdated: evidence[0]?.created_at || null,
        explanation: evidence.length < 3
          ? `Only ${evidence.length} recorded evidence item${evidence.length === 1 ? '' : 's'} exists for this concept; BAA will not draw a firm conclusion yet.`
          : `The ${recent.length} most recent evidence items show ${recentCorrect}/${recent.length} correct (${rate}%). Across all ${evidence.length} recorded items, ${correct} are correct.`
      };
    }).sort((a, b) => String(b.lastUpdated || '').localeCompare(String(a.lastUpdated || '')));

    const summary = {
      hasAnyEvidence: rows.length > 0,
      totalEvidence: rows.length,
      trackedConcepts: concepts.length,
      mastered: concepts.filter(c => c.state === 'mastered').length,
      learning: concepts.filter(c => c.state === 'learning').length,
      needsRevision: concepts.filter(c => c.state === 'needs_revision').length,
      struggling: concepts.filter(c => c.state === 'struggling').length,
      insufficientEvidence: concepts.filter(c => c.state === 'insufficient_evidence').length,
    };

    return json(res, 200, {
      ok: true,
      learnerId,
      summary,
      concepts,
      methodology: 'Learning Memory is derived only from authenticated learner-scoped academic evidence already stored in PostgreSQL. It never invents evidence or treats missing evidence as weakness.',
      limitations: [
        'Academic learning signals only; no psychological or emotional profiling.',
        'Question-level evidence is included only when the corresponding server evidence rows exist.',
        'This endpoint does not claim that a production database is provisioned merely because the source path exists.'
      ]
    }, { 'Cache-Control': 'private, no-store, max-age=0' });
  } catch (e) {
    return json(res, e.status || 500, { error: { code: e.code || 'LEARNING_MEMORY_FAILED', message: e.status ? e.message : 'Unable to load learning memory.' } }, { 'Cache-Control': 'private, no-store, max-age=0' });
  }
}