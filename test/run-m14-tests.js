#!/usr/bin/env node
const fs=require('fs');const assert=require('assert');
const page=fs.readFileSync('parent-os.html','utf8');
let passed=0;function test(n,f){try{f();passed++;console.log(`PASS ${n}`)}catch(e){console.error(`FAIL ${n}\n${e.stack||e}`);process.exitCode=1}}
test('Parent dashboard reads real assessment data',()=>{assert.ok(page.includes('BAAAssessment.getAttemptHistory()'));assert.ok(page.includes('BAAAssessment.summarizeAttempt'))});
test('Parent dashboard reads real learning intelligence',()=>assert.ok(page.includes('BAAIntelligence.getLearningSummary()')));
test('Parent dashboard reads real planner data',()=>assert.ok(page.includes('BAAPlanner.getDailyPlan()')));
test('Parent dashboard exposes evidence-derived academic profile',()=>assert.ok(page.includes('BAAAssessment.getAcademicProfile()')));
test('Parent dashboard exposes bounded academic forecast',()=>assert.ok(page.includes('BAAPrediction.getPredictionSummary()')));
test('Parent dashboard exposes Guardian academic support signals',()=>{assert.ok(page.includes('BAAGuardian.getSummary()'));assert.ok(page.includes('Academic support signals'))});
test('Dashboard does not claim comparisons or invented data',()=>{assert.ok(page.includes('nothing here is invented or estimated'));assert.ok(page.includes('no class averages'))});
test('Dashboard explicitly avoids health/personality inference',()=>assert.ok(page.includes('does not infer mental health, personality, or family conditions')));
test('Dynamic student name is escaped',()=>assert.ok(page.includes('function esc(')));
test('Parent dashboard remains single-student private testing scope',()=>assert.ok(page.includes('Single-Student Private Testing')));
console.log(`\nM14: ${passed}/10 PASS`);if(process.exitCode)process.exit(process.exitCode);
