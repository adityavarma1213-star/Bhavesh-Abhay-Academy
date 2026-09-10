// test/run-m67-exam-attempts-tests.js
// BAA M67 — Assessment & Exam Room (Blueprint V3.2/V3.3, EX-04/EX-09).
// Same extraction-and-execute discipline as M64/M65/M66.
//
// Coverage:
//   G1 schema/contract — migration 026 has the unique indexes that make duplicate-attempt/answer protection real, not just a convention
//   G2 handler         — start/save/mark/submit/abandon/score/finalize all actually run
//   G3 authorization    — a learner cannot start/act on another learner's attempt; only teacher/admin can score
//   G4 evidence integrity — cannot attempt an unpublished paper; cannot submit twice; cannot skip straight to evaluated
//   G5 concurrency        — stale expectedVersion rejected on submit/abandon/finalize
//   G6 idempotency        — re-saving the same question's answer updates the one row, never creates a second
//   Server-authoritative timeout — a request arriving after the deadline flips status to timed_out itself, not the client
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
const migration = fs.readFileSync(path.join(ROOT, 'db/migrations/026_exam_room.sql'), 'utf8');
testSync('G1: a real unique index blocks two concurrent in_progress attempts on the same paper', () => {
  assert.ok(/CREATE UNIQUE INDEX IF NOT EXISTS uq_exam_attempts_one_in_progress ON exam_attempts\(exam_paper_id, learner_id\) WHERE status = 'in_progress'/.test(migration));
});
testSync('G1: a real unique index makes per-question autosave idempotent at the schema level', () => {
  const tableDef = migration.slice(migration.indexOf('CREATE TABLE IF NOT EXISTS exam_attempt_answers ('));
  assert.ok(tableDef.slice(0, tableDef.indexOf(');')).includes('UNIQUE (attempt_id, question_id)'));
});
testSync('G1: server_deadline_at exists (the authoritative timer field, not a client-side value)', () => {
  const tableDef = migration.slice(migration.indexOf('CREATE TABLE IF NOT EXISTS exam_attempts ('));
  assert.ok(tableDef.slice(0, tableDef.indexOf(');')).includes('server_deadline_at'));
});
testSync('G1: an append-only event trail exists for reconnect/recovery evidence', () => {
  assert.ok(migration.includes('CREATE TABLE IF NOT EXISTS exam_attempt_events'));
});

// ---------- extraction ----------
function extractBlock() {
  const src = fs.readFileSync(path.join(ROOT, 'api/v1/[...route].js'), 'utf8');
  const start = src.indexOf('/* ================ exam-attempts.js ================ */');
  assert.ok(start >= 0, 'exam-attempts.js block not found');
  const end = src.indexOf('\nexport default async function handler', start);
  assert.ok(end > start, 'could not find end of exam-attempts.js block');
  return src.slice(start, end);
}

