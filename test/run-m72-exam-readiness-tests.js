// test/run-m72-exam-readiness-tests.js
// BAA M72 — Evidence-Based Exam Readiness (Blueprint V3.2/V3.3).
// Same extraction-and-execute discipline as M64-M71.
//
// Coverage:
//   G2 handler         — every component (coverage/mastery/mock/time) computed from real rows
//   G3 authorization    — a learner cannot read another learner's readiness
//   G4 evidence honesty — readinessLevel is 'insufficient_evidence' whenever ANY required component lacks enough real data; never fabricated as a fallback percentage
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
  const start = src.indexOf('/* ================ exam-readiness.js ================ */');
  assert.ok(start >= 0, 'exam-readiness.js block not found');
  const end = src.indexOf('\nexport default async function handler', start);
  assert.ok(end > start, 'could not find end of exam-readiness.js block');
  return src.slice(start, end);
}

function loadHandler(data, session) {
  const block = extractBlock();
  const sandbox = {
    console, Date, JSON, Math, Number, String, Object, Array, Set, Map, Error, Promise, RegExp,
    global: {},
    sql: async (strings, ...values) => {
      const q = strings.join('?').replace(/\s+/g, ' ').trim();
      if (q.startsWith('SELECT COUNT(*)::int')) return { rows: [{ count: data.totalConcepts ?? 0 }] };
      if (q.startsWith('SELECT cm.status')) return { rows: data.masteryRows || [] };
      if (q.startsWith('SELECT ea.total_score')) return { rows: data.mockRows || [] };
      if (q.startsWith('SELECT ea.time_limit_seconds')) return { rows: data.timedRows || [] };
      return { rows: [] };
    },
    json: (res, status, body) => { res.statusCode = status; res.body = body; return res; },
    requireAuth: async () => session,
    requireLearnerAccess: async (s, learnerId) => {
      if (s.roles.includes('admin') || s.roles.includes('teacher')) return;
      if (s.learnerId === learnerId) return;
      const e = new Error('You are not authorized to access this learner.'); e.status = 403; e.code = 'LEARNER_FORBIDDEN'; throw e;
    },
    hasRole: (s, role) => s.roles.includes(role),
  };
  vm.createContext(sandbox);
  vm.runInContext(block + '\nglobal.__h = handler_exam_readiness;\n', sandbox);
  return sandbox.global.__h;
}

function makeRes() { return { statusCode: null, body: null, setHeader() {}, status(s) { this.statusCode = s; return this; }, json(b) { this.body = b; return this; } }; }

const learnerASession = { user_id: 'u_a', roles: ['student'], learnerId: 'learnerA' };
const teacherSession = { user_id: 'u_t', roles: ['teacher'] };

