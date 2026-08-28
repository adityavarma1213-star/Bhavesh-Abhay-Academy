// BAA OS — M04 authoritative AI Tutor adapter.
// Keeps the established Gemini streaming implementation in api/chat.js,
// but replaces client-supplied learningContext with server-owned evidence.
import baseHandler from './chat.js';
import { sql } from './_lib/db.js';
import { requireAuth, requireLearnerAccess } from './_lib/auth.js';
import { json } from './_lib/security.js';

export const config = { runtime: 'nodejs' };

function clean(value, max = 120) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

async function resolveLearnerId(session, requested) {
  const learnerId = clean(requested, 100);
  if (learnerId) {
    await requireLearnerAccess(session, learnerId);
    return learnerId;
  }
  if (session.roles.includes('student')) {
    const result = await sql`
      SELECT id FROM learners
      WHERE user_id=${session.user_id} AND deactivated_at IS NULL
      LIMIT 1
    `;
    if (result.rows[0]?.id) return String(result.rows[0].id);
  }
  return '';
}

async function enforceParentPolicy(session, learnerId) {
  if (!learnerId || !session?.roles?.includes('student')) return;
  const result = await sql`
    SELECT tutor_enabled
    FROM parent_ai_policies
    WHERE learner_id=${learnerId}
    LIMIT 1
  `;
  if (result.rows[0] && result.rows[0].tutor_enabled === false) {
    const err = new Error('AI Tutor is disabled by the active parent approval policy.');
    err.status = 403;
    err.code = 'AI_TUTOR_DISABLED_BY_PARENT_POLICY';
    throw err;
  }
}

async function buildEvidenceContext(learnerId) {
  if (!learnerId) return null;
  const [memory, evidence, attempts] = await Promise.all([
    sql`
      SELECT concept, status, evidence_count, correct_count
      FROM learning_memory
      WHERE learner_id=${learnerId}
        AND status IN ('mastered','learning','needs_revision')
      ORDER BY last_updated DESC
      LIMIT 24
    `,
    sql`
      SELECT concept, subject, chapter, error_type, correctness
      FROM learning_evidence
      WHERE learner_id=${learnerId}
      ORDER BY created_at DESC
      LIMIT 40
    `,
    sql`
      SELECT score, max_score
      FROM assessment_attempts
      WHERE learner_id=${learnerId}
        AND status IN ('submitted','evaluated')
        AND score IS NOT NULL AND max_score > 0
      ORDER BY COALESCE(end_time,start_time) DESC
      LIMIT 8
    `,
  ]);

  const states = memory.rows.map(row => ({
    concept: clean(row.concept, 70),
    status: clean(row.status, 30),
    evidence: Number(row.evidence_count || 0),
    correct: Number(row.correct_count || 0),
  })).filter(row => row.concept);

  const mistakes = evidence.rows
    .filter(row => row.correctness !== true && row.correctness !== 'correct')
    .slice(0, 8)
    .map(row => [clean(row.subject, 30), clean(row.chapter, 40), clean(row.concept, 60), clean(row.error_type, 40)].filter(Boolean).join(' / '))
    .filter(Boolean);

  const percentages = attempts.rows.map(row => Math.round((Number(row.score) / Number(row.max_score)) * 1000) / 10);

  if (!states.length && !mistakes.length && !percentages.length) return null;

  return JSON.stringify({
    conceptStates: states,
    recentPossibleMisconceptions: mistakes,
    recentAssessmentPercentages: percentages,
    evidencePolicy: 'Use only as academic evidence; do not diagnose or infer personal traits.',
  }).slice(0, 1150);
}

export default async function handler(req, res) {
  try {
    // Tutor responses can contain learner-specific evidence and streamed AI output;
    // never allow an intermediary/browser cache to retain the response.
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    if (req.method !== 'POST') return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'POST required.' } });
    const session = await requireAuth(req);
    const body = await req.json();
    const learnerId = await resolveLearnerId(session, body?.learnerId);
    if (!learnerId) {
      return json(res, 400, { error: { code: 'LEARNER_REQUIRED', message: 'A learner context is required for the production AI Tutor path.' } });
    }
    await enforceParentPolicy(session, learnerId);

    const learningContext = await buildEvidenceContext(learnerId);
    const authoritativeBody = {
      ...body,
      learnerId: undefined,
      learningContext,
    };

    // Preserve the existing Gemini streaming/security/rate-limit behavior;
    // only the evidence source is replaced at this boundary.
    req.json = async () => authoritativeBody;
    return baseHandler(req, res);
  } catch (e) {
    return json(res, e.status || 500, {
      error: { code: e.code || 'AI_TUTOR_EVIDENCE_API_FAILED', message: e.status ? e.message : 'AI Tutor evidence service unavailable.' }
    });
  }
}
