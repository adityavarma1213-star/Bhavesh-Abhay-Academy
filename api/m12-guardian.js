import { sql } from './_lib/db.js';
import { json, id } from './_lib/security.js';
import { requireAuth, requireLearnerAccess } from './_lib/auth.js';

export const config = { runtime: 'nodejs' };

function normalizeAlertId(value) {
  const v = String(value || '').trim();
  return v && v.length <= 180 ? v : null;
}

export default async function handler(req, res) {
  try {
    const session = await requireAuth(req);
    const learnerId = String(req.query?.learnerId || '').trim();
    await requireLearnerAccess(session, learnerId);

    if (req.method === 'GET') {
      const result = await sql`
        SELECT alert_id, acknowledged_at
        FROM guardian_alert_acknowledgements
        WHERE learner_id=${learnerId}
        ORDER BY acknowledged_at DESC
        LIMIT 500
      `;
      return json(res, 200, {
        ok: true,
        learnerId,
        acknowledgements: result.rows.map(row => ({
          alertId: row.alert_id,
          acknowledgedAt: row.acknowledged_at,
        })),
        scope: 'academic_support_only',
      });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const alertId = normalizeAlertId(body.alertId);
      if (!alertId) return json(res, 400, { error: { code: 'INVALID_ALERT_ID', message: 'A valid alertId is required.' } });
      await sql`
        INSERT INTO guardian_alert_acknowledgements(learner_id, alert_id)
        VALUES(${learnerId}, ${alertId})
        ON CONFLICT(learner_id, alert_id)
        DO UPDATE SET acknowledged_at=NOW()
      `;
      return json(res, 200, { ok: true, alertId, acknowledgedAt: new Date().toISOString() });
    }

    if (req.method === 'DELETE') {
      const body = req.body || {};
      const alertId = normalizeAlertId(body.alertId);
      if (alertId) {
        await sql`DELETE FROM guardian_alert_acknowledgements WHERE learner_id=${learnerId} AND alert_id=${alertId}`;
      } else {
        await sql`DELETE FROM guardian_alert_acknowledgements WHERE learner_id=${learnerId}`;
      }
      return json(res, 200, { ok: true, deleted: alertId ? 1 : 'all' });
    }

    return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'GET, POST or DELETE required.' } }, { Allow: 'GET, POST, DELETE' });
  } catch (e) {
    return json(res, e.status || 500, {
      error: { code: e.code || 'GUARDIAN_API_FAILED', message: e.status ? e.message : 'Guardian service unavailable.' }
    });
  }
}