(async () => {
  await test('G3: a learner cannot read another learner\'s readiness', async () => {
    const h = loadHandler({}, learnerASession);
    const res = makeRes();
    await h({ method: 'GET', query: { learnerId: 'learnerB', subjectId: 'math' } }, res);
    assert.strictEqual(res.statusCode, 403);
  });

  await test('G4: no curriculum at all → coverage.insufficientEvidence and overall insufficient_evidence', async () => {
    const h = loadHandler({ totalConcepts: 0 }, learnerASession);
    const res = makeRes();
    await h({ method: 'GET', query: { learnerId: 'learnerA', subjectId: 'math' } }, res);
    assert.strictEqual(res.body.coverage.insufficientEvidence, true);
    assert.strictEqual(res.body.readinessLevel, 'insufficient_evidence');
    assert.ok(res.body.readinessExplanation.includes('curriculum coverage'));
  });

  await test('G4: curriculum exists but fewer than 3 concepts have any evidence → mastery insufficient, overall insufficient', async () => {
    const h = loadHandler({ totalConcepts: 10, masteryRows: [{ status: 'weak', mastery_score: 0.1 }] }, learnerASession);
    const res = makeRes();
    await h({ method: 'GET', query: { learnerId: 'learnerA', subjectId: 'math' } }, res);
    assert.strictEqual(res.body.mastery.insufficientEvidence, true);
    assert.strictEqual(res.body.readinessLevel, 'insufficient_evidence');
    assert.ok(res.body.readinessExplanation.includes('concept mastery evidence'));
  });

  await test('G4: enough mastery evidence but zero evaluated mocks → mockPerformance insufficient, overall insufficient', async () => {
    const h = loadHandler({
      totalConcepts: 10,
      masteryRows: [{ status: 'mastered', mastery_score: 0.9 }, { status: 'mastered', mastery_score: 0.85 }, { status: 'developing', mastery_score: 0.6 }],
      mockRows: [],
    }, learnerASession);
    const res = makeRes();
    await h({ method: 'GET', query: { learnerId: 'learnerA', subjectId: 'math' } }, res);
    assert.strictEqual(res.body.mockPerformance.insufficientEvidence, true);
    assert.strictEqual(res.body.readinessLevel, 'insufficient_evidence');
    assert.ok(res.body.readinessExplanation.includes('evaluated mock performance'));
  });

  await test('G2 + G4: with every component sufficiently evidenced, a real readinessLevel IS computed and explained', async () => {
    const h = loadHandler({
      totalConcepts: 3,
      masteryRows: [{ status: 'mastered', mastery_score: 0.9 }, { status: 'mastered', mastery_score: 0.85 }, { status: 'mastered', mastery_score: 0.82 }],
      mockRows: [{ total_score: 9, max_marks: 10 }],
      timedRows: [{ time_limit_seconds: 3600, started_at: '2026-01-01T00:00:00Z', submitted_at: '2026-01-01T00:50:00Z' }],
    }, learnerASession);
    const res = makeRes();
    await h({ method: 'GET', query: { learnerId: 'learnerA', subjectId: 'math' } }, res);
    assert.notStrictEqual(res.body.readinessLevel, 'insufficient_evidence');
    assert.strictEqual(res.body.readinessLevel, 'exam_ready');
    assert.ok(res.body.readinessExplanation.includes('%'), 'the explanation must cite the actual real numbers, not just assert the label');
  });

  await test('G2: weak mastery + weak mock performance produces "building", not an inflated label', async () => {
    const h = loadHandler({
      totalConcepts: 10,
      masteryRows: [{ status: 'weak', mastery_score: 0.1 }, { status: 'weak', mastery_score: 0.15 }, { status: 'weak', mastery_score: 0.2 }],
      mockRows: [{ total_score: 2, max_marks: 10 }],
    }, learnerASession);
    const res = makeRes();
    await h({ method: 'GET', query: { learnerId: 'learnerA', subjectId: 'math' } }, res);
    assert.strictEqual(res.body.readinessLevel, 'building');
  });

  await test('G2: mockPerformance ignores a mock with no marks recorded (max_marks null/0), never divides by zero or fakes a percent', async () => {
    const h = loadHandler({ totalConcepts: 10, masteryRows: [{ status: 'mastered', mastery_score: 0.9 }, { status: 'mastered', mastery_score: 0.9 }, { status: 'mastered', mastery_score: 0.9 }], mockRows: [{ total_score: 5, max_marks: null }] }, learnerASession);
    const res = makeRes();
    await h({ method: 'GET', query: { learnerId: 'learnerA', subjectId: 'math' } }, res);
    assert.strictEqual(res.body.mockPerformance.evaluatedMockAttempts, 0);
    assert.strictEqual(res.body.mockPerformance.insufficientEvidence, true);
  });

  await test('G3: a teacher can read any learner\'s readiness', async () => {
    const h = loadHandler({ totalConcepts: 5 }, teacherSession);
    const res = makeRes();
    await h({ method: 'GET', query: { learnerId: 'learnerA', subjectId: 'math' } }, res);
    assert.strictEqual(res.statusCode, 200);
  });

  console.log(failures === 0 ? '\nALL M72 EXAM READINESS TESTS PASSED' : `\n${failures} M72 TEST(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})();
