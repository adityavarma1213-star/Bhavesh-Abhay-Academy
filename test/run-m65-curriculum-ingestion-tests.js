// test/run-m65-curriculum-ingestion-tests.js
// BAA M65 — Curriculum + Paper Ingestion Foundation (Blueprint V3.2/V3.3, IB-03/IB-04/IB-06/IB-07).
//
// Same discipline as run-m64-board-registry-tests.js: extract the real
// handler code from api/v1/[...route].js and execute it against an
// in-memory fake `sql` tag, rather than pattern-matching source text.
// This is what caught two real ReferenceError-class bugs during this
// module's own development (a deleted `export default async function
// handler` line, twice, and an unresolved `cryptoModule`/`runOcr` import) —
// node --check missed both; only actually running the handler caught them.
//
// Coverage, mapped to the blueprint's gates:
//   G1 schema/contract  — migration 024 has the columns/constraints the API assumes
//   G2 handler          — curriculum CRUD, paper-ingestion upload/transition all actually run
//   G3 authorization     — non-admin blocked from curriculum writes; student/parent blocked entirely from ingestion
//   G4 evidence/governance — the state machine cannot skip states (e.g. uploaded -> published directly)
//   G5 concurrency        — stale expectedVersion rejected, both for curriculum updates and ingestion transitions
//   G6 idempotency        — re-uploading byte-identical content returns the existing job, not a duplicate
//
// This is a mock-database test — POSTGRES_URL is not configured in this
// environment, so this is NOT LIVE-VERIFIED. See the M65 report for the
// explicit NOT LIVE-VERIFIED / NOT DEPLOYMENT-VERIFIED / NOT
// LIVE-BROWSER-VERIFIED statements this test does not and cannot satisfy.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
let failures = 0;
async function test(name, fn) {
  try { await fn(); console.log('PASS:', name); }
  catch (e) { console.error('FAIL:', name, '\n ', e.stack || e); failures++; }
}
function testSync(name, fn) {
  try { fn(); console.log('PASS:', name); }
  catch (e) { console.error('FAIL:', name, '\n ', e.stack || e); failures++; }
}

// ---------- G1: schema/contract ----------
const migration = fs.readFileSync(path.join(ROOT, 'db/migrations/024_curriculum_and_ingestion.sql'), 'utf8');

testSync('G1: curriculum graph tables exist with the columns the API depends on', () => {
  for (const [table, cols] of [
    ['subjects', ['board_id', 'academic_year_id', 'class_level', 'medium', 'name', 'status', 'version']],
    ['chapters', ['subject_id', 'sequence_no', 'name', 'status', 'version']],
    ['topics', ['chapter_id', 'name', 'status']],
    ['concepts', ['topic_id', 'name', 'status']],
    ['learning_outcomes', ['concept_id', 'description']],
  ]) {
    const tableDef = migration.slice(migration.indexOf(`CREATE TABLE IF NOT EXISTS ${table} (`));
    for (const col of cols) assert.ok(tableDef.slice(0, tableDef.indexOf(');')).includes(col), `${table} missing column: ${col}`);
  }
});
testSync('G1: ingestion_jobs.content_hash is UNIQUE (this is what makes idempotent dedup possible)', () => {
  const tableDef = migration.slice(migration.indexOf('CREATE TABLE IF NOT EXISTS ingestion_jobs ('));
  assert.ok(/UNIQUE \(content_hash\)/.test(tableDef.slice(0, tableDef.indexOf(');'))));
});
testSync('G1: ingestion_jobs.status is constrained to the documented governance states', () => {
  const tableDef = migration.slice(migration.indexOf('CREATE TABLE IF NOT EXISTS ingestion_jobs ('));
  for (const state of ['uploaded', 'validated', 'rejected_validation', 'parsed', 'needs_manual_transcription', 'needs_review', 'verified', 'licence_check', 'licence_rejected', 'approved', 'published', 'retired']) {
    assert.ok(tableDef.includes(`'${state}'`), `ingestion_jobs.status CHECK is missing state: ${state}`);
  }
});
testSync('G1: an append-only ingestion_audit table exists for governance history', () => {
  assert.ok(migration.includes('CREATE TABLE IF NOT EXISTS ingestion_audit'));
});
testSync('G1: exam_papers and questions carry licence_type and verification_status (provenance is schema-level, not optional)', () => {
  for (const table of ['exam_papers', 'board_questions', 'textbooks']) {
    const tableDef = migration.slice(migration.indexOf(`CREATE TABLE IF NOT EXISTS ${table} (`));
    const body = tableDef.slice(0, tableDef.indexOf(');'));
    assert.ok(body.includes('licence_type'), `${table} missing licence_type`);
    assert.ok(body.includes('verification_status'), `${table} missing verification_status`);
  }
});

