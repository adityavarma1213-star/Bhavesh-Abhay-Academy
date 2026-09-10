// test/run-m66-question-bank-tests.js
// BAA M66 — Universal Question Bank + Search (Blueprint V3.2/V3.3, IB-05).
// Same extraction-and-execute discipline as M64/M65's test files.
//
// Coverage:
//   G1 schema/contract — migration 025 adds the search_vector/indexes the API assumes
//   G2 handler         — create/update/search/get actually run
//   G3 authorization    — student cannot author a question; teacher cannot unilaterally publish/verify
//   G4 child-safety/evidence — an unpublished or unverified question is invisible to students (404, not 403 — no existence leak)
//   G5 concurrency       — stale expectedVersion on update rejected
//   G6 idempotency (soft)— duplicate question text on the same paper rejected
//
// NOT LIVE-VERIFIED — DATABASE ACCESS UNAVAILABLE. This is a mock-database
// test; the full-text search behavior (`plainto_tsquery`) is exercised only
// at the query-construction level here, not against a real Postgres
// instance with real tsvector matching semantics.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
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

// ---------- G1 ----------
const migration = fs.readFileSync(path.join(ROOT, 'db/migrations/025_question_search.sql'), 'utf8');
testSync('G1: search_vector column and GIN index exist', () => {
  assert.ok(migration.includes('ADD COLUMN IF NOT EXISTS search_vector tsvector'));
  assert.ok(/USING GIN\(search_vector\)/.test(migration));
});
testSync('G1: filter indexes exist for the required facets (board+class, subject, chapter, topic, learning outcome, type+difficulty, verification)', () => {
  for (const idx of ['idx_board_questions_board_class', 'idx_board_questions_subject', 'idx_board_questions_chapter', 'idx_board_questions_topic', 'idx_board_questions_learning_outcome', 'idx_board_questions_type_difficulty', 'idx_board_questions_verification']) {
    assert.ok(migration.includes(idx), `missing index: ${idx}`);
  }
});
testSync('G1: soft duplicate-detection unique index exists, scoped to non-null exam_paper_id', () => {
  assert.ok(/CREATE UNIQUE INDEX IF NOT EXISTS uq_board_questions_paper_text ON board_questions\(exam_paper_id, question_text\) WHERE exam_paper_id IS NOT NULL/.test(migration));
});
testSync('G1: no Elasticsearch/OpenSearch/vector infra introduced — PostgreSQL capabilities only, per blueprint instruction', () => {
  assert.ok(!/elasticsearch|opensearch|pinecone|weaviate|qdrant/i.test(migration));
});

// ---------- extraction + fake sql ----------
function extractBlock() {
  const src = fs.readFileSync(path.join(ROOT, 'api/v1/[...route].js'), 'utf8');
  const start = src.indexOf('/* ================ question-bank.js ================ */');
  assert.ok(start >= 0, 'question-bank.js block not found');
  const end = src.indexOf('\nexport default async function handler', start);
  assert.ok(end > start, 'could not find end of question-bank.js block');
  return src.slice(start, end);
}

