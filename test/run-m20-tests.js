#!/usr/bin/env node
const fs=require('fs');const assert=require('assert');
const career=fs.readFileSync('js/baa-career.js','utf8');const student=fs.readFileSync('student-os.html','utf8');
let passed=0;function test(n,f){try{f();passed++;console.log(`PASS ${n}`)}catch(e){console.error(`FAIL ${n}\n${e.stack||e}`);process.exitCode=1}}
test('Career module has explicit exploratory tracks',()=>{assert.ok(career.includes('Space & Aerospace'));assert.ok(career.includes('Software Development'));assert.ok(career.includes('STEM Research'));assert.ok(career.includes('Data & AI'))});
test('Career plan reads real academic profile evidence',()=>assert.ok(career.includes('BAAAssessment.getAcademicProfile()')));
test('Career plan identifies evidence and gaps',()=>{assert.ok(career.includes('evidence_present'));assert.ok(career.includes('not_yet_tracked'));assert.ok(career.includes('gaps'))});
test('Career plan includes a disclaimer against certainty',()=>assert.ok(career.includes('not a prediction or guarantee')));
test('Student OS loads career module',()=>assert.ok(student.includes('js/baa-career.js')));
test('Student OS replaces fake career preview with dynamic track UI',()=>{assert.ok(student.includes('careerTrackSelect'));assert.ok(student.includes('careerPlanDynamic'));assert.ok(!student.includes('Estimated 3.5 years along your current pace'))});
test('Career plan refreshes on career world open',()=>assert.ok(student.includes("if(name==='career') refreshCareerPlan();")));
test('Career UI explains skill gaps',()=>assert.ok(student.includes('Skills to explore next')));
test('No job/salary/admission guarantee is made',()=>{assert.ok(!career.includes('guaranteed job'));assert.ok(!career.includes('guaranteed salary'));assert.ok(!career.includes('guaranteed admission'))});
test('Career engine does not call external AI directly',()=>assert.ok(!career.includes('fetch(')));
console.log(`\nM20: ${passed}/10 PASS`);if(process.exitCode)process.exit(process.exitCode);
