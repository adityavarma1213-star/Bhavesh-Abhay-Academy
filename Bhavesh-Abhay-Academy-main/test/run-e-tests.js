// Section E test harness — same sandbox-in-Node approach as
// test/run-tests.js (no real browser: no DOM/fetch/rendering, see that
// file's header). Adds sessionStorage (used by baa-wellbeing.js) and
// loads js/baa-trust.js + js/baa-wellbeing.js alongside A/B/C.
// Run with: node test/run-e-tests.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeStorage() {
  const data = {};
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    clear: () => { Object.keys(data).forEach(k => delete data[k]); },
    _raw: data,
  };
}

function loadInSandbox() {
  const sandbox = {};
  sandbox.window = sandbox;
  sandbox.localStorage = makeStorage();
  sandbox.sessionStorage = makeStorage();
  sandbox.console = console;
  sandbox.Date = Date;
  sandbox.Math = Math;
  vm.createContext(sandbox);
  const files = [
    'js/question-bank.js', 'js/baa-assessment.js', 'js/baa-intelligence.js',
    'js/baa-planner.js', 'js/baa-trust.js', 'js/baa-wellbeing.js',
  ];
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

// Helper: produce one graded attempt with a mix of an auto-accepted
// question and a human-review-required question, so appeal tests have
// something real to work with.
async function seedOneAttempt(w) {
  w.BAAAssessment.setStudentName('Test Student');
  const a = w.BAAGetAssessment('a_quick_fractions_quiz');
  let attempt = w.BAAAssessment.startAttempt(a);
  const questions = a.questionIds.map(w.BAAGetQuestion);
  w.BAAAssessment.saveAnswer(attempt.id, questions[0].id, '6/8');
  attempt = w.BAAAssessment.getAttempt(attempt.id);
  await w.BAAAssessment.submitAttempt(attempt, [questions[0]], 'http://fake');
  return { attemptId: attempt.id, questionId: questions[0].id };
}

// ---------- Module 37: consent + activity log ----------
function testConsent() {
  const w = loadInSandbox();
  const before = w.BAATrust.getConsentStatus();
  assert(before.parentalAcknowledgementGiven === false, 'E-Consent1: consent starts false, never fabricated as already given');

  const res = w.BAATrust.recordConsentAcknowledgement('parent');
  assert(res.consent.parentalAcknowledgementGiven === true, 'E-Consent2: recording acknowledgement sets it true');
  assert(res.consent.acknowledgedRole === 'parent', 'E-Consent3: acknowledged role recorded');
  assert(!!res.consent.acknowledgedAt, 'E-Consent4: acknowledged timestamp recorded');

  const log = w.BAATrust.getActivityLog();
  assert(log.some(e => e.action === 'consent_acknowledged'), 'E-Consent5: consent change appears in the activity log');

  const revoked = w.BAATrust.revokeConsentAcknowledgement();
  assert(revoked.consent.parentalAcknowledgementGiven === false, 'E-Consent6: consent can be revoked');
}

// ---------- Module 37: data inventory + retention honesty ----------
function testDataInventoryAndRetention() {
  const w = loadInSandbox();
  const inv = w.BAATrust.getDataInventory();
  assert(Array.isArray(inv) && inv.length >= 5, 'E-Inv1: data inventory lists real stores, not empty');
  const image = inv.find(d => /image/i.test(d.category));
  assert(image && /not persisted/i.test(image.retention), 'E-Inv2: uploaded image is honestly documented as not persisted');
  const voice = inv.find(d => /voice/i.test(d.category));
  assert(voice && /not persisted|ephemeral/i.test(voice.retention), 'E-Inv3: voice audio is honestly documented as not persisted');

  const policy = w.BAATrust.getRetentionPolicyText();
  assert(typeof policy === 'string' && policy.length > 40, 'E-Ret1: retention policy text exists');
  assert(!/is COPPA compliant|is GDPR compliant|fully compliant/i.test(policy), 'E-Ret2: retention text does not falsely claim legal compliance');
}

// ---------- Module 55: export reflects real, live data ----------
async function testExport() {
  const w = loadInSandbox();
  await seedOneAttempt(w);
  const dump = w.BAATrust.exportAllData();
  assert(dump.sectionB_assessments && dump.sectionB_assessments.attempts.length === 1, 'E-Export1: export contains the real seeded attempt (no fabrication)');
  assert(dump.studentName === 'Test Student', 'E-Export2: export contains the real student name');
}

// ---------- Module 55: fresh start archives, clears active data, preserves review history ----------
async function testFreshStart() {
  const w = loadInSandbox();
  const { attemptId, questionId } = await seedOneAttempt(w);
  // Force a human-reviewable row to exist and get it decided, so we can
  // confirm the DECISION RECORD survives a fresh start.
  w.BAAAssessment.requestReevaluation(attemptId, questionId, { requestedBy: 'parent', reason: 'please check' });
  w.BAAAssessment.submitTeacherReview(
    w.BAAAssessment.getTeacherReviewQueue({ status: 'pending' })[0].id,
    { action: 'accept', reviewer: 'Ms. Rao' }
  );

  const before = JSON.parse(w.localStorage.getItem('baa_section_b_data_v1'));
  assert(before.attempts.length === 1 && before.teacherReviews.length === 1, 'E-Fresh0: setup has one attempt and one decided review');

  const result = w.BAATrust.freshStart({ requestedBy: 'student', reason: 'starting the term fresh' });
  assert(!result.error, 'E-Fresh1: freshStart succeeds');
  assert(result.preservedReviewCount === 1, 'E-Fresh2: freshStart reports the preserved review count');

  const after = JSON.parse(w.localStorage.getItem('baa_section_b_data_v1'));
  assert(after.attempts.length === 0, 'E-Fresh3: attempts cleared by fresh start');
  assert(after.evidence.length === 0, 'E-Fresh4: evidence cleared by fresh start');
  assert(after.teacherReviews.length === 1, 'E-Fresh5: human review/appeal decisions are NOT destroyed by fresh start (Module 39/55)');

  const archives = w.BAATrust.listFreshStartArchives();
  assert(archives.length === 1 && archives[0].hadAttempts === 1, 'E-Fresh6: fresh start recorded a real archive entry, not a fabricated one');
}

// ---------- Module 55: deletion requests (scoped, logged, no silent action) ----------
async function testDeletion() {
  const w = loadInSandbox();
  await seedOneAttempt(w);

  const reqAppOnly = w.BAATrust.requestDeletion({ scope: 'this_app_only', requestedBy: 'student' });
  assert(reqAppOnly.request.status === 'pending', 'E-Del1: deletion request starts pending, not auto-fulfilled');

  const fulfilled = w.BAATrust.fulfillDeletion(reqAppOnly.request.id);
  assert(fulfilled.fulfilled === true, 'E-Del2: this_app_only deletion fulfills');
  assert(w.localStorage.getItem('baa_section_b_data_v1') === null, 'E-Del3: Section B data cleared by this_app_only deletion');
  assert(w.localStorage.getItem(w.BAATrust.STORAGE_KEY) !== null, 'E-Del4: the trust/audit record itself survives an app-only deletion (it IS the audit trail)');

  const log = w.BAATrust.getActivityLog();
  assert(log.some(e => e.action === 'deletion_requested') && log.some(e => e.action === 'deletion_fulfilled'),
    'E-Del5: both the request and the fulfillment are logged (sequence preserved, not just an end state)');

  // Re-fulfilling the same request must not silently succeed twice.
  const second = w.BAATrust.fulfillDeletion(reqAppOnly.request.id);
  assert(!!second.error, 'E-Del6: fulfilling an already-resolved deletion request is rejected, not silently repeated');
}

async function testDeletionEverything() {
  const w = loadInSandbox();
  w.localStorage.setItem('baa_student_name', 'Test Student');
  w.localStorage.setItem('baa_section_g2_accounts_v1', JSON.stringify({ users: [{ id: 'u1' }] }));
  const req = w.BAATrust.requestDeletion({ scope: 'everything', requestedBy: 'parent' });
  w.BAATrust.fulfillDeletion(req.request.id);
  assert(w.localStorage.getItem('baa_student_name') === null, 'E-DelAll1: everything-scope deletion clears the student name');
  assert(w.localStorage.getItem('baa_section_g2_accounts_v1') === null, 'E-DelAll2: everything-scope deletion clears the account store');
  assert(w.localStorage.getItem(w.BAATrust.STORAGE_KEY) === null, 'E-DelAll3: everything-scope deletion clears the trust record itself, as documented');
}

// ---------- Module 39: appeal / re-evaluation, building on Section B's review system ----------
async function testAppealFlow() {
  const w = loadInSandbox();
  const { attemptId, questionId } = await seedOneAttempt(w);

  const beforeQueue = w.BAAAssessment.getTeacherReviewQueue();
  const wasFlagged = beforeQueue.some(r => r.attemptId === attemptId && r.questionId === questionId);

  const appeal = w.BAAAssessment.requestReevaluation(attemptId, questionId, { requestedBy: 'parent', reason: 'seems wrong' });
  assert(!appeal.error, 'E-Appeal1: requestReevaluation succeeds even on a question the AI never flagged (wasFlagged=' + wasFlagged + ')');
  assert(appeal.review.teacherStatus === 'pending', 'E-Appeal2: an appeal puts the question into the pending review queue');
  assert(appeal.review.appeal && appeal.review.appeal.status === 'pending', 'E-Appeal3: the appeal itself is recorded with pending status');
  assert(appeal.review.appeal.requestedBy === 'parent', 'E-Appeal4: appeal records who requested it');

  const queueAfter = w.BAAAssessment.getTeacherReviewQueue({ status: 'pending' });
  assert(queueAfter.some(r => r.id === appeal.review.id), 'E-Appeal5: the appealed review shows up in the teacher review queue (built on the SAME system, not a duplicate)');

  const decision1 = w.BAAAssessment.submitTeacherReview(appeal.review.id, { action: 'edit', teacherMarks: 1, reviewer: 'Mr. Iyer' });
  assert(!decision1.error, 'E-Appeal6: teacher can decide an appeal via the existing submitTeacherReview path');
  assert(!!decision1.questionResult.originalAiEvaluation, 'E-Appeal7: original AI evaluation is preserved even for an appeal-created review');

  const reopened = w.BAAAssessment.requestReevaluation(attemptId, questionId, { requestedBy: 'student', reason: 'still not sure' });
  assert(reopened.review.teacherStatus === 'pending', 'E-Appeal8: a second appeal reopens the SAME review row (no duplicate row for the same question)');

  const decision2 = w.BAAAssessment.submitTeacherReview(reopened.review.id, { action: 'accept', reviewer: 'Mr. Iyer' });
  assert(decision2.review.decisionHistory.length === 1, 'E-Appeal9: the FIRST decision is preserved in decisionHistory before the second decision overwrites the row (no silent modification of historical evaluation records)');
  assert(decision2.review.decisionHistory[0].teacherStatus === 'edited', 'E-Appeal10: the preserved historical decision matches what was actually decided the first time');
  assert(!!decision2.questionResult.originalAiEvaluation, 'E-Appeal11: original AI evaluation still intact after a second decision');
}

// ---------- Module 54: healthy pacing, no shame, no dark patterns ----------
function testWellbeing() {
  const w = loadInSandbox();

  w.BAAWellbeing.setReminderPreference(false);
  const disabled = w.BAAWellbeing.checkBreakSuggestion();
  assert(disabled.shouldSuggestBreak === false, 'E-Well1: no break suggestion when the student/parent has turned reminders off (student stays in control)');

  w.BAAWellbeing.setReminderPreference(true, 0);
  const due = w.BAAWellbeing.checkBreakSuggestion();
  assert(due.shouldSuggestBreak === true, 'E-Well2: a break suggestion becomes due once the interval elapses');
  assert(due.suggestion && due.suggestion.body.length > 0, 'E-Well3: the suggestion carries real supportive copy');

  const missedCopy = w.BAAWellbeing.supportiveMissedTaskCopy();
  const lowScoreCopy = w.BAAWellbeing.supportiveLowScoreCopy();
  const shameWords = /you failed|you didn't try|falling behind|not good enough|other students/i;
  assert(!shameWords.test(missedCopy), 'E-Well4: missed-task copy contains no shame/comparison language');
  assert(!shameWords.test(lowScoreCopy), 'E-Well5: low-score copy contains no shame/comparison language');

  w.BAAWellbeing.setReminderPreference(true, 999999);
  const notDueYet = w.BAAWellbeing.checkBreakSuggestion();
  assert(notDueYet.shouldSuggestBreak === false, 'E-Well6: with a long interval, no premature suggestion fires (not maximizing interruptions)');
}

// ---------- Regression: Section E writes never touch A-D / G1-G3 stores it shouldn't ----------
async function testRegression() {
  const w = loadInSandbox();
  w.localStorage.setItem('baa_student_name', 'Regression Student');
  w.localStorage.setItem('baa_section_g3_authorization_v1', JSON.stringify({ userRoles: [{ x: 1 }] }));
  const g3Before = w.localStorage.getItem('baa_section_g3_authorization_v1');

  w.BAATrust.recordConsentAcknowledgement('student');
  w.BAAWellbeing.setReminderPreference(true, 20);

  assert(w.localStorage.getItem('baa_student_name') === 'Regression Student', 'E-Regr1: Section A student name untouched by Section E writes');
  assert(w.localStorage.getItem('baa_section_g3_authorization_v1') === g3Before, 'E-Regr2: Section G3 authorization store untouched by Section E writes');
  assert(w.localStorage.getItem('baa_section_e_trust_v1') !== null, 'E-Regr3: Section E uses its own new localStorage key');
  assert(w.localStorage.getItem('baa_section_e_wellbeing_prefs_v1') !== null, 'E-Regr4: wellbeing prefs use their own new localStorage key');
}

(async function main() {
  testConsent();
  testDataInventoryAndRetention();
  await testExport();
  await testFreshStart();
  await testDeletion();
  await testDeletionEverything();
  await testAppealFlow();
  testWellbeing();
  await testRegression();

  console.log('');
  if (failures > 0) {
    console.error(`${failures} SECTION E TEST(S) FAILED`);
    process.exit(1);
  } else {
    console.log('ALL SECTION E TESTS PASSED');
  }
})();
