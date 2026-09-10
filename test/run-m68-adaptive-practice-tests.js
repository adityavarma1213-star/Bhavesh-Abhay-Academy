// test/run-m68-adaptive-practice-tests.js
// BAA M68 — Adaptive Practice + Remediation (Blueprint V3.2/V3.3, EX-05/EX-06/EX-07).
// Same extraction-and-execute discipline as M64-M67.
//
// Coverage:
//   G1 schema/contract — migration 027 has the grading-honesty columns (correct_answer_text nullable, is_correct nullable, graded_by CHECK) the API assumes
//   G2 handler         — start session/submit answer/complete/classify mistake all actually run
//   G3 authorization    — a learner cannot start a session for another learner; only teacher/admin can classify a mistake
//   G4 evidence honesty — a question with no answer key stays ungraded (never fabricated); mastery_score is NULL (not 0) with no graded attempts
//   G5 concurrency        — stale expectedVersion on session completion rejected
//   G6 idempotency        — resubmitting the same question in a session updates the one attempt row, never duplicates
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
const migration = fs.readFileSync(path.join(ROOT, 'db/migrations/027_adaptive_practice.sql'), 'utf8');
testSync('G1: board_questions gains nullable correct_answer_text/explanation_text (grading honesty)', () => {
  assert.ok(migration.includes('ADD COLUMN IF NOT EXISTS correct_answer_text TEXT;'));
  assert.ok(migration.includes('ADD COLUMN IF NOT EXISTS explanation_text TEXT;'));
});
testSync('G1: concept_mastery.mastery_score is nullable and status includes insufficient_evidence (no fabricated zero)', () => {
  const tableDef = migration.slice(migration.indexOf('CREATE TABLE IF NOT EXISTS concept_mastery ('));
  const body = tableDef.slice(0, tableDef.indexOf(');'));
  assert.ok(/mastery_score NUMERIC,/.test(body), 'mastery_score must not have a NOT NULL/default of 0');
  assert.ok(body.includes("'insufficient_evidence'"));
});
testSync('G1: practice_attempts.is_correct is nullable with a graded_by provenance CHECK (never a fabricated grade)', () => {
  const tableDef = migration.slice(migration.indexOf('CREATE TABLE IF NOT EXISTS practice_attempts ('));
  const body = tableDef.slice(0, tableDef.indexOf(');'));
  assert.ok(/is_correct BOOLEAN,/.test(body));
  assert.ok(body.includes("graded_by TEXT NOT NULL DEFAULT 'ungraded' CHECK (graded_by IN ('ungraded', 'deterministic', 'human'))"));
});
testSync('G1: practice_attempts has a real idempotency constraint (one row per question per session)', () => {
  const tableDef = migration.slice(migration.indexOf('CREATE TABLE IF NOT EXISTS practice_attempts ('));
  assert.ok(tableDef.slice(0, tableDef.indexOf(');')).includes('UNIQUE (practice_session_id, question_id)'));
});
testSync('G1: mistake_records.failure_type defaults to unclassified, not a guessed category', () => {
  assert.ok(migration.includes("failure_type TEXT NOT NULL DEFAULT 'unclassified'"));
});

// ---------- extraction ----------
function extractBlock() {
  const src = fs.readFileSync(path.join(ROOT, 'api/v1/[...route].js'), 'utf8');
  const start = src.indexOf('/* ================ adaptive-practice.js ================ */');
  assert.ok(start >= 0, 'adaptive-practice.js block not found');
  const end = src.indexOf('\nexport default async function handler', start);
  assert.ok(end > start, 'could not find end of adaptive-practice.js block');
  return src.slice(start, end);
}