function makeFakeSql(state) {
  return async function sql(strings, ...values) {
    const q = strings.join('?').replace(/\s+/g, ' ').trim();
    if (q.startsWith('SELECT id FROM boards WHERE id')) return { rows: state.boards.filter(b => b.id === values[0]).map(b => ({ id: b.id })) };
    if (q.startsWith('SELECT id FROM board_questions WHERE exam_paper_id')) {
      const [examPaperId, text] = values;
      return { rows: state.questions.filter(q2 => q2.exam_paper_id === examPaperId && q2.question_text === text).map(q2 => ({ id: q2.id })) };
    }
    if (q.startsWith('SELECT * FROM board_questions WHERE id')) return { rows: state.questions.filter(q2 => q2.id === values[0]) };
    if (q.startsWith('SELECT * FROM board_questions WHERE (')) {
      const [includeUnpublished, boardId, , classLevel, , subjectId, , chapterId, , topicId, , conceptId, , learningOutcomeId, , examPaperId, examPaperId2, examPaperId3, , questionType, , difficulty, , keyword] = values;
      let rows = state.questions.slice();
      if (!includeUnpublished) rows = rows.filter(q2 => q2.status === 'published' && q2.verification_status === 'verified');
      if (boardId) rows = rows.filter(q2 => q2.board_id === boardId);
      if (classLevel) rows = rows.filter(q2 => q2.class_level === classLevel);
      if (subjectId) rows = rows.filter(q2 => q2.subject_id === subjectId);
      if (chapterId) rows = rows.filter(q2 => q2.chapter_id === chapterId);
      if (topicId) rows = rows.filter(q2 => q2.topic_id === topicId);
      if (conceptId) rows = rows.filter(q2 => q2.concept_id === conceptId);
      if (learningOutcomeId) rows = rows.filter(q2 => q2.learning_outcome_id === learningOutcomeId);
      if (examPaperId) {
        const mockIds = (state.mockExamQuestions || []).filter(m => m.exam_paper_id === examPaperId).map(m => m.board_question_id);
        rows = rows.filter(q2 => q2.exam_paper_id === examPaperId || mockIds.includes(q2.id));
      }
      if (questionType) rows = rows.filter(q2 => q2.question_type === questionType);
      if (difficulty) rows = rows.filter(q2 => q2.difficulty === difficulty);
      if (keyword) rows = rows.filter(q2 => q2.question_text.toLowerCase().includes(String(keyword).toLowerCase()));
      return { rows };
    }
    if (q.startsWith('INSERT INTO board_questions')) {
      const [id0, version, examPaperId, boardId, classLevel, subjectId, medium, chapterId, topicId, conceptId, learningOutcomeId, questionText, questionType, marks, difficulty, bloomLevel, sourceUrl, licenceType] = values;
      state.questions.push({ id: id0, version, exam_paper_id: examPaperId, board_id: boardId, class_level: classLevel, subject_id: subjectId, medium, chapter_id: chapterId, topic_id: topicId, concept_id: conceptId, learning_outcome_id: learningOutcomeId, question_text: questionText, question_type: questionType, marks, difficulty, bloom_level: bloomLevel, source_url: sourceUrl, licence_type: licenceType, verification_status: 'pending_verification', status: 'draft', created_at: 't', updated_at: 't' });
      return { rows: [], count: 1 };
    }
    if (q.startsWith('UPDATE board_questions SET')) {
      const [status, verificationStatus, difficulty, marks, updatedAt, id0, expectedVersion] = values;
      const question = state.questions.find(q2 => q2.id === id0 && q2.version === expectedVersion);
      if (!question) return { rows: [], count: 0 };
      question.status = status; question.verification_status = verificationStatus; question.difficulty = difficulty; question.marks = marks; question.version += 1; question.updated_at = updatedAt;
      return { rows: [], count: 1 };
    }
    throw new Error('Unhandled fake-sql query in question-bank test: ' + q);
  };
}

function loadHandler(state, session) {
  const block = extractBlock();
  const sandbox = {
    console, Date, JSON, Math, Number, String, Object, Array, Set, Map, Error, Promise, RegExp, parseInt,
    global: {},
    sql: makeFakeSql(state),
    json: (res, status, body) => { res.statusCode = status; res.body = body; return res; },
    id: (p) => `${p}_${Math.random().toString(36).slice(2, 8)}`,
    writeAudit: async () => {},
    requireAuth: async () => session,
    hasRole: (s, role) => s.roles.includes(role),
  };
  vm.createContext(sandbox);
  vm.runInContext(block + '\nglobal.__h = handler_question_bank;\n', sandbox);
  return sandbox.global.__h;
}

function makeRes() { return { statusCode: null, body: null, setHeader() {}, status(s) { this.statusCode = s; return this; }, json(b) { this.body = b; return this; } }; }

const adminSession = { user_id: 'u_admin', roles: ['admin'] };
const teacherSession = { user_id: 'u_teacher', roles: ['teacher'] };
const studentSession = { user_id: 'u_student', roles: ['student'] };

