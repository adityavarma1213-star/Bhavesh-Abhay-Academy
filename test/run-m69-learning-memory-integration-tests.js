// test/run-m69-learning-memory-integration-tests.js
// BAA M69 — Learning Memory Integration (Blueprint V3.2/V3.3).
//
// Tests the real recordBoardLearningEvidence bridge and confirms it
// actually drives the existing, unmodified learning-memory derivation
// engine (deriveAndPersistLearningMemory) — not a parallel reimplementation.
// Also confirms the code-motion refactor that extracted that engine to
// module scope preserved its exact original behavior (thresholds,
// mastered/learning/needs_revision logic) unchanged.
//
// Coverage:
//   G1 schema/contract — migration 028's nullable relaxation + CHECK constraint
//   G4 evidence gating   — unverified/unpublished/unmapped-concept questions never produce evidence
//   G2 handler           — a valid board question DOES produce evidence and updates learning_memory for real
//   Regression            — the extracted shared engine still matches the pre-existing MIN_EVIDENCE/threshold rules exactly
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
const migration = fs.readFileSync(path.join(ROOT, 'db/migrations/028_learning_memory_integration.sql'), 'utf8');
testSync('G1: attempt_id/assessment_id/question_id are relaxed to nullable (backward compatible)', () => {
  assert.ok(migration.includes('ALTER COLUMN attempt_id DROP NOT NULL'));
  assert.ok(migration.includes('ALTER COLUMN assessment_id DROP NOT NULL'));
  assert.ok(migration.includes('ALTER COLUMN question_id DROP NOT NULL'));
});
testSync('G1: a CHECK constraint still requires one complete, valid provenance chain (never evidence with no real source)', () => {
  assert.ok(/CHECK \(\s*\(attempt_id IS NOT NULL AND assessment_id IS NOT NULL AND question_id IS NOT NULL\)\s*OR \(board_question_id IS NOT NULL\)\s*\)/.test(migration));
});
testSync('G1: board_question_id references the correct (renamed) table', () => {
  assert.ok(migration.includes('board_question_id TEXT REFERENCES board_questions(id)'));
});

// ---------- extraction ----------
function extractSharedFunctions() {
  const src = fs.readFileSync(path.join(ROOT, 'api/v1/[...route].js'), 'utf8');
  const start = src.indexOf('const handler_learner = __build_learner();') + 'const handler_learner = __build_learner();'.length;
  const end = src.indexOf('/* ================ learning-memory.js ================ */');
  assert.ok(end > start, 'could not find the shared learning-memory functions region');
  return src.slice(start, end);
}

function makeFakeSql(state) {
  return async function sql(strings, ...values) {
    const q = strings.join('?').replace(/\s+/g, ' ').trim();
    if (q.startsWith('SELECT bq.status, bq.verification_status')) {
      const [boardQuestionId] = values;
      const bq = state.boardQuestions.find(b => b.id === boardQuestionId);
      if (!bq) return { rows: [] };
      return { rows: [{ status: bq.status, verification_status: bq.verification_status, difficulty: bq.difficulty, subject_name: bq.subject_name, concept_name: bq.concept_name, topic_name: bq.topic_name }] };
    }
    if (q.startsWith('INSERT INTO learning_evidence')) {
      const [id0, learnerId, subject, topic, concept, difficulty, correctness, evidenceType, boardQuestionId, sourceAttemptId, createdAt] = values;
      state.evidence.push({ id: id0, learner_id: learnerId, subject, chapter: null, topic, concept, difficulty, correctness, error_type: null, attempt_id: null, question_id: null, evidence_type: evidenceType, board_question_id: boardQuestionId, source_attempt_id: sourceAttemptId, created_at: createdAt });
      return { rows: [], count: 1 };
    }
    if (q.startsWith('SELECT id,concept,subject,topic,correctness,error_type,attempt_id,question_id,created_at')) {
      const [learnerId] = values;
      return { rows: state.evidence.filter(e => e.learner_id === learnerId).sort((a, b) => a.created_at.localeCompare(b.created_at)) };
    }
    if (q.startsWith('INSERT INTO learning_memory')) { state.memoryWrites.push(values); return { rows: [], count: 1 }; }
    if (q.startsWith('SELECT status,evidence_count FROM learning_memory_history')) return { rows: [] };
    if (q.startsWith('INSERT INTO learning_memory_history')) { state.historyWrites.push(values); return { rows: [], count: 1 }; }
    if (q.startsWith('SELECT concept,subject,topic,status,evidence_count,correct_count,last_updated FROM learning_memory WHERE')) {
      const [learnerId] = values;
      const byConcept = new Map();
      for (const w of state.memoryWrites) {
        if (w[0] !== learnerId) continue;
        byConcept.set(w[1], { concept: w[1], subject: w[2], topic: w[3], status: w[4], evidence_count: w[5], correct_count: w[6], last_updated: w[7] });
      }
      return { rows: [...byConcept.values()] };
    }
    if (q.startsWith('SELECT id,concept,subject,error_type,status,first_detected,last_detected FROM mistake_patterns')) return { rows: [] };
    throw new Error('Unhandled fake-sql query in M69 test: ' + q);
  };
}