// ---------- Extraction + execution harness (same proven pattern for both blocks) ----------
function extractBlock(startMarker, endMarker) {
  const src = fs.readFileSync(path.join(ROOT, 'api/v1/[...route].js'), 'utf8');
  const start = src.indexOf(startMarker);
  assert.ok(start >= 0, `${startMarker} not found`);
  const end = src.indexOf(endMarker, start);
  assert.ok(end > start, `could not find end of block starting at ${startMarker}`);
  return src.slice(start, end);
}

function makeFakeSqlForCurriculum(state) {
  return async function sql(strings, ...values) {
    const q = strings.join('?').replace(/\s+/g, ' ').trim();
    if (q.startsWith('SELECT id FROM boards WHERE id = ?')) return { rows: state.boards.filter(b => b.id === values[0]).map(b => ({ id: b.id })) };
    if (q.startsWith('SELECT id FROM subjects WHERE board_id=')) { const [boardId, classLevel, medium, name] = values; return { rows: state.subjects.filter(s => s.board_id === boardId && s.class_level === classLevel && s.medium === medium && s.name === name).map(s => ({ id: s.id })) }; }
    if (q.startsWith('SELECT id FROM chapters WHERE subject_id=') && q.includes('sequence_no=')) { const [subjectId, seq] = values; return { rows: state.chapters.filter(c => c.subject_id === subjectId && c.sequence_no === seq).map(c => ({ id: c.id })) }; }
    if (q.startsWith('SELECT id FROM subjects WHERE id = ?')) return { rows: state.subjects.filter(s => s.id === values[0]).map(s => ({ id: s.id })) };
    if (q.startsWith('SELECT id FROM chapters WHERE id = ?')) return { rows: state.chapters.filter(c => c.id === values[0]).map(c => ({ id: c.id })) };
    if (q.startsWith('SELECT id FROM topics WHERE id = ?')) return { rows: state.topics.filter(t => t.id === values[0]).map(t => ({ id: t.id })) };
    if (q.startsWith('SELECT id FROM concepts WHERE id = ?')) return { rows: state.concepts.filter(c => c.id === values[0]).map(c => ({ id: c.id })) };
    if (q.startsWith('SELECT * FROM subjects WHERE id = ?')) return { rows: state.subjects.filter(s => s.id === values[0]) };
    if (q.startsWith('SELECT * FROM subjects WHERE (')) {
      const [boardId, , academicYearId, , classLevel] = values;
      let rows = state.subjects.filter(s => s.status === 'active');
      if (boardId) rows = rows.filter(s => s.board_id === boardId);
      if (academicYearId) rows = rows.filter(s => s.academic_year_id === academicYearId);
      if (classLevel) rows = rows.filter(s => s.class_level === classLevel);
      return { rows };
    }
    if (q.startsWith('SELECT id, sequence_no, name, status, version FROM chapters WHERE subject_id')) return { rows: state.chapters.filter(c => c.subject_id === values[0]) };
    if (q.startsWith('SELECT * FROM chapters WHERE id = ?')) return { rows: state.chapters.filter(c => c.id === values[0]) };
    if (q.startsWith('SELECT * FROM chapters WHERE subject_id = ? AND sequence_no')) return { rows: state.chapters.filter(c => c.subject_id === values[0] && c.sequence_no === values[1]) };
    if (q.startsWith('SELECT * FROM chapters WHERE subject_id')) return { rows: state.chapters.filter(c => c.subject_id === values[0] && c.status === 'active') };
    if (q.startsWith('SELECT id, name, status FROM topics WHERE chapter_id')) return { rows: state.topics.filter(t => t.chapter_id === values[0]) };
    if (q.startsWith('SELECT * FROM topics WHERE id = ?')) return { rows: state.topics.filter(t => t.id === values[0]) };
    if (q.startsWith('SELECT * FROM topics WHERE chapter_id')) return { rows: state.topics.filter(t => t.chapter_id === values[0] && t.status === 'active') };
    if (q.startsWith('SELECT id, name, status FROM concepts WHERE topic_id')) return { rows: state.concepts.filter(c => c.topic_id === values[0]) };
    if (q.startsWith('SELECT * FROM concepts WHERE id = ?')) return { rows: state.concepts.filter(c => c.id === values[0]) };
    if (q.startsWith('SELECT * FROM concepts WHERE topic_id')) return { rows: state.concepts.filter(c => c.topic_id === values[0] && c.status === 'active') };
    if (q.startsWith('SELECT id, description FROM learning_outcomes WHERE concept_id')) return { rows: state.learningOutcomes.filter(l => l.concept_id === values[0]) };
    if (q.startsWith('SELECT * FROM learning_outcomes WHERE concept_id')) return { rows: state.learningOutcomes.filter(l => l.concept_id === values[0]) };
    if (q.startsWith('SELECT * FROM learning_outcomes WHERE id = ?')) return { rows: state.learningOutcomes.filter(l => l.id === values[0]) };
    if (q.startsWith('SELECT id FROM learning_outcomes')) return { rows: [] };
    if (q.startsWith('INSERT INTO subjects')) { const [id0, boardId, ayId, classLevel, medium, name, status, version, createdAt, updatedAt] = values; state.subjects.push({ id: id0, board_id: boardId, academic_year_id: ayId, class_level: classLevel, medium, name, status, version, created_at: createdAt, updated_at: updatedAt }); return { rows: [], count: 1 }; }
    if (q.startsWith('INSERT INTO chapters')) { const [id0, subjectId, seq, name, status, version, createdAt] = values; state.chapters.push({ id: id0, subject_id: subjectId, sequence_no: seq, name, status, version, created_at: createdAt }); return { rows: [], count: 1 }; }
    if (q.startsWith('INSERT INTO topics')) { const [id0, chapterId, name, status, createdAt] = values; state.topics.push({ id: id0, chapter_id: chapterId, name, status, created_at: createdAt }); return { rows: [], count: 1 }; }
    if (q.startsWith('INSERT INTO concepts')) { const [id0, topicId, name, status, createdAt] = values; state.concepts.push({ id: id0, topic_id: topicId, name, status, created_at: createdAt }); return { rows: [], count: 1 }; }
    if (q.startsWith('INSERT INTO learning_outcomes')) { const [id0, conceptId, description, createdAt] = values; state.learningOutcomes.push({ id: id0, concept_id: conceptId, description, created_at: createdAt }); return { rows: [], count: 1 }; }
    if (q.startsWith('UPDATE subjects SET')) { const [status, version, updatedAt, id0, expectedVersion] = values; const s = state.subjects.find(x => x.id === id0 && x.version === expectedVersion); if (!s) return { rows: [], count: 0 }; s.status = status; s.version += 1; s.updated_at = updatedAt; return { rows: [], count: 1 }; }
    if (q.startsWith('UPDATE chapters SET')) { const [status, version, id0, expectedVersion] = values; const c = state.chapters.find(x => x.id === id0 && x.version === expectedVersion); if (!c) return { rows: [], count: 0 }; c.status = status; c.version += 1; return { rows: [], count: 1 }; }
    throw new Error('Unhandled fake-sql query in curriculum test: ' + q);
  };
}

