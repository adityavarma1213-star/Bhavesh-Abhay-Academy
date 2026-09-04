import { json, writeAudit } from './_lib/security.js';
import { requireAuth, hasRole } from './_lib/auth.js';
import { sql } from './_lib/db.js';
import { consumeAiRateLimit } from './_lib/ai-rate-limit.js';

export const config = { runtime: 'nodejs' };
const MODEL = 'gemini-3.5-flash-lite';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const MAX_OUTPUT_TOKENS = 700;
const MAX_NOTE_CHARS = 2200;
const MIN_EVIDENCE = 3;
const EVIDENCE_PAGE_SIZE = 500;
const MAX_EVIDENCE_PER_CONCEPT = 12;
const MAX_PROVIDER_BYTES = 1024 * 1024;
const MAX_LEARNER_ID_CHARS = 120;
const MAX_SUBJECT_CHARS = 120;
const MAX_CHAPTER_CHARS = 160;
const MAX_CONCEPT_CHARS = 180;
const MAX_CORRECTNESS_CHARS = 40;
const MAX_ASSESSMENT_TITLE_CHARS = 160;
const clean = (v) => String(v ?? '').trim();
const display = (v, max) => clean(v).slice(0, max);

function bounded(value, field, max, { required = true } = {}) {
  if (value == null || String(value).trim() === '') {
    if (required) return { ok: false, code: `${field.toUpperCase()}_REQUIRED`, message: `${field} is required.` };
    return { ok: true, value: '' };
  }
  if (typeof value !== 'string') return { ok: false, code: `${field.toUpperCase()}_INVALID`, message: `${field} must be a string.` };
  const valueTrimmed = value.trim();
  if (valueTrimmed.length > max) return { ok: false, code: 'VALUE_TOO_LONG', message: `${field} must be at most ${max} characters.` };
  return { ok: true, value: valueTrimmed };
}

function promptFor({ evidence, attempts }) {
  const evidenceLines = evidence.map((r) => ({
    subject: display(r.subject, MAX_SUBJECT_CHARS),
    chapter: display(r.chapter, MAX_CHAPTER_CHARS),
    concept: display(r.concept, MAX_CONCEPT_CHARS),
    correctness: display(r.correctness, MAX_CORRECTNESS_CHARS),
    created_at: r.created_at,
  }));
  const attemptLines = attempts.map((r) => ({
    assessment_title: display(r.assessment_title, MAX_ASSESSMENT_TITLE_CHARS),
    score: Number(r.score),
    max_score: Number(r.max_score),
    completed_at: r.completed_at,
  }));
  return `You are writing a concise teacher note for BAA. This is an academic evidence summary, not a diagnosis and not a psychological assessment.\n\nSTRICT RULES:\n- Use ONLY the supplied recorded evidence and assessment attempts.\n- Do not invent grades, abilities, causes, emotions, attendance, effort, family facts, or future outcomes.\n- Do not label or diagnose the learner.\n- Do not expose the learner ID in the note.\n- Distinguish evidence from interpretation.\n- If evidence is sparse or mixed, say so plainly.\n- Do not claim mastery unless the supplied evidence supports that wording; prefer 'shows stronger performance' when appropriate.\n- Produce 3 short sections with these exact headings: Strengths, Attention, Next step.\n- Each section should contain 1-2 concise sentences.\n- The Next step must be a practical academic action grounded in the evidence, and should leave the teacher in control.\n- Return plain text only, no markdown table.\n\nThe supplied concept evidence has already passed BAA's minimum evidence gate of ${MIN_EVIDENCE} recorded items per concept. The supplied rows are the most recent evidence for each eligible concept; do not make a concept-level strength or attention claim from any concept unless its supplied evidence contains at least ${MIN_EVIDENCE} rows.\n\nSUPPLIED RECENT LEARNING EVIDENCE (${evidenceLines.length} rows):\n${JSON.stringify(evidenceLines)}\n\nRECENT ASSESSMENT ATTEMPTS (${attemptLines.length} rows):\n${JSON.stringify(attemptLines)}`;
}

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

