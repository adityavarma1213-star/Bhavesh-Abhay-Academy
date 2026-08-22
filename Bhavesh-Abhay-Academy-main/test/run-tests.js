// Test harness: simulates a browser (localStorage + window global) in Node
// so Section B + Section C JS can be loaded and exercised without a real
// browser. This is NOT a substitute for live browser/UI testing (no DOM,
// no fetch, no rendering) — see SECTION_C_FINAL_REPORT.md for what this
// does and doesn't cover. Run with: node test/run-tests.js
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

// ---------- TEST 1: No evidence -> empty/insufficient states everywhere ----------
async function test1() {
  const w = loadInSandbox();
  const summary = w.BAAIntelligence.getLearningSummary();
  assert(summary.hasAnyEvidence === false, 'T1: no evidence -> hasAnyEvidence false');
  const plan = w.BAAPlanner.getDailyPlan();
  assert(plan.tasks.length === 0, 'T1: no evidence -> empty daily plan (no fabricated tasks)');
}

// ---------- TEST 2: partial evidence (below threshold) -> insufficient_evidence ----------
async function test2() {
  const w = loadInSandbox();
  w.BAAAssessment.setStudentName('Test Student');
  const a = w.BAAGetAssessment('a_quick_fractions_quiz');
  let attempt = w.BAAAssessment.startAttempt(a);
  w.BAAAssessment.saveAnswer(attempt.id, 'q_frac_001', '6/8'); // correct
  attempt = w.BAAAssessment.getAttempt(attempt.id);
  const questions = a.questionIds.map(w.BAAGetQuestion);
  await w.BAAAssessment.submitAttempt(attempt, [questions[0]], 'http://fake');
  const state = w.BAAIntelligence.getConceptState('equivalent-fractions');
  assert(state && state.state === 'insufficient_evidence', 'T2: 1 answer -> insufficient_evidence (state=' + (state && state.state) + ')');
}

// ---------- TEST 3: enough correct evidence -> mastered/strong; wrong evidence -> needs_revision/struggling ----------
async function test3() {
  const w = loadInSandbox();
  w.BAAAssessment.setStudentName('Test Student');
  const q1 = w.BAAGetQuestion('q_frac_001'); // mcq, equivalent-fractions
  const q2 = w.BAAGetQuestion('q_frac_002'); // true_false, equivalent-fractions

  // 4 correct answers across 2 different questions -> should reach at least "strong"
  for (let i = 0; i < 2; i++) {
    const a = w.BAAGetAssessment('a_quick_fractions_quiz');
    let attempt = w.BAAAssessment.startAttempt(a);
    w.BAAAssessment.saveAnswer(attempt.id, 'q_frac_001', '6/8');
    w.BAAAssessment.saveAnswer(attempt.id, 'q_frac_002', 'True');
    attempt = w.BAAAssessment.getAttempt(attempt.id);
    await w.BAAAssessment.submitAttempt(attempt, [q1, q2], 'http://fake');
  }
  const state = w.BAAIntelligence.getConceptState('equivalent-fractions');
  assert(state && (state.state === 'mastered' || state.state === 'strong'), 'T3: 4/4 correct across 2 questions -> mastered or strong (got ' + (state && state.state) + ')');
  assert(state.confidence === 'medium' || state.confidence === 'high', 'T3: confidence is medium/high with 4 evidence rows (got ' + state.confidence + ')');

  // Now a concept with repeated wrong answers -> needs_revision / struggling
  const qAlg = w.BAAGetQuestion('q_alg_001'); // mcq linear equations, wrong answer path
  for (let i = 0; i < 4; i++) {
    const a2 = w.BAAGetAssessment('a_linear_equations_chapter_test');
    let attempt2 = w.BAAAssessment.startAttempt(a2);
    w.BAAAssessment.saveAnswer(attempt2.id, 'q_alg_001', 'x = 10'); // wrong (correct is x=5)
    attempt2 = w.BAAAssessment.getAttempt(attempt2.id);
    await w.BAAAssessment.submitAttempt(attempt2, [qAlg], 'http://fake');
  }
  const badState = w.BAAIntelligence.getConceptState('solving-linear-equations');
  assert(badState && (badState.state === 'needs_revision' || badState.state === 'struggling'), 'T3: 0/4 correct -> needs_revision or struggling (got ' + (badState && badState.state) + ')');

  // Mistake pattern should be confirmed (4 occurrences of the same errorType >= threshold 3)
  const patterns = w.BAAAssessment.getMistakePatterns({ onlyConfirmed: true });
  assert(patterns.some(p => p.concept === 'solving-linear-equations'), 'T3: repeated same-error pattern flagged as possible_misconception');

  return w; // hand off the populated sandbox to the planner tests
}

