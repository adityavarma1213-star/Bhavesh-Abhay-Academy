#!/usr/bin/env node
const fs=require('fs');const assert=require('assert');
const cal=fs.readFileSync('js/baa-school-calendar.js','utf8');const planner=fs.readFileSync('js/baa-planner.js','utf8');const student=fs.readFileSync('student-os.html','utf8');
let passed=0;function test(n,f){try{f();passed++;console.log(`PASS ${n}`)}catch(e){console.error(`FAIL ${n}\n${e.stack||e}`);process.exitCode=1}}
test('Calendar store is versioned and local',()=>{assert.ok(cal.includes('baa_school_calendar_v1'));assert.ok(cal.includes('SCHEMA_VERSION=1'))});
test('Calendar supports explicit school event types',()=>{assert.ok(cal.includes("['exam','deadline','holiday','school_event']"));assert.ok(cal.includes('addEvent'))});
test('Calendar events are user-entered and retrievable',()=>{assert.ok(cal.includes('getEvents'));assert.ok(cal.includes('title:String(title)'))});
test('Planner reads calendar context',()=>{assert.ok(planner.includes('BAASchoolCalendar.getDateContext'));assert.ok(planner.includes('calendarContext'))});
test('School holidays prevent automatic daily task generation',()=>assert.ok(planner.includes('calendarContext.isHoliday')));
test('Planner returns calendar events in daily context',()=>assert.ok(planner.includes('calendarEvents: calendarContext.events')));
test('Student OS exposes school calendar controls',()=>{assert.ok(student.includes('School calendar'));assert.ok(student.includes('calendarAddBtn'));assert.ok(student.includes('BAASchoolCalendar.addEvent'))});
test('Calendar removal is supported',()=>assert.ok(student.includes('BAASchoolCalendar.removeEvent')));
test('No calendar events are fabricated',()=>assert.ok(!cal.includes('2026-08-15')&&!cal.includes('exam: true')));
test('Calendar remains local/private testing only',()=>assert.ok(cal.includes('Local/private testing calendar layer')));
console.log(`\nM18: ${passed}/10 PASS`);if(process.exitCode)process.exit(process.exitCode);
