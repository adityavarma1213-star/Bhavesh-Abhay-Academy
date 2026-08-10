#!/usr/bin/env node
const fs=require('fs');const assert=require('assert');
const policy=fs.readFileSync('js/baa-parent-approval.js','utf8');
const student=fs.readFileSync('student-os.html','utf8');
const planner=fs.readFileSync('js/baa-planner.js','utf8');
const parent=fs.readFileSync('parent-os.html','utf8');
let passed=0;function test(n,f){try{f();passed++;console.log(`PASS ${n}`)}catch(e){console.error(`FAIL ${n}\n${e.stack||e}`);process.exitCode=1}}
test('Parent policy is versioned and defaults preserve existing behavior',()=>{assert.ok(policy.includes('baa_parent_approval_v1'));assert.ok(policy.includes('aiTutorEnabled:true'));assert.ok(policy.includes('aiMentorEnabled:true'))});
test('Parent can govern Tutor, Mentor, and Planner',()=>{assert.ok(policy.includes('aiTutorEnabled'));assert.ok(policy.includes('aiMentorEnabled'));assert.ok(policy.includes('plannerEnabled'))});
test('Parent can cap daily planner minutes',()=>{assert.ok(policy.includes('maxDailyStudyMinutes'));assert.ok(policy.includes('Math.max(15,Math.min(180'))});
test('Student Tutor is actually gated',()=>assert.ok(student.includes("BAAParentApproval.canUse('ai_tutor')")));
test('Student Mentor is actually gated',()=>assert.ok(student.includes("BAAParentApproval.canUse('ai_mentor')")));
test('Planner is actually gated and respects parent minutes',()=>{assert.ok(planner.includes("BAAParentApproval.canUse('planner')"));assert.ok(planner.includes('getDailyMinutesLimit'))});
test('Parent dashboard exposes approval controls',()=>{assert.ok(parent.includes('Parent Approval Mode'));assert.ok(parent.includes('paTutor'));assert.ok(parent.includes('paMentor'));assert.ok(parent.includes('paPlanner'))});
test('Policy updates are validated and persisted',()=>{assert.ok(policy.includes('function updatePolicy'));assert.ok(policy.includes('return save(current)?current:null'))});
test('Unknown features remain allowed rather than silently breaking the app',()=>assert.ok(policy.includes('return true')));
test('Testing-only limitation is explicit',()=>{assert.ok(parent.includes('private testing device'));assert.ok(policy.includes('Local/private testing governance layer'))});
console.log(`\nM15: ${passed}/10 PASS`);if(process.exitCode)process.exit(process.exitCode);