function makeFakeSql(state) {
  return async function sql(strings, ...values) {
    const q = strings.join('?').replace(/\s+/g, ' ').trim();
    if (q.startsWith('SELECT * FROM board_questions WHERE concept_id')) {
      const [conceptId, sessionId] = values;
      const attempted = state.attempts.filter(a => a.practice_session_id === sessionId).map(a => a.question_id);
      const candidates = state.questions.filter(qq => qq.concept_id === conceptId && qq.status === 'published' && qq.verification_status === 'verified' && !attempted.includes(qq.id));
      candidates.sort((a, b) => a.difficulty.localeCompare(b.difficulty));
      return { rows: candidates.slice(0, 1) };
    }
    if (q.startsWith('SELECT is_correct FROM practice_attempts')) {
      const [learnerId, conceptId] = values;
      const sessionIds = state.sessions.filter(s => s.learner_id === learnerId && s.concept_id === conceptId).map(s => s.id);
      const graded = state.attempts.filter(a => sessionIds.includes(a.practice_session_id) && a.is_correct !== null);
      return { rows: graded.map(a => ({ is_correct: a.is_correct })) };
    }
    if (q.startsWith('SELECT id, version FROM concept_mastery')) {
      const [learnerId, conceptId] = values;
      return { rows: state.mastery.filter(m => m.learner_id === learnerId && m.concept_id === conceptId).map(m => ({ id: m.id, version: m.version })) };
    }
    if (q.startsWith('UPDATE concept_mastery SET correct_count')) {
      const [correctCount, incorrectCount, masteryScore, status, lastPracticedAt, updatedAt, id0] = values;
      const m = state.mastery.find(x => x.id === id0);
      if (m) { m.correct_count = correctCount; m.incorrect_count = incorrectCount; m.mastery_score = masteryScore; m.status = status; m.last_practiced_at = lastPracticedAt; m.version += 1; m.updated_at = updatedAt; }
      return { rows: [], count: 1 };
    }
    if (q.startsWith('INSERT INTO concept_mastery')) {
      const [id0, learnerId, conceptId, correctCount, incorrectCount, masteryScore, status, lastPracticedAt, updatedAt] = values;
      state.mastery.push({ id: id0, learner_id: learnerId, concept_id: conceptId, correct_count: correctCount, incorrect_count: incorrectCount, mastery_score: masteryScore, status, last_practiced_at: lastPracticedAt, version: 1, updated_at: updatedAt });
      return { rows: [], count: 1 };
    }
    if (q.startsWith("SELECT * FROM concept_mastery WHERE learner_id = ? AND status IN")) {
      const [learnerId] = values;
      return { rows: state.mastery.filter(m => m.learner_id === learnerId && (m.status === 'weak' || m.status === 'insufficient_evidence')) };
    }
    if (q.startsWith('SELECT id FROM concepts WHERE id')) return { rows: state.concepts.filter(c => c.id === values[0]).map(c => ({ id: c.id })) };
    if (q.startsWith('INSERT INTO practice_sessions')) {
      const [id0, learnerId, conceptId, createdAt] = values; // status='in_progress', version=1 are literals
      state.sessions.push({ id: id0, learner_id: learnerId, concept_id: conceptId, status: 'in_progress', version: 1, created_at: createdAt, completed_at: null });
      return { rows: [], count: 1 };
    }
    if (q.startsWith('SELECT * FROM practice_sessions WHERE id')) return { rows: state.sessions.filter(s => s.id === values[0]) };
    if (q.startsWith('SELECT id, question_type, correct_answer_text, explanation_text FROM board_questions')) return { rows: state.questions.filter(qq => qq.id === values[0]).map(qq => ({ id: qq.id, question_type: qq.question_type, correct_answer_text: qq.correct_answer_text, explanation_text: qq.explanation_text })) };
    if (q.startsWith('SELECT id FROM practice_attempts WHERE practice_session_id')) return { rows: state.attempts.filter(a => a.practice_session_id === values[0] && a.question_id === values[1]).map(a => ({ id: a.id })) };
    if (q.startsWith('UPDATE practice_attempts SET response_text')) {
      const [responseText, isCorrect, gradedBy, answeredAt, id0] = values;
      const a = state.attempts.find(x => x.id === id0);
      if (a) { a.response_text = responseText; a.is_correct = isCorrect; a.graded_by = gradedBy; a.answered_at = answeredAt; }
      return { rows: [], count: 1 };
    }
    if (q.startsWith('INSERT INTO practice_attempts')) {
      const [id0, sessionId, questionId, responseText, isCorrect, gradedBy, answeredAt] = values;
      state.attempts.push({ id: id0, practice_session_id: sessionId, question_id: questionId, response_text: responseText, is_correct: isCorrect, graded_by: gradedBy, answered_at: answeredAt });
      return { rows: [], count: 1 };
    }
    if (q.startsWith('SELECT id FROM mistake_records WHERE learner_id')) return { rows: [] };
    if (q.startsWith('INSERT INTO mistake_records')) {
      const [id0, learnerId, conceptId, questionId, recordedAt] = values; // practice_attempt_id=NULL, failure_type='unclassified' are literals
      state.mistakes.push({ id: id0, learner_id: learnerId, concept_id: conceptId, question_id: questionId, practice_attempt_id: null, failure_type: 'unclassified', classified_by_user_id: null, recorded_at: recordedAt });
      return { rows: [], count: 1 };
    }
    if (q.startsWith('SELECT * FROM concept_mastery WHERE learner_id = ? AND concept_id')) {
      const [learnerId, conceptId] = values;
      return { rows: state.mastery.filter(m => m.learner_id === learnerId && m.concept_id === conceptId) };
    }
    if (q.startsWith("UPDATE practice_sessions SET status='completed'")) {
      const [completedAt, id0, expectedVersion] = values;
      const s = state.sessions.find(x => x.id === id0 && x.version === expectedVersion);
      if (!s) return { rows: [], count: 0 };
      s.status = 'completed'; s.completed_at = completedAt; s.version += 1;
      return { rows: [], count: 1 };
    }
    if (q.startsWith('SELECT id FROM mistake_records WHERE id')) return { rows: state.mistakes.filter(m => m.id === values[0]).map(m => ({ id: m.id })) };
    if (q.startsWith('UPDATE mistake_records SET failure_type')) {
      const [failureType, userId, id0] = values;
      const m = state.mistakes.find(x => x.id === id0);
      if (m) { m.failure_type = failureType; m.classified_by_user_id = userId; }
      return { rows: [], count: 1 };
    }
    throw new Error('Unhandled fake-sql query in adaptive-practice test: ' + q);
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
    // M69's bridge is a collaborator, not M68's own concern — mocked here
    // (success, no-op) so these tests stay focused on M68's behavior.
    // The bridge's real logic (evidence-gating, concept resolution, the
    // actual learning_evidence write) is tested directly in
    // run-m69-learning-memory-integration-tests.js.
    recordBoardLearningEvidence: async () => { state.m69BridgeCalls = (state.m69BridgeCalls || 0) + 1; return { written: true }; },
  };
  vm.createContext(sandbox);
  vm.runInContext(block + '\nglobal.__h = handler_adaptive_practice;\n', sandbox);
  return sandbox.global.__h;
}

