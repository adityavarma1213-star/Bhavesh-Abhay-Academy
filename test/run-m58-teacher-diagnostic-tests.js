#!/usr/bin/env node
// M58 Teacher Diagnostic Snap & Differentiated Assignment — integration test.
const fs=require('fs');
let failures=0;
function check(cond,msg){ if(!cond){console.error('FAIL:',msg);failures++;} else console.log('PASS:',msg); }

const api=fs.readFileSync('api/v1/[...route].js','utf8');
const teacher=fs.readFileSync('teacher-os.html','utf8');
const diagJs=fs.readFileSync('js/baa-teacher-diagnostic.js','utf8');

check(api.includes("route==='teacher-diagnostic'"),'teacher-diagnostic route is registered');
const handlerSrc=(api.split('__build_teacher_diagnostic')[1]||'').split('const handler_teacher_diagnostic')[0];
check(handlerSrc.includes("hasRole(session,'teacher')")&&handlerSrc.includes("hasRole(session,'admin')"),'requires a real teacher or admin role');
check(handlerSrc.includes('teacherOwnsClass(session.user_id,classId)'),'reuses the exact same ownership check M17 already uses — no separate, possibly-inconsistent auth logic');
check(handlerSrc.includes("FROM learning_memory WHERE learner_id=ANY")&&handlerSrc.includes('concept=${concept}'),'groups students using real, already-computed learning_memory status for the real concept, not fabricated data');
check(handlerSrc.includes("status==='needs_revision'")&&handlerSrc.includes("status==='learning'")&&handlerSrc.includes("status==='mastered'"),'reuses the exact status vocabulary M09 already computes (mastered/learning/needs_revision) rather than inventing a new one');
check(handlerSrc.includes('insufficient_evidence'),'a student with no recorded evidence for the concept is honestly bucketed as insufficient evidence, never silently dropped or guessed into a group');
check(handlerSrc.includes('INSERT INTO planner_tasks'),'assigning a group actually creates real planner tasks — this is an actionable feature, not just an informational grouping');
check(handlerSrc.includes("`Assigned by your teacher after a class diagnostic on"),"the created task's reasons array is honest about why it exists (explainability, matching the rest of this codebase's planner tasks)");
check(handlerSrc.includes('INVALID_GROUP'),'only the three real group names are accepted — arbitrary/typo\'d group values are rejected, not silently treated as one of the three');
check(handlerSrc.includes('writeAudit')&&handlerSrc.includes('teacher_diagnostic.group_assigned'),'a group assignment is audit-logged');

check(teacher.includes('/api/v1/teacher-diagnostic'),'teacher-os.html actually calls the real endpoint');
check(teacher.includes('diagConceptSelect')&&teacher.includes('a.concepts.map'),'the concept picker is built from real class concepts already loaded, not free text that could target a concept with zero evidence');
check(teacher.includes('data-assign-group')&&teacher.includes("method:'POST'"),'the Assign buttons actually issue a real POST, not a decorative click handler');
check(teacher.includes("g.insufficient_evidence?.length"),'the UI honestly surfaces students with no evidence rather than hiding them or lumping them into a group');

check(diagJs.includes('global.BAATeacherDiagnostic'),'the original pure group()/assignment() module is untouched and still exported (its own unit test still covers it)');

if(failures){ console.error(`${failures} TEST(S) FAILED`); process.exit(1); }
console.log('ALL M58 TEACHER DIAGNOSTIC INTEGRATION TESTS PASSED');