function loadCurriculumHandler(state, session) {
  const block = extractBlock('/* ================ curriculum-graph.js ================ */', '/* ================ paper-ingestion.js ================ */');
  const sandbox = {
    console, Date, JSON, Math, Number, String, Object, Array, Set, Map, Error, Promise, RegExp,
    global: {},
    sql: makeFakeSqlForCurriculum(state),
    json: (res, status, body) => { res.statusCode = status; res.body = body; return res; },
    id: (p) => `${p}_${Math.random().toString(36).slice(2, 8)}`,
    requireAuth: async () => session,
    hasRole: (s, role) => s.roles.includes(role),
  };
  vm.createContext(sandbox);
  vm.runInContext(block + '\nglobal.__h = handler_curriculum_graph;\n', sandbox);
  return sandbox.global.__h;
}

function makeFakeSqlForIngestion(state) {
  return async function sql(strings, ...values) {
    const q = strings.join('?').replace(/\s+/g, ' ').trim();
    if (q.startsWith('SELECT id FROM exam_papers WHERE id = ?')) return { rows: state.examPapers.filter(p => p.id === values[0]).map(p => ({ id: p.id })) };
    if (q.startsWith('SELECT * FROM ingestion_jobs WHERE content_hash')) return { rows: state.jobs.filter(j => j.content_hash === values[0]) };
    if (q.startsWith('SELECT * FROM ingestion_jobs WHERE id = ?')) return { rows: state.jobs.filter(j => j.id === values[0]) };
    if (q.startsWith('SELECT * FROM ingestion_jobs WHERE (')) { const [status] = values; let rows = state.jobs.slice(); if (status) rows = rows.filter(j => j.status === status); return { rows }; }
    if (q.startsWith('SELECT from_status, to_status, note, created_at FROM ingestion_audit')) return { rows: state.audit.filter(a => a.ingestion_job_id === values[0]) };
    if (q.startsWith('INSERT INTO ingestion_jobs')) {
      const [id0, examPaperId, uploadedBy, filename, mimeType, sizeBytes, contentHash, status, version, createdAt, updatedAt] = values;
      state.jobs.push({ id: id0, exam_paper_id: examPaperId, uploaded_by_user_id: uploadedBy, original_filename: filename, mime_type: mimeType, size_bytes: sizeBytes, content_hash: contentHash, ocr_provider: null, ocr_status: 'not_attempted', ocr_result_text: null, error_code: null, error_message: null, status, version, created_at: createdAt, updated_at: updatedAt });
      return { rows: [], count: 1 };
    }
    if (q.startsWith('INSERT INTO ingestion_audit')) { const [id0, jobId, actorId, fromStatus, toStatus, note, createdAt] = values; state.audit.push({ id: id0, ingestion_job_id: jobId, actor_user_id: actorId, from_status: fromStatus, to_status: toStatus, note, created_at: createdAt }); return { rows: [], count: 1 }; }
    if (q.startsWith('UPDATE ingestion_jobs SET ocr_provider')) {
      const [ocrProvider, ocrStatus, ocrText, errorCode, errorMessage, status, updatedAt, id0] = values;
      const job = state.jobs.find(j => j.id === id0);
      if (job) { job.ocr_provider = ocrProvider; job.ocr_status = ocrStatus; job.ocr_result_text = ocrText; job.error_code = errorCode; job.error_message = errorMessage; job.status = status; job.version += 1; job.updated_at = updatedAt; }
      return { rows: [], count: 1 };
    }
    if (q.startsWith('UPDATE ingestion_jobs SET status') && q.includes('ocr_result_text')) {
      const [status, text, updatedAt, id0, expectedVersion] = values; // ocr_status='succeeded' is a literal in the real query, not a bound param
      const job = state.jobs.find(j => j.id === id0 && j.version === expectedVersion);
      if (!job) return { rows: [], count: 0 };
      job.status = status; job.ocr_result_text = text; job.ocr_status = 'succeeded'; job.version += 1; job.updated_at = updatedAt;
      return { rows: [], count: 1 };
    }
    if (q.startsWith('UPDATE ingestion_jobs SET status')) {
      const [status, updatedAt, id0, expectedVersion] = values;
      const job = state.jobs.find(j => j.id === id0 && j.version === expectedVersion);
      if (!job) return { rows: [], count: 0 };
      job.status = status; job.version += 1; job.updated_at = updatedAt;
      return { rows: [], count: 1 };
    }
    throw new Error('Unhandled fake-sql query in ingestion test: ' + q);
  };
}