function baseQuestion(overrides) {
  return { id: 'q1', version: 1, exam_paper_id: null, board_id: 'cbse', class_level: 'Class 10', subject_id: null, medium: 'English', chapter_id: null, topic_id: null, concept_id: null, learning_outcome_id: null, question_text: 'What is the HCF of 12 and 18?', question_type: 'short_answer', marks: 2, difficulty: 'easy', bloom_level: 'apply', source_url: null, licence_type: 'unknown', verification_status: 'pending_verification', status: 'draft', created_at: 't', updated_at: 't', ...overrides };
}

(async () => {
  await test('G3: a student cannot author a question', async () => {
    const state = { boards: [{ id: 'cbse' }], questions: [] };
    const h = loadHandler(state, studentSession);
    const res = makeRes();
    await h({ method: 'POST', query: {}, body: { boardId: 'cbse', classLevel: 'Class 10', medium: 'English', questionText: 'x' } }, res);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(state.questions.length, 0);
  });

  await test('G2: a teacher can author a question, defaulting to draft/pending_verification', async () => {
    const state = { boards: [{ id: 'cbse' }], questions: [] };
    const h = loadHandler(state, teacherSession);
    const res = makeRes();
    await h({ method: 'POST', query: {}, body: { boardId: 'cbse', classLevel: 'Class 10', medium: 'English', questionText: 'What is 7 x 8?', questionType: 'mcq', marks: 1 } }, res);
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.body.question.status, 'draft');
    assert.strictEqual(res.body.question.verificationStatus, 'pending_verification');
  });

  await test('G6 (soft idempotency): duplicate question text on the same paper is rejected', async () => {
    const state = { boards: [{ id: 'cbse' }], questions: [baseQuestion({ exam_paper_id: 'paper1' })] };
    const h = loadHandler(state, teacherSession);
    const res = makeRes();
    await h({ method: 'POST', query: {}, body: { boardId: 'cbse', classLevel: 'Class 10', medium: 'English', questionText: 'What is the HCF of 12 and 18?', examPaperId: 'paper1' } }, res);
    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(res.body.error.code, 'DUPLICATE_QUESTION');
  });

  await test('G3: a teacher cannot unilaterally publish or verify a question', async () => {
    const state = { boards: [{ id: 'cbse' }], questions: [baseQuestion()] };
    const h = loadHandler(state, teacherSession);
    const res = makeRes();
    await h({ method: 'PATCH', query: { id: 'q1' }, body: { status: 'published', verificationStatus: 'verified', expectedVersion: 1 } }, res);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(state.questions[0].status, 'draft');
  });

  await test('G2: a teacher CAN correct non-governance metadata (difficulty/marks) without admin', async () => {
    const state = { boards: [{ id: 'cbse' }], questions: [baseQuestion()] };
    const h = loadHandler(state, teacherSession);
    const res = makeRes();
    await h({ method: 'PATCH', query: { id: 'q1' }, body: { difficulty: 'medium', marks: 3, expectedVersion: 1 } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(state.questions[0].difficulty, 'medium');
  });

  await test('G2: an admin CAN publish and verify a question', async () => {
    const state = { boards: [{ id: 'cbse' }], questions: [baseQuestion()] };
    const h = loadHandler(state, adminSession);
    const res = makeRes();
    await h({ method: 'PATCH', query: { id: 'q1' }, body: { status: 'published', verificationStatus: 'verified', expectedVersion: 1 } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(state.questions[0].status, 'published');
    assert.strictEqual(state.questions[0].verification_status, 'verified');
  });

  await test('G5: a stale expectedVersion on update is rejected, not silently applied', async () => {
    const state = { boards: [{ id: 'cbse' }], questions: [baseQuestion({ version: 3 })] };
    const h = loadHandler(state, adminSession);
    const res = makeRes();
    await h({ method: 'PATCH', query: { id: 'q1' }, body: { status: 'published', verificationStatus: 'verified', expectedVersion: 1 } }, res);
    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(res.body.error.code, 'STALE_VERSION');
    assert.strictEqual(state.questions[0].status, 'draft');
  });

  await test('G4: a draft/unverified question is invisible to a student search (no leak)', async () => {
    const state = { boards: [{ id: 'cbse' }], questions: [baseQuestion({ id: 'q_draft', status: 'draft', verification_status: 'pending_verification' })] };
    const h = loadHandler(state, studentSession);
    const res = makeRes();
    await h({ method: 'GET', query: { boardId: 'cbse' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.questions.length, 0, 'an unpublished/unverified question must not appear in a student\'s search results');
  });

  await test('G4: a published+verified question IS visible to a student search', async () => {
    const state = { boards: [{ id: 'cbse' }], questions: [baseQuestion({ id: 'q_pub', status: 'published', verification_status: 'verified' })] };
    const h = loadHandler(state, studentSession);
    const res = makeRes();
    await h({ method: 'GET', query: { boardId: 'cbse' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.questions.length, 1);
  });

  await test('G4: fetching a draft question by id as a student returns 404, not 403 (does not confirm existence)', async () => {
    const state = { boards: [{ id: 'cbse' }], questions: [baseQuestion({ id: 'q_draft' })] };
    const h = loadHandler(state, studentSession);
    const res = makeRes();
    await h({ method: 'GET', query: { id: 'q_draft' } }, res);
    assert.strictEqual(res.statusCode, 404);
    assert.strictEqual(res.body.error.code, 'QUESTION_NOT_FOUND');
  });

  await test('G3: a teacher (not just admin) CAN see draft questions via includeUnpublished', async () => {
    const state = { boards: [{ id: 'cbse' }], questions: [baseQuestion({ id: 'q_draft' })] };
    const h = loadHandler(state, teacherSession);
    const res = makeRes();
    await h({ method: 'GET', query: { boardId: 'cbse', includeUnpublished: 'true' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.questions.length, 1);
  });

  await test('G2: keyword search filters by question text', async () => {
    const state = { boards: [{ id: 'cbse' }], questions: [
      baseQuestion({ id: 'q_hcf', question_text: 'Find the HCF of 12 and 18', status: 'published', verification_status: 'verified' }),
      baseQuestion({ id: 'q_area', question_text: 'Find the area of a circle with radius 7cm', status: 'published', verification_status: 'verified' }),
    ] };
    const h = loadHandler(state, studentSession);
    const res = makeRes();
    await h({ method: 'GET', query: { boardId: 'cbse', q: 'HCF' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.questions.length, 1);
    assert.strictEqual(res.body.questions[0].id, 'q_hcf');
  });

  await test('G2: invalid questionType is rejected', async () => {
    const state = { boards: [{ id: 'cbse' }], questions: [] };
    const h = loadHandler(state, adminSession);
    const res = makeRes();
    await h({ method: 'POST', query: {}, body: { boardId: 'cbse', classLevel: 'Class 10', medium: 'English', questionText: 'x', questionType: 'essay_freeform_thing' } }, res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error.code, 'INVALID_QUESTION_TYPE');
  });

  await test('M71 bridge: searching by examPaperId also surfaces questions linked via mock_exam_questions, not just direct exam_paper_id', async () => {
    const state = { boards: [{ id: 'cbse' }], questions: [baseQuestion({ id: 'q_orig', exam_paper_id: 'original_paper', status: 'published', verification_status: 'verified' })], mockExamQuestions: [{ exam_paper_id: 'mock_paper_1', board_question_id: 'q_orig' }] };
    const h = loadHandler(state, studentSession);
    const res = makeRes();
    await h({ method: 'GET', query: { examPaperId: 'mock_paper_1' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.questions.length, 1, 'a question composed into a mock via the bridge table must be found by that mock\'s examPaperId, even though its own exam_paper_id points elsewhere');
  });

  await test('M75 low-bandwidth: fields=minimal returns a slim payload', async () => {
    const state = { boards: [{ id: 'cbse' }], questions: [baseQuestion({ id: 'q1', status: 'published', verification_status: 'verified' })] };
    const h = loadHandler(state, studentSession);
    const res = makeRes();
    await h({ method: 'GET', query: { boardId: 'cbse', fields: 'minimal' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.slim, true);
    assert.deepStrictEqual(Object.keys(res.body.questions[0]).sort(), ['difficulty', 'id', 'marks', 'questionText', 'questionType'].sort());
  });

  console.log(failures === 0 ? '\nALL M66 QUESTION BANK TESTS PASSED' : `\n${failures} M66 TEST(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})();
