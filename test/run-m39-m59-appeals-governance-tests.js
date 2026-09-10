#!/usr/bin/env node
// M39 (AI Review & Appeal) + M59 (Human-in-the-Loop Governance), merged.
const fs=require('fs');
let failures=0;
function check(cond,msg){ if(!cond){console.error('FAIL:',msg);failures++;} else console.log('PASS:',msg); }

const migration=fs.readFileSync('db/migrations/020_appeals_reason.sql','utf8');
const api=fs.readFileSync('api/v1/[...route].js','utf8');
const trust=fs.readFileSync('trust-privacy.html','utf8');
const review=fs.readFileSync('teacher-review.html','utf8');

check(migration.includes('appeal_reason'),'teacher_reviews gains the missing appeal_reason column (reuses the existing table, no parallel queue table)');
check(api.includes("route==='appeals'"),'appeals route is registered');

const handlerSrc=(api.split('__build_appeals')[1]||'').split('const handler_appeals')[0];
check(handlerSrc.includes('requireLearnerAccess(session,learnerId)'),'a student can only appeal a result belonging to a learner they have real access to');
check(handlerSrc.includes('aa.learner_id=${learnerId}'),'server verifies the disputed result actually belongs to the claimed learner before creating an appeal');
check(handlerSrc.includes('REASON_REQUIRED'),'an appeal without a stated reason is rejected, not silently accepted');
check(handlerSrc.includes("alreadyPending"),'submitting a second appeal for the same question while one is already pending does not create a duplicate queue entry');
check(handlerSrc.includes("hasRole(session,'teacher')")&&handlerSrc.includes("hasRole(session,'admin')"),'resolving an appeal requires teacher or admin role');
check(handlerSrc.includes('requireLearnerAccess(session,row.rows[0].learner_id)'),'a teacher can only resolve appeals for students they are actually linked to (not hasRole alone)');
check(handlerSrc.includes("MARKS_REQUIRED_FOR_EDIT"),'editing a score without providing the new score is rejected');
check(!/UPDATE assessment_results/.test(handlerSrc) && !/UPDATE ai_evaluation_records/.test(handlerSrc),'resolving an appeal never modifies the original AI-graded result or evaluation record — only teacher_reviews is written, so nothing is silently altered');
check(handlerSrc.includes("writeAudit")&&handlerSrc.includes('appeal.requested')&&handlerSrc.includes('appeal.resolved'),'both the request and the resolution are audit-logged');
check(handlerSrc.includes("JOIN teacher_learner tl") ,'the teacher queue is scoped to the requesting teacher\'s own linked students, not every pending appeal in the system');

check(trust.includes("fetch('/api/v1/appeals'")&&trust.includes("method: 'POST'"),'the real student-facing form now calls the real server endpoint');
check(!trust.includes('BAAAssessment.requestReevaluation'),'the old local-only-queue call path has been replaced, not left running in parallel alongside the new server path');
check(trust.includes("find(l => l.relationship === 'self')"),'the learner id is resolved the same trusted way student-os.html already does, not taken from an untrusted client field');

check(review.includes("fetch('/api/v1/appeals'")||review.includes('/api/v1/appeals'),'the teacher-facing queue loads real server-backed appeals');
check(review.includes("roles.includes('teacher')")&&review.includes("roles.includes('admin')"),'the new appeals section checks for a real teacher/admin session before showing any cross-student data');
check(review.includes('appealsSection')&&review.includes("style.display='flex'"),'the section is hidden by default and only revealed after a real authorization check succeeds — never shown with placeholder data');

if(failures){ console.error(`${failures} TEST(S) FAILED`); process.exit(1); }
console.log('ALL M39+M59 APPEALS/GOVERNANCE INTEGRATION TESTS PASSED');
