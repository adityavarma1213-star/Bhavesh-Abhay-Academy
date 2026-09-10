// test/run-m70-paper-intelligence-tests.js
// BAA M70 — Paper Intelligence + Multi-Year Analytics (Blueprint V3.2/V3.3, IB-08).
// Same extraction-and-execute discipline as M64-M69.
//
// Coverage:
//   G2 handler — real counts/percentages computed from actual question rows
//   G4 evidence honesty — year-over-year is NEVER populated unless the blueprint's own evidence bar (>=2 years, each with >=3 questions) is met; an empty result set returns insufficientEvidence, not zeros dressed up as data
//   G3 authorization — unpublished/unverified content is excluded from analytics for an ordinary user, included only via includeUnpublished for teacher/admin
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
  const start = src.indexOf('/* ================ paper-intelligence.js ================ */');
  assert.ok(start >= 0, 'paper-intelligence.js block not found');
  const end = src.indexOf('\nexport default async function handler', start);
  assert.ok(end > start, 'could not find end of paper-intelligence.js block');
  return src.slice(start, end);
}

function loadHandler(questions, session) {
  const block = extractBlock();
  const sandbox = {
    console, Date, JSON, Math, Number, String, Object, Array, Set, Map, Error, Promise, RegExp,
    global: {},
    sql: async (strings, ...values) => {
      const [boardId, subjectId1, subjectId2, classLevel1, classLevel2, includeUnpublished] = values;
      let rows = questions.filter(q => q.board_id === boardId);
      if (subjectId1) rows = rows.filter(q => q.subject_id === subjectId1);
      if (classLevel1) rows = rows.filter(q => q.class_level === classLevel1);
      if (!includeUnpublished) rows = rows.filter(q => q.status === 'published' && q.verification_status === 'verified');
      return { rows };
    },
    json: (res, status, body) => { res.statusCode = status; res.body = body; return res; },
    requireAuth: async () => session,
    hasRole: (s, role) => s.roles.includes(role),
  };
  vm.createContext(sandbox);
  vm.runInContext(block + '\nglobal.__h = handler_paper_intelligence;\n', sandbox);
  return sandbox.global.__h;
}

function makeRes() { return { statusCode: null, body: null, setHeader() {}, status(s) { this.statusCode = s; return this; }, json(b) { this.body = b; return this; } }; }

const studentSession = { user_id: 'u_s', roles: ['student'] };
const teacherSession = { user_id: 'u_t', roles: ['teacher'] };

function q(overrides) {
  return { id: 'q', board_id: 'cbse', subject_id: 'math', class_level: 'Class 10', concept_id: 'c1', concept_name: 'HCF', chapter_id: 'ch1', chapter_name: 'Real Numbers', question_type: 'mcq', marks: 1, difficulty: 'easy', academic_year_id: 'ay1', year_label: '2024-25', status: 'published', verification_status: 'verified', ...overrides };
}

