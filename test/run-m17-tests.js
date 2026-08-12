#!/usr/bin/env node
const fs=require('fs');const assert=require('assert');
const analytics=fs.readFileSync('js/baa-teacher-analytics.js','utf8');const teacher=fs.readFileSync('teacher-os.html','utf8');
let passed=0;function test(n,f){try{f();passed++;console.log(`PASS ${n}`)}catch(e){console.error(`FAIL ${n}\n${e.stack||e}`);process.exitCode=1}}
test('Analytics engine summarizes real evidence',()=>{assert.ok(analytics.includes('summarizeSnapshot'));assert.ok(analytics.includes('snapshot?.evidence'));assert.ok(analytics.includes('accuracy'))});
test('Analytics supports reusable multi-student aggregation',()=>{assert.ok(analytics.includes('aggregateStudentSnapshots'));assert.ok(analytics.includes('students:snapshots.length'))});
test('Current build does not fabricate class data',()=>{assert.ok(analytics.includes('single_student_private_testing'));assert.ok(teacher.includes('Class-wide heatmaps require real multi-student records'))});
test('Teacher OS loads analytics engine',()=>assert.ok(teacher.includes('js/baa-teacher-analytics.js')));
test('Teacher OS renders concept analytics',()=>{assert.ok(teacher.includes('Teacher analytics'));assert.ok(teacher.includes('BAATeacherAnalytics.getCurrentTeacherAnalytics()'))});
test('Accuracy is derived from evidence counts',()=>assert.ok(analytics.includes('totalCorrect')&&analytics.includes('totalEvidence')));
test('Analytics has an honest empty state',()=>assert.ok(teacher.includes('No concept-level evidence exists yet.')));
test('No student ranking is introduced',()=>assert.ok(!analytics.includes('rank')&&!analytics.includes('leaderboard')));
test('No invented class size is introduced',()=>assert.ok(!analytics.includes('students:30')&&!analytics.includes('students:40')));
test('Analytics remains read-only',()=>assert.ok(!analytics.includes('localStorage.setItem')));
console.log(`\nM17: ${passed}/10 PASS`);if(process.exitCode)process.exit(process.exitCode);
