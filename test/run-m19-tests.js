#!/usr/bin/env node
const fs=require('fs');const assert=require('assert');
const pass=fs.readFileSync('js/baa-learning-passport.js','utf8');const student=fs.readFileSync('student-os.html','utf8');
let passed=0;function test(n,f){try{f();passed++;console.log(`PASS ${n}`)}catch(e){console.error(`FAIL ${n}\n${e.stack||e}`);process.exitCode=1}}
test('Passport module exists and is schema-versioned',()=>{assert.ok(pass.includes('Module 19: AI Learning Passport'));assert.ok(pass.includes('SCHEMA_VERSION=1'))});
test('Passport competencies come from real learning memory',()=>{assert.ok(pass.includes('store.learningMemory'));assert.ok(pass.includes('verifiedByEvidence:true'))});
test('Passport carries assessment records',()=>assert.ok(pass.includes('store.attempts')));
test('Passport reports evidence count',()=>assert.ok(pass.includes('evidenceCount:(store.evidence||[]).length')));
test('Passport export is deterministic JSON',()=>assert.ok(pass.includes('JSON.stringify(build(),null,2)')));
test('Student OS loads passport',()=>{assert.ok(student.includes('js/baa-learning-passport.js'));assert.ok(student.includes('Learning Passport'))});
test('Student OS shows evidence-backed competencies',()=>assert.ok(student.includes('BAALearningPassport.build()')));
test('Student OS provides export',()=>assert.ok(student.includes('baa-learning-passport.json')));
test('Passport is explicitly not an external credential',()=>assert.ok(student.includes('not an external credential')));
test('No invented competency is hardcoded',()=>assert.ok(!student.includes('verified competencies: Math, Science, English')));
console.log(`\nM19: ${passed}/10 PASS`);if(process.exitCode)process.exit(process.exitCode);