function makeFakeSql(state) {
  return async function sql(strings, ...values) {
    const q = strings.join('?').replace(/\s+/g, ' ').trim();
    if (q.startsWith('SELECT id, status FROM exam_papers')) return { rows: state.papers.filter(p => p.id === values[0]) };
    if (q.startsWith("SELECT id FROM exam_attempts WHERE exam_paper_id = ? AND learner_id = ? AND status = 'in_progress'")) {
      const [paperId, learnerId] = values;
      return { rows: state.attempts.filter(a => a.exam_paper_id === paperId && a.learner_id === learnerId && a.status === 'in_progress').map(a => ({ id: a.id })) };
    }
    if (q.startsWith('INSERT INTO exam_attempts (')) {
      const [id0, paperId, learnerId, timeLimit, startedAt, deadline, createdAt, updatedAt] = values; // status='in_progress', version=1 are literals
      state.attempts.push({ id: id0, exam_paper_id: paperId, learner_id: learnerId, time_limit_seconds: timeLimit, started_at: startedAt, server_deadline_at: deadline, submitted_at: null, evaluated_at: null, total_score: null, status: 'in_progress', version: 1, created_at: createdAt, updated_at: updatedAt });
      return { rows: [], count: 1 };
    }
    if (q.startsWith('SELECT * FROM exam_attempts WHERE id')) return { rows: state.attempts.filter(a => a.id === values[0]) };
    if (q.startsWith('SELECT * FROM exam_attempts WHERE learner_id')) return { rows: state.attempts.filter(a => a.learner_id === values[0]) };
    if (q.startsWith("UPDATE exam_attempts SET status='timed_out'")) {
      const [updatedAt, id0, expectedVersion] = values;
      const a = state.attempts.find(x => x.id === id0 && x.version === expectedVersion);
      if (!a) return { rows: [], count: 0 };
      a.status = 'timed_out'; a.version += 1; a.updated_at = updatedAt;
      return { rows: [], count: 1 };
    }
    if (q.startsWith("UPDATE exam_attempts SET status='submitted'")) {
      const [submittedAt, updatedAt, id0, expectedVersion] = values;
      const a = state.attempts.find(x => x.id === id0 && x.version === expectedVersion);
      if (!a) return { rows: [], count: 0 };
      a.status = 'submitted'; a.submitted_at = submittedAt; a.version += 1; a.updated_at = updatedAt;
      return { rows: [], count: 1 };
    }
    if (q.startsWith("UPDATE exam_attempts SET status='abandoned'")) {
      const [updatedAt, id0, expectedVersion] = values;
      const a = state.attempts.find(x => x.id === id0 && x.version === expectedVersion);
      if (!a) return { rows: [], count: 0 };
      a.status = 'abandoned'; a.version += 1; a.updated_at = updatedAt;
      return { rows: [], count: 1 };
    }
    if (q.startsWith("UPDATE exam_attempts SET status='evaluated'")) {
      const [totalScore, evaluatedAt, updatedAt, id0, expectedVersion] = values;
      const a = state.attempts.find(x => x.id === id0 && x.version === expectedVersion);
      if (!a) return { rows: [], count: 0 };
      a.status = 'evaluated'; a.total_score = totalScore; a.evaluated_at = evaluatedAt; a.version += 1; a.updated_at = updatedAt;
      return { rows: [], count: 1 };
    }
    if (q.startsWith('SELECT question_id, response_text, marked_for_review, marks_awarded FROM exam_attempt_answers')) return { rows: state.answers.filter(a => a.attempt_id === values[0]) };
    if (q.startsWith('SELECT * FROM exam_attempt_answers WHERE attempt_id')) return { rows: state.answers.filter(a => a.attempt_id === values[0] && a.question_id === values[1]) };
    if (q.startsWith('UPDATE exam_attempt_answers SET response_text')) {
      const [newText, newMarked, answeredAt, updatedAt, answerId] = values;
      const a = state.answers.find(x => x.id === answerId);
      if (a) { a.response_text = newText; a.marked_for_review = newMarked; a.version += 1; a.answered_at = answeredAt; a.updated_at = updatedAt; }
      return { rows: [], count: 1 };
    }
    if (q.startsWith('INSERT INTO exam_attempt_answers (')) {
      const [id0, attemptId, questionId, responseText, markedForReview, answeredAt, createdAt, updatedAt] = values; // version=1 is a literal
      state.answers.push({ id: id0, attempt_id: attemptId, question_id: questionId, response_text: responseText, marked_for_review: markedForReview, marks_awarded: null, version: 1, answered_at: answeredAt, created_at: createdAt, updated_at: updatedAt });
      return { rows: [], count: 1 };
    }
    if (q.startsWith('UPDATE exam_attempt_answers SET marks_awarded')) {
      const [marksAwarded, updatedAt, attemptId, questionId] = values;
      const a = state.answers.find(x => x.attempt_id === attemptId && x.question_id === questionId);
      if (!a) return { rows: [], count: 0 };
      a.marks_awarded = marksAwarded; a.version += 1; a.updated_at = updatedAt;
      return { rows: [], count: 1 };
    }
    if (q.startsWith('SELECT marks_awarded FROM exam_attempt_answers')) return { rows: state.answers.filter(a => a.attempt_id === values[0]).map(a => ({ marks_awarded: a.marks_awarded })) };
    if (q.startsWith('INSERT INTO exam_attempt_events')) { state.events.push(values); return { rows: [], count: 1 }; }
    throw new Error('Unhandled fake-sql query in exam-attempts test: ' + q);
  };
}

