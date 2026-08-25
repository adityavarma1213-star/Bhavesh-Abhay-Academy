#!/usr/bin/env node
const fs=require('fs'),assert=require('assert');
const career=fs.readFileSync('js/baa-career.js','utf8');const student=fs.readFileSync('student-os.html','utf8');
let passed=0;function test(n,f){try{f();passed++;console.log(`PASS ${n}`)}catch(e){console.error(`FAIL ${n}\n${e.stack||e}`);process.exitCode=1}}
test('Career module has explicit exploratory tracks',()=>{assert.ok(career.includes('Space & Aerospace'));assert.ok(career.includes('Software Development'));assert.ok(career.includes('STEM Research'));assert.ok(career.includes('Data & AI'))});
test('Career plan reads real academic profile evidence',()=>assert.ok(career.includes('BAAAssessment.getAcademicProfile()')));
test('Career plan identifies evidence and gaps',()=>{assert.ok(career.includes('not_yet_tracked'));assert.ok(career.includes('gaps'))});
test('Career plan includes a disclaimer against certainty',()=>assert.ok(career.includes('not a prediction or guarantee')));
test('Career module exposes server-backed load',()=>assert.ok(career.includes('/api/m20-career.js')));
test('Career module exposes rendered mount',()=>assert.ok(career.includes('data-career-signals')&&career.includes('global.BAACareer')));
test('Student OS loads career module',()=>assert.ok(student.includes('js/baa-career.js')));
test('No job/salary/admission guarantee is made',()=>{assert.ok(!career.includes('guaranteed job'));assert.ok(!career.includes('guaranteed salary'));assert.ok(!career.includes('guaranteed admission'))});
test('Career guidance remains exploratory',()=>assert.ok(career.includes('Consequential decisions should be reviewed')));
console.log(`\nM20: ${passed}/9 PASS`);if(process.exitCode)process.exit(process.exitCode);