function loadBridge(state) {
  const shared = extractSharedFunctions();
  const sandbox = {
    console, Date, JSON, Math, Number, String, Object, Array, Set, Map, Error, Promise, RegExp,
    global: {},
    sql: makeFakeSql(state),
    id: (p) => `${p}_${Math.random().toString(36).slice(2, 8)}`,
  };
  vm.createContext(sandbox);
  vm.runInContext(shared + '\nglobal.recordBoardLearningEvidence = recordBoardLearningEvidence;\nglobal.deriveAndPersistLearningMemory = deriveAndPersistLearningMemory;\n', sandbox);
  return { record: sandbox.global.recordBoardLearningEvidence, derive: sandbox.global.deriveAndPersistLearningMemory };
}

function freshState() {
  return {
    boardQuestions: [
      { id: 'bq1', status: 'published', verification_status: 'verified', difficulty: 'easy', subject_name: 'Math', concept_name: 'HCF', topic_name: 'Real Numbers' },
      { id: 'bq_draft', status: 'draft', verification_status: 'pending_verification', difficulty: 'easy', subject_name: 'Math', concept_name: 'HCF', topic_name: 'Real Numbers' },
      { id: 'bq_needs_review', status: 'published', verification_status: 'needs_review', difficulty: 'easy', subject_name: 'Math', concept_name: 'HCF', topic_name: 'Real Numbers' },
      { id: 'bq_no_concept', status: 'published', verification_status: 'verified', difficulty: 'easy', subject_name: 'Math', concept_name: null, topic_name: null },
    ],
    evidence: [], memoryWrites: [], historyWrites: [],
  };
}

