#!/usr/bin/env node
const fs=require('fs');const assert=require('assert');const vm=require('vm');
const analytics=fs.readFileSync('js/baa-teacher-analytics.js','utf8');
const teacher=fs.readFileSync('teacher-os.html','utf8');
const endpoint=fs.readFileSync('api/v1/[...route].js','utf8');
let passed=0;function test(n,f){try{f();passed++;console.log(`PASS ${n}`)}catch(e){console.error(`FAIL ${n}\n${e.stack||e}`);process.exitCode=1}}

test('Analytics engine summarizes real evidence',()=>{assert.ok(analytics.includes('snapshot?.evidence'));assert.ok(analytics.includes('accuracy'))});
test('Analytics aggregation produces a real two-student result',()=>{const ctx={window:{}};vm.runInNewContext(analytics,ctx);const r=ctx.window.BAATeacherAnalytics.aggregateStudentSnapshots([{evidence:[{concept:'algebra',subject:'Math',correctness:'correct'},{concept:'algebra',subject:'Math',correctness:'incorrect'}]},{evidence:[{concept:'algebra',subject:'Math',correctness:'correct'}]}]);assert.strictEqual(r.students,2);assert.strictEqual(r.concepts[0].totalEvidence,3);assert.strictEqual(r.concepts[0].totalCorrect,2);assert.strictEqual(r.concepts[0].accuracy,67)});
test('M17 does not fabricate a local class size',()=>{assert.ok(!analytics.includes("students:1"));assert.ok(!analytics.includes('single_student_private_testing'));assert.ok(analytics.includes('server_class_analytics_required'))});
test('Server M17 endpoint exists and is teacher-authorized',()=>{assert.ok(endpoint.includes("hasRole(s,'teacher')"));assert.ok(endpoint.includes('class_members'));assert.ok(endpoint.includes('teacherOwnsClass'))});
test('Server M17 aggregates across distinct learners',()=>{assert.ok(endpoint.includes('COUNT(DISTINCT learner_id)'));assert.ok(endpoint.includes('GROUP BY subject,chapter,topic,concept'));assert.ok(endpoint.includes('WHERE learner_id=ANY(${memberIds})'))});
test('Teacher OS uses the server class analytics endpoint',()=>{assert.ok(teacher.includes("fetch('/api/v1/class-analytics'"));assert.ok(teacher.includes('/api/v1/class-analytics?classId='));assert.ok(teacher.includes('Class-wide learning intelligence'))});
test('Teacher OS no longer labels local data as class analytics',()=>{assert.ok(!teacher.includes('Current scope: single-student private testing'))});
test('No student ranking is introduced',()=>assert.ok(!analytics.includes('leaderboard')));
test('Analytics remains read-only',()=>assert.ok(!analytics.includes('localStorage.setItem')));
console.log(`\nM17: ${passed}/9 PASS`);if(process.exitCode)process.exit(process.exitCode);
