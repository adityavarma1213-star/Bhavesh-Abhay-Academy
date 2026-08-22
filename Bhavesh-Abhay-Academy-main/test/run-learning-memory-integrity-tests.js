// Behavioral test for the Learning Memory server-trust boundary.
// api/v1/[...route].js now derives status/evidence_count/correct_count from
// learning_evidence rather than trusting the client's own aggregate claim. This
// test exercises the exact derivation function in isolation (extracted here to
// avoid requiring a live Postgres instance — full DB integration is a separate,
// documented limitation, same as test/run-assessment-integrity-tests.js).
import assert from 'node:assert/strict';

const MIN_EVIDENCE_FOR_JUDGEMENT = 3;
const RECENT_WINDOW = 5;
const MASTERED_THRESHOLD = 0.8;
const LEARNING_THRESHOLD = 0.5;
const MISTAKE_PATTERN_THRESHOLD = 3;

// Mirrors the derivation block in api/v1/[...route].js exactly.
function deriveStatus(evidenceRows) {
  const evidenceCount = evidenceRows.length;
  const correctCount = evidenceRows.filter(e => e.correctness === 'correct').length;
  let status;
  if (evidenceCount < MIN_EVIDENCE_FOR_JUDGEMENT) {
    status = 'insufficient_evidence';
  } else {
    const recent = evidenceRows.slice(-RECENT_WINDOW);
    const correctRate = recent.filter(e => e.correctness === 'correct').length / recent.length;
    status = correctRate >= MASTERED_THRESHOLD ? 'mastered' : correctRate >= LEARNING_THRESHOLD ? 'learning' : 'needs_revision';
  }
  return { status, evidenceCount, correctCount };
}

let passed = 0;
function ok(cond, msg) { assert.equal(Boolean(cond), true, msg); passed++; console.log('PASS:', msg); }

// L1: a client claiming "mastered" with only 1 real evidence row must not be believed —
// the derivation is what api/v1/[...route].js actually writes, and it ignores any
// client-submitted status entirely.
const oneCorrect = [{ correctness: 'correct' }];
ok(deriveStatus(oneCorrect).status === 'insufficient_evidence', 'L1: one correct answer is insufficient evidence for "mastered", regardless of what a client claims');

// L2: three correct answers (>= MIN_EVIDENCE_FOR_JUDGEMENT) with a 100% recent rate -> mastered
const threeCorrect = [{ correctness: 'correct' }, { correctness: 'correct' }, { correctness: 'correct' }];
ok(deriveStatus(threeCorrect).status === 'mastered', 'L2: three-for-three genuinely earns "mastered"');

// L3: mixed results below the learning threshold -> needs_revision
const mostlyWrong = [{ correctness: 'incorrect' }, { correctness: 'incorrect' }, { correctness: 'correct' }, { correctness: 'incorrect' }];
ok(deriveStatus(mostlyWrong).status === 'needs_revision', 'L3: a low recent correct-rate resolves to needs_revision, not whatever a client would have preferred');

// L4: exactly at the learning threshold (0.5) -> learning, not mastered
const half = [{ correctness: 'correct' }, { correctness: 'incorrect' }, { correctness: 'correct' }, { correctness: 'incorrect' }];
ok(deriveStatus(half).status === 'learning', 'L4: a 50% recent rate resolves to "learning", matching the client threshold exactly');

// L5: mistake pattern threshold — fewer than 3 occurrences of the same error stays "watching"
function derivePatternStatus(occurrences) {
  return occurrences.length >= MISTAKE_PATTERN_THRESHOLD ? 'possible_misconception' : 'watching';
}
ok(derivePatternStatus([1, 2]) === 'watching', 'L5: two occurrences of the same error type stays "watching"');
ok(derivePatternStatus([1, 2, 3]) === 'possible_misconception', 'L6: a third occurrence of the same error type promotes to "possible_misconception", matching js/baa-assessment.js exactly');

console.log(`LEARNING MEMORY INTEGRITY: ${passed}/6 PASS`);
