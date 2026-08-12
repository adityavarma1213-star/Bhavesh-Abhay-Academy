// BAA v1: Learning Memory persistence.
//
// SECURITY RULE (same boundary as api/v1/assessment.js and api/v1/rewards.js):
// learning_memory and mistake_patterns are marked DERIVED in db/schema.sql —
// "Recomputable from learning_evidence at any time... see js/baa-assessment.js
// updateLearningMemory() for the exact derivation rule being mirrored." This
// file now honors that: status/evidence_count/correct_count and mistake
// pattern status are computed server-side from server-verified
// learning_evidence rows (which are themselves only ever written from
// verified assessment_results — see api/v1/assessment.js). The client's own
// learningMemory/mistakePatterns payload is no longer written to the
// database; it is accepted for backward compatibility but ignored, so a
// forged "mastered" claim on a concept the student never actually answered
// correctly cannot reach a table that AI Mode, the Tutor, Planner, or the
// Confidence Meter (M9/M10) read from.
//
// The exact thresholds mirror js/baa-assessment.js:
// MIN_EVIDENCE_FOR_JUDGEMENT=3, RECENT_WINDOW=5, MASTERED_THRESHOLD=0.8,
// LEARNING_THRESHOLD=0.5, MISTAKE_PATTERN_THRESHOLD=3 — so server-derived
// status matches what the client would have computed from the same evidence.

import { sql } from '../_lib/db.js';
import { requireAuth, requireLearnerAccess } from '../_lib/auth.js';
import { json, id, writeAudit } from '../_lib/security.js';
export const config={runtime:'nodejs'};

const MIN_EVIDENCE_FOR_JUDGEMENT = 3;
const RECENT_WINDOW = 5;
const MASTERED_THRESHOLD = 0.8;
const LEARNING_THRESHOLD = 0.5;
const MISTAKE_PATTERN_THRESHOLD = 3;

async function deriveAndPersist(learnerId) {
  const evidence = await sql`SELECT id,concept,subject,topic,correctness,error_type,attempt_id,question_id,created_at
    FROM learning_evidence WHERE learner_id=${learnerId} ORDER BY created_at ASC`;
  const rows = evidence.rows;
  const now = new Date().toISOString();

  // ---- learning_memory: one row per concept, derived from all evidence for that concept ----
  const byConcept = new Map();
  for (const r of rows) {
    if (!byConcept.has(r.concept)) byConcept.set(r.concept, []);
    byConcept.get(r.concept).push(r);
  }
  for (const [concept, allForConcept] of byConcept) {
    const evidenceCount = allForConcept.length;
    const correctCount = allForConcept.filter(e => e.correctness === 'correct').length;
    let status;
    if (evidenceCount < MIN_EVIDENCE_FOR_JUDGEMENT) {
      status = 'insufficient_evidence';
    } else {
      const recent = allForConcept.slice(-RECENT_WINDOW);
      const correctRate = recent.filter(e => e.correctness === 'correct').length / recent.length;
      status = correctRate >= MASTERED_THRESHOLD ? 'mastered' : correctRate >= LEARNING_THRESHOLD ? 'learning' : 'needs_revision';
    }
    const last = allForConcept[allForConcept.length - 1];
    await sql`INSERT INTO learning_memory(learner_id,concept,subject,topic,status,evidence_count,correct_count,last_updated)
               VALUES(${learnerId},${concept},${last.subject||null},${last.topic||null},${status},${evidenceCount},${correctCount},${now})
               ON CONFLICT(learner_id,concept) DO UPDATE SET
                 subject=EXCLUDED.subject, topic=EXCLUDED.topic, status=EXCLUDED.status,
                 evidence_count=EXCLUDED.evidence_count, correct_count=EXCLUDED.correct_count, last_updated=EXCLUDED.last_updated`;
    const prior = await sql`SELECT status,evidence_count FROM learning_memory_history WHERE learner_id=${learnerId} AND concept=${concept} ORDER BY recorded_at DESC LIMIT 1`;
    const p = prior.rows[0];
    if (!p || p.status !== status || Number(p.evidence_count) !== evidenceCount) {
      await sql`INSERT INTO learning_memory_history(id,learner_id,concept,status,evidence_count,recorded_at)
                 VALUES(${id('lmh')},${learnerId},${concept},${status},${evidenceCount},${now})`;
    }
  }

  // ---- mistake_patterns: group incorrect/erroring evidence by (concept, error_type) ----
  const byPatternKey = new Map();
  for (const r of rows) {
    if (r.correctness === 'correct' || !r.error_type) continue;
    const key = `${r.concept}::${r.error_type}`;
    if (!byPatternKey.has(key)) byPatternKey.set(key, { concept: r.concept, subject: r.subject, errorType: r.error_type, occurrences: [] });
    byPatternKey.get(key).occurrences.push(r);
  }
  for (const p of byPatternKey.values()) {
    const status = p.occurrences.length >= MISTAKE_PATTERN_THRESHOLD ? 'possible_misconception' : 'watching';
    const first = p.occurrences[0].created_at;
    const last = p.occurrences[p.occurrences.length - 1].created_at;
    const patternId = id('pattern');
    const inserted = await sql`INSERT INTO mistake_patterns(id,learner_id,concept,subject,error_type,status,first_detected,last_detected)
               VALUES(${patternId},${learnerId},${p.concept},${p.subject||null},${p.errorType},${status},${first},${last})
               ON CONFLICT(learner_id,concept,error_type) DO UPDATE SET status=EXCLUDED.status,last_detected=EXCLUDED.last_detected
               RETURNING id`;
    const realPatternId = inserted.rows[0]?.id || patternId;
    for (const occ of p.occurrences) {
      await sql`INSERT INTO mistake_pattern_occurrences(id,pattern_id,evidence_id,occurred_at)
                 VALUES(${id('occ')},${realPatternId},${occ.id},${occ.created_at})
                 ON CONFLICT(pattern_id,evidence_id) DO NOTHING`;
    }
  }

  return getSnapshot(learnerId);
}

