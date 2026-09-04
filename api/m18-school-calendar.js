import { json, writeAudit } from './_lib/security.js';
import { requireAuth, requireLearnerAccess } from './_lib/auth.js';
import { sql } from './_lib/db.js';

export const config = { runtime: 'nodejs' };

const ALLOWED_TYPES = new Set(['exam', 'deadline', 'holiday', 'school_event']);
const PAGE_SIZE = 500;
const MAX_LEARNER_ID_CHARS = 120;
const MAX_TITLE_CHARS = 120;
const MAX_SUBJECT_CHARS = 80;
const MAX_DATE_CHARS = 10;

function noStore(res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
}

function boundedString(value, max, code, message, required = false) {
  if (typeof value !== 'string') return { value: '', error: required ? code : null };
  const trimmed = value.trim();
  if (required && !trimmed) return { value: '', error: code };
  if (trimmed.length > max) return { value: '', error: code };
  return { value: trimmed, error: null };
}

function isValidIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function cleanEvent(input = {}) {
  const title = boundedString(input.title, MAX_TITLE_CHARS, 'TITLE_TOO_LONG', `title must be at most ${MAX_TITLE_CHARS} characters.`, true);
  const date = boundedString(input.date, MAX_DATE_CHARS, 'DATE_TOO_LONG', `date must be at most ${MAX_DATE_CHARS} characters.`, true);
  const subject = input.subject == null
    ? { value: '', error: null }
    : boundedString(input.subject, MAX_SUBJECT_CHARS, 'SUBJECT_TOO_LONG', `subject must be at most ${MAX_SUBJECT_CHARS} characters.`);
  const type = typeof input.type === 'string' ? input.type.trim() : 'school_event';
  if (title.error || date.error || subject.error) return null;
  if (!isValidIsoDate(date.value) || !ALLOWED_TYPES.has(type)) return null;
  if (subject.value && !/^[\w .&'()\/-]+$/u.test(subject.value)) return null;
  return { title: title.value, date: date.value, type, subject: subject.value || null };
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

async function loadAllEvents(learnerId, from, to) {
  const rows = [];
  let cursor = null;
  for (;;) {
    const page = cursor
      ? await sql`
          SELECT id,title,event_date,event_type,subject,created_at
          FROM school_calendar_events
          WHERE learner_id=${learnerId}
            AND (${from}::date IS NULL OR event_date >= ${from}::date)
            AND (${to}::date IS NULL OR event_date <= ${to}::date)
            AND (
              event_date > ${cursor.eventDate}
              OR (event_date = ${cursor.eventDate} AND created_at > ${cursor.createdAt})
              OR (event_date = ${cursor.eventDate} AND created_at = ${cursor.createdAt} AND id > ${cursor.id})
            )
          ORDER BY event_date ASC, created_at ASC, id ASC
          LIMIT ${PAGE_SIZE}`
      : await sql`
          SELECT id,title,event_date,event_type,subject,created_at
          FROM school_calendar_events
          WHERE learner_id=${learnerId}
            AND (${from}::date IS NULL OR event_date >= ${from}::date)
            AND (${to}::date IS NULL OR event_date <= ${to}::date)
          ORDER BY event_date ASC, created_at ASC, id ASC
          LIMIT ${PAGE_SIZE}`;
    const batch = Array.isArray(page?.rows) ? page.rows : [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    const last = batch[batch.length - 1];
    cursor = { eventDate: last.event_date, createdAt: last.created_at, id: last.id };
  }
  return rows;
}

function escapeIcs(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function nextCalendarDate(value) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

function buildIcs(events) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Bhavesh Abhay Academy//School Calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const event of events) {
    const date = String(event.date).replace(/-/g, '');
    const uid = `baa-${event.id}@bhaveshabhayacademy`;
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${escapeIcs(uid)}`);
    lines.push(`DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`);
    lines.push(`DTSTART;VALUE=DATE:${date}`);
    // RFC 5545 all-day DTEND is exclusive: a one-day event ends on the next day.
    lines.push(`DTEND;VALUE=DATE:${nextCalendarDate(event.date)}`);
    lines.push(`SUMMARY:${escapeIcs(event.title)}`);
    lines.push(`CATEGORIES:${escapeIcs(event.type)}`);
    if (event.subject) lines.push(`DESCRIPTION:${escapeIcs(`Subject: ${event.subject}`)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

async function handler(req, res) {
  noStore(res);
  try {
    const session = await requireAuth(req);
    const learnerParsed = boundedString(req.query?.learnerId ?? req.body?.learnerId, MAX_LEARNER_ID_CHARS, 'LEARNER_ID_TOO_LONG', `learnerId must be at most ${MAX_LEARNER_ID_CHARS} characters.`, true);
    if (learnerParsed.error) {
      return json(res, 400, { error: { code: learnerParsed.error, message: learnerParsed.error === 'LEARNER_ID_TOO_LONG' ? `learnerId must be at most ${MAX_LEARNER_ID_CHARS} characters.` : 'learnerId is required.' } });
    }
    const learnerId = learnerParsed.value;
    await requireLearnerAccess(session, learnerId);

    if (req.method === 'GET') {
      const fromParsed = req.query?.from == null ? { value: null, error: null } : boundedString(req.query.from, MAX_DATE_CHARS, 'FROM_TOO_LONG', `from must be at most ${MAX_DATE_CHARS} characters.`);
      const toParsed = req.query?.to == null ? { value: null, error: null } : boundedString(req.query.to, MAX_DATE_CHARS, 'TOO_LONG', `to must be at most ${MAX_DATE_CHARS} characters.`);
      if (fromParsed.error || toParsed.error) {
        return json(res, 400, { error: { code: fromParsed.error || toParsed.error, message: fromParsed.error ? `from must be at most ${MAX_DATE_CHARS} characters.` : `to must be at most ${MAX_DATE_CHARS} characters.` } });
      }
      const from = fromParsed.value;
      const to = toParsed.value;
      if ((from && !isValidIsoDate(from)) || (to && !isValidIsoDate(to))) {
        return json(res, 400, { error: { code: 'INVALID_DATE_RANGE', message: 'from and to must be valid ISO calendar dates (YYYY-MM-DD).' } });
      }
      if (from && to && from > to) {
        return json(res, 400, { error: { code: 'INVALID_DATE_RANGE', message: 'from must be on or before to.' } });
      }
      const rows = await loadAllEvents(learnerId, from, to);
      const events = rowsToEvents(rows);
      if (String(req.query?.format || '').toLowerCase() === 'ics') {
        const ics = buildIcs(events);
        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="baa-school-calendar.ics"');
        await writeAudit({
          actorUserId: session.user_id,
          action: 'school_calendar.export.ics',
          entityType: 'learner',
          entityId: learnerId,
          metadata: { eventCount: events.length, from, to },
        });
        return res.status(200).send(ics);
      }
      return json(res, 200, { ok: true, learnerId, events, source: 'server_school_calendar', exportFormats: ['ics'] });
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