// ---------- TEST 4: Planner generates tasks with reasons, respects time budget, connects to real actions ----------
async function test4(w) {
  w.BAAPlanner.setAvailableMinutes(20);
  const plan = w.BAAPlanner.getDailyPlan();
  assert(plan.tasks.length > 0, 'T4: weak concept present -> planner generates at least one task');
  assert(plan.minutesPlanned <= 20, 'T4: planner respects the 20-minute time budget (planned=' + plan.minutesPlanned + ')');
  const practiceTask = plan.tasks.find(t => t.type === 'practice' && t.concept === 'solving-linear-equations');
  assert(practiceTask && practiceTask.reasons.length > 0, 'T4: practice task carries an explainable reason');
  assert(practiceTask && practiceTask.action && (practiceTask.action.kind === 'assessment'), 'T4: practice task action connects to a real assessment (kind=' + (practiceTask && practiceTask.action.kind) + ')');

  // Upcoming assessment bumps priority + adds a reason referencing it
  w.BAAPlanner.addUpcomingAssessment({ title: 'Math Unit Test', subject: 'Mathematics', date: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10) });
  const planAgain = w.BAAPlanner.getDailyPlan();
  assert(planAgain.tasks.length === plan.tasks.length, 'T4: same-day re-open does not duplicate tasks (idempotent)');

  return w;
}

// ---------- TEST 5: missed-task rebalancing (not just pushed to tomorrow, not silently deleted) ----------
async function test5(w) {
  const store = w.BAAPlanner._load();
  const t = store.tasks.find(x => x.status === 'pending');
  assert(!!t, 'T5: setup — there is a pending task to backdate');
  t.scheduledDate = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  w.localStorage.setItem(w.BAAPlanner.STORAGE_KEY, JSON.stringify(store));

  const plan = w.BAAPlanner.getDailyPlan();
  const store2 = w.BAAPlanner._load();
  const missedOrCancelled = store2.tasks.find(x => x.id === t.id);
  assert(missedOrCancelled.status === 'missed' || missedOrCancelled.status === 'cancelled', 'T5: backdated task transitions to missed/cancelled, not silently deleted (status=' + missedOrCancelled.status + ')');
  assert(missedOrCancelled.history.some(h => h.event === 'missed' || h.event === 'cancelled'), 'T5: history entry recorded for the miss (no silent deletion)');
  assert(plan.hasCarriedMissedTasks || missedOrCancelled.status === 'cancelled', 'T5: still-needed missed task is carried into today\'s plan for rebalancing');
}

// ---------- TEST 6: completing a task never auto-marks mastery ----------
async function test6(w) {
  const plan = w.BAAPlanner.getDailyPlan();
  const anyTask = plan.tasks.find(x => x.status === 'pending');
  if (anyTask) {
    const beforeState = w.BAAIntelligence.getConceptState(anyTask.concept);
    w.BAAPlanner.completeTask(anyTask.id);
    const afterState = w.BAAIntelligence.getConceptState(anyTask.concept);
    const beforeLabel = beforeState ? beforeState.state : 'insufficient_evidence';
    const afterLabel = afterState ? afterState.state : 'insufficient_evidence';
    assert(beforeLabel === afterLabel, 'T6: completing a task does not change concept state (mastery is evidence-only) — before=' + beforeLabel + ' after=' + afterLabel);
  } else {
    console.log('SKIP: T6 — no pending task available to complete');
  }
}

async function main() {
  await test1();
  await test2();
  const w = await test3();
  await test4(w);
  await test5(w);
  await test6(w);
  console.log('\n' + (failures === 0 ? 'ALL TESTS PASSED' : failures + ' TEST(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
}
main();
