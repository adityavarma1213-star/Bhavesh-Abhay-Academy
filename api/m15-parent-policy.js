// BAA OS — M15 server-authoritative Parent Approval Mode.
import { sql } from './_lib/db.js';
import { requireAuth, hasRole } from './_lib/auth.js';
import { json, writeAudit } from './_lib/security.js';

export const config = { runtime: 'nodejs' };

const DEFAULT_POLICY = Object.freeze({
  tutorEnabled: true,
  mentorEnabled: true,
  plannerEnabled: true,
  plannerDailyMinutes: 30,
});
const MAX_LEARNER_ID_CHARS = 120;
const MAX_UPDATED_AT_CHARS = 64;

function learnerIdFrom(body) {
  const value = typeof body?.learnerId === 'string' ? body.learnerId.trim() : '';
  if (!value) return { value: '', error: 'LEARNER_REQUIRED' };
  if (value.length > MAX_LEARNER_ID_CHARS) return { value: '', error: 'LEARNER_ID_TOO_LONG' };
  return { value, error: null };
}

function expectedUpdatedAtFrom(body) {
  const value = typeof body?.expectedUpdatedAt === 'string' ? body.expectedUpdatedAt.trim() : '';
  if (value.length > MAX_UPDATED_AT_CHARS) return { value: '', error: 'UPDATED_AT_TOO_LONG' };
  return { value, error: null };
}

function normalizePolicy(body) {
  const minutes = Number(body?.plannerDailyMinutes);
  return {
    tutorEnabled: body?.tutorEnabled !== false,
    mentorEnabled: body?.mentorEnabled !== false,
    plannerEnabled: body?.plannerEnabled !== false,
    plannerDailyMinutes: Number.isFinite(minutes) ? Math.max(0, Math.min(480, Math.round(minutes))) : DEFAULT_POLICY.plannerDailyMinutes,
  };
}

async function assertParentLearner(session, learnerId) {
  if (hasRole(session, 'admin')) return;
  if (!hasRole(session, 'parent')) {
    const err = new Error('Parent role required.'); err.status = 403; err.code = 'PARENT_ROLE_REQUIRED'; throw err;
  }
  const result = await sql`
    SELECT 1 FROM parent_learner
    WHERE parent_user_id=${session.user_id}
      AND learner_id=${learnerId}
      AND status='active'
    LIMIT 1
  `;
  if (!result.rows.length) {
    const err = new Error('You are not authorized to manage this learner.'); err.status = 403; err.code = 'LEARNER_FORBIDDEN'; throw err;
  }
}

function toPolicy(row) {
  if (!row) return { ...DEFAULT_POLICY };
  return {
    tutorEnabled: row.tutor_enabled !== false,
    mentorEnabled: row.mentor_enabled !== false,
    plannerEnabled: row.planner_enabled !== false,
    plannerDailyMinutes: Number(row.planner_daily_minutes),
  };
}

function updatedAtFrom(row) {
  return row?.updated_at ? new Date(row.updated_at).toISOString() : null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  try {
    const session = await requireAuth(req);
    if (!['GET', 'POST'].includes(req.method)) {
      return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'GET or POST required.' } });
    }

    if (req.method === 'GET') {
      const parsed = learnerIdFrom(req.query || {});
      if (parsed.error) {
        return json(res, 400, { error: { code: parsed.error, message: parsed.error === 'LEARNER_REQUIRED' ? 'learnerId is required.' : `learnerId must be at most ${MAX_LEARNER_ID_CHARS} characters.` } });
      }
      const learnerId = parsed.value;
      await assertParentLearner(session, learnerId);
      const result = await sql`
        SELECT tutor_enabled, mentor_enabled, planner_enabled, planner_daily_minutes, updated_at
        FROM parent_ai_policies
        WHERE learner_id=${learnerId}
        LIMIT 1
      `;
      const row = result.rows[0];
      return json(res, 200, { learnerId, policy: toPolicy(row), updatedAt: updatedAtFrom(row) });
    }

    const body = await req.json();
    const parsedLearner = learnerIdFrom(body);
    if (parsedLearner.error) {
      return json(res, 400, { error: { code: parsedLearner.error, message: parsedLearner.error === 'LEARNER_REQUIRED' ? 'learnerId is required.' : `learnerId must be at most ${MAX_LEARNER_ID_CHARS} characters.` } });
    }
    const learnerId = parsedLearner.value;
    await assertParentLearner(session, learnerId);
    const policy = normalizePolicy(body);
    const parsedExpected = expectedUpdatedAtFrom(body);
    if (parsedExpected.error) {
      return json(res, 400, { error: { code: parsedExpected.error, message: `expectedUpdatedAt must be at most ${MAX_UPDATED_AT_CHARS} characters.` } });
    }
    const expectedUpdatedAt = parsedExpected.value;

    if (expectedUpdatedAt) {
      const current = await sql`
        SELECT updated_at
        FROM parent_ai_policies
        WHERE learner_id=${learnerId}
        LIMIT 1
      `;
      const currentUpdatedAt = updatedAtFrom(current.rows[0]);
      if (currentUpdatedAt !== expectedUpdatedAt) {
        return json(res, 409, {
          error: { code: 'POLICY_CONFLICT', message: 'Parent policy changed elsewhere. Reload the current policy before saving.' },
          learnerId,
          updatedAt: currentUpdatedAt,
        });
      }
    }

    const result = await sql`
      INSERT INTO parent_ai_policies
        (learner_id, tutor_enabled, mentor_enabled, planner_enabled, planner_daily_minutes, updated_by)
      VALUES
        (${learnerId}, ${policy.tutorEnabled}, ${policy.mentorEnabled}, ${policy.plannerEnabled}, ${policy.plannerDailyMinutes}, ${session.user_id})
      ON CONFLICT (learner_id) DO UPDATE SET
        tutor_enabled=EXCLUDED.tutor_enabled,
        mentor_enabled=EXCLUDED.mentor_enabled,
        planner_enabled=EXCLUDED.planner_enabled,
        planner_daily_minutes=EXCLUDED.planner_daily_minutes,
        updated_by=EXCLUDED.updated_by,
        updated_at=NOW()
      RETURNING tutor_enabled, mentor_enabled, planner_enabled, planner_daily_minutes, updated_at
    `;
    const saved = result.rows[0];

    await writeAudit({
      actorUserId: session.user_id,
      action: 'PARENT_AI_POLICY_UPDATED',
      entityType: 'learner',
      entityId: learnerId,
      metadata: {
        tutorEnabled: policy.tutorEnabled,
        mentorEnabled: policy.mentorEnabled,
        plannerEnabled: policy.plannerEnabled,
        plannerDailyMinutes: policy.plannerDailyMinutes,
      },
    });

    return json(res, 200, { learnerId, policy: toPolicy(saved), updatedAt: updatedAtFrom(saved) });
  } catch (e) {
    return json(res, e.status || 500, {
      error: { code: e.code || 'M15_POLICY_FAILED', message: e.status ? e.message : 'Parent policy service unavailable.' }
    });
  }
}
