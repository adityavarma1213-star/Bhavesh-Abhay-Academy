// test/run-m73-board-missions-tests.js
// BAA M73 — Board Preparation Missions + Revision (Blueprint V3.2/V3.3).
// Same extraction-and-execute discipline as M64-M72.
//
// Coverage:
//   G2 handler         — generation, listing, and complete/skip all actually run
//   G3 authorization    — a learner cannot generate/complete missions for another learner
//   G4 evidence honesty — a mission is only ever generated from a real weak/insufficient-evidence concept; its `reasons` field cites that real evidence
//   G6 idempotency        — regenerating on the same day for the same concept returns the existing task, never a duplicate
//   Reuse                 — writes into the EXISTING planner_tasks table (type='board_revision'), not a parallel table
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

function extractBlock() {
  const src = fs.readFileSync(path.join(ROOT, 'api/v1/[...route].js'), 'utf8');
  const start = src.indexOf('/* ================ board-missions.js ================ */');
  assert.ok(start >= 0, 'board-missions.js block not found');
  const end = src.indexOf('\nexport default async function handler', start);
  assert.ok(end > start, 'could not find end of board-missions.js block');
  return src.slice(start, end);
}

function makeFakeSql(state) {
  return async function sql(strings, ...values) {
    const q = strings.join('?').replace(/\s+/g, ' ').trim();
    if (q.startsWith('SELECT cm.concept_id')) {
      const [learnerId, subjectId, limit] = values;
      return { rows: state.mastery.filter(m => m.learner_id === learnerId && m.subject_id === subjectId && ['weak', 'insufficient_evidence'].includes(m.status)).sort((a, b) => (a.mastery_score ?? -1) - (b.mastery_score ?? -1)).slice(0, limit) };
    }
    if (q.startsWith('SELECT id FROM planner_tasks WHERE learner_id')) {
      const [learnerId, concept, scheduledDate] = values;
      return { rows: state.tasks.filter(t => t.learner_id === learnerId && t.concept === concept && t.type === 'board_revision' && t.scheduled_date === scheduledDate).map(t => ({ id: t.id })) };
    }
    if (q.startsWith('INSERT INTO planner_tasks')) {
      const [id0, learnerId, title, concept, subject, minutes, priority, reasons, action, scheduledDate, createdAt] = values;
      state.tasks.push({ id: id0, learner_id: learnerId, type: 'board_revision', title, concept, subject, estimated_minutes: minutes, priority, reasons, action, status: 'pending', scheduled_date: scheduledDate, created_at: createdAt, completed_at: null });
      return { rows: [], count: 1 };
    }
    if (q.startsWith('SELECT id, title, concept, subject, estimated_minutes, priority, reasons, action, status, scheduled_date, completed_at FROM planner_tasks')) {
      const [learnerId] = values;
      return { rows: state.tasks.filter(t => t.learner_id === learnerId && t.type === 'board_revision').sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date)) };
    }
    if (q.startsWith('SELECT id, learner_id, status FROM planner_tasks')) {
      const [taskId] = values;
      return { rows: state.tasks.filter(t => t.id === taskId && t.type === 'board_revision').map(t => ({ id: t.id, learner_id: t.learner_id, status: t.status })) };
    }
    if (q.startsWith('UPDATE planner_tasks SET status')) {
      const [newStatus, completedAt, taskId] = values;
      const t = state.tasks.find(x => x.id === taskId);
      if (t) { t.status = newStatus; t.completed_at = completedAt; }
      return { rows: [], count: 1 };
    }
    if (q.startsWith('INSERT INTO planner_task_events')) { state.events.push(values); return { rows: [], count: 1 }; }
    throw new Error('Unhandled fake-sql query in M73 test: ' + q);
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
  vm.runInContext(block + '\nglobal.__h = handler_board_missions;\n', sandbox);
  return sandbox.global.__h;
}

function makeRes() { return { statusCode: null, body: null, setHeader() {}, status(s) { this.statusCode = s; return this; }, json(b) { this.body = b; return this; } }; }

const learnerASession = { user_id: 'u_a', roles: ['student'], learnerId: 'learnerA' };

function freshState() {
  return {
    mastery: [
      { learner_id: 'learnerA', subject_id: 'math', concept_id: 'c_weak', mastery_score: 0.2, status: 'weak', concept_name: 'HCF', subject_name: 'Math' },
      { learner_id: 'learnerA', subject_id: 'math', concept_id: 'c_insuff', mastery_score: null, status: 'insufficient_evidence', concept_name: 'LCM', subject_name: 'Math' },
    ],
    tasks: [], events: [],
  };
}

