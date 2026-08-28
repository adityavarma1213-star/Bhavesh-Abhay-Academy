import { json, writeAudit } from './_lib/security.js';
import { requireAuth, requireLearnerAccess } from './_lib/auth.js';
import { sql } from './_lib/db.js';

export const config = { runtime: 'nodejs' };

const ALLOWED_TYPES = new Set(['exam', 'deadline', 'holiday', 'school_event']);

function noStore(res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
}

function cleanEvent(input = {}) {
  const title = String(input.title || '').trim().slice(0, 120);
  const date = String(input.date || '').slice(0, 10);
  const type = String(input.type || 'school_event');
  const subject = input.subject == null ? null : String(input.subject).trim().slice(0, 80);
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !ALLOWED_TYPES.has(type)) return null;
  if (subject && !/^[\w .&'()\/-]+$/u.test(subject)) return null;
  return { title, date, type, subject: subject || null };
}

function rowsToEvents(rows) {
  return rows.map(row => ({
    id: row.id,
    title: row.title,
    date: row.event_date,
    type: row.event_type,
    subject: row.subject,
    createdAt: row.created_at,
  }));
}

async function handler(req, res) {
  noStore(res);
  try {
    const session = await requireAuth(req);
    const learnerId = String(req.query?.learnerId || req.body?.learnerId || '');
    await requireLearnerAccess(session, learnerId);

    if (req.method === 'GET') {
      const from = req.query?.from ? String(req.query.from).slice(0, 10) : null;
      const to = req.query?.to ? String(req.query.to).slice(0, 10) : null;
      const rows = await sql`
        SELECT id,title,event_date,event_type,subject,created_at
        FROM school_calendar_events
        WHERE learner_id=${learnerId}
          AND (${from}::date IS NULL OR event_date >= ${from}::date)
          AND (${to}::date IS NULL OR event_date <= ${to}::date)
        ORDER BY event_date ASC, created_at ASC
        LIMIT 500`;
      return json(res, 200, { ok: true, learnerId, events: rowsToEvents(rows.rows), source: 'server_school_calendar' });
    }

    if (req.method === 'POST') {
      const event = cleanEvent(req.body || {});
      if (!event) return json(res, 400, { error: { code: 'INVALID_EVENT', message: 'Valid title, ISO date, event type and optional subject are required.' } });
      const rows = await sql`
        INSERT INTO school_calendar_events (learner_id,title,event_date,event_type,subject)
        VALUES (${learnerId},${event.title},${event.date}::date,${event.type},${event.subject})
        RETURNING id,title,event_date,event_type,subject,created_at`;
      const created = rowsToEvents(rows.rows)[0];
      await writeAudit({
        actorUserId: session.user_id,
        action: 'school_calendar.event.create',
        entityType: 'school_calendar_event',
        entityId: String(created.id),
        metadata: { learnerId, eventType: event.type },
      });
      return json(res, 201, { ok: true, event: created });
    }

    if (req.method === 'DELETE') {
      const id = String(req.body?.id || req.query?.id || '');
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json(res, 400, { error: { code: 'INVALID_EVENT_ID', message: 'A valid event id is required.' } });
      const result = await sql`
        DELETE FROM school_calendar_events WHERE id=${id} AND learner_id=${learnerId}`;
      const deleted = result.rowCount > 0;
      if (deleted) {
        await writeAudit({
          actorUserId: session.user_id,
          action: 'school_calendar.event.delete',
          entityType: 'school_calendar_event',
          entityId: id,
          metadata: { learnerId },
        });
      }
      return json(res, 200, { ok: true, deleted });
    }

    return json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'GET, POST or DELETE required.' } }, { Allow: 'GET, POST, DELETE' });
  } catch (error) {
    return json(res, error.status || 500, {
      error: {
        code: error.code || 'SCHOOL_CALENDAR_FAILED',
        message: error.status ? error.message : 'Unable to process the school calendar.',
      },
    });
  }
}

export default handler;
