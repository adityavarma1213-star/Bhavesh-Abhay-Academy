// Behavioral tests for the server-trust boundary introduced by the Mastery Gate audit.
// These execute the real verdict-signing/verification implementation, rather than merely
// searching source text. Full API/DB integration still requires a PostgreSQL test instance.
import assert from 'node:assert/strict';
process.env.ASSESSMENT_VERDICT_SECRET = 'test-only-assessment-verdict-secret';
const { issueAssessmentVerdict, verifyAssessmentVerdict, gradeDeterministic } = await import('../api/_lib/assessment-verdict.js');

let passed = 0;
function ok(value, message) { assert.equal(Boolean(value), true, message); passed++; console.log('PASS:', message); }

const wrong = gradeDeterministic('B', 'C', 1);
ok(wrong.isCorrect === false && wrong.score === 0 && wrong.correctness === 'incorrect', 'I1: deterministic server grading rejects a forged client claim when the stored answer key says C');

const right = gradeDeterministic('C', 'C', 1);
ok(right.isCorrect === true && right.score === 1 && right.correctness === 'correct', 'I2: deterministic server grading accepts the actual stored answer');

const token = issueAssessmentVerdict({
  attemptId: 'attempt_1', questionId: 'q_1', gradingMode: 'ai', score: 2,
  maxScore: 2, correctness: 'correct', errors: [], missingConcepts: [], confidence: 'high', humanReviewRequired: false,
});
ok(typeof token === 'string' && token.split('.').length === 2, 'I3: AI grading produces a signed verdict token');

const verified = verifyAssessmentVerdict(token, { attemptId: 'attempt_1', questionId: 'q_1' });
ok(verified.ok && verified.verdict.correctness === 'correct' && verified.verdict.score === 2, 'I4: the real signed verdict verifies for the exact attempt/question');

const forgedPayload = Buffer.from(JSON.stringify({...verified.verdict, correctness:'incorrect', score:0})).toString('base64url');
const forged = `${forgedPayload}.${token.split('.')[1]}`;
const forgedCheck = verifyAssessmentVerdict(forged, { attemptId: 'attempt_1', questionId: 'q_1' });
ok(!forgedCheck.ok, 'I5: editing the verdict payload without recomputing its signature is rejected');

const wrongAttempt = verifyAssessmentVerdict(token, { attemptId: 'attempt_999', questionId: 'q_1' });
ok(!wrongAttempt.ok && wrongAttempt.code === 'VERDICT_ATTEMPT_MISMATCH', 'I6: a valid verdict cannot be replayed for another attempt');

const wrongQuestion = verifyAssessmentVerdict(token, { attemptId: 'attempt_1', questionId: 'q_999' });
ok(!wrongQuestion.ok && wrongQuestion.code === 'VERDICT_QUESTION_MISMATCH', 'I7: a valid verdict cannot be replayed for another question');

console.log(`ASSESSMENT INTEGRITY: ${passed}/7 PASS`);
