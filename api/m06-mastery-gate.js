import { json, id, verifyPassword, writeAudit, clientIp } from './_lib/security.js';
import { requireAuth, requireLearnerAccess, hasRole } from './_lib/auth.js';
import { sql } from './_lib/db.js';

export const config = { runtime: 'nodejs' };
const clean = (v, max = 180) => String(v ?? '').trim().slice(0, max);
const findingKey = (subject, chapter, concept, label) => `${subject}::${chapter}::${concept}::${label}`.toLowerCase();
const VALID_CORRECTNESS = new Set(['correct','partially_correct','incorrect']);
const PAGE_SIZE = 500;
const MAX_LEARNER_ID_CHARS = 120;
const MAX_SUBJECT_CHARS = 120;
const MAX_CHAPTER_CHARS = 180;

function bounded(value, field, max, { required = true } = {}) {
  if (value == null || String(value).trim() === '') {
    if (required) { const err = new Error(`${field} is required.`); err.status = 400; err.code = 'INVALID_GATE_SCOPE'; throw err; }
    return '';
  }
  if (typeof value !== 'string') { const err = new Error(`${field} must be a string.`); err.status = 400; err.code = 'INVALID_GATE_SCOPE'; throw err; }
  const normalized = value.trim();
  if (normalized.length > max) { const err = new Error(`${field} must be at most ${max} characters.`); err.status = 400; err.code = 'VALUE_TOO_LONG'; throw err; }
  return normalized;
}

