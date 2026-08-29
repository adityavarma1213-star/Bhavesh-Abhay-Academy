import { sql } from './_lib/db.js';
import { json } from './_lib/security.js';
import { requireAuth, requireLearnerAccess } from './_lib/auth.js';

export const config = { runtime: 'nodejs' };

function normalizeAlertId(value) {
  const v = String(value || '').trim();
  return v && v.length <= 180 ? v : null;
}

function buildAcademicAlerts(memoryRows, assessmentRows) {
  const alerts = [];
  const grouped = new Map();
  for (const row of memoryRows) {
    const concept = String(row.concept || '').trim();
    if (!concept) continue;
    if (!grouped.has(concept)) grouped.set(concept, []);
    grouped.get(concept).push(row);
  }

  for (const [concept, rows] of grouped.entries()) {
    const latest = rows[0];
    const evidenceCount = Number(latest?.evidence_count || 0);
    const correctCount = Number(latest?.correct_count || 0);
    // BAA's evidence gate requires at least three answered questions before
    // an academic concept can be characterized as needing revision. Sparse
    // evidence must remain informational rather than becoming a Guardian alert.
    if (latest?.status === 'needs_revision' && evidenceCount >= 3) {
      alerts.push({
        id: `low_performance:${concept}`,
        severity: evidenceCount >= 4 && correctCount <= 1 ? 'high' : 'medium',
        type: 'repeated_low_performance',
        concept,
        subject: latest.subject || null,
        title: `Extra support may help with ${concept.replace(/-/g, ' ')}`,
        reason: `Server learning evidence currently marks this concept for revision after ${evidenceCount} evidence point${evidenceCount === 1 ? '' : 's'}.`,
        action: { kind: 'practice', concept },
        requiresHumanReview: false,
      });
    }
  }

  const percentages = assessmentRows
    .map(row => Number(row.score) / Number(row.max_score) * 100)
    .filter(Number.isFinite);
  if (percentages.length >= 3) {
    const current = percentages[0];
    const previous = percentages.slice(1, 4);
    const previousAverage = previous.reduce((sum, value) => sum + value, 0) / previous.length;
    if (current <= previousAverage - 12) {
      alerts.push({
        id: 'assessment_decline',
        severity: 'medium',
        type: 'assessment_decline',
        concept: null,
        subject: null,
        title: 'Recent assessment performance dipped',
        reason: `The latest submitted assessment is ${Math.round(previousAverage - current)} percentage points below the recent average.`,
        action: { kind: 'review', href: 'assessment.html' },
        requiresHumanReview: false,
      });
    }
  }

  return alerts.sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.severity] ?? 9) - ({ high: 0, medium: 1, low: 2 }[b.severity] ?? 9));
}

export default async function handler(req, res) {
  try {
    const session = await requireAuth(req);
    const learnerId = String(req.query?.learnerId || '').trim();
    await requireLearnerAccess(session, learnerId);
    // Guardian responses contain learner-specific academic evidence and must never be cached.
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');

    if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
      return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'GET, POST or DELETE required.' } }, { Allow: 'GET, POST, DELETE', 'Cache-Control': 'private, no-store, max-age=0' });
    }

    if (req.method === 'GET') {
      const [acknowledgements, memory, assessments] = await Promise.all([
        sql`
          SELECT alert_id, acknowledged_at
          FROM guardian_alert_acknowledgements
          WHERE learner_id=${learnerId}
          ORDER BY acknowledged_at DESC
          LIMIT 500
        `,
        sql`
          SELECT concept, subject, status, evidence_count, correct_count, last_updated
          FROM learning_memory
          WHERE learner_id=${learnerId}
            AND status IN ('mastered','learning','needs_revision')
          ORDER BY last_updated DESC
          LIMIT 200
        `,
        sql`
          SELECT score, max_score, COALESCE(end_time, start_time) AS completed_at
          FROM assessment_attempts
          WHERE learner_id=${learnerId}
            AND status IN ('submitted','evaluated')
            AND score IS NOT NULL
            AND max_score > 0
          ORDER BY COALESCE(end_time, start_time) DESC
          LIMIT 8
        `,
      ]);
      const alerts = buildAcademicAlerts(memory.rows, assessments.rows);
      return json(res, 200, {
        ok: true,
        learnerId,
        alerts,
        alertCount: alerts.length,
        highestSeverity: alerts[0]?.severity || 'none',
        acknowledgements: acknowledgements.rows.map(row => ({ alertId: row.alert_id, acknowledgedAt: row.acknowledged_at })),
        evidence: { trackedConcepts: memory.rows.length, assessments: assessments.rows.length },
        evaluatedAt: new Date().toISOString(),
        scope: 'academic_support_only',
        limitation: 'Guardian uses academic learning evidence only. It does not diagnose mental health, personality, family conditions, or intent.',
      });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const alertId = normalizeAlertId(body.alertId);
      if (!alertId) return json(res, 400, { error: { code: 'INVALID_ALERT_ID', message: 'A valid alertId is required.' } }, { 'Cache-Control': 'private, no-store, max-age=0' });
      await sql`
        INSERT INTO guardian_alert_acknowledgements(learner_id, alert_id)
        VALUES(${learnerId}, ${alertId})
        ON CONFLICT(learner_id, alert_id)
        DO UPDATE SET acknowledged_at=NOW()
      `;
      return json(res, 200, { ok: true, alertId, acknowledgedAt: new Date().toISOString() }, { 'Cache-Control': 'private, no-store, max-age=0' });
    }

    const body = req.body || {};
    const alertId = normalizeAlertId(body.alertId);
    if (alertId) {
      await sql`DELETE FROM guardian_alert_acknowledgements WHERE learner_id=${learnerId} AND alert_id=${alertId}`;
    } else {
      await sql`DELETE FROM guardian_alert_acknowledgements WHERE learner_id=${learnerId}`;
    }
    return json(res, 200, { ok: true, deleted: alertId ? 1 : 'all' }, { 'Cache-Control': 'private, no-store, max-age=0' });
  } catch (e) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    return json(res, e.status || 500, {
      error: { code: e.code || 'GUARDIAN_API_FAILED', message: e.status ? e.message : 'Guardian service unavailable.' }
    }, { 'Cache-Control': 'private, no-store, max-age=0' });
  }
}