function makeRes() { return { statusCode: null, body: null, setHeader() {}, status(s) { this.statusCode = s; return this; }, json(b) { this.body = b; return this; } }; }

const adminSession = { user_id: 'u_admin', roles: ['admin'] };
const teacherSession = { user_id: 'u_teacher', roles: ['teacher'] };
const learnerASession = { user_id: 'u_a', roles: ['student'], learnerId: 'learnerA' };
const learnerBSession = { user_id: 'u_b', roles: ['student'], learnerId: 'learnerB' };

function freshState() {
  return {
    concepts: [{ id: 'c1' }],
    questions: [
      { id: 'q1', concept_id: 'c1', status: 'published', verification_status: 'verified', question_type: 'mcq', difficulty: 'easy', correct_answer_text: 'B', explanation_text: 'Because...' },
      { id: 'q2', concept_id: 'c1', status: 'published', verification_status: 'verified', question_type: 'short_answer', difficulty: 'medium', correct_answer_text: null, explanation_text: null },
    ],
    sessions: [], attempts: [], mastery: [], mistakes: [],
  };
}

(async () => {
  await test('G3: a learner cannot start a practice session for another learner', async () => {
    const state = freshState();
    const h = loadHandler(state, learnerASession);
    const res = makeRes();
    await h({ method: 'POST', query: {}, body: { learnerId: 'learnerB', conceptId: 'c1' } }, res);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(state.sessions.length, 0);
  });

  await test('G2: starting a session selects a real verified+published question', async () => {
    const state = freshState();
    const h = loadHandler(state, learnerASession);
    const res = makeRes();
    await h({ method: 'POST', query: {}, body: { learnerId: 'learnerA', conceptId: 'c1' } }, res);
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.body.question.id, 'q1'); // easy sorts before medium
  });

  await test('G4 (grading honesty): a question WITH an answer key is graded deterministically', async () => {
    const state = freshState();
    const h = loadHandler(state, learnerASession);
    let res = makeRes();
    await h({ method: 'POST', query: {}, body: { learnerId: 'learnerA', conceptId: 'c1' } }, res);
    const sessionId = res.body.sessionId;
    res = makeRes();
    await h({ method: 'PATCH', query: { sessionId }, body: { action: 'submit_answer', questionId: 'q1', responseText: 'B' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.isCorrect, true);
    assert.strictEqual(res.body.gradedBy, 'deterministic');
    assert.strictEqual(res.body.explanation, 'Because...');
  });

  await test('G4 (grading honesty): a question WITHOUT an answer key stays ungraded, not guessed', async () => {
    const state = freshState();
    state.attempts.push({ id: 'seed', practice_session_id: 'seed_session', question_id: 'q1', response_text: 'x', is_correct: true, graded_by: 'deterministic', answered_at: 't' }); // irrelevant seed
    const h = loadHandler(state, learnerASession);
    let res = makeRes();
    await h({ method: 'POST', query: {}, body: { learnerId: 'learnerA', conceptId: 'c1' } }, res);
    const sessionId = res.body.sessionId;
    res = makeRes();
    await h({ method: 'PATCH', query: { sessionId }, body: { action: 'submit_answer', questionId: 'q2', responseText: 'some free-text answer' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.isCorrect, null, 'a question with no answer key must never be auto-graded');
    assert.strictEqual(res.body.gradedBy, 'ungraded');
  });

  await test('G4: mastery_score is NULL (insufficient_evidence), not fabricated as 0, before any graded attempt', async () => {
    const state = freshState();
    const h = loadHandler(state, learnerASession);
    let res = makeRes();
    await h({ method: 'POST', query: {}, body: { learnerId: 'learnerA', conceptId: 'c1' } }, res);
    const sessionId = res.body.sessionId;
    res = makeRes();
    await h({ method: 'PATCH', query: { sessionId }, body: { action: 'submit_answer', questionId: 'q2', responseText: 'ungraded answer' } }, res);
    assert.strictEqual(res.body.mastery.status, 'insufficient_evidence');
    assert.strictEqual(res.body.mastery.masteryScore, null);
  });

  await test('G2 + G4: an incorrect deterministic answer creates an unclassified mistake record and updates mastery to weak', async () => {
    const state = freshState();
    const h = loadHandler(state, learnerASession);
    let res = makeRes();
    await h({ method: 'POST', query: {}, body: { learnerId: 'learnerA', conceptId: 'c1' } }, res);
    const sessionId = res.body.sessionId;
    res = makeRes();
    await h({ method: 'PATCH', query: { sessionId }, body: { action: 'submit_answer', questionId: 'q1', responseText: 'A (wrong)' } }, res);
    assert.strictEqual(res.body.isCorrect, false);
    assert.strictEqual(state.mistakes.length, 1);
    assert.strictEqual(state.mistakes[0].failure_type, 'unclassified', 'the system must not guess a failure type');
    assert.strictEqual(res.body.mastery.status, 'weak');
    assert.strictEqual(res.body.mastery.masteryScore, 0);
  });

  await test('G6 idempotency: resubmitting the same question updates the one attempt row, never duplicates', async () => {
    const state = freshState();
    const h = loadHandler(state, learnerASession);
    let res = makeRes();
    await h({ method: 'POST', query: {}, body: { learnerId: 'learnerA', conceptId: 'c1' } }, res);
    const sessionId = res.body.sessionId;
    await h({ method: 'PATCH', query: { sessionId }, body: { action: 'submit_answer', questionId: 'q1', responseText: 'A' } }, makeRes());
    await h({ method: 'PATCH', query: { sessionId }, body: { action: 'submit_answer', questionId: 'q1', responseText: 'B' } }, makeRes());
    assert.strictEqual(state.attempts.length, 1, 'only one attempt row should exist for this question in this session');
    assert.strictEqual(state.attempts[0].response_text, 'B');
    assert.strictEqual(state.attempts[0].is_correct, true, 'the corrected (now-right) answer should be reflected');
  });

  await test('G3: a teacher (not just admin) can see weak concepts for a learner', async () => {
    const state = freshState();
    state.mastery.push({ id: 'm1', learner_id: 'learnerA', concept_id: 'c1', correct_count: 0, incorrect_count: 2, mastery_score: 0, status: 'weak', last_practiced_at: 't', version: 1, updated_at: 't' });
    const h = loadHandler(state, teacherSession);
    const res = makeRes();
    await h({ method: 'GET', query: { action: 'weak-concepts', learnerId: 'learnerA' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.weakConcepts.length, 1);
  });

  await test('G5: a stale expectedVersion on session completion is rejected', async () => {
    const state = freshState();
    state.sessions.push({ id: 's1', learner_id: 'learnerA', concept_id: 'c1', status: 'in_progress', version: 3, created_at: 't', completed_at: null });
    const h = loadHandler(state, learnerASession);
    const res = makeRes();
    await h({ method: 'PATCH', query: { sessionId: 's1' }, body: { action: 'complete', expectedVersion: 1 } }, res);
    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(res.body.error.code, 'STALE_VERSION');
    assert.strictEqual(state.sessions[0].status, 'in_progress');
  });

  await test('G3: a learner cannot classify a mistake (teacher/admin only)', async () => {
    const state = freshState();
    state.mistakes.push({ id: 'mr1', learner_id: 'learnerA', concept_id: 'c1', question_id: 'q1', practice_attempt_id: null, failure_type: 'unclassified', classified_by_user_id: null, recorded_at: 't' });
    const h = loadHandler(state, learnerASession);
    const res = makeRes();
    await h({ method: 'PATCH', query: { mistakeId: 'mr1' }, body: { failureType: 'careless' } }, res);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(state.mistakes[0].failure_type, 'unclassified');
  });

  await test('G2: a teacher CAN classify a mistake with a real failure_type', async () => {
    const state = freshState();
    state.mistakes.push({ id: 'mr1', learner_id: 'learnerA', concept_id: 'c1', question_id: 'q1', practice_attempt_id: null, failure_type: 'unclassified', classified_by_user_id: null, recorded_at: 't' });
    const h = loadHandler(state, teacherSession);
    const res = makeRes();
    await h({ method: 'PATCH', query: { mistakeId: 'mr1' }, body: { failureType: 'calculation' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(state.mistakes[0].failure_type, 'calculation');
    assert.strictEqual(state.mistakes[0].classified_by_user_id, 'u_teacher');
  });

  await test('M69 wiring: a deterministically graded answer calls the Learning Memory bridge; an ungraded one does not', async () => {
    const state = freshState();
    const h = loadHandler(state, learnerASession);
    let res = makeRes();
    await h({ method: 'POST', query: {}, body: { learnerId: 'learnerA', conceptId: 'c1' } }, res);
    const sessionId = res.body.sessionId;

    await h({ method: 'PATCH', query: { sessionId }, body: { action: 'submit_answer', questionId: 'q1', responseText: 'B' } }, makeRes());
    assert.strictEqual(state.m69BridgeCalls, 1, 'a deterministically graded (answer-key) submission must call the M69 bridge');

    await h({ method: 'PATCH', query: { sessionId }, body: { action: 'submit_answer', questionId: 'q2', responseText: 'free text' } }, makeRes());
    assert.strictEqual(state.m69BridgeCalls, 1, 'an ungraded (no answer key) submission must NOT call the M69 bridge');
  });

  console.log(failures === 0 ? '\nALL M68 ADAPTIVE PRACTICE TESTS PASSED' : `\n${failures} M68 TEST(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})();
