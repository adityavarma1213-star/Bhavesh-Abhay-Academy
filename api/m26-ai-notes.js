import { json, writeAudit } from './_lib/security.js';
import { requireAuth, hasRole } from './_lib/auth.js';
import { sql } from './_lib/db.js';
import { consumeAiRateLimit } from './_lib/ai-rate-limit.js';

export const config = { runtime: 'nodejs' };
const MODEL = 'gemini-3.5-flash-lite';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const MAX_OUTPUT_TOKENS = 700;
const MAX_NOTE_CHARS = 2200;
const clean = (v, max = 160) => String(v ?? '').trim().slice(0, max);

function promptFor({ learnerId, evidence, attempts }) {
  const evidenceLines = evidence.map((r) => ({
    subject: clean(r.subject, 80),
    chapter: clean(r.chapter, 100),
    concept: clean(r.concept, 120),
    correctness: clean(r.correctness, 40),
    created_at: r.created_at,
  }));
  const attemptLines = attempts.map((r) => ({
    assessment_title: clean(r.assessment_title, 120),
    score: Number(r.score),
    max_score: Number(r.max_score),
    completed_at: r.completed_at,
  }));
  return `You are writing a concise teacher note for BAA. This is an academic evidence summary, not a diagnosis and not a psychological assessment.\n\nSTRICT RULES:\n- Use ONLY the supplied recorded evidence and assessment attempts.\n- Do not invent grades, abilities, causes, emotions, attendance, effort, family facts, or future outcomes.\n- Do not label or diagnose the learner.\n- Do not expose the learner ID in the note.\n- Distinguish evidence from interpretation.\n- If evidence is sparse or mixed, say so plainly.\n- Do not claim mastery unless the supplied evidence supports that wording; prefer 'shows stronger performance' when appropriate.\n- Produce 3 short sections with these exact headings: Strengths, Attention, Next step.\n- Each section should contain 1-2 concise sentences.\n- The Next step must be a practical academic action grounded in the evidence, and should leave the teacher in control.\n- Return plain text only, no markdown table.\n\nRECORDED LEARNING EVIDENCE (${evidenceLines.length} rows):\n${JSON.stringify(evidenceLines)}\n\nRECENT ASSESSMENT ATTEMPTS (${attemptLines.length} rows):\n${JSON.stringify(attemptLines)}`;
}

async function callGemini(prompt, apiKey) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: MAX_OUTPUT_TOKENS },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response;
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'POST required.' } }, { Allow: 'POST' });
  try {
    const session = await requireAuth(req);
    if (!hasRole(session, 'teacher') && !hasRole(session, 'admin')) {
      return json(res, 403, { error: { code: 'FORBIDDEN', message: 'Teacher or administrator role required.' } });
    }
    const rate = await consumeAiRateLimit('m26-notes', session.user_id, { windowSeconds: 300, maxRequests: 10 });
    if (rate.limited) return json(res, 429, { error: { code: 'RATE_LIMITED', message: 'Too many note-generation requests. Please wait a moment.' } });

    const learnerId = clean(req.body?.learnerId, 120);
    if (!learnerId) return json(res, 400, { error: { code: 'INVALID_LEARNER', message: 'learnerId is required.' } });

    const accessRows = hasRole(session, 'admin')
      ? await sql`SELECT id FROM learners WHERE id=${learnerId} LIMIT 1`
      : await sql`
          SELECT cm.learner_id AS id FROM class_members cm
          JOIN classes c ON c.id=cm.class_id
          WHERE cm.learner_id=${learnerId} AND cm.status='active'
            AND c.teacher_user_id=${session.user_id} AND c.archived_at IS NULL LIMIT 1`;
    if (!accessRows.rows.length) return json(res, 404, { error: { code: 'LEARNER_NOT_FOUND', message: 'Learner not found or not accessible.' } });

    const evidence = await sql`
      SELECT subject, chapter, concept, correctness, created_at
      FROM learning_evidence WHERE learner_id=${learnerId}
      ORDER BY created_at DESC LIMIT 60`;
    const attempts = await sql`
      SELECT assessment_title, score, max_score, completed_at
      FROM assessment_attempts WHERE learner_id=${learnerId}
        AND status IN ('submitted','evaluated','completed')
      ORDER BY completed_at DESC NULLS LAST, created_at DESC LIMIT 5`;

    if (!evidence.rows.length && !attempts.rows.length) {
      return json(res, 200, { ok: true, learnerId, generated: false, draft: 'There is not enough recorded academic evidence yet to generate an AI teacher note.', evidenceCount: 0, assessmentCount: 0, limitation: 'No AI inference was made because evidence is insufficient.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return json(res, 503, { error: { code: 'AI_NOT_CONFIGURED', message: 'AI note generation is not configured on this deployment. Use the evidence-backed draft instead.' } });

    const response = await callGemini(promptFor({ learnerId, evidence: evidence.rows, attempts: attempts.rows }), apiKey);
    if (!response.ok) return json(res, 502, { error: { code: 'AI_UPSTREAM_FAILED', message: 'AI note generation failed. Use the evidence-backed draft instead.' } });
    const payload = await response.json().catch(() => null);
    const draft = payload?.candidates?.[0]?.content?.parts?.map((p) => p?.text || '').join('').trim().slice(0, MAX_NOTE_CHARS);
    if (!draft) return json(res, 502, { error: { code: 'AI_EMPTY_RESPONSE', message: 'AI returned no usable teacher note. Use the evidence-backed draft instead.' } });

    await writeAudit({ actorUserId: session.user_id, action: 'teacher.notes.ai_draft', entityType: 'learner', entityId: learnerId, metadata: { evidenceCount: evidence.rows.length, assessmentCount: attempts.rows.length, role: hasRole(session, 'admin') ? 'admin' : 'teacher', model: MODEL } });
    return json(res, 200, { ok: true, learnerId, generated: true, draft, evidenceCount: evidence.rows.length, assessmentCount: attempts.rows.length, model: MODEL, limitation: 'AI-generated academic summary grounded only in recorded BAA evidence; teacher review is required before saving or sharing.' });
  } catch (e) {
    return json(res, e.status || 500, { error: { code: e.code || 'M26_AI_NOTES_FAILED', message: e.status ? e.message : 'Unable to generate the AI teacher note.' } });
  }
}