(async () => {
  await test('G4: an empty result set returns insufficientEvidence rather than fabricated zero-value statistics', async () => {
    const h = loadHandler([], studentSession);
    const res = makeRes();
    await h({ method: 'GET', query: { boardId: 'cbse' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.insufficientEvidence, true);
    assert.strictEqual(res.body.totalQuestionsObserved, 0);
  });

  await test('G3: an ordinary user\'s analytics exclude unpublished/unverified content', async () => {
    const questions = [q({ id: 'q1' }), q({ id: 'q2', status: 'draft', verification_status: 'pending_verification' })];
    const h = loadHandler(questions, studentSession);
    const res = makeRes();
    await h({ method: 'GET', query: { boardId: 'cbse' } }, res);
    assert.strictEqual(res.body.totalQuestionsObserved, 1);
  });

  await test('G3: a teacher CAN include unpublished content via includeUnpublished', async () => {
    const questions = [q({ id: 'q1' }), q({ id: 'q2', status: 'draft', verification_status: 'pending_verification' })];
    const h = loadHandler(questions, teacherSession);
    const res = makeRes();
    await h({ method: 'GET', query: { boardId: 'cbse', includeUnpublished: 'true' } }, res);
    assert.strictEqual(res.body.totalQuestionsObserved, 2);
  });

  await test('G3: a student cannot use includeUnpublished even if they pass it', async () => {
    const questions = [q({ id: 'q1' }), q({ id: 'q2', status: 'draft', verification_status: 'pending_verification' })];
    const h = loadHandler(questions, studentSession);
    const res = makeRes();
    await h({ method: 'GET', query: { boardId: 'cbse', includeUnpublished: 'true' } }, res);
    assert.strictEqual(res.body.totalQuestionsObserved, 1, 'includeUnpublished must be silently ignored for a non-privileged session');
  });

  await test('G2: concept/chapter/type/difficulty/marks distributions are real counts and percentages', async () => {
    const questions = [q({ id: 'q1', question_type: 'mcq' }), q({ id: 'q2', question_type: 'mcq' }), q({ id: 'q3', question_type: 'short_answer', marks: 2 })];
    const h = loadHandler(questions, studentSession);
    const res = makeRes();
    await h({ method: 'GET', query: { boardId: 'cbse' } }, res);
    assert.strictEqual(res.body.totalQuestionsObserved, 3);
    const mcq = res.body.questionTypeDistribution.find(x => x.key === 'mcq');
    assert.strictEqual(mcq.count, 2);
    assert.strictEqual(mcq.percentOfTotal, 66.7);
  });

  await test('G4: fewer than 2 qualifying years never produces a year-over-year comparison', async () => {
    const questions = [q({ id: 'q1' }), q({ id: 'q2' }), q({ id: 'q3' })]; // all same year, 3 questions >= MIN_QUESTIONS_PER_YEAR but only 1 year
    const h = loadHandler(questions, studentSession);
    const res = makeRes();
    await h({ method: 'GET', query: { boardId: 'cbse' } }, res);
    assert.strictEqual(res.body.yearOverYear.insufficientEvidence, true);
    assert.ok(res.body.yearOverYear.partialObservedCounts.length === 1);
  });

  await test('G4: a year with fewer than MIN_QUESTIONS_PER_YEAR_FOR_TREND questions does not count toward the trend even if 2+ years exist', async () => {
    const questions = [
      q({ id: 'q1', year_label: '2023-24' }), q({ id: 'q2', year_label: '2023-24' }), q({ id: 'q3', year_label: '2023-24' }), // 3 — qualifies
      q({ id: 'q4', year_label: '2024-25' }), // only 1 — does not qualify
    ];
    const h = loadHandler(questions, studentSession);
    const res = makeRes();
    await h({ method: 'GET', query: { boardId: 'cbse' } }, res);
    assert.strictEqual(res.body.yearOverYear.insufficientEvidence, true, 'only one year meets the per-year minimum, so no real comparison is possible yet');
  });

  await test('G2 + G4: with real 2+ qualifying years, a genuine year-over-year comparison IS produced', async () => {
    const questions = [
      q({ id: 'q1', year_label: '2023-24', concept_id: 'c1', concept_name: 'HCF' }),
      q({ id: 'q2', year_label: '2023-24', concept_id: 'c1', concept_name: 'HCF' }),
      q({ id: 'q3', year_label: '2023-24', concept_id: 'c2', concept_name: 'LCM' }),
      q({ id: 'q4', year_label: '2024-25', concept_id: 'c1', concept_name: 'HCF' }),
      q({ id: 'q5', year_label: '2024-25', concept_id: 'c1', concept_name: 'HCF' }),
      q({ id: 'q6', year_label: '2024-25', concept_id: 'c1', concept_name: 'HCF' }),
    ];
    const h = loadHandler(questions, studentSession);
    const res = makeRes();
    await h({ method: 'GET', query: { boardId: 'cbse' } }, res);
    assert.strictEqual(res.body.yearOverYear.insufficientEvidence, false);
    assert.strictEqual(res.body.yearOverYear.byYear.length, 2);
    const y2425 = res.body.yearOverYear.byYear.find(y => y.year === '2024-25');
    assert.strictEqual(y2425.conceptFrequency[0].label, 'HCF');
    assert.strictEqual(y2425.conceptFrequency[0].count, 3);
  });

  await test('G1: boardId is required', async () => {
    const h = loadHandler([], studentSession);
    const res = makeRes();
    await h({ method: 'GET', query: {} }, res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error.code, 'BOARD_ID_REQUIRED');
  });

  console.log(failures === 0 ? '\nALL M70 PAPER INTELLIGENCE TESTS PASSED' : `\n${failures} M70 TEST(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})();
