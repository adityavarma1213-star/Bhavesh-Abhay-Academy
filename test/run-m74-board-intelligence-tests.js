// test/run-m74-board-intelligence-tests.js
// BAA M74 — Teacher / Parent / School Board Intelligence (Blueprint V3.2/V3.3).
// Same extraction-and-execute discipline as M64-M73.
//
// Coverage:
//   G2 handler — learner/class/board views each compute real aggregates
//   G3 authorization — a parent/learner can only see the ONE learner they're authorized for; a teacher can only see a class they actually own; only admin can see board-wide data
//   G4 evidence honesty — an empty class or board returns insufficientEvidence, not a fabricated zero average
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
  const start = src.indexOf('/* ================ board-intelligence.js ================ */');
  assert.ok(start >= 0, 'board-intelligence.js block not found');
  const end = src.indexOf('\nexport default async function handler', start);
  assert.ok(end > start, 'could not find end of board-intelligence.js block');
  return src.slice(start, end);
}

function loadHandler(data, session) {
  const block = extractBlock();
  const sandbox = {
    console, Date, JSON, Math, Number, String, Object, Array, Set, Map, Error, Promise, RegExp,
    global: {},
    sql: async (strings, ...values) => {
      const q = strings.join('?').replace(/\s+/g, ' ').trim();
      if (q.startsWith('SELECT cm.status, cm.mastery_score, c.name AS concept_name')) {
        const [learnerId, subjectId] = values;
        return { rows: (data.mastery || []).filter(m => m.learner_id === learnerId && m.subject_id === subjectId) };
      }
      if (q.startsWith('SELECT status FROM planner_tasks')) {
        const [learnerId] = values;
        return { rows: (data.missions || []).filter(m => m.learner_id === learnerId) };
      }
      if (q.startsWith('SELECT id FROM classes')) {
        const [classId, teacherUserId] = values;
        return { rows: (data.classes || []).filter(c => c.id === classId && c.teacher_user_id === teacherUserId).map(c => ({ id: c.id })) };
      }
      if (q.startsWith('SELECT learner_id FROM class_members')) {
        const [classId] = values;
        return { rows: (data.classMembers || []).filter(m => m.class_id === classId).map(m => ({ learner_id: m.learner_id })) };
      }
      if (q.startsWith('SELECT cm.status, cm.mastery_score FROM concept_mastery cm') && q.includes('WHERE cm.learner_id')) {
        const [learnerId, subjectId] = values;
        return { rows: (data.mastery || []).filter(m => m.learner_id === learnerId && m.subject_id === subjectId) };
      }
      if (q.startsWith('SELECT cm.status, cm.mastery_score FROM concept_mastery cm') && q.includes('WHERE s.board_id')) {
        const [boardId] = values;
        return { rows: (data.mastery || []).filter(m => m.board_id === boardId) };
      }
      throw new Error('Unhandled fake-sql query in M74 test: ' + q);
    },
    json: (res, status, body) => { res.statusCode = status; res.body = body; return res; },
    requireAuth: async () => session,
    requireLearnerAccess: async (s, learnerId) => {
      if (s.roles.includes('admin') || s.roles.includes('teacher')) return;
      if (s.authorizedLearnerId === learnerId) return;
      const e = new Error('You are not authorized to access this learner.'); e.status = 403; e.code = 'LEARNER_FORBIDDEN'; throw e;
    },
    hasRole: (s, role) => s.roles.includes(role),
  };
  vm.createContext(sandbox);
  vm.runInContext(block + '\nglobal.__h = handler_board_intelligence;\n', sandbox);
  return sandbox.global.__h;
}

function makeRes() { return { statusCode: null, body: null, setHeader() {}, status(s) { this.statusCode = s; return this; }, json(b) { this.body = b; return this; } }; }

const parentSession = { user_id: 'u_p', roles: ['parent'], authorizedLearnerId: 'learnerA' };
const teacherSession = { user_id: 'teacher1', roles: ['teacher'] };
const adminSession = { user_id: 'u_admin', roles: ['admin'] };