async function readJsonWithinLimit(response) {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_PROVIDER_BYTES) return { ok: false, code: 'PAYLOAD_TOO_LARGE' };
  const reader = response.body?.getReader?.();
  if (!reader) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_PROVIDER_BYTES) return { ok: false, code: 'PAYLOAD_TOO_LARGE' };
    try { return { ok: true, body: JSON.parse(text) }; } catch { return { ok: false, code: 'INVALID_JSON' }; }
  }
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_PROVIDER_BYTES) {
        await reader.cancel().catch(() => {});
        return { ok: false, code: 'PAYLOAD_TOO_LARGE' };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock?.();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return { ok: true, body: JSON.parse(new TextDecoder().decode(bytes)) }; }
  catch { return { ok: false, code: 'INVALID_JSON' }; }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  if (req.method !== 'POST') return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'POST required.' } }, { Allow: 'POST' });
  try {
    const session = await requireAuth(req);
    if (!hasRole(session, 'teacher') && !hasRole(session, 'admin')) {
      return json(res, 403, { error: { code: 'FORBIDDEN', message: 'Teacher or administrator role required.' } });
    }
    const rate = await consumeAiRateLimit('m26-notes', session.user_id, { windowSeconds: 300, maxRequests: 10 });
    if (rate.limited) return json(res, 429, { error: { code: 'RATE_LIMITED', message: 'Too many note-generation requests. Please wait a moment.' } });

    const learnerCheck = bounded(req.body?.learnerId, 'learnerId', MAX_LEARNER_ID_CHARS);
    if (!learnerCheck.ok) return json(res, 400, { error: { code: learnerCheck.code, message: learnerCheck.message } });
    const learnerId = learnerCheck.value;

    const accessRows = hasRole(session, 'admin')
      ? await sql`SELECT id FROM learners WHERE id=${learnerId} LIMIT 1`
      : await sql`
          SELECT cm.learner_id AS id FROM class_members cm
          JOIN classes c ON c.id=cm.class_id
          WHERE cm.learner_id=${learnerId} AND cm.status='active'
            AND c.teacher_user_id=${session.user_id} AND c.archived_at IS NULL LIMIT 1`;
    if (!accessRows.rows.length) return json(res, 404, { error: { code: 'LEARNER_NOT_FOUND', message: 'Learner not found or not accessible.' } });

    const [evidenceRows, attempts] = await Promise.all([
      loadAllEvidence(learnerId),
      sql`
        SELECT assessment_title, score, max_score, completed_at
        FROM assessment_attempts WHERE learner_id=${learnerId}
          AND status IN ('submitted','evaluated','completed')
        ORDER BY completed_at DESC NULLS LAST, created_at DESC LIMIT 5`
    ]);

    if (!evidenceRows.length && !attempts.rows.length) {
      return json(res, 200, { ok: true, learnerId, generated: false, draft: 'There is not enough recorded academic evidence yet to generate an AI teacher note.', evidenceCount: 0, assessmentCount: 0, evidenceGate: { minimumEvidencePerConcept: MIN_EVIDENCE, eligibleConcepts: 0 }, limitation: 'No AI inference was made because evidence is insufficient.' });
    }

    const grouped = new Map();
    for (const row of evidenceRows) {
      const concept = clean(row.concept);
      if (!concept) continue;
      if (!grouped.has(concept)) grouped.set(concept, []);
      grouped.get(concept).push(row);
    }
    const eligibleConcepts = new Set([...grouped.entries()].filter(([, rows]) => rows.length >= MIN_EVIDENCE).map(([concept]) => concept));
    const gatedEvidence = [...eligibleConcepts].flatMap((concept) => grouped.get(concept).slice(0, MAX_EVIDENCE_PER_CONCEPT));

    if (!gatedEvidence.length) {
      return json(res, 200, {
        ok: true,
        learnerId,
        generated: false,
        draft: `There is not enough repeated evidence yet to generate an AI teacher note. BAA requires at least ${MIN_EVIDENCE} recorded learning-evidence items for a concept before making a concept-level strength or attention statement.`,
        evidenceCount: evidenceRows.length,
        eligibleEvidenceCount: 0,
        assessmentCount: attempts.rows.length,
        evidenceGate: { minimumEvidencePerConcept: MIN_EVIDENCE, eligibleConcepts: 0 },
        limitation: 'No AI inference was made because no concept passed the evidence gate. Teacher review remains required.'
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return json(res, 503, { error: { code: 'AI_NOT_CONFIGURED', message: 'AI note generation is not configured on this deployment. Use the evidence-backed draft instead.' } });

    const response = await callGemini(promptFor({ evidence: gatedEvidence, attempts: attempts.rows }), apiKey);
    if (!response.ok) return json(res, 502, { error: { code: 'AI_UPSTREAM_FAILED', message: 'AI note generation failed. Use the evidence-backed draft instead.' } });
    const parsed = await readJsonWithinLimit(response);
    if (!parsed.ok) return json(res, 502, { error: { code: 'AI_UPSTREAM_INVALID', message: parsed.code === 'PAYLOAD_TOO_LARGE' ? 'AI note provider response exceeded the 1 MiB safety limit.' : 'AI note provider returned invalid JSON.' } });
    const payload = parsed.body;
    const draft = payload?.candidates?.[0]?.content?.parts?.map((p) => p?.text || '').join('').trim().slice(0, MAX_NOTE_CHARS);
    if (!draft) return json(res, 502, { error: { code: 'AI_EMPTY_RESPONSE', message: 'AI returned no usable teacher note. Use the evidence-backed draft instead.' } });

    await writeAudit({ actorUserId: session.user_id, action: 'teacher.notes.ai_draft', entityType: 'learner', entityId: learnerId, metadata: { evidenceCount: gatedEvidence.length, rawEvidenceCount: evidenceRows.length, eligibleConceptCount: eligibleConcepts.size, assessmentCount: attempts.rows.length, minimumEvidence: MIN_EVIDENCE, maxEvidencePerConcept: MAX_EVIDENCE_PER_CONCEPT, role: hasRole(session, 'admin') ? 'admin' : 'teacher', model: MODEL } });
    return json(res, 200, { ok: true, learnerId, generated: true, draft, evidenceCount: gatedEvidence.length, rawEvidenceCount: evidenceRows.length, eligibleConceptCount: eligibleConcepts.size, assessmentCount: attempts.rows.length, evidenceGate: { minimumEvidencePerConcept: MIN_EVIDENCE, eligibleConcepts: eligibleConcepts.size }, model: MODEL, limitation: `AI-generated academic summary grounded in the complete stored evidence history for concept eligibility, with the ${MAX_EVIDENCE_PER_CONCEPT} most recent rows supplied per eligible concept; teacher review is required before saving or sharing.` });
  } catch (e) {
    return json(res, e.status || 500, { error: { code: e.code || 'M26_AI_NOTES_FAILED', message: e.status ? e.message : 'Unable to generate the AI teacher note.' } });
  }
}
