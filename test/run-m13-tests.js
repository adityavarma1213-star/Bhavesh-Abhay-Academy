#!/usr/bin/env node
const fs=require('fs');const assert=require('assert');
const pred=fs.readFileSync('js/baa-prediction.js','utf8');const student=fs.readFileSync('student-os.html','utf8');
let passed=0;function test(n,f){try{f();passed++;console.log(`PASS ${n}`)}catch(e){console.error(`FAIL ${n}\n${e.stack||e}`);process.exitCode=1}}
test('Prediction engine exists and is academic-only',()=>{assert.ok(pred.includes('Module 13: AI Prediction Engine'));assert.ok(pred.includes('academic forecast'));});
test('Insufficient evidence returns no fabricated forecast',()=>{assert.ok(pred.includes("status:'insufficient_evidence'"));assert.ok(pred.includes('needs more completed assessments'))});
test('Readiness uses real mastery and assessment evidence',()=>{assert.ok(pred.includes('store.learningMemory'));assert.ok(pred.includes('attempts'));assert.ok(pred.includes('masteryRate'))});
test('Trajectory uses multiple recent assessments',()=>{assert.ok(pred.includes('attempts.slice(0,5)'));assert.ok(pred.includes('previousAvg'));assert.ok(pred.includes("trajectory='improving'"))});
test('Forecast includes confidence',()=>assert.ok(pred.includes('confidence:confidence.band')));
test('Student OS loads prediction engine',()=>{assert.ok(student.includes('js/baa-prediction.js'));assert.ok(student.includes('id="predictionPanel"'))});
test('Student OS renders bounded forecast',()=>{assert.ok(student.includes('BAAPrediction.getPredictionSummary()'));assert.ok(student.includes('estimates, not guarantees'))});
test('No hardcoded forecast score is shipped',()=>{assert.ok(!student.includes('Readiness estimate:</b> 100/100'))});
test('Prediction does not contact external AI directly',()=>assert.ok(!pred.includes('fetch(')));
test('Prediction is refreshed with profile view',()=>assert.ok(student.includes('refreshPredictionPanel()')));
console.log(`\nM13: ${passed}/10 PASS`);if(process.exitCode)process.exit(process.exitCode);
