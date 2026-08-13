// test/run-section-d-smoke.js
// Smoke test for the exact data calls parent-os.html and teacher-os.html make,
// using the same sandbox pattern as test/run-tests.js. Populates real evidence
// via the real Section B/C modules (no shortcuts), then calls every function
// the two new pages call and checks nothing throws and shapes are as expected.
// This does NOT render real DOM/HTML — see the final report for what manual
// browser testing still needs to happen.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeLocalStorage() {
  const data = {};
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    clear: () => { Object.keys(data).forEach(k => delete data[k]); },
  };
}
function loadInSandbox() {
  const sandbox = {};
  sandbox.window = sandbox;
  sandbox.localStorage = makeLocalStorage();
  sandbox.console = console;
  sandbox.Date = Date;
  vm.createContext(sandbox);
  const files = ['js/question-bank.js', 'js/baa-assessment.js', 'js/baa-intelligence.js', 'js/baa-planner.js'];
  for (const f of files) {
    const code = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    vm.runInContext(code, sandbox, { filename: f });
  }
  return sandbox;
}

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failures++; }
  else console.log('PASS:', msg);
}

async function run() {
  const w = loadInSandbox();
  w.BAAAssessment.setStudentName('Test Student');

  // ---- D0: empty state — both pages must not throw with zero evidence ----
  assert(w.BAAIntelligence.getLearningSummary().hasAnyEvidence === false, 'D0: empty summary before any evidence');
  assert(w.BAAAssessment.getAttemptHistory().length === 0, 'D0: empty attempt history before any evidence');
  assert(w.BAAPlanner.getDailyPlan().tasks.length === 0, 'D0: empty plan before any evidence');
  assert(w.BAAAssessment.getTeacherReviewQueue({ status: 'pending' }).length === 0, 'D0: empty review queue before any evidence');

  // ---- Populate real evidence (mirrors T3 in the existing suite) ----
  const q1 = w.BAAGetQuestion('q_frac_001');
  const q2 = w.BAAGetQuestion('q_frac_002');
  for (let i = 0; i < 2; i++) {
    const a = w.BAAGetAssessment('a_quick_fractions_quiz');
    let attempt = w.BAAAssessment.startAttempt(a);
    w.BAAAssessment.saveAnswer(attempt.id, 'q_frac_001', '6/8');
    w.BAAAssessment.saveAnswer(attempt.id, 'q_frac_002', 'True');
    attempt = w.BAAAssessment.getAttempt(attempt.id);
    await w.BAAAssessment.submitAttempt(attempt, [q1, q2], 'http://fake');
  }
  const qAlg = w.BAAGetQuestion('q_alg_001');
  for (let i = 0; i < 4; i++) {
    const a2 = w.BAAGetAssessment('a_linear_equations_chapter_test');
    let attempt2 = w.BAAAssessment.startAttempt(a2);
    w.BAAAssessment.saveAnswer(attempt2.id, 'q_alg_001', 'x = 10'); // wrong
    attempt2 = w.BAAAssessment.getAttempt(attempt2.id);
    await w.BAAAssessment.submitAttempt(attempt2, [qAlg], 'http://fake');
  }

  // ---- D1: Parent OS data calls (mirrors parent-os.html's render()) ----
  const summary = w.BAAIntelligence.getLearningSummary();
  assert(summary.hasAnyEvidence === true, 'D1: summary has evidence after real attempts');
  assert(Array.isArray(summary.mastered) && Array.isArray(summary.struggling), 'D1: summary has expected array fields');
  const attempts = w.BAAAssessment.getAttemptHistory().slice(0, 5);
  assert(attempts.length > 0, 'D1: attempt history non-empty');
  for (const a of attempts) {
    const s = w.BAAAssessment.summarizeAttempt(a);
    assert(typeof s.total === 'number', 'D1: summarizeAttempt returns a usable summary for attempt ' + a.id);
  }
  const plan = w.BAAPlanner.getDailyPlan();
  assert(plan.hasAnyEvidence === true, 'D1: planner reflects real evidence');
  const weak = [...summary.struggling, ...summary.needsRevision];
  assert(weak.length > 0, 'D1: at least one weak concept exists for the home-support-suggestion path to exercise');
  for (const conceptState of weak) {
    assert(typeof conceptState.why === 'string' && conceptState.why.length > 0, 'D1: weak concept has a non-empty "why" for parent-facing explanation');
  }

  // ---- D2: Teacher OS data calls (mirrors teacher-os.html's render()) ----
  const states = w.BAAIntelligence.getConceptStates();
  assert(states.length >= 2, 'D2: at least 2 concept states exist (fractions + linear equations)');
  for (const s of states) {
    assert(s.stateIcon && s.stateLabel && s.confidence, 'D2: concept state has icon/label/confidence for ' + s.concept);
  }
  const mistakes = w.BAAIntelligence.getMistakeIntelligence();
  assert(mistakes.some(m => m.status === 'possible_misconception'), 'D2: at least one confirmed mistake pattern for Mistake Archeology panel');
  const reviewQueue = w.BAAAssessment.getTeacherReviewQueue({ status: 'pending' });
  assert(Array.isArray(reviewQueue), 'D2: review queue call does not throw and returns an array');

  // ---- D3: findPracticeLink logic (duplicated in both new pages) must resolve for a known concept ----
  function findPracticeLink(concept) {
    for (const a of w.BAAAssessmentCatalog) {
      if (a.questionIds.some(qid => { const q = w.BAAGetQuestion(qid); return q && q.concept === concept; })) {
        return `assessment.html?start=${encodeURIComponent(a.id)}`;
      }
    }
    return null;
  }
  const link = findPracticeLink('solving-linear-equations');
  assert(typeof link === 'string' && link.includes('assessment.html?start='), 'D3: findPracticeLink resolves a real assessment link for a weak concept');
  assert(findPracticeLink('a-concept-that-does-not-exist') === null, 'D3: findPracticeLink honestly returns null for an unknown concept, never a fabricated link');

  console.log(failures === 0 ? '\nALL SECTION D SMOKE TESTS PASSED' : `\n${failures} SECTION D SMOKE TEST(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

run();