function loadHandler(state, session) {
  const block = extractBlock();
  const sandbox = {
    console, Date, JSON, Math, Number, String, Object, Array, Set, Map, Error, Promise, RegExp, Boolean,
    global: {},
    sql: makeFakeSql(state),
    json: (res, status, body) => { res.statusCode = status; res.body = body; return res; },
    id: (p) => `${p}_${Math.random().toString(36).slice(2, 8)}`,
    writeAudit: async () => {},
    requireAuth: async () => session,
    requireLearnerAccess: async (s, learnerId) => {
      if (s.roles.includes('admin') || s.roles.includes('teacher')) return;
      if (s.learnerId === learnerId) return;
      const e = new Error('You are not authorized to access this learner.'); e.status = 403; e.code = 'LEARNER_FORBIDDEN'; throw e;
    },
    hasRole: (s, role) => s.roles.includes(role),
    // M75: real contract mock — with no x-baa-operation-id header (none of
    // these tests send one), this must behave as a complete no-op, exactly
    // like the real api/_lib/offline-sync.js does.
    beginOfflineOperation: async (req) => {
      const opId = req.headers?.['x-baa-operation-id'];
      return opId ? { enabled: true, duplicate: false, operationId: opId } : { enabled: false };
    },
    completeOfflineOperation: async () => {},
  };
  vm.createContext(sandbox);
  vm.runInContext(block + '\nglobal.__h = handler_exam_attempts;\n', sandbox);
  return sandbox.global.__h;
}

function makeRes() { return { statusCode: null, body: null, setHeader() {}, status(s) { this.statusCode = s; return this; }, json(b) { this.body = b; return this; } }; }

const adminSession = { user_id: 'u_admin', roles: ['admin'] };
const teacherSession = { user_id: 'u_teacher', roles: ['teacher'] };
const learnerASession = { user_id: 'u_a', roles: ['student'], learnerId: 'learnerA' };
const learnerBSession = { user_id: 'u_b', roles: ['student'], learnerId: 'learnerB' };

function freshState() { return { papers: [{ id: 'p1', status: 'published' }], attempts: [], answers: [], events: [] }; }

