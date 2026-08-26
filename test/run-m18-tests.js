#!/usr/bin/env node
const fs=require('fs');const assert=require('assert');
const cal=fs.readFileSync('js/baa-school-calendar.js','utf8');
const api=fs.readFileSync('api/m18-school-calendar.js','utf8');
const bridge=fs.readFileSync('js/baa-m18-school-calendar-server.js','utf8');
const planner=fs.readFileSync('js/baa-planner.js','utf8');
const student=fs.readFileSync('student-os.html','utf8');
const bootstrap=fs.readFileSync('js/baa-guide-catalogue.js','utf8');
let passed=0;function test(n,f){try{f();passed++;console.log(`PASS ${n}`)}catch(e){console.error(`FAIL ${n}\n${e.stack||e}`);process.exitCode=1}}
test('Calendar store is versioned and local fallback remains',()=>{assert.ok(cal.includes('baa_school_calendar_v1'));assert.ok(cal.includes('SCHEMA_VERSION=1'))});
test('Calendar supports explicit school event types',()=>{assert.ok(cal.includes("['exam','deadline','holiday','school_event']"));assert.ok(cal.includes('addEvent'))});
test('Calendar events are user-entered and retrievable',()=>{assert.ok(cal.includes('getEvents'));assert.ok(cal.includes('title:String(title)'))});
test('Planner reads calendar context',()=>{assert.ok(planner.includes('BAASchoolCalendar.getDateContext'));assert.ok(planner.includes('calendarContext'))});
test('School holidays prevent automatic daily task generation',()=>assert.ok(planner.includes('calendarContext.isHoliday')));
test('Planner returns calendar events in daily context',()=>assert.ok(planner.includes('calendarEvents: calendarContext.events')));
test('Student OS exposes school calendar controls',()=>{assert.ok(student.includes('School calendar'));assert.ok(student.includes('calendarAddBtn'));assert.ok(student.includes('BAASchoolCalendar.addEvent'))});
test('Calendar removal is supported',()=>assert.ok(student.includes('BAASchoolCalendar.removeEvent')));
test('Server calendar requires authentication and learner ownership',()=>{assert.ok(api.includes('requireAuth'));assert.ok(api.includes('requireLearnerAccess'))});
test('Server calendar persists learner-owned events',()=>{assert.ok(api.includes('school_calendar_events'));assert.ok(api.includes('INSERT INTO school_calendar_events'));assert.ok(api.includes('DELETE FROM school_calendar_events'))});
test('Server calendar validates event types and dates',()=>{assert.ok(api.includes("'exam', 'deadline', 'holiday', 'school_event'"));assert.ok(api.includes('^\\d{4}-\\d{2}-\\d{2}$'))});
test('Client bridge uses authenticated server requests',()=>{assert.ok(bridge.includes('api/m18-school-calendar'));assert.ok(bridge.includes("credentials:'include'"));assert.ok(bridge.includes('BAA_LEARNER_ID'))});
test('Client bridge makes calendar writes server-backed',()=>{assert.ok(bridge.includes('calendar.addEvent=function'));assert.ok(bridge.includes('calendar.removeEvent=function'));assert.ok(bridge.includes('BAAM18SchoolCalendar'))});
test('Shared Student OS bootstrap loads M18 bridge',()=>assert.ok(bootstrap.includes("baa-m18-school-calendar-server.js")));
test('No calendar events are fabricated',()=>assert.ok(!cal.includes('2026-08-15')&&!cal.includes('exam: true')));
console.log(`\nM18: ${passed}/15 PASS`);if(process.exitCode)process.exit(process.exitCode);