(async () => {
  await test('G3 (view=learner): a parent can see their own child\'s summary', async () => {
    const h = loadHandler({ mastery: [{ learner_id: 'learnerA', subject_id: 'math', status: 'weak', mastery_score: 0.2, concept_name: 'HCF' }], missions: [{ learner_id: 'learnerA', status: 'completed' }] }, parentSession);
    const res = makeRes();
    await h({ method: 'GET', query: { view: 'learner', learnerId: 'learnerA', subjectId: 'math' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body.weakConcepts, ['HCF']);
    assert.strictEqual(res.body.revisionProgress.missionsCompleted, 1);
  });

  await test('G3 (view=learner): a parent CANNOT see a different learner', async () => {
    const h = loadHandler({}, parentSession);
    const res = makeRes();
    await h({ method: 'GET', query: { view: 'learner', learnerId: 'learnerB', subjectId: 'math' } }, res);
    assert.strictEqual(res.statusCode, 403);
  });

  await test('G3 (view=class): a teacher can view a class they own', async () => {
    const data = {
      classes: [{ id: 'c1', teacher_user_id: 'teacher1' }],
      classMembers: [{ class_id: 'c1', learner_id: 'l1' }, { class_id: 'c1', learner_id: 'l2' }],
      mastery: [
        { learner_id: 'l1', subject_id: 'math', status: 'weak', mastery_score: 0.1 },
        { learner_id: 'l1', subject_id: 'math', status: 'weak', mastery_score: 0.2 },
        { learner_id: 'l2', subject_id: 'math', status: 'mastered', mastery_score: 0.9 },
      ],
    };
    const h = loadHandler(data, teacherSession);
    const res = makeRes();
    await h({ method: 'GET', query: { view: 'class', classId: 'c1', subjectId: 'math' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.learnerCount, 2);
    assert.deepStrictEqual([...res.body.atRiskLearnerIds], ['l1'], 'l1 has 2 weak concepts (>= threshold), l2 has none');
  });

  await test('G3 (view=class): a teacher CANNOT view a class they do not own', async () => {
    const data = { classes: [{ id: 'c1', teacher_user_id: 'someone_else' }], classMembers: [] };
    const h = loadHandler(data, teacherSession);
    const res = makeRes();
    await h({ method: 'GET', query: { view: 'class', classId: 'c1', subjectId: 'math' } }, res);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.error.code, 'NOT_YOUR_CLASS');
  });

  await test('G4: an empty class returns insufficientEvidence, not a fabricated zero average', async () => {
    const data = { classes: [{ id: 'c1', teacher_user_id: 'teacher1' }], classMembers: [] };
    const h = loadHandler(data, teacherSession);
    const res = makeRes();
    await h({ method: 'GET', query: { view: 'class', classId: 'c1', subjectId: 'math' } }, res);
    assert.strictEqual(res.body.insufficientEvidence, true);
    assert.strictEqual(res.body.learnerCount, 0);
  });

  await test('G3 (view=board): only admin can view board-wide intelligence', async () => {
    const h = loadHandler({}, teacherSession);
    const res = makeRes();
    await h({ method: 'GET', query: { view: 'board', boardId: 'cbse' } }, res);
    assert.strictEqual(res.statusCode, 403);
  });

  await test('G2 (view=board): admin gets a real board-wide aggregate, with the honest scope disclosure', async () => {
    const data = { mastery: [{ board_id: 'cbse', status: 'mastered', mastery_score: 0.9 }, { board_id: 'cbse', status: 'weak', mastery_score: 0.2 }] };
    const h = loadHandler(data, adminSession);
    const res = makeRes();
    await h({ method: 'GET', query: { view: 'board', boardId: 'cbse' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.masteredCount, 1);
    assert.ok(res.body.scopeNote.includes('no separate school/institution entity'), 'the response must honestly disclose the school-view limitation, not silently imply full institution support');
  });

  await test('G1: an invalid view value is rejected', async () => {
    const h = loadHandler({}, adminSession);
    const res = makeRes();
    await h({ method: 'GET', query: { view: 'nonsense' } }, res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error.code, 'INVALID_VIEW');
  });

  console.log(failures === 0 ? '\nALL M74 BOARD INTELLIGENCE TESTS PASSED' : `\n${failures} M74 TEST(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})();