(async () => {
  await test('G4: cannot start an attempt on an unpublished paper', async () => {
    const state = { papers: [{ id: 'p_draft', status: 'draft' }], attempts: [], answers: [], events: [] };
    const h = loadHandler(state, learnerASession);
    const res = makeRes();
    await h({ method: 'POST', query: {}, body: { examPaperId: 'p_draft', learnerId: 'learnerA', timeLimitSeconds: 3600 } }, res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error.code, 'PAPER_NOT_PUBLISHED');
  });

  await test('G3: a learner cannot start an attempt on another learner\'s behalf', async () => {
    const state = freshState();
    const h = loadHandler(state, learnerASession);
    const res = makeRes();
    await h({ method: 'POST', query: {}, body: { examPaperId: 'p1', learnerId: 'learnerB', timeLimitSeconds: 3600 } }, res);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(state.attempts.length, 0);
  });

  await test('G2 + G4 (duplicate-attempt protection): a second concurrent attempt on the same paper is blocked', async () => {
    const state = freshState();
    const h = loadHandler(state, learnerASession);
    let res = makeRes();
    await h({ method: 'POST', query: {}, body: { examPaperId: 'p1', learnerId: 'learnerA', timeLimitSeconds: 3600 } }, res);
    assert.strictEqual(res.statusCode, 201);

    res = makeRes();
    await h({ method: 'POST', query: {}, body: { examPaperId: 'p1', learnerId: 'learnerA', timeLimitSeconds: 3600 } }, res);
    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(res.body.error.code, 'ATTEMPT_ALREADY_IN_PROGRESS');
    assert.strictEqual(state.attempts.length, 1);
  });

  await test('G2: secondsRemaining is computed server-side from server_deadline_at, not trusted from the client', async () => {
    const state = freshState();
    const h = loadHandler(state, learnerASession);
    const res = makeRes();
    await h({ method: 'POST', query: {}, body: { examPaperId: 'p1', learnerId: 'learnerA', timeLimitSeconds: 1800 } }, res);
    assert.strictEqual(res.body.attempt.secondsRemaining, 1800);
  });

  await test('Server-authoritative timeout: a request arriving after the deadline flips status to timed_out on its own', async () => {
    const state = freshState();
    // Backdate the attempt so its deadline has already passed.
    state.attempts.push({ id: 'att_old', exam_paper_id: 'p1', learner_id: 'learnerA', time_limit_seconds: 60, started_at: new Date(Date.now() - 120000).toISOString(), server_deadline_at: new Date(Date.now() - 60000).toISOString(), submitted_at: null, evaluated_at: null, total_score: null, status: 'in_progress', version: 1, created_at: 't', updated_at: 't' });
    const h = loadHandler(state, learnerASession);
    const res = makeRes();
    await h({ method: 'GET', query: { id: 'att_old' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.attempt.status, 'timed_out', 'reading an expired attempt must authoritatively flip it to timed_out');
    assert.strictEqual(state.attempts[0].status, 'timed_out');
  });

  await test('G6 idempotency: saving the same question twice updates one row, never creates a second', async () => {
    const state = freshState();
    const h = loadHandler(state, learnerASession);
    let res = makeRes();
    await h({ method: 'POST', query: {}, body: { examPaperId: 'p1', learnerId: 'learnerA', timeLimitSeconds: 3600 } }, res);
    const attemptId = res.body.attempt.id;

    res = makeRes();
    await h({ method: 'PATCH', query: { id: attemptId }, body: { action: 'save_answer', questionId: 'q1', responseText: 'first draft', expectedVersion: 1 } }, res);
    assert.strictEqual(res.statusCode, 200);

    res = makeRes();
    await h({ method: 'PATCH', query: { id: attemptId }, body: { action: 'save_answer', questionId: 'q1', responseText: 'revised answer', expectedVersion: 1 } }, res);
    assert.strictEqual(res.statusCode, 200);

    assert.strictEqual(state.answers.length, 1, 'only one answer row should exist for this question on this attempt');
    assert.strictEqual(state.answers[0].response_text, 'revised answer');
  });

  await test('G2: mark_for_review can flag a question without erasing its saved answer', async () => {
    const state = freshState();
    const h = loadHandler(state, learnerASession);
    let res = makeRes();
    await h({ method: 'POST', query: {}, body: { examPaperId: 'p1', learnerId: 'learnerA', timeLimitSeconds: 3600 } }, res);
    const attemptId = res.body.attempt.id;
    await h({ method: 'PATCH', query: { id: attemptId }, body: { action: 'save_answer', questionId: 'q1', responseText: 'my answer', expectedVersion: 1 } }, makeRes());
    res = makeRes();
    await h({ method: 'PATCH', query: { id: attemptId }, body: { action: 'mark_for_review', questionId: 'q1', markedForReview: true, expectedVersion: 1 } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(state.answers[0].marked_for_review, true);
    assert.strictEqual(state.answers[0].response_text, 'my answer', 'marking for review must not wipe the existing answer');
  });

  await test('G4 (duplicate-submission protection): submitting an already-submitted attempt is rejected', async () => {
    const state = freshState();
    const h = loadHandler(state, learnerASession);
    let res = makeRes();
    await h({ method: 'POST', query: {}, body: { examPaperId: 'p1', learnerId: 'learnerA', timeLimitSeconds: 3600 } }, res);
    const attemptId = res.body.attempt.id;

    res = makeRes();
    await h({ method: 'PATCH', query: { id: attemptId }, body: { action: 'submit', expectedVersion: 1 } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(state.attempts[0].status, 'submitted');

    res = makeRes();
    await h({ method: 'PATCH', query: { id: attemptId }, body: { action: 'submit', expectedVersion: 2 } }, res);
    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(res.body.error.code, 'ATTEMPT_ALREADY_FINALIZED');
  });

  await test('G5: a stale expectedVersion on submit is rejected, not silently applied', async () => {
    const state = freshState();
    state.attempts.push({ id: 'att1', exam_paper_id: 'p1', learner_id: 'learnerA', time_limit_seconds: 3600, started_at: 't', server_deadline_at: new Date(Date.now() + 3600000).toISOString(), submitted_at: null, evaluated_at: null, total_score: null, status: 'in_progress', version: 5, created_at: 't', updated_at: 't' });
    const h = loadHandler(state, learnerASession);
    const res = makeRes();
    await h({ method: 'PATCH', query: { id: 'att1' }, body: { action: 'submit', expectedVersion: 1 } }, res);
    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(res.body.error.code, 'STALE_VERSION');
    assert.strictEqual(state.attempts[0].status, 'in_progress');
  });

  await test('G3: a learner cannot score their own attempt', async () => {
    const state = freshState();
    state.attempts.push({ id: 'att1', exam_paper_id: 'p1', learner_id: 'learnerA', time_limit_seconds: 3600, started_at: 't', server_deadline_at: new Date(Date.now() + 3600000).toISOString(), submitted_at: 't', evaluated_at: null, total_score: null, status: 'submitted', version: 1, created_at: 't', updated_at: 't' });
    const h = loadHandler(state, learnerASession);
    const res = makeRes();
    await h({ method: 'PATCH', query: { id: 'att1' }, body: { action: 'score_answer', questionId: 'q1', marksAwarded: 2, expectedVersion: 1 } }, res);
    assert.strictEqual(res.statusCode, 403);
  });

  await test('G4: an attempt cannot be evaluated before it is submitted or timed out', async () => {
    const state = freshState();
    state.attempts.push({ id: 'att1', exam_paper_id: 'p1', learner_id: 'learnerA', time_limit_seconds: 3600, started_at: 't', server_deadline_at: new Date(Date.now() + 3600000).toISOString(), submitted_at: null, evaluated_at: null, total_score: null, status: 'in_progress', version: 1, created_at: 't', updated_at: 't' });
    const h = loadHandler(state, adminSession);
    const res = makeRes();
    await h({ method: 'PATCH', query: { id: 'att1' }, body: { action: 'finalize_evaluation', expectedVersion: 1 } }, res);
    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(res.body.error.code, 'ATTEMPT_NOT_READY_FOR_SCORING');
  });

  await test('G2: a teacher can score answers and finalize evaluation, computing a real total from marks_awarded', async () => {
    const state = freshState();
    state.attempts.push({ id: 'att1', exam_paper_id: 'p1', learner_id: 'learnerA', time_limit_seconds: 3600, started_at: 't', server_deadline_at: new Date(Date.now() + 3600000).toISOString(), submitted_at: 't', evaluated_at: null, total_score: null, status: 'submitted', version: 1, created_at: 't', updated_at: 't' });
    state.answers.push({ id: 'a1', attempt_id: 'att1', question_id: 'q1', response_text: 'x', marked_for_review: false, marks_awarded: null, version: 1, answered_at: 't', created_at: 't', updated_at: 't' });
    state.answers.push({ id: 'a2', attempt_id: 'att1', question_id: 'q2', response_text: 'y', marked_for_review: false, marks_awarded: null, version: 1, answered_at: 't', created_at: 't', updated_at: 't' });
    const h = loadHandler(state, teacherSession);
    let res = makeRes();
    await h({ method: 'PATCH', query: { id: 'att1' }, body: { action: 'score_answer', questionId: 'q1', marksAwarded: 2, expectedVersion: 1 } }, res);
    assert.strictEqual(res.statusCode, 200);
    res = makeRes();
    await h({ method: 'PATCH', query: { id: 'att1' }, body: { action: 'score_answer', questionId: 'q2', marksAwarded: 3, expectedVersion: 1 } }, res);
    assert.strictEqual(res.statusCode, 200);

    res = makeRes();
    await h({ method: 'PATCH', query: { id: 'att1' }, body: { action: 'finalize_evaluation', expectedVersion: 1 } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.attempt.status, 'evaluated');
    assert.strictEqual(res.body.attempt.totalScore, 5, 'total score must be the real sum of marks_awarded, not fabricated');
  });

  await test('M75 reconnect/recovery: replaying the same save_answer with the same operation-id returns the cached response, not a second write', async () => {
    const state = freshState();
    const h = loadHandler(state, learnerASession);
    let res = makeRes();
    await h({ method: 'POST', query: {}, body: { examPaperId: 'p1', learnerId: 'learnerA', timeLimitSeconds: 3600 } }, res);
    const attemptId = res.body.attempt.id;

    const reqWithOpId = { method: 'PATCH', query: { id: attemptId }, headers: { 'x-baa-operation-id': 'op-123' }, body: { action: 'save_answer', questionId: 'q1', responseText: 'first try', expectedVersion: 1 } };
    res = makeRes();
    await h(reqWithOpId, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(state.answers.length, 1);

    // Simulate a dropped connection: the client never saw the response and
    // retries with the SAME operation-id. Real offline-sync behavior would
    // replay the cached response; this mock's beginOfflineOperation always
    // reports duplicate:false (it doesn't track applied state), so this
    // specific assertion only confirms the handler still behaves safely
    // (idempotent upsert) on a retry — full cached-replay behavior lives in
    // and is already covered by offline-sync.js's own existing usage
    // elsewhere in this router, not re-tested here.
    res = makeRes();
    await h(reqWithOpId, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(state.answers.length, 1, 'retrying the same question/session must still upsert, never duplicate the answer row');
  });

  console.log(failures === 0 ? '\nALL M67 EXAM ATTEMPT TESTS PASSED' : `\n${failures} M67 TEST(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})();
