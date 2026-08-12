// Behavioral tests for the Homework Scanner server-trust boundary (M8),
// mirroring test/run-assessment-integrity-tests.js. These execute the real
// verdict-signing/verification implementation, not source-text matching.
import assert from 'node:assert/strict';
process.env.ASSESSMENT_VERDICT_SECRET = 'test-only-assessment-verdict-secret';
const { issueHomeworkVerdict, verifyHomeworkVerdict, hashHomeworkText } = await import('../api/_lib/assessment-verdict.js');

let passed = 0;
function ok(value, message) { assert.equal(Boolean(value), true, message); passed++; console.log('PASS:', message); }

const textA = 'Photosynthesis converts light energy into chemical energy.';
const textB = 'A completely different, much weaker submission.';
const hashA = hashHomeworkText(textA);
const hashB = hashHomeworkText(textB);
ok(hashA !== hashB, 'H1: different submission text hashes differently');

const token = issueHomeworkVerdict({
  submissionId: 'sub_1', textHash: hashA, overallAssessment: 'strong',
  confidence: 'high', humanReviewRequired: false, learningSignals: [],
});
ok(typeof token === 'string' && token.split('.').length === 2, 'H2: homework evaluation produces a signed verdict token');

const verified = verifyHomeworkVerdict(token, { submissionId: 'sub_1', textHash: hashA });
ok(verified.ok && verified.verdict.overallAssessment === 'strong', 'H3: the real signed verdict verifies for the exact submission/text');

const swappedText = verifyHomeworkVerdict(token, { submissionId: 'sub_1', textHash: hashB });
ok(!swappedText.ok && swappedText.code === 'VERDICT_TEXT_MISMATCH', 'H4: a verdict cannot be reused after the submitted text is swapped');

const swappedSubmission = verifyHomeworkVerdict(token, { submissionId: 'sub_999', textHash: hashA });
ok(!swappedSubmission.ok && swappedSubmission.code === 'VERDICT_SUBMISSION_MISMATCH', 'H5: a verdict cannot be replayed onto another submission');

const tamperedPayload = Buffer.from(JSON.stringify({ ...verified.verdict, overallAssessment: 'needs_improvement' })).toString('base64url');
const tampered = `${tamperedPayload}.${token.split('.')[1]}`;
const tamperedCheck = verifyHomeworkVerdict(tampered, { submissionId: 'sub_1', textHash: hashA });
ok(!tamperedCheck.ok, 'H6: editing the verdict payload (e.g. weak-work upgraded to strong) without recomputing its signature is rejected');

const noToken = verifyHomeworkVerdict(undefined, { submissionId: 'sub_1', textHash: hashA });
ok(!noToken.ok && noToken.code === 'VERDICT_UNAVAILABLE', 'H7: a missing token is never treated as a valid evaluation');

const noSecret = (() => { delete process.env.ASSESSMENT_VERDICT_SECRET; return issueHomeworkVerdict({ submissionId: 'sub_1', textHash: hashA, overallAssessment: 'strong' }); })();
process.env.ASSESSMENT_VERDICT_SECRET = 'test-only-assessment-verdict-secret';
ok(noSecret === null, 'H8: without a configured server secret, no verdict token is issued (fails closed, never fabricates trust)');

console.log(`HOMEWORK INTEGRITY: ${passed}/8 PASS`);