async function getSnapshot(learnerId) {
  const [memory, patterns] = await Promise.all([
    sql`SELECT concept,subject,topic,status,evidence_count,correct_count,last_updated FROM learning_memory WHERE learner_id=${learnerId}`,
    sql`SELECT id,concept,subject,error_type,status,first_detected,last_detected FROM mistake_patterns WHERE learner_id=${learnerId}`,
  ]);
  const learningMemory = {};
  for (const m of memory.rows) {
    learningMemory[m.concept] = {
      concept: m.concept, subject: m.subject, topic: m.topic, status: m.status,
      evidenceCount: m.evidence_count, correctCount: m.correct_count, lastUpdated: m.last_updated,
    };
  }
  return {
    learningMemory,
    mistakePatterns: patterns.rows.map(p => ({
      id: p.id, concept: p.concept, subject: p.subject, errorType: p.error_type,
      status: p.status, firstDetected: p.first_detected, lastSeen: p.last_detected,
    })),
  };
}

export default async function handler(req, res) {
  try {
    const s = await requireAuth(req);
    const learnerId = String(req.query?.learnerId || '');
    await requireLearnerAccess(s, learnerId);

    if (req.method === 'GET') {
      return json(res, 200, { ok: true, snapshot: await getSnapshot(learnerId) });
    }

    if (req.method === 'PUT') {
      // The client's learningMemory/mistakePatterns body (if any) is intentionally not read:
      // both are DERIVED tables (see db/schema.sql) and are recomputed here from
      // server-verified learning_evidence instead, so this sync can never be used to
      // write an unearned "mastered" status or hide a real mistake pattern.
      const snapshot = await deriveAndPersist(learnerId);
      await writeAudit({ actorUserId: s.user_id, action: 'learning_memory.sync', entityType: 'learner', entityId: learnerId, metadata: { serverDerived: true, concepts: Object.keys(snapshot.learningMemory).length, patterns: snapshot.mistakePatterns.length } });
      return json(res, 200, { ok: true, snapshot });
    }

    return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'GET or PUT required.' } }, { Allow: 'GET, PUT' });
  } catch (e) {
    return json(res, e.status || 500, { error: { code: e.code || 'LEARNING_MEMORY_SYNC_FAILED', message: e.status ? e.message : 'Learning memory sync failed.' } });
  }
}
