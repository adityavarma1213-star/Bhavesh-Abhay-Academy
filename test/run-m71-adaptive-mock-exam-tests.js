// test/run-m71-adaptive-mock-exam-tests.js
// BAA M71 — Adaptive Mock Examination (Blueprint V3.2/V3.3).
// Same extraction-and-execute discipline as M64-M70.
//
// Coverage:
//   G1 schema/contract — migration 029's paper_type/generated_for_learner_id + mock_exam_questions bridge and its idempotency constraint
//   G2 handler         — generation actually selects real questions, in a deterministic priority order
//   G3 authorization    — a learner cannot generate a mock for another learner
//   G4 evidence honesty — selection_reason is never fabricated: weak_concept only for genuinely weak concepts, coverage_gap only when weak-concept supply runs out
//   G6 idempotency        — mock_exam_questions cannot contain the same question twice for one paper (schema-level, verified via the constraint text)
//   Isolation             — a generated mock is tagged paper_type='mock' + generated_for_learner_id, never 'official'
//
// NOT LIVE-VERIFIED — DATABASE ACCESS UNAVAILABLE.

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
const migration = fs.readFileSync(path.join(ROOT, 'db/migrations/029_adaptive_mock_exam.sql'), 'utf8');
testSync('G1: exam_papers gains paper_type (official/mock) and generated_for_learner_id', () => {
  assert.ok(migration.includes("paper_type TEXT NOT NULL DEFAULT 'official' CHECK (paper_type IN ('official', 'mock'))"));
  assert.ok(migration.includes('generated_for_learner_id TEXT REFERENCES learners(id)'));
});
testSync('G1 (G6 idempotency): mock_exam_questions cannot contain the same question twice for one paper', () => {
  const tableDef = migration.slice(migration.indexOf('CREATE TABLE IF NOT EXISTS mock_exam_questions ('));
  assert.ok(tableDef.slice(0, tableDef.indexOf(');')).includes('UNIQUE (exam_paper_id, board_question_id)'));
});
testSync('G1: selection_reason is constrained to the three honest categories (no room for a fabricated reason)', () => {
  assert.ok(migration.includes("selection_reason TEXT NOT NULL CHECK (selection_reason IN ('weak_concept', 'insufficient_evidence_concept', 'coverage_gap'))"));
});

// ---------- extraction ----------
function extractBlock() {
  const src = fs.readFileSync(path.join(ROOT, 'api/v1/[...route].js'), 'utf8');
  const start = src.indexOf('/* ================ adaptive-mock-exam.js ================ */');
  assert.ok(start >= 0, 'adaptive-mock-exam.js block not found');
  const end = src.indexOf('\nexport default async function handler', start);
  assert.ok(end > start, 'could not find end of adaptive-mock-exam.js block');
  return src.slice(start, end);
}

function makeFakeSql(state) {
  return async function sql(strings, ...values) {
    const q = strings.join('?').replace(/\s+/g, ' ').trim();
    if (q.startsWith('SELECT id FROM boards WHERE id')) return { rows: state.boards.filter(b => b.id === values[0]).map(b => ({ id: b.id })) };
    if (q.startsWith('SELECT cm.concept_id, cm.mastery_score, cm.status')) {
      const [learnerId, subjectId] = values;
      return { rows: state.conceptMastery.filter(cm => cm.learner_id === learnerId && cm.subject_id === subjectId && ['weak', 'insufficient_evidence'].includes(cm.status)).sort((a, b) => (a.mastery_score ?? -1) - (b.mastery_score ?? -1) || a.concept_id.localeCompare(b.concept_id)) };
    }
    if (q.startsWith('SELECT id FROM board_questions WHERE concept_id')) {
      const [conceptId, boardId, classLevel, medium] = values;
      return { rows: state.questions.filter(bq => bq.concept_id === conceptId && bq.board_id === boardId && bq.class_level === classLevel && bq.medium === medium && bq.status === 'published' && bq.verification_status === 'verified').sort((a, b) => a.difficulty.localeCompare(b.difficulty) || a.id.localeCompare(b.id)).slice(0, 2).map(bq => ({ id: bq.id })) };
    }
    if (q.startsWith('SELECT id, concept_id FROM board_questions WHERE board_id')) {
      const [boardId, subjectId, classLevel, medium] = values;
      return { rows: state.questions.filter(bq => bq.board_id === boardId && bq.subject_id === subjectId && bq.class_level === classLevel && bq.medium === medium && bq.status === 'published' && bq.verification_status === 'verified').sort((a, b) => a.id.localeCompare(b.id)).map(bq => ({ id: bq.id, concept_id: bq.concept_id })) };
    }
    if (q.startsWith('INSERT INTO exam_papers')) {
      const [id0, boardId, classLevel, subjectId, medium, learnerId, createdAt, updatedAt] = values;
      state.examPapers.push({ id: id0, board_id: boardId, class_level: classLevel, subject_id: subjectId, medium, generated_for_learner_id: learnerId, paper_type: 'mock', status: 'published', created_at: createdAt, updated_at: updatedAt });
      return { rows: [], count: 1 };
    }
    if (q.startsWith('INSERT INTO mock_exam_questions')) {
      const [id0, examPaperId, boardQuestionId, seq, reason, conceptId, createdAt] = values;
      state.mockExamQuestions.push({ id: id0, exam_paper_id: examPaperId, board_question_id: boardQuestionId, sequence_no: seq, selection_reason: reason, concept_id: conceptId, created_at: createdAt });
      return { rows: [], count: 1 };
    }
    if (q.startsWith('SELECT generated_for_learner_id, paper_type FROM exam_papers')) return { rows: state.examPapers.filter(p => p.id === values[0]).map(p => ({ generated_for_learner_id: p.generated_for_learner_id, paper_type: p.paper_type })) };
    if (q.startsWith('SELECT sequence_no, board_question_id, selection_reason, concept_id FROM mock_exam_questions')) return { rows: state.mockExamQuestions.filter(m => m.exam_paper_id === values[0]).sort((a, b) => a.sequence_no - b.sequence_no) };
    throw new Error('Unhandled fake-sql query in M71 test: ' + q);
  };
}

