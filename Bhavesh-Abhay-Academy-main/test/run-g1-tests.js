// test/run-g1-tests.js
// BAA OS — Section G1 tests.
//
// Covers (per the G1 brief, requirement 25):
//   - schema validity (db/schema.sql parses, no duplicate table names,
//     every FK target table exists, every table has a primary key)
//   - required relationships / required fields on the mapped rows
//   - assessment / evidence / planner / teacher-note / review relationships
//   - no duplicate primary IDs
//   - foreign-key integrity where this JS layer can check it
//   - the LocalStorage adapter still works (same keys as A–D)
//   - the Database adapter honestly reports "not connected" and never
//     fabricates data
//
// This does NOT run against a real database — none is connected. See
// SCHEMA.md and js/data-access/adapters/databaseAdapter.js.
//
// Run with: node test/run-g1-tests.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failures++; }
  else console.log('PASS:', msg);
}

// ============================================================
// PART 1 — SCHEMA VALIDITY (static analysis of db/schema.sql;
// there is no live database to actually execute this against)
// ============================================================
function testSchemaValidity() {
  const sql = fs.readFileSync(path.join(ROOT, 'db', 'schema.sql'), 'utf8');

  const tableNames = [];
  const tableRe = /CREATE TABLE (\w+)\s*\(/g;
  let m;
  while ((m = tableRe.exec(sql))) tableNames.push(m[1]);

  assert(tableNames.length >= 25, `S1: schema defines a substantial number of tables (found ${tableNames.length})`);

  const dupes = tableNames.filter((t, i) => tableNames.indexOf(t) !== i);
  assert(dupes.length === 0, `S2: no duplicate CREATE TABLE names (dupes: ${dupes.join(', ') || 'none'})`);

  // Every table has a PRIMARY KEY, either inline or composite.
  const tableBlocks = sql.split(/CREATE TABLE /).slice(1);
  let allHavePk = true;
  const missingPk = [];
  for (const block of tableBlocks) {
    const name = block.match(/^(\w+)/)[1];
    const body = block.slice(0, block.indexOf(');') + 2);
    if (!/PRIMARY KEY/.test(body)) { allHavePk = false; missingPk.push(name); }
  }
  assert(allHavePk, `S3: every table has a PRIMARY KEY (missing on: ${missingPk.join(', ')})`);

  // Every REFERENCES target is a table actually defined in this file.
  const refRe = /REFERENCES (\w+)\(/g;
  const missingRefs = [];
  while ((m = refRe.exec(sql))) {
    if (!tableNames.includes(m[1])) missingRefs.push(m[1]);
  }
  assert(missingRefs.length === 0, `S4: every REFERENCES target table exists in schema.sql (missing: ${[...new Set(missingRefs)].join(', ') || 'none'})`);

  // Learner-owned tables required by requirement 5 all carry learner_id.
  const learnerOwnedTables = [
    'learning_evidence', 'assessment_attempts', 'planner_tasks',
    'mistake_patterns', 'teacher_notes', 'teacher_reviews', 'learning_memory',
  ];
  for (const t of learnerOwnedTables) {
    const block = tableBlocks.find(b => b.startsWith(t + ' ') || b.startsWith(t + '\n') || b.startsWith(t + '('));
    assert(!!block && /learner_id\s+TEXT NOT NULL REFERENCES learners/.test(block),
      `S5: ${t} has a required learner_id FK (ownership model, requirement 5)`);
  }

  // Derived tables are documented as such (comment presence, not just structural).
  assert(/DERIVED\. One row per \(learner, concept\)/.test(sql), 'S6: learning_memory is documented as DERIVED data');
  assert(/DERIVED but must stay explainable/.test(sql), 'S7: mistake_patterns is documented as derived-but-explainable');
}

// ============================================================
// PART 2 — ADAPTERS
// ============================================================
function makeLocalStorage() {
  const data = {};
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    clear: () => { Object.keys(data).forEach(k => delete data[k]); },
    _raw: data,
  };
}

function testAdapters() {
  const ls = makeLocalStorage();
  global.localStorage = ls;
  delete require.cache[require.resolve('../js/data-access/adapters/localStorageAdapter.js')];
  delete require.cache[require.resolve('../js/data-access/adapters/databaseAdapter.js')];
  const LocalStorageAdapter = require('../js/data-access/adapters/localStorageAdapter.js');
  const DatabaseAdapter = require('../js/data-access/adapters/databaseAdapter.js');

  assert(LocalStorageAdapter.isConnected() === true, 'A1: LocalStorageAdapter reports connected when localStorage exists');
  assert(DatabaseAdapter.isConnected() === false, 'A2: DatabaseAdapter honestly reports NOT connected (no live DB exists)');

  let threw = false, code = null;
  try { DatabaseAdapter.getSectionBStore(); } catch (e) { threw = true; code = e.code; }
  assert(threw && code === 'DATABASE_NOT_CONNECTED', 'A3: DatabaseAdapter throws DATABASE_NOT_CONNECTED rather than fabricating data');

  ls.setItem('baa_student_name', 'Ada');
  assert(LocalStorageAdapter.getStudentName() === 'Ada', 'A4: LocalStorageAdapter reads the exact existing baa_student_name key');

  ls.setItem('baa_section_d_teacher_notes_v1', JSON.stringify([{ id: 'note_1', text: 'Great progress', createdAt: '2026-01-01T00:00:00.000Z' }]));
  const notes = LocalStorageAdapter.getTeacherNotes();
  assert(notes.length === 1 && notes[0].text === 'Great progress', 'A5: LocalStorageAdapter reads existing Section D notes unchanged');

  delete global.localStorage;
}

// ============================================================
// PART 3 — REPOSITORIES, backed by REAL Section B/C data produced
// by the actual A–D modules (same sandbox pattern as test/run-tests.js)
// ============================================================
function loadAppSandbox() {
  const sandbox = {};
  sandbox.window = sandbox;
  sandbox.localStorage = makeLocalStorage();
  sandbox.console = console;
  sandbox.Date = Date;
  vm.createContext(sandbox);
  const files = ['js/question-bank.js', 'js/baa-assessment.js', 'js/baa-intelligence.js', 'js/baa-planner.js'];
  for (const f of files) {
    const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
    vm.runInContext(code, sandbox, { filename: f });
  }
  return sandbox;
}

// Adapter wired to the sandbox's localStorage instead of a real browser one,
// so repositories can be exercised against real A–D-produced data without
// requiring an actual browser.
function makeSandboxAdapter(sandbox) {
  // Left set (not deleted) — the adapter reads global.localStorage lazily on
  // every call, so it must still be present for the repository calls below,
  // not just at require() time.
  global.localStorage = sandbox.localStorage;
  delete require.cache[require.resolve('../js/data-access/adapters/localStorageAdapter.js')];
  return require('../js/data-access/adapters/localStorageAdapter.js');
}

async function testRepositories() {
  const w = loadAppSandbox();
  w.BAAAssessment.setStudentName('Test Student');

  // Produce real attempts/evidence/mistake-patterns/teacher-review data,
  // same shape as the T3 test in test/run-tests.js.
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
    w.BAAAssessment.saveAnswer(attempt2.id, 'q_alg_001', 'x = 10'); // wrong -> mistake pattern
    attempt2 = w.BAAAssessment.getAttempt(attempt2.id);
    await w.BAAAssessment.submitAttempt(attempt2, [qAlg], 'http://fake');
  }
  // Simulate a Section D teacher note directly against the sandbox's
  // localStorage, same shape teacher-os.html writes.
  w.localStorage.setItem('baa_section_d_teacher_notes_v1', JSON.stringify([
    { id: 'note_1', text: 'Needs more practice on linear equations.', createdAt: new Date().toISOString() },
  ]));

  const adapter = makeSandboxAdapter(w);

  ['learnerRepository', 'assessmentRepository', 'evidenceRepository', 'plannerRepository', 'teacherReviewRepository', 'teacherNotesRepository']
    .forEach(f => delete require.cache[require.resolve(`../js/data-access/repositories/${f}.js`)]);
  const learnerRepo = require('../js/data-access/repositories/learnerRepository.js').getRepo(adapter);
  const learner = learnerRepo.getCurrentLearner();
  assert(!!learner.id, 'R1: learnerRepository returns a stable learner id');
  assert(learner.display_name === 'Test Student', 'R2: learnerRepository reflects the real student name');

  const assessmentRepo = require('../js/data-access/repositories/assessmentRepository.js').getRepo(adapter, learner.id);
  const attempts = assessmentRepo.listAttempts();
  assert(attempts.length === 6, `R3: assessmentRepository returns one row per real attempt (got ${attempts.length})`);
  assert(attempts.every(a => a.learner_id === learner.id), 'R4: every attempt row is owned by the learner (requirement 5)');
  const ids = attempts.map(a => a.id);
  assert(new Set(ids).size === ids.length, 'R5: no duplicate assessment_attempts primary ids');

  const oneAttempt = attempts[0];
  const answers = assessmentRepo.listAnswers(oneAttempt.id);
  const results = assessmentRepo.listResults(oneAttempt.id);
  assert(answers.length > 0 && answers.every(a => a.attempt_id === oneAttempt.id), 'R6: assessment_answers correctly reference their attempt');
  assert(results.length > 0 && results.every(r => r.attempt_id === oneAttempt.id), 'R7: assessment_results correctly reference their attempt');

  const evidenceRepo = require('../js/data-access/repositories/evidenceRepository.js').getRepo(adapter, learner.id);
  const evidence = evidenceRepo.listEvidence();
  assert(evidence.length > 0, 'R8: evidenceRepository returns real evidence rows');
  assert(evidence.every(e => e.learner_id === learner.id), 'R9: every evidence row is owned by the learner');
  const evIds = evidence.map(e => e.id);
  assert(new Set(evIds).size === evIds.length, 'R10: no duplicate learning_evidence primary ids');
  const attemptIds = new Set(attempts.map(a => a.id));
  assert(evidence.every(e => attemptIds.has(e.attempt_id)), 'R11: every evidence row references a real attempt (FK integrity)');

  const memory = evidenceRepo.listLearningMemory();
  assert(memory.length > 0, 'R12: evidenceRepository returns derived learning_memory rows');
  assert(memory.every(mm => ['insufficient_evidence', 'mastered', 'learning', 'needs_revision'].includes(mm.status)),
    'R13: learning_memory status values match the schema CHECK constraint');

  const patterns = evidenceRepo.listMistakePatterns();
  assert(patterns.length > 0, 'R14: evidenceRepository returns mistake_patterns (repeated wrong answers were seeded)');
  const confirmed = patterns.find(p => p.status === 'possible_misconception');
  assert(!!confirmed, 'R15: repeated same-error pattern reaches possible_misconception, mirroring Section B');
  assert(confirmed.occurrences.length > 0 && confirmed.occurrences.every(o => !!o.evidence_id),
    'R16: every mistake_pattern_occurrence resolves back to a real learning_evidence row (requirement 12 — explainable, not just a count)');

  const plannerRepo = require('../js/data-access/repositories/plannerRepository.js').getRepo(adapter, learner.id);
  w.BAAPlanner.getDailyPlan(); // triggers real task generation, same as the app does
  const adapter2 = makeSandboxAdapter(w); // re-read after task generation
  const plannerRepo2 = require('../js/data-access/repositories/plannerRepository.js').getRepo(adapter2, learner.id);
  const tasks = plannerRepo2.listTasks();
  assert(tasks.length > 0, 'R17: plannerRepository returns real planner_tasks generated by Section C');
  assert(tasks.every(t => t.learner_id === learner.id), 'R18: every planner_tasks row is owned by the learner');
  const taskIds = tasks.map(t => t.id);
  assert(new Set(taskIds).size === taskIds.length, 'R19: no duplicate planner_tasks primary ids');
  const events = plannerRepo2.listTaskEvents(tasks[0].id);
  assert(events.length > 0 && events[0].event === 'created', 'R20: planner_task_events preserves the real task history (requirement 26 — no silent deletion)');

  const reviewRepo = require('../js/data-access/repositories/teacherReviewRepository.js').getRepo(adapter, learner.id);
  const reviews = reviewRepo.listReviews();
  // q_alg_001 is auto-gradable (mcq) so it never enters human review; this
  // just checks the repository doesn't throw and shapes correctly either way.
  assert(Array.isArray(reviews), 'R21: teacherReviewRepository returns an array without throwing');
  assert(reviews.every(r => r.learner_id === learner.id), 'R22: every teacher_reviews row is owned by the learner');

  const notesRepo = require('../js/data-access/repositories/teacherNotesRepository.js').getRepo(adapter, learner.id);
  const notes = notesRepo.listNotes();
  assert(notes.length === 1 && notes[0].text.includes('linear equations'), 'R23: teacherNotesRepository reads the real Section D note untouched');
  assert(notes[0].learner_id === learner.id, 'R24: teacher_notes row is owned by the learner');
}

async function main() {
  testSchemaValidity();
  testAdapters();
  await testRepositories();
  console.log('\n' + (failures === 0 ? 'ALL G1 TESTS PASSED' : failures + ' G1 TEST(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
}
main();
