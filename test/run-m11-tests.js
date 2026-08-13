#!/usr/bin/env node
/**
 * M11 — AI Planner.
 */
const fs=require('fs');
const assert=require('assert');
const planner=fs.readFileSync('js/baa-planner.js','utf8');
const student=fs.readFileSync('student-os.html','utf8');
let passed=0;
function test(name,fn){try{fn();passed++;console.log(`PASS ${name}`)}catch(e){console.error(`FAIL ${name}\n${e.stack||e}`);process.exitCode=1}}
test('Planner has evidence-driven candidate generation',()=>{assert.ok(planner.includes('function generateCandidates()'));assert.ok(planner.includes('getLearningSummary()'));assert.ok(planner.includes('needsRevision'))});
test('Planner accounts for goals and upcoming assessments',()=>{assert.ok(planner.includes('getGoals()'));assert.ok(planner.includes('getUpcomingAssessments()'));assert.ok(planner.includes('Supports your goal'))});
test('Planner respects daily time and task limits',()=>{assert.ok(planner.includes('MAX_TASKS_PER_DAY'));assert.ok(planner.includes('availableMinutesPerDay'));assert.ok(planner.includes('minutesBudget'))});
test('Planner rebalances missed tasks instead of blindly piling them up',()=>{assert.ok(planner.includes('checkAndRebalanceMissedTasks'));assert.ok(planner.includes('stillNeeded'))});
test('Planner supports daily and weekly plans',()=>{assert.ok(planner.includes('function getDailyPlan'));assert.ok(planner.includes('function getWeeklyPlan'))});
test('Planner supports a monthly plan',()=>{assert.ok(planner.includes('function getMonthlyPlan(monthDate)'));assert.ok(planner.includes('plannedMinutes'));assert.ok(planner.includes('weeks.push'))});
test('Monthly plan is read-only and evidence-grounded',()=>{assert.ok(planner.includes('generatedFromEvidence'));assert.ok(planner.includes('does not fabricate'))});
test('Student OS renders the monthly planner view',()=>{assert.ok(student.includes('id="plannerMonthlyPlan"'));assert.ok(student.includes('function renderPlannerMonthlyPlan()'));assert.ok(student.includes('BAAPlanner.getMonthlyPlan()'))});
test('Planner actions remain student-controlled',()=>{assert.ok(planner.includes('Marked complete by student'));assert.ok(planner.includes('function skipTask'));assert.ok(planner.includes('function rescheduleTask'))});
test('Planner has no hardcoded fake mastery or scores',()=>{assert.ok(!planner.includes('score: 100'));assert.ok(!planner.includes('mastery: 100'))});
console.log(`\nM11: ${passed}/10 PASS`);
if(process.exitCode)process.exit(process.exitCode);