function loadIngestionHandler(state, session, ocrResult) {
  const block = extractBlock('/* ================ paper-ingestion.js ================ */', '\nexport default async function handler');
  const sandbox = {
    console, Date, JSON, Math, Number, String, Object, Array, Set, Map, Error, Promise, RegExp, Buffer,
    global: {},
    sql: makeFakeSqlForIngestion(state),
    json: (res, status, body) => { res.statusCode = status; res.body = body; return res; },
    id: (p) => `${p}_${Math.random().toString(36).slice(2, 8)}`,
    requireAuth: async () => session,
    hasRole: (s, role) => s.roles.includes(role),
    writeAudit: async () => {},
    runOcr: async () => ocrResult || { provider: null, status: 'not_configured', text: null, errorCode: 'OCR_PROVIDER_NOT_CONFIGURED', errorMessage: 'No OCR_PROVIDER is configured.' },
    crypto,
  };
  vm.createContext(sandbox);
  vm.runInContext(block + '\nglobal.__h = handler_paper_ingestion;\n', sandbox);
  return sandbox.global.__h;
}

function makeRes() { return { statusCode: null, body: null, setHeader() {}, status(s) { this.statusCode = s; return this; }, json(b) { this.body = b; return this; } }; }

const adminSession = { user_id: 'u_admin', roles: ['admin'] };
const teacherSession = { user_id: 'u_teacher', roles: ['teacher'] };
const studentSession = { user_id: 'u_student', roles: ['student'] };

