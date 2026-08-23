// BAA M40 — authenticated server-backed syllabus storage.
// Uploads are chunked so the browser is never the system of record.
import { sql } from './_lib/db.js';
import { requireAuth, hasRole } from './_lib/auth.js';
import { randomUUID } from 'node:crypto';

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_CHUNK_BYTES = 256 * 1024;
const ALLOWED_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain'
]);

function send(res, status, payload) {
  res.status(status).json(payload);
}

function bodyOf(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
}

function requireTeacher(session, res) {
  if (!hasRole(session, 'teacher') && !hasRole(session, 'admin')) {
    send(res, 403, { ok: false, error: { code: 'TEACHER_REQUIRED', message: 'Teacher or admin access is required.' } });
    return false;
  }
  return true;
}

async function ownedUpload(session, id) {
  const r = await sql`
    SELECT id, teacher_user_id, board, grade, subject, academic_year, filename,
           mime_type, size_bytes, status, created_at, updated_at
    FROM syllabus_uploads
    WHERE id=${id}
      AND (${hasRole(session, 'admin')} OR teacher_user_id=${session.user_id})
    LIMIT 1`;
  return r.rows[0] || null;
}

async function list(req, res, session) {
  const q = req.query || {};
  const board = String(q.board || '').trim();
  const grade = String(q.grade || '').trim();
  const subject = String(q.subject || '').trim();
  const academicYear = String(q.academicYear || '').trim();
  const canManage = hasRole(session, 'teacher') || hasRole(session, 'admin');
  const r = canManage
    ? await sql`
        SELECT id, board, grade, subject, academic_year, filename, mime_type,
               size_bytes, status, created_at, updated_at
        FROM syllabus_uploads
        WHERE (${hasRole(session, 'admin')} OR teacher_user_id=${session.user_id})
          AND (${board}='' OR board=${board})
          AND (${grade}='' OR grade=${grade})
          AND (${subject}='' OR subject=${subject})
          AND (${academicYear}='' OR academic_year=${academicYear})
          AND status <> 'archived'
        ORDER BY created_at DESC`
    : await sql`
        SELECT id, board, grade, subject, academic_year, filename, mime_type,
               size_bytes, status, created_at, updated_at
        FROM syllabus_uploads
        WHERE status='published'
          AND (${board}='' OR board=${board})
          AND (${grade}='' OR grade=${grade})
          AND (${subject}='' OR subject=${subject})
          AND (${academicYear}='' OR academic_year=${academicYear})
        ORDER BY created_at DESC`;
  send(res, 200, { ok: true, syllabi: r.rows });
}

async function initUpload(req, res, session) {
  const b = bodyOf(req);
  const board = String(b.board || '').trim();
  const grade = String(b.grade || '').trim();
  const subject = String(b.subject || '').trim();
  const academicYear = String(b.academicYear || '').trim();
  const filename = String(b.filename || '').trim().slice(0, 255);
  const mimeType = String(b.mimeType || '').trim();
  const sizeBytes = Number(b.sizeBytes);
  if (!board || !grade || !subject || !academicYear || !filename || !ALLOWED_TYPES.has(mimeType)) {
    return send(res, 400, { ok: false, error: { code: 'INVALID_SYLLABUS_METADATA', message: 'Board, class, subject, academic year and a PDF/DOCX/TXT file are required.' } });
  }
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > MAX_BYTES) {
    return send(res, 400, { ok: false, error: { code: 'SYLLABUS_SIZE_INVALID', message: 'Syllabus must be between 1 byte and 10 MB.' } });
  }
  const id = randomUUID();
  await sql`
    INSERT INTO syllabus_uploads
      (id, teacher_user_id, board, grade, subject, academic_year, filename, mime_type, size_bytes)
    VALUES
      (${id}, ${session.user_id}, ${board}, ${grade}, ${subject}, ${academicYear}, ${filename}, ${mimeType}, ${sizeBytes})`;
  send(res, 201, { ok: true, uploadId: id, maxChunkBytes: MAX_CHUNK_BYTES });
}

async function putChunk(req, res, session) {
  const b = bodyOf(req);
  const id = String(b.uploadId || '');
  const index = Number(b.chunkIndex);
  const totalChunks = Number(b.totalChunks);
  const encoded = String(b.dataBase64 || '');
  if (!id || !Number.isInteger(index) || index < 0 || !Number.isInteger(totalChunks) || totalChunks < 1 || index >= totalChunks || !encoded) {
    return send(res, 400, { ok: false, error: { code: 'INVALID_SYLLABUS_CHUNK', message: 'A valid uploadId, chunkIndex, totalChunks and dataBase64 are required.' } });
  }
  const row = await ownedUpload(session, id);
  if (!row) return send(res, 404, { ok: false, error: { code: 'SYLLABUS_NOT_FOUND', message: 'Syllabus upload not found.' } });
  if (row.status !== 'draft') return send(res, 409, { ok: false, error: { code: 'SYLLABUS_NOT_DRAFT', message: 'Only draft syllabi accept file chunks.' } });
  let data;
  try { data = Buffer.from(encoded, 'base64'); } catch { return send(res, 400, { ok: false, error: { code: 'SYLLABUS_CHUNK_ENCODING', message: 'Invalid base64 chunk.' } }); }
  if (!data.length || data.length > MAX_CHUNK_BYTES) return send(res, 400, { ok: false, error: { code: 'SYLLABUS_CHUNK_SIZE', message: 'Chunk exceeds the 256 KB limit.' } });
  await sql`
    INSERT INTO syllabus_file_chunks (upload_id, chunk_index, data)
    VALUES (${id}, ${index}, ${data})
    ON CONFLICT (upload_id, chunk_index) DO UPDATE SET data=EXCLUDED.data`;
  send(res, 200, { ok: true, uploadId: id, chunkIndex: index, totalChunks });
}