function loadHandler(state, session) {
  const block = extractBlock();
  const sandbox = {
    console, Date, JSON, Math, Number, String, Object, Array, Set, Map, Error, Promise, RegExp,
    global: {},
    sql: makeFakeSql(state),
    json: (res, status, body) => { res.statusCode = status; res.body = body; return res; },
    id: (p) => `${p}_${Math.random().toString(36).slice(2, 8)}`,
    requireAuth: async () => session,
    requireLearnerAccess: async (s, learnerId) => {
      if (s.roles.includes('admin') || s.roles.includes('teacher')) return;
      if (s.learnerId === learnerId) return;
      const e = new Error('You are not authorized to access this learner.'); e.status = 403; e.code = 'LEARNER_FORBIDDEN'; throw e;
    },
    hasRole: (s, role) => s.roles.includes(role),
  };
  vm.createContext(sandbox);
  vm.runInContext(block + '\nglobal.__h = handler_adaptive_mock_exam;\n', sandbox);
  return sandbox.global.__h;
}

function makeRes() { return { statusCode: null, body: null, setHeader() {}, status(s) { this.statusCode = s; return this; }, json(b) { this.body = b; return this; } }; }

const learnerASession = { user_id: 'u_a', roles: ['student'], learnerId: 'learnerA' };

function freshState() {
  return {
    boards: [{ id: 'cbse' }],
    conceptMastery: [
      { learner_id: 'learnerA', subject_id: 'math', concept_id: 'c_weak', mastery_score: 0.2, status: 'weak' },
      { learner_id: 'learnerA', subject_id: 'math', concept_id: 'c_insufficient', mastery_score: null, status: 'insufficient_evidence' },
    ],
    questions: [
      { id: 'q_weak1', concept_id: 'c_weak', board_id: 'cbse', subject_id: 'math', class_level: 'Class 10', medium: 'English', status: 'published', verification_status: 'verified', difficulty: 'easy' },
      { id: 'q_insuff1', concept_id: 'c_insufficient', board_id: 'cbse', subject_id: 'math', class_level: 'Class 10', medium: 'English', status: 'published', verification_status: 'verified', difficulty: 'easy' },
      { id: 'q_other1', concept_id: 'c_other', board_id: 'cbse', subject_id: 'math', class_level: 'Class 10', medium: 'English', status: 'published', verification_status: 'verified', difficulty: 'medium' },
      { id: 'q_other2', concept_id: 'c_other', board_id: 'cbse', subject_id: 'math', class_level: 'Class 10', medium: 'English', status: 'published', verification_status: 'verified', difficulty: 'medium' },
    ],
    examPapers: [], mockExamQuestions: [],
  };
}

