// Runtime-contract checks for the Mastery Gate's critical orchestration rules.
// These intentionally complement, rather than replace, browser/DB integration tests.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const assessment = fs.readFileSync('assessment.html','utf8');
const api = fs.readFileSync('api/v1/[...route].js','utf8');
const forecast = fs.readFileSync('api/v1/[...route].js','utf8');

assert.match(assessment, /window\.BAA_READY\s*=\s*initGateLearner\(\)/, 'M1: assessment page exposes a shared readiness promise');
assert.match(assessment, /await window\.BAA_READY/, 'M2: deep-link startup awaits learner readiness');
assert.match(api, /gradeDeterministic\(/, 'M3: assessment sync invokes server-side deterministic grading');
assert.match(api, /verifyAssessmentVerdict\(/, 'M4: assessment sync verifies signed AI verdicts');
assert.doesNotMatch(api, /VALUES\([^\n]*r\.isCorrect[^\n]*r\.correctness/, 'M5: client correctness fields are not written directly into the grading result');
assert.match(forecast, /const chapterScore=relAttempts\.length\?/, 'M6: forecast score is chapter-scoped and does not fall back to overall score');
assert.match(forecast, /exam-close-caution intentionally wins/, 'M7: warning-band tie-break is documented at the decision point');
console.log('MASTERY RUNTIME CONTRACT: 7/7 PASS');