(async () => {
  await test('G4 evidence gating: a draft (unpublished) question never produces evidence', async () => {
    const state = freshState();
    const { record } = loadBridge(state);
    const result = await record({ learnerId: 'l1', boardQuestionId: 'bq_draft', sourceAttemptId: 's1', evidenceType: 'board_practice_attempt', isCorrect: true });
    assert.strictEqual(result.written, false);
    assert.strictEqual(result.reason, 'QUESTION_NOT_VERIFIED_PUBLISHED');
    assert.strictEqual(state.evidence.length, 0);
  });

  await test('G4 evidence gating: a needs_review (unverified) question never produces evidence, even if published', async () => {
    const state = freshState();
    const { record } = loadBridge(state);
    const result = await record({ learnerId: 'l1', boardQuestionId: 'bq_needs_review', sourceAttemptId: 's1', evidenceType: 'board_practice_attempt', isCorrect: true });
    assert.strictEqual(result.written, false);
    assert.strictEqual(result.reason, 'QUESTION_NOT_VERIFIED_PUBLISHED');
  });

  await test('G4 evidence gating: a question with no concept mapped never produces evidence (cannot satisfy the NOT NULL concept column honestly)', async () => {
    const state = freshState();
    const { record } = loadBridge(state);
    const result = await record({ learnerId: 'l1', boardQuestionId: 'bq_no_concept', sourceAttemptId: 's1', evidenceType: 'board_practice_attempt', isCorrect: true });
    assert.strictEqual(result.written, false);
    assert.strictEqual(result.reason, 'NO_CONCEPT_MAPPED');
  });

  await test('G4 evidence gating: an unknown question id never produces evidence', async () => {
    const state = freshState();
    const { record } = loadBridge(state);
    const result = await record({ learnerId: 'l1', boardQuestionId: 'does-not-exist', sourceAttemptId: 's1', evidenceType: 'board_practice_attempt', isCorrect: true });
    assert.strictEqual(result.written, false);
    assert.strictEqual(result.reason, 'QUESTION_NOT_FOUND');
  });

  await test('G2: a valid published+verified question DOES produce real evidence and updates learning_memory', async () => {
    const state = freshState();
    const { record } = loadBridge(state);
    const result = await record({ learnerId: 'l1', boardQuestionId: 'bq1', sourceAttemptId: 's1', evidenceType: 'board_practice_attempt', isCorrect: true });
    assert.strictEqual(result.written, true);
    assert.strictEqual(state.evidence.length, 1);
    assert.strictEqual(state.evidence[0].concept, 'HCF');
    assert.strictEqual(state.evidence[0].correctness, 'correct');
    assert.strictEqual(result.snapshot.learningMemory['HCF'].status, 'insufficient_evidence', 'below MIN_EVIDENCE_FOR_JUDGEMENT=3, status must stay insufficient_evidence, not jump to mastered on one data point');
  });

  await test('Regression: the extracted shared engine still reaches mastered at exactly the same threshold as before the refactor (3+ correct, >=0.8 rate)', async () => {
    const state = freshState();
    const { record } = loadBridge(state);
    await record({ learnerId: 'l1', boardQuestionId: 'bq1', sourceAttemptId: 's1', evidenceType: 'board_practice_attempt', isCorrect: true });
    await record({ learnerId: 'l1', boardQuestionId: 'bq1', sourceAttemptId: 's2', evidenceType: 'board_practice_attempt', isCorrect: true });
    const result = await record({ learnerId: 'l1', boardQuestionId: 'bq1', sourceAttemptId: 's3', evidenceType: 'board_practice_attempt', isCorrect: true });
    assert.strictEqual(result.snapshot.learningMemory['HCF'].status, 'mastered');
    assert.strictEqual(result.snapshot.learningMemory['HCF'].evidenceCount, 3);
    assert.strictEqual(result.snapshot.learningMemory['HCF'].correctCount, 3);
  });

  await test('Regression: a mix of correct/incorrect at exactly 3 attempts lands on needs_revision, matching the original formula', async () => {
    const state = freshState();
    const { record } = loadBridge(state);
    await record({ learnerId: 'l1', boardQuestionId: 'bq1', sourceAttemptId: 's1', evidenceType: 'board_practice_attempt', isCorrect: false });
    await record({ learnerId: 'l1', boardQuestionId: 'bq1', sourceAttemptId: 's2', evidenceType: 'board_practice_attempt', isCorrect: false });
    const result = await record({ learnerId: 'l1', boardQuestionId: 'bq1', sourceAttemptId: 's3', evidenceType: 'board_practice_attempt', isCorrect: true });
    assert.strictEqual(result.snapshot.learningMemory['HCF'].status, 'needs_revision', 'correctRate 1/3 < LEARNING_THRESHOLD=0.5, must be needs_revision');
  });

  console.log(failures === 0 ? '\nALL M69 LEARNING MEMORY INTEGRATION TESTS PASSED' : `\n${failures} M69 TEST(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})();