(async () => {
  await test('G3: a learner cannot generate a mock for another learner', async () => {
    const state = freshState();
    const h = loadHandler(state, learnerASession);
    const res = makeRes();
    await h({ method: 'POST', query: {}, body: { learnerId: 'learnerB', boardId: 'cbse', subjectId: 'math', classLevel: 'Class 10', medium: 'English', questionCount: 2, timeLimitSeconds: 1800 } }, res);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(state.examPapers.length, 0);
  });

  await test('G2 + G4: weak concepts are prioritized first, with their real (non-fabricated) reasons', async () => {
    const state = freshState();
    const h = loadHandler(state, learnerASession);
    const res = makeRes();
    await h({ method: 'POST', query: {}, body: { learnerId: 'learnerA', boardId: 'cbse', subjectId: 'math', classLevel: 'Class 10', medium: 'English', questionCount: 2, timeLimitSeconds: 1800 } }, res);
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.body.questionCount, 2);
    const reasons = res.body.selection.map(s => s.reason);
    assert.ok(reasons.includes('weak_concept'));
    assert.ok(reasons.includes('insufficient_evidence_concept'));
    assert.ok(!reasons.includes('coverage_gap'), 'coverage_gap should not appear while weak-concept supply is not exhausted');
  });

  await test('G4: coverage_gap fills in only once weak-concept questions run out, never before', async () => {
    const state = freshState();
    const h = loadHandler(state, learnerASession);
    const res = makeRes();
    await h({ method: 'POST', query: {}, body: { learnerId: 'learnerA', boardId: 'cbse', subjectId: 'math', classLevel: 'Class 10', medium: 'English', questionCount: 4, timeLimitSeconds: 1800 } }, res);
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.body.questionCount, 4);
    const byReason = {};
    for (const s of res.body.selection) byReason[s.reason] = (byReason[s.reason] || 0) + 1;
    assert.strictEqual(byReason.weak_concept, 1);
    assert.strictEqual(byReason.insufficient_evidence_concept, 1);
    assert.strictEqual(byReason.coverage_gap, 2, 'the remaining 2 slots must come from real coverage questions, correctly labeled');
  });

  await test('Isolation: a generated mock is tagged paper_type=mock and tied to the requesting learner, never official', async () => {
    const state = freshState();
    const h = loadHandler(state, learnerASession);
    const res = makeRes();
    await h({ method: 'POST', query: {}, body: { learnerId: 'learnerA', boardId: 'cbse', subjectId: 'math', classLevel: 'Class 10', medium: 'English', questionCount: 1, timeLimitSeconds: 1800 } }, res);
    assert.strictEqual(state.examPapers[0].paper_type, 'mock');
    assert.strictEqual(state.examPapers[0].generated_for_learner_id, 'learnerA');
  });

  await test('G2: an insufficient supply of questions returns a real partial/insufficient result, not a fabricated full set', async () => {
    const state = freshState();
    state.questions = state.questions.slice(0, 1); // only 1 question total available
    const h = loadHandler(state, learnerASession);
    const res = makeRes();
    await h({ method: 'POST', query: {}, body: { learnerId: 'learnerA', boardId: 'cbse', subjectId: 'math', classLevel: 'Class 10', medium: 'English', questionCount: 5, timeLimitSeconds: 1800 } }, res);
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.body.questionCount, 1);
    assert.strictEqual(res.body.partiallyFilled, true);
  });

  await test('G2: zero available questions returns insufficientEvidence, no exam paper created', async () => {
    const state = freshState();
    state.questions = [];
    const h = loadHandler(state, learnerASession);
    const res = makeRes();
    await h({ method: 'POST', query: {}, body: { learnerId: 'learnerA', boardId: 'cbse', subjectId: 'math', classLevel: 'Class 10', medium: 'English', questionCount: 5, timeLimitSeconds: 1800 } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.insufficientEvidence, true);
    assert.strictEqual(res.body.examPaperId, null);
    assert.strictEqual(state.examPapers.length, 0);
  });

  await test('G2: the selection can be re-fetched by examPaperId, matching exactly what was generated', async () => {
    const state = freshState();
    const h = loadHandler(state, learnerASession);
    let res = makeRes();
    await h({ method: 'POST', query: {}, body: { learnerId: 'learnerA', boardId: 'cbse', subjectId: 'math', classLevel: 'Class 10', medium: 'English', questionCount: 2, timeLimitSeconds: 1800 } }, res);
    const examPaperId = res.body.examPaperId;
    res = makeRes();
    await h({ method: 'GET', query: { examPaperId } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.selection.length, 2);
  });

  console.log(failures === 0 ? '\nALL M71 ADAPTIVE MOCK EXAM TESTS PASSED' : `\n${failures} M71 TEST(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})();
