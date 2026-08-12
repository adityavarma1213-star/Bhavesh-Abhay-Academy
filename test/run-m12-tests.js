#!/usr/bin/env node
/**
 * M12 — AI Guardian.
 * Academic-support signals only; no health/personality diagnosis.
 */
const fs=require('fs');
const assert=require('assert');
const guardian=fs.readFileSync('js/baa-guardian.js','utf8');
const student=fs.readFileSync('student-os.html','utf8');
let passed=0;
function test(name,fn){try{fn();passed++;console.log(`PASS ${name}`)}catch(e){console.error(`FAIL ${name}\n${e.stack||e}`);process.exitCode=1}}
test('Guardian module is explicit and scoped to academic support',()=>{assert.ok(guardian.includes('Module 12: AI Guardian'));assert.ok(guardian.includes('academic early-support signals only'));assert.ok(guardian.includes('does NOT'));assert.ok(guardian.includes('mental health'));});
test('Guardian detects repeated low academic performance',()=>{assert.ok(guardian.includes('repeated_low_performance'));assert.ok(guardian.includes('recent.length<3'));assert.ok(guardian.includes('correct<=1'))});
test('Guardian detects pending human review',()=>{assert.ok(guardian.includes('pending_human_review'));assert.ok(guardian.includes("teacherStatus==='pending'"))});
test('Guardian can use planner missed-task evidence',()=>{assert.ok(guardian.includes('missed_planner_tasks'));assert.ok(guardian.includes('getDailyPlan'));assert.ok(guardian.includes("status==='missed'"))});
test('Guardian alerts are explainable',()=>{assert.ok(guardian.includes('reason:'));assert.ok(guardian.includes('action:'));assert.ok(guardian.includes('requiresHumanReview'))});
test('Guardian state is persisted with a schema version',()=>{assert.ok(guardian.includes('baa_guardian_v1'));assert.ok(guardian.includes('schemaVersion:SCHEMA_VERSION'))});
test('Guardian supports acknowledgement',()=>{assert.ok(guardian.includes('acknowledgeAlert'));assert.ok(guardian.includes('resetAcknowledgements'))});
test('Student OS loads Guardian and exposes a dedicated world',()=>{assert.ok(student.includes('js/baa-guardian.js'));assert.ok(student.includes('id="world-guardian"'));assert.ok(student.includes("openWorld('guardian')"))});
test('Guardian UI states that alerts are not diagnoses',()=>{assert.ok(student.includes('does not diagnose you'));assert.ok(student.includes('academic-risk signal'))});
test('Guardian UI renders active signals from the real module',()=>{assert.ok(student.includes('BAAGuardian.getSummary()'));assert.ok(student.includes('BAAGuardian.acknowledgeAlert'))});
console.log(`\nM12: ${passed}/10 PASS`);
if(process.exitCode)process.exit(process.exitCode);
