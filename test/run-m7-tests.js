#!/usr/bin/env node
/**
 * M7 — Transparent AI Evaluation.
 */
const fs=require('fs');
const assert=require('assert');
const api=fs.readFileSync('api/evaluate.js','utf8');
const data=fs.readFileSync('js/baa-assessment.js','utf8');
const page=fs.readFileSync('assessment.html','utf8');
let passed=0;
function test(name,fn){try{fn();passed++;console.log(`PASS ${name}`)}catch(e){console.error(`FAIL ${name}\n${e.stack||e}`);process.exitCode=1}}
test('Evaluator requests a structured rubric',()=>{assert.ok(api.includes('"rubric": [{"criterion"'));assert.ok(api.includes('1-4 concrete criteria'));assert.ok(api.includes('Rubric scores should add up'))});
test('Evaluator includes confidence and review fields',()=>{assert.ok(api.includes('"confidence": "high" | "medium" | "low"'));assert.ok(api.includes('"humanReviewRequired": <true|false>'));assert.ok(api.includes('Do not present an uncertain judgement as a guaranteed fact'))});
test('Evaluator validates rubric structure',()=>{assert.ok(api.includes('Array.isArray(parsed.rubric)'));assert.ok(api.includes('clampScore(Number(item?.score)'));assert.ok(api.includes('item?.maxScore'))});
test('Evaluator parse failure remains unscored',()=>{assert.ok(api.includes('score: null'));assert.ok(api.includes('humanReviewRequired: true'));assert.ok(api.includes('did not return a readable result'))});
test('Assessment layer stores rubric',()=>{assert.ok(data.includes('rubric: Array.isArray(result.rubric)'));assert.ok(data.includes('rubric: qResult.rubric'))});
test('Original AI evaluation is preserved',()=>{assert.ok(data.includes('originalAiEvaluation'));assert.ok(data.includes('qResult.originalAiEvaluation ='))});
test('Student results show marking rationale',()=>{assert.ok(page.includes('How this was marked'));assert.ok(page.includes('item.criterion'));assert.ok(page.includes('item.evidence'))});
test('Student results show confidence/review status',()=>{assert.ok(page.includes('AI confidence: ${r.confidence}'));assert.ok(page.includes('Flagged for human review'))});
test('Teacher review remains available',()=>{assert.ok(page.includes('teacher-review.html'));assert.ok(data.includes('getTeacherReviewQueue'));assert.ok(data.includes('submitTeacherReview'))});
test('Temporary evaluator debug logs are removed',()=>assert.ok(!api.includes('[DEBUG evaluate]')));
console.log(`\nM7: ${passed}/10 PASS`);
if(process.exitCode)process.exit(process.exitCode);