async function loadAllEvidence(learnerId, subject, chapter) {
  const rows = [];
  let cursor = null;
  for (;;) {
    const page = cursor
      ? await sql`
        SELECT le.id, le.attempt_id AS "attemptId", le.question_id AS "questionId",
               le.subject, le.chapter, le.concept, le.correctness,
               le.finding_details AS "findingDetails", le.created_at AS "createdAt",
               q.common_error_type AS "commonErrorType"
        FROM learning_evidence le
        JOIN questions q ON q.id=le.question_id
        WHERE le.learner_id=${learnerId}
          AND le.subject=${subject}
          AND le.chapter=${chapter}
          AND (le.created_at < ${cursor.createdAt}
               OR (le.created_at = ${cursor.createdAt} AND le.id < ${cursor.id}))
        ORDER BY le.created_at DESC, le.id DESC
        LIMIT ${PAGE_SIZE}`
      : await sql`
        SELECT le.id, le.attempt_id AS "attemptId", le.question_id AS "questionId",
               le.subject, le.chapter, le.concept, le.correctness,
               le.finding_details AS "findingDetails", le.created_at AS "createdAt",
               q.common_error_type AS "commonErrorType"
        FROM learning_evidence le
        JOIN questions q ON q.id=le.question_id
        WHERE le.learner_id=${learnerId}
          AND le.subject=${subject}
          AND le.chapter=${chapter}
        ORDER BY le.created_at DESC, le.id DESC
        LIMIT ${PAGE_SIZE}`;
    const batch = Array.isArray(page?.rows) ? page.rows : [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    const last = batch[batch.length - 1];
    cursor = { createdAt: last.createdAt, id: last.id };
  }
  return rows;
}

async function buildGate(learnerId, subject, chapter) {
  const rows = await loadAllEvidence(learnerId, subject, chapter);
  const validRows = rows.filter(row => VALID_CORRECTNESS.has(String(row.correctness)));
  const excludedEvidenceCount = rows.length - validRows.length;
  const findings = new Map();
  const latestConcept = new Map();
  for (const row of validRows) {
    const concept = clean(row.concept, 180) || 'Unspecified concept';
    const conceptKey = `${row.subject}::${row.chapter}::${concept}`;
    if (!latestConcept.has(conceptKey)) latestConcept.set(conceptKey, row.correctness);
    if (!['incorrect','partially_correct'].includes(String(row.correctness))) continue;
    const details = Array.isArray(row.findingDetails) && row.findingDetails.length ? row.findingDetails : [row.commonErrorType || 'general_error'];
    for (const raw of details) {
      const label = clean(raw, 180) || 'general_error';
      const key = findingKey(row.subject, row.chapter, concept, label);
      const existing = findings.get(key);
      if (!existing) {
        findings.set(key, {
          key,
          type: clean(row.commonErrorType || 'concept_gap', 80) || 'concept_gap',
          text: label,
          concept,
          status: 'red',
          attemptId: row.attemptId,
          questionId: row.questionId,
          firstSeenAt: row.createdAt,
          lastSeenAt: row.createdAt,
          clearedAt: null,
        });
      } else if (new Date(row.createdAt).getTime() > new Date(existing.lastSeenAt).getTime()) {
        existing.lastSeenAt = row.createdAt;
        existing.attemptId = row.attemptId;
        existing.questionId = row.questionId;
      }
    }
  }
  for (const f of findings.values()) {
    const conceptKey = `${subject}::${chapter}::${f.concept}`;
    if (latestConcept.get(conceptKey) === 'correct') {
      f.status = 'green';
      f.clearedAt = f.lastSeenAt;
    }
  }
  const list = [...findings.values()];
  const red = list.filter(f => f.status === 'red');
  const green = list.filter(f => f.status === 'green');

  const bypass = await sql`
    SELECT id, reason, created_at AS "createdAt", parent_user_id AS "parentUserId"
    FROM learning_gate_bypasses
    WHERE learner_id=${learnerId} AND subject=${subject} AND chapter=${chapter}
    ORDER BY created_at DESC LIMIT 1`;
  const activeBypass = bypass.rows[0] || null;
  const gateStatus = activeBypass ? 'bypassed' : (red.length ? 'locked' : (list.length ? 'cleared' : 'open'));

  if (rows[0]) {
    const gateId = `gate_${learnerId}_${Buffer.from(`${subject}:${chapter}`).toString('base64url').slice(0,80)}`;
    await sql`
      INSERT INTO learning_progression_gates(id,learner_id,subject,chapter,status,red_count,green_count,last_assessment_id,last_attempt_id,updated_at)
      VALUES(${gateId},${learnerId},${subject},${chapter},${gateStatus},${red.length},${green.length},
        (SELECT assessment_id FROM assessment_attempts WHERE id=${rows[0].attemptId} LIMIT 1),${rows[0].attemptId},NOW())
      ON CONFLICT (learner_id,subject,chapter) DO UPDATE SET status=EXCLUDED.status,red_count=EXCLUDED.red_count,green_count=EXCLUDED.green_count,last_assessment_id=EXCLUDED.last_assessment_id,last_attempt_id=EXCLUDED.last_attempt_id,updated_at=NOW()`;

    for (const f of list) {
      await sql`
        INSERT INTO learning_gate_findings(id,learner_id,subject,chapter,attempt_id,question_id,finding_key,finding_type,finding_text,status,first_seen_at,last_seen_at,cleared_at)
        VALUES(${id('gatefinding')},${learnerId},${subject},${chapter},${f.attemptId},${f.questionId},${f.key},${f.type},${f.text},${f.status},${f.firstSeenAt},${f.lastSeenAt},${f.clearedAt})
        ON CONFLICT (learner_id,subject,chapter,finding_key) DO UPDATE SET status=EXCLUDED.status,attempt_id=EXCLUDED.attempt_id,question_id=EXCLUDED.question_id,last_seen_at=EXCLUDED.last_seen_at,cleared_at=EXCLUDED.cleared_at`;
    }
  }
  return { learnerId, subject, chapter, status: gateStatus, redCount: red.length, greenCount: green.length, findings: list, bypass: activeBypass, evidenceCount: validRows.length, excludedEvidenceCount, acceptedCorrectness:[...VALID_CORRECTNESS] };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  try {
    const session = await requireAuth(req);
    const body = req.body || {};
    const learnerId = bounded(req.query?.learnerId || body.learnerId, 'learnerId', MAX_LEARNER_ID_CHARS);
    const subject = bounded(req.query?.subject || body.subject, 'subject', MAX_SUBJECT_CHARS);
    const chapter = bounded(req.query?.chapter || body.chapter, 'chapter', MAX_CHAPTER_CHARS);
    await requireLearnerAccess(session, learnerId);

    if (req.method === 'GET') return json(res,200,{ok:true,gate:await buildGate(learnerId,subject,chapter)});
    if (req.method !== 'POST') return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET or POST required.'}},{Allow:'GET, POST'});
    if (String(body.action || '') !== 'bypass') return json(res,400,{error:{code:'INVALID_GATE_ACTION',message:'POST requires action=bypass.'}});
    if (!hasRole(session,'parent')) return json(res,403,{error:{code:'PARENT_REQUIRED',message:'Only an authenticated parent can bypass a progression gate.'}});
    const relation = await sql`SELECT 1 FROM parent_learner WHERE parent_user_id=${session.user_id} AND learner_id=${learnerId} AND status='active' LIMIT 1`;
    if (!relation.rows.length) return json(res,403,{error:{code:'PARENT_LEARNER_FORBIDDEN',message:'No active parent relationship exists for this learner.'}});
    const password = String(body.password || '');
    if (!password) return json(res,400,{error:{code:'PASSWORD_REAUTH_REQUIRED',message:'Parent password re-entry is required.'}});
    const credential = await sql`SELECT password_hash FROM credentials WHERE user_id=${session.user_id} LIMIT 1`;
    if (!credential.rows.length || !verifyPassword(password,credential.rows[0].password_hash)) return json(res,401,{error:{code:'PASSWORD_REAUTH_FAILED',message:'Password verification failed.'}});
    const reason = clean(body.reason,500);
    if (!reason) return json(res,400,{error:{code:'BYPASS_REASON_REQUIRED',message:'A reason is required for a progression-gate bypass.'}});
    const bypassId=id('gatebypass');
    await sql`INSERT INTO learning_gate_bypasses(id,learner_id,parent_user_id,subject,chapter,reason,created_at,ip_address) VALUES(${bypassId},${learnerId},${session.user_id},${subject},${chapter},${reason},NOW(),${clientIp(req)})`;
    await writeAudit({actorUserId:session.user_id,action:'mastery_gate.bypass',entityType:'learner_progression_gate',entityId:`${learnerId}:${subject}:${chapter}`,metadata:{learnerId,subject,chapter,reason,bypassId,ip:clientIp(req)}});
    return json(res,200,{ok:true,bypassId,gate:await buildGate(learnerId,subject,chapter)});
  } catch (e) {
    console.error('MASTERY_GATE_FAILED',e);
    return json(res,e.status||500,{error:{code:e.code||'MASTERY_GATE_FAILED',message:e.status?e.message:'Unable to evaluate mastery gate.'}});
  }
}
