#!/usr/bin/env node
/**
 * M9 — AI Learning Memory.
 */
const fs=require('fs');
const assert=require('assert');
const data=fs.readFileSync('js/baa-assessment.js','utf8');
const page=fs.readFileSync('student-os.html','utf8');
let passed=0;
function test(name,fn){try{fn();passed++;console.log(`PASS ${name}`)}catch(e){console.error(`FAIL ${name}\n${e.stack||e}`);process.exitCode=1}}
test('Store contains a versioned academic profile',()=>{assert.ok(data.includes('academicProfile: { schemaVersion: 1'));assert.ok(data.includes('schemaVersion: 1'))});
test('Strengths come from evidence-backed learning memory',()=>{assert.ok(data.includes('function refreshAcademicProfile(store)'));assert.ok(data.includes("m.status === 'mastered' || m.status === 'strong'"))});
test('Weaknesses come from evidence-backed learning memory',()=>assert.ok(data.includes("m.status === 'needs_revision' || m.status === 'struggling'")));
test('Learning habits are academic activity metrics',()=>{assert.ok(data.includes('assessmentsCompleted'));assert.ok(data.includes('activeLearningDays'));assert.ok(data.includes('reattemptRate'));assert.ok(data.includes('mostPracticedSubject'))});
test('Profile refreshes after assessment evidence',()=>assert.ok(data.includes('refreshAcademicProfile(store);\n    save(store);')));
test('Homework evidence refreshes the profile',()=>assert.ok(data.includes('updateMistakePatterns(store, fresh);\n    refreshAcademicProfile(store);')));
test('Profile is exposed through the public API',()=>assert.ok(data.includes('getAcademicProfile')));
test('Student OS has a persistent Academic Profile panel',()=>{assert.ok(page.includes('id="pfAcademicProfileDynamic"'));assert.ok(page.includes('BAAAssessment.getAcademicProfile()'))});
test('Profile is labelled evidence-based',()=>{assert.ok(page.includes('Evidence-based'));assert.ok(page.includes('Persistent evidence'))});
test('No hardcoded personal strengths/weaknesses are shipped',()=>{assert.ok(!page.includes('strengths: [')&&!page.includes('weaknesses: ['))});
console.log(`\nM9: ${passed}/10 PASS`);
if(process.exitCode)process.exit(process.exitCode);