(async () => {
  // ---------- Curriculum graph ----------
  await test('G2: creating a subject against an unknown board is rejected', async () => {
    const state = { boards: [], subjects: [], chapters: [], topics: [], concepts: [], learningOutcomes: [] };
    const h = loadCurriculumHandler(state, adminSession);
    const res = makeRes();
    await h({ method: 'POST', query: { type: 'subject' }, body: { boardId: 'ghost-board', classLevel: 'Class 10', medium: 'English', name: 'Mathematics' } }, res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error.code, 'UNKNOWN_BOARD');
  });

  await test('G3: a non-admin cannot create a subject', async () => {
    const state = { boards: [{ id: 'cbse' }], subjects: [], chapters: [], topics: [], concepts: [], learningOutcomes: [] };
    const h = loadCurriculumHandler(state, studentSession);
    const res = makeRes();
    await h({ method: 'POST', query: { type: 'subject' }, body: { boardId: 'cbse', classLevel: 'Class 10', medium: 'English', name: 'Mathematics' } }, res);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(state.subjects.length, 0);
  });

  await test('G2: full graph can be built subject -> chapter -> topic -> concept -> learning-outcome', async () => {
    const state = { boards: [{ id: 'cbse' }], subjects: [], chapters: [], topics: [], concepts: [], learningOutcomes: [] };
    const h = loadCurriculumHandler(state, adminSession);
    let res = makeRes();
    await h({ method: 'POST', query: { type: 'subject' }, body: { boardId: 'cbse', classLevel: 'Class 10', medium: 'English', name: 'Mathematics' } }, res);
    assert.strictEqual(res.statusCode, 201);
    const subjectId = res.body.subject.id;

    res = makeRes();
    await h({ method: 'POST', query: { type: 'chapter' }, body: { subjectId, sequenceNo: 1, name: 'Real Numbers' } }, res);
    assert.strictEqual(res.statusCode, 201);
    const chapterId = res.body.chapter.id;

    res = makeRes();
    await h({ method: 'POST', query: { type: 'topic' }, body: { chapterId, name: 'Euclid\'s Division Lemma' } }, res);
    assert.strictEqual(res.statusCode, 201);
    const topicId = res.body.topic.id;

    res = makeRes();
    await h({ method: 'POST', query: { type: 'concept' }, body: { topicId, name: 'HCF via division algorithm' } }, res);
    assert.strictEqual(res.statusCode, 201);
    const conceptId = res.body.concept.id;

    res = makeRes();
    await h({ method: 'POST', query: { type: 'learning-outcome' }, body: { conceptId, description: 'Student can compute HCF of two positive integers using the division algorithm.' } }, res);
    assert.strictEqual(res.statusCode, 201);

    // Now walk it back down via GET, confirming the nesting actually works.
    res = makeRes();
    await h({ method: 'GET', query: { type: 'subject', id: subjectId } }, res);
    assert.strictEqual(res.body.chapters.length, 1);
    res = makeRes();
    await h({ method: 'GET', query: { type: 'chapter', id: chapterId } }, res);
    assert.strictEqual(res.body.topics.length, 1);
    res = makeRes();
    await h({ method: 'GET', query: { type: 'topic', id: topicId } }, res);
    assert.strictEqual(res.body.concepts.length, 1);
    res = makeRes();
    await h({ method: 'GET', query: { type: 'concept', id: conceptId } }, res);
    assert.strictEqual(res.body.learningOutcomes.length, 1);
  });

  await test('G2: a duplicate chapter sequence number on the same subject is rejected', async () => {
    const state = { boards: [{ id: 'cbse' }], subjects: [{ id: 'subj1', board_id: 'cbse', status: 'active' }], chapters: [{ id: 'chap1', subject_id: 'subj1', sequence_no: 1, name: 'X', status: 'active', version: 1 }], topics: [], concepts: [], learningOutcomes: [] };
    const h = loadCurriculumHandler(state, adminSession);
    const res = makeRes();
    await h({ method: 'POST', query: { type: 'chapter' }, body: { subjectId: 'subj1', sequenceNo: 1, name: 'Y' } }, res);
    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(res.body.error.code, 'CHAPTER_SEQUENCE_TAKEN');
  });

  await test('G5: updating a subject with a stale expectedVersion is rejected, not silently applied', async () => {
    const state = { boards: [{ id: 'cbse' }], subjects: [{ id: 'subj1', board_id: 'cbse', class_level: 'Class 10', medium: 'English', name: 'Math', status: 'active', version: 4 }], chapters: [], topics: [], concepts: [], learningOutcomes: [] };
    const h = loadCurriculumHandler(state, adminSession);
    const res = makeRes();
    await h({ method: 'PATCH', query: { type: 'subject', id: 'subj1' }, body: { status: 'inactive', expectedVersion: 1 } }, res);
    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(res.body.error.code, 'STALE_VERSION');
    assert.strictEqual(state.subjects[0].status, 'active');
    assert.strictEqual(state.subjects[0].version, 4);
  });

  // ---------- Paper ingestion ----------
  await test('G3: a student cannot access paper ingestion at all', async () => {
    const state = { examPapers: [], jobs: [], audit: [] };
    const h = loadIngestionHandler(state, studentSession);
    const res = makeRes();
    await h({ method: 'GET', query: {} }, res);
    assert.strictEqual(res.statusCode, 403);
  });

  await test('G2: uploading an unsupported mime type is rejected before any job is created', async () => {
    const state = { examPapers: [], jobs: [], audit: [] };
    const h = loadIngestionHandler(state, teacherSession);
    const res = makeRes();
    await h({ method: 'POST', query: {}, body: { filename: 'x.exe', mimeType: 'application/x-msdownload', contentBase64: Buffer.from('x').toString('base64') } }, res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error.code, 'INVALID_FILE_TYPE');
    assert.strictEqual(state.jobs.length, 0);
  });

  await test('G2: an oversized file is rejected', async () => {
    const state = { examPapers: [], jobs: [], audit: [] };
    const h = loadIngestionHandler(state, teacherSession);
    const bigBuffer = Buffer.alloc(9 * 1024 * 1024, 1); // 9 MB > 8 MB limit
    const res = makeRes();
    await h({ method: 'POST', query: {}, body: { filename: 'big.pdf', mimeType: 'application/pdf', contentBase64: bigBuffer.toString('base64') } }, res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error.code, 'FILE_TOO_LARGE');
  });

  await test('G2 + honesty check: with no OCR provider configured, the job lands on needs_manual_transcription, not a fabricated parse', async () => {
    const state = { examPapers: [], jobs: [], audit: [] };
    const h = loadIngestionHandler(state, teacherSession); // default runOcr mock reports not_configured
    const res = makeRes();
    await h({ method: 'POST', query: {}, body: { filename: 'paper.pdf', mimeType: 'application/pdf', contentBase64: Buffer.from('a real board paper').toString('base64') } }, res);
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.body.job.status, 'needs_manual_transcription');
    assert.strictEqual(res.body.job.ocr_status, 'not_configured');
    assert.strictEqual(res.body.job.ocr_result_text, null, 'no OCR text should exist when OCR was never actually run');
  });

  await test('G6 idempotency: uploading byte-identical content twice returns the same job, not a duplicate', async () => {
    const state = { examPapers: [], jobs: [], audit: [] };
    const h = loadIngestionHandler(state, teacherSession);
    const content = Buffer.from('identical board paper bytes').toString('base64');
    let res = makeRes();
    await h({ method: 'POST', query: {}, body: { filename: 'paper.pdf', mimeType: 'application/pdf', contentBase64: content } }, res);
    assert.strictEqual(res.statusCode, 201);
    const firstJobId = res.body.job.id;

    res = makeRes();
    await h({ method: 'POST', query: {}, body: { filename: 'paper-renamed.pdf', mimeType: 'application/pdf', contentBase64: content } }, res);
    assert.strictEqual(res.statusCode, 200, 'a duplicate-content upload should return 200, not 201 (no new resource created)');
    assert.strictEqual(res.body.deduplicated, true);
    assert.strictEqual(res.body.job.id, firstJobId);
    assert.strictEqual(state.jobs.length, 1, 'only one ingestion job should exist for identical content');
  });

  await test('G4 evidence/governance: the state machine cannot skip states (uploaded content cannot jump straight to published)', async () => {
    const state = { examPapers: [], jobs: [{ id: 'job1', status: 'needs_manual_transcription', version: 1 }], audit: [] };
    const h = loadIngestionHandler(state, adminSession);
    const res = makeRes();
    await h({ method: 'PATCH', query: { jobId: 'job1' }, body: { action: 'publish', expectedVersion: 1 } }, res);
    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(res.body.error.code, 'INVALID_TRANSITION');
    assert.strictEqual(state.jobs[0].status, 'needs_manual_transcription');
  });

  await test('G2 + G3: a teacher can move a job through review/verification, but only admin can pass licence check', async () => {
    const state = { examPapers: [], jobs: [{ id: 'job1', status: 'needs_manual_transcription', version: 1 }], audit: [] };
    let h = loadIngestionHandler(state, teacherSession);
    let res = makeRes();
    await h({ method: 'PATCH', query: { jobId: 'job1' }, body: { action: 'submit_manual_transcription', transcriptionText: 'Q1. Solve for x...', expectedVersion: 1 } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(state.jobs[0].status, 'parsed');

    res = makeRes();
    await h({ method: 'PATCH', query: { jobId: 'job1' }, body: { action: 'mark_needs_review', expectedVersion: 2 } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(state.jobs[0].status, 'needs_review');

    res = makeRes();
    await h({ method: 'PATCH', query: { jobId: 'job1' }, body: { action: 'verify_source', expectedVersion: 3 } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(state.jobs[0].status, 'verified');

    // A teacher trying to move it into licence_check should be forbidden — that's admin-only governance.
    res = makeRes();
    await h({ method: 'PATCH', query: { jobId: 'job1' }, body: { action: 'enter_licence_check', expectedVersion: 4 } }, res);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(state.jobs[0].status, 'verified', 'status must not change on a forbidden transition attempt');

    // An admin can.
    h = loadIngestionHandler(state, adminSession);
    res = makeRes();
    await h({ method: 'PATCH', query: { jobId: 'job1' }, body: { action: 'enter_licence_check', expectedVersion: 4 } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(state.jobs[0].status, 'licence_check');
  });

  await test('G5: a stale expectedVersion on a governance transition is rejected, not silently applied', async () => {
    const state = { examPapers: [], jobs: [{ id: 'job1', status: 'licence_check', version: 5 }], audit: [] };
    const h = loadIngestionHandler(state, adminSession);
    const res = makeRes();
    await h({ method: 'PATCH', query: { jobId: 'job1' }, body: { action: 'licence_pass', expectedVersion: 1 } }, res);
    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(res.body.error.code, 'STALE_VERSION');
    assert.strictEqual(state.jobs[0].status, 'licence_check');
    assert.strictEqual(state.jobs[0].version, 5);
  });

  await test('G4: licence_fail routes to licence_rejected, a terminal state distinct from generic rejection', async () => {
    const state = { examPapers: [], jobs: [{ id: 'job1', status: 'licence_check', version: 1 }], audit: [] };
    const h = loadIngestionHandler(state, adminSession);
    const res = makeRes();
    await h({ method: 'PATCH', query: { jobId: 'job1' }, body: { action: 'licence_fail', expectedVersion: 1 } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(state.jobs[0].status, 'licence_rejected');
  });

  console.log(failures === 0 ? '\nALL M65 CURRICULUM + INGESTION TESTS PASSED' : `\n${failures} M65 TEST(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})();