async function finalize(req, res, session) {
  const b = bodyOf(req);
  const id = String(b.uploadId || '');
  const totalChunks = Number(b.totalChunks);
  if (!id || !Number.isInteger(totalChunks) || totalChunks < 1) return send(res, 400, { ok: false, error: { code: 'INVALID_FINALIZE_REQUEST', message: 'uploadId and totalChunks are required.' } });
  const row = await ownedUpload(session, id);
  if (!row) return send(res, 404, { ok: false, error: { code: 'SYLLABUS_NOT_FOUND', message: 'Syllabus upload not found.' } });
  const chunks = await sql`SELECT chunk_index, octet_length(data) AS bytes FROM syllabus_file_chunks WHERE upload_id=${id} ORDER BY chunk_index`;
  if (chunks.rows.length !== totalChunks || chunks.rows.some((x, i) => Number(x.chunk_index) !== i)) {
    return send(res, 409, { ok: false, error: { code: 'SYLLABUS_CHUNKS_INCOMPLETE', message: 'Not all syllabus chunks have arrived.' } });
  }
  const totalBytes = chunks.rows.reduce((n, x) => n + Number(x.bytes || 0), 0);
  if (totalBytes !== Number(row.size_bytes)) return send(res, 409, { ok: false, error: { code: 'SYLLABUS_SIZE_MISMATCH', message: 'Uploaded bytes do not match the declared file size.' } });
  await sql`UPDATE syllabus_uploads SET updated_at=NOW() WHERE id=${id}`;
  send(res, 200, { ok: true, uploadId: id, status: row.status, bytes: totalBytes });
}

async function publish(req, res, session) {
  const b = bodyOf(req);
  const id = String(b.uploadId || '');
  const row = await ownedUpload(session, id);
  if (!row) return send(res, 404, { ok: false, error: { code: 'SYLLABUS_NOT_FOUND', message: 'Syllabus upload not found.' } });
  const chunks = await sql`SELECT COUNT(*)::int AS count, COALESCE(SUM(octet_length(data)),0)::bigint AS bytes FROM syllabus_file_chunks WHERE upload_id=${id}`;
  if (Number(chunks.rows[0].count) < 1 || Number(chunks.rows[0].bytes) !== Number(row.size_bytes)) return send(res, 409, { ok: false, error: { code: 'SYLLABUS_NOT_READY', message: 'Finish uploading the complete syllabus before publishing.' } });
  await sql`UPDATE syllabus_uploads SET status='published', updated_at=NOW() WHERE id=${id}`;
  send(res, 200, { ok: true, uploadId: id, status: 'published' });
}

async function remove(req, res, session) {
  const id = String((req.query || {}).id || bodyOf(req).uploadId || '');
  const row = await ownedUpload(session, id);
  if (!row) return send(res, 404, { ok: false, error: { code: 'SYLLABUS_NOT_FOUND', message: 'Syllabus upload not found.' } });
  await sql`UPDATE syllabus_uploads SET status='archived', updated_at=NOW() WHERE id=${id}`;
  send(res, 200, { ok: true, uploadId: id, status: 'archived' });
}

async function download(req, res, session) {
  const id = String((req.query || {}).id || '');
  if (!id) return send(res, 400, { ok: false, error: { code: 'SYLLABUS_ID_REQUIRED', message: 'A syllabus id is required.' } });
  const canManage = hasRole(session, 'teacher') || hasRole(session, 'admin');
  const r = canManage
    ? await sql`SELECT id, teacher_user_id, filename, mime_type, size_bytes, status FROM syllabus_uploads WHERE id=${id} AND (${hasRole(session,'admin')} OR teacher_user_id=${session.user_id}) LIMIT 1`
    : await sql`SELECT id, teacher_user_id, filename, mime_type, size_bytes, status FROM syllabus_uploads WHERE id=${id} AND status='published' LIMIT 1`;
  const row = r.rows[0];
  if (!row) return send(res, 404, { ok: false, error: { code: 'SYLLABUS_NOT_FOUND', message: 'Syllabus not found.' } });
  const chunks = await sql`SELECT data FROM syllabus_file_chunks WHERE upload_id=${id} ORDER BY chunk_index`;
  const file = Buffer.concat(chunks.rows.map(x => Buffer.from(x.data)));
  res.status(200);
  res.setHeader('Content-Type', row.mime_type);
  res.setHeader('Content-Length', String(file.length));
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(row.filename)}`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(file);
}

export default async function handler(req, res) {
  try {
    const session = await requireAuth(req);
    if (req.method === 'GET' && String(req.query?.action || '') === 'download') return download(req, res, session);
    if (req.method === 'GET') return list(req, res, session);
    if (!requireTeacher(session, res)) return;
    if (req.method !== 'POST' && req.method !== 'DELETE') return send(res, 405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } });
    const action = String(req.query?.action || bodyOf(req).action || '');
    if (action === 'init') return initUpload(req, res, session);
    if (action === 'chunk') return putChunk(req, res, session);
    if (action === 'finalize') return finalize(req, res, session);
    if (action === 'publish') return publish(req, res, session);
    if (action === 'delete') return remove(req, res, session);
    return send(res, 400, { ok: false, error: { code: 'SYLLABUS_ACTION_REQUIRED', message: 'Specify init, chunk, finalize, publish or delete.' } });
  } catch (err) {
    const status = Number(err?.status) || 500;
    send(res, status, { ok: false, error: { code: err?.code || 'SYLLABUS_SERVER_ERROR', message: status >= 500 ? 'Syllabus service is unavailable.' : err.message } });
  }
}