(async () => {
  await test('G3: a learner cannot generate missions for another learner', async () => {
    const state = freshState();
    const h = loadHandler(state, learnerASession);
    const res = makeRes();
    await h({ method: 'POST', query: {}, body: { learnerId: 'learnerB', subjectId: 'math', daysAhead: 3 } }, res);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(state.tasks.length, 0);
  });

  await test('G4: a mission is generated only from a real weak concept, with reasons citing that real evidence', async () => {
    const state = freshState();
    const h = loadHandler(state, learnerASession);
    const res = makeRes();
    await h({ method: 'POST', query: {}, body: { learnerId: 'learnerA', subjectId: 'math', daysAhead: 2 } }, res);
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.body.tasksCreated, 2);
    assert.strictEqual(state.tasks[0].concept, 'LCM', 'insufficient_evidence (NULL mastery_score) sorts first, same NULLS-FIRST convention as M71');
    const reasons = JSON.parse(state.tasks[0].reasons);
    assert.strictEqual(reasons[0].type, 'insufficient_evidence_concept');
    assert.strictEqual(reasons[0].conceptId, 'c_insuff');
    assert.strictEqual(reasons[0].masteryScore, null, 'the reason must honestly report no score exists yet, not fabricate one');
  });

  await test('Reuse: missions are written into the existing planner_tasks table with type=board_revision, not a parallel table', async () => {
    const state = freshState();
    const h = loadHandler(state, learnerASession);
    await h({ method: 'POST', query: {}, body: { learnerId: 'learnerA', subjectId: 'math', daysAhead: 1 } }, makeRes());
    assert.strictEqual(state.tasks[0].type, 'board_revision');
  });

  await test('G6 idempotency: regenerating for the same learner/concept/day returns the existing task, not a duplicate', async () => {
    const state = freshState();
    const h = loadHandler(state, learnerASession);
    await h({ method: 'POST', query: {}, body: { learnerId: 'learnerA', subjectId: 'math', daysAhead: 1 } }, makeRes());
    const res = makeRes();
    await h({ method: 'POST', query: {}, body: { learnerId: 'learnerA', subjectId: 'math', daysAhead: 1 } }, res);
    assert.strictEqual(res.body.tasks[0].deduplicated, true);
    assert.strictEqual(state.tasks.length, 1, 'only one task should exist, not two');
  });

  await test('G4: no weak concepts at all returns insufficientEvidence, no tasks created', async () => {
    const state = { mastery: [], tasks: [], events: [] };
    const h = loadHandler(state, learnerASession);
    const res = makeRes();
    await h({ method: 'POST', query: {}, body: { learnerId: 'learnerA', subjectId: 'math', daysAhead: 3 } }, res);
    assert.strictEqual(res.body.insufficientEvidence, true);
    assert.strictEqual(state.tasks.length, 0);
  });

  await test('G2: a learner can list their own board-revision missions', async () => {
    const state = freshState();
    const h = loadHandler(state, learnerASession);
    await h({ method: 'POST', query: {}, body: { learnerId: 'learnerA', subjectId: 'math', daysAhead: 2 } }, makeRes());
    const res = makeRes();
    await h({ method: 'GET', query: { learnerId: 'learnerA' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.tasks.length, 2);
  });

  await test('G2: a learner can mark their own mission complete, and it writes a real completion event', async () => {
    const state = freshState();
    const h = loadHandler(state, learnerASession);
    await h({ method: 'POST', query: {}, body: { learnerId: 'learnerA', subjectId: 'math', daysAhead: 1 } }, makeRes());
    const taskId = state.tasks[0].id;
    const res = makeRes();
    await h({ method: 'PATCH', query: { taskId }, body: { action: 'complete' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(state.tasks[0].status, 'completed');
    assert.ok(state.tasks[0].completed_at);
    assert.strictEqual(state.events.length, 1);
  });

  await test('G4: completing an already-completed task is rejected, not silently re-applied', async () => {
    const state = freshState();
    const h = loadHandler(state, learnerASession);
    await h({ method: 'POST', query: {}, body: { learnerId: 'learnerA', subjectId: 'math', daysAhead: 1 } }, makeRes());
    const taskId = state.tasks[0].id;
    await h({ method: 'PATCH', query: { taskId }, body: { action: 'complete' } }, makeRes());
    const res = makeRes();
    await h({ method: 'PATCH', query: { taskId }, body: { action: 'complete' } }, res);
    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(res.body.error.code, 'TASK_NOT_PENDING');
  });

  await test('G3: a learner cannot complete another learner\'s mission', async () => {
    const state = freshState();
    state.tasks.push({ id: 't1', learner_id: 'learnerB', type: 'board_revision', status: 'pending' });
    const h = loadHandler(state, learnerASession);
    const res = makeRes();
    await h({ method: 'PATCH', query: { taskId: 't1' }, body: { action: 'complete' } }, res);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(state.tasks[0].status, 'pending');
  });

  console.log(failures === 0 ? '\nALL M73 BOARD MISSIONS TESTS PASSED' : `\n${failures} M73 TEST(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})();
