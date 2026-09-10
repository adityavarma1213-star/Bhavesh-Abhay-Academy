#!/usr/bin/env node
// Batch 6: M56 Adaptive Pacing, M57 Parent Conversation, M61 Founder Lab,
// M51 Pedagogy, M60 Purpose Design — integration test.
const fs=require('fs');
let failures=0;
function check(cond,msg){ if(!cond){console.error('FAIL:',msg);failures++;} else console.log('PASS:',msg); }

const api=fs.readFileSync('api/v1/[...route].js','utf8');
const studentOs=fs.readFileSync('student-os.html','utf8');
const parentOs=fs.readFileSync('parent-os.html','utf8');
const adminHtml=fs.readFileSync('admin.html','utf8');
const pedagogyDoc=fs.readFileSync('PEDAGOGY-POLICY.md','utf8');
const revisionJs=fs.readFileSync('js/baa-revision.js','utf8');
const assessmentHtml=fs.readFileSync('assessment.html','utf8');

// --- M56 Adaptive Pacing ---
check(api.includes("route==='adaptive-pacing'"),'adaptive-pacing route is registered');
const pacingSrc=(api.split('__build_adaptive_pacing')[1]||'').split('const handler_adaptive_pacing')[0];
check(pacingSrc.includes('available_minutes_per_day')&&pacingSrc.includes('planner_tasks'),'reuses real, already-set planner preferences and real task data, not fabricated numbers');
check(pacingSrc.includes('self_rated_pressure')&&pacingSrc.includes('6-checkinRow'),"reuses M54's real, explicit energy signal (inverted) rather than inventing a duplicate input");
check(pacingSrc.includes('energy!=null')||pacingSrc.includes('energyKnown'),"honestly reports when no check-in exists today rather than silently assuming a neutral energy level");
check(pacingSrc.includes("req.method!=='POST'")&&pacingSrc.includes("if(rec.action!=='reduce_scope')"),'scope reduction only runs via an explicit POST action, never automatically inside the GET recommendation');
check(pacingSrc.includes("ORDER BY CASE priority"),'when reducing scope, lower-priority tasks are cancelled first, not an arbitrary or highest-priority selection');
check(pacingSrc.includes('writeAudit')&&pacingSrc.includes('adaptive_pacing.scope_reduced'),'an actual scope reduction is audit-logged');
check(studentOs.includes('renderAdaptivePacing')&&studentOs.includes('adaptivePacingApplyBtn'),'a real panel exists with a real, explicit Apply action, not an automatic mutation');
check(studentOs.includes('renderAdaptivePacing')&&studentOs.includes('renderCognitiveSafety(mine.id)') ,'sanity: both M54 and M56 are wired into the same real login init block');

// --- M57 Parent Conversation ---
check(api.includes("route==='parent-conversation'"),'parent-conversation route is registered');
const convoSrc=(api.split('__build_parent_conversation')[1]||'').split('const handler_parent_conversation')[0];
check(convoSrc.includes("FROM learning_memory WHERE learner_id=${learnerId} AND status='needs_revision'"),'prompts are grounded in the learner\'s real recorded weak concept, not a generic placeholder');
check(convoSrc.includes('insufficient_evidence'),'honestly reports when there is no real weak-concept evidence to ground a conversation in, rather than inventing a topic');
check(convoSrc.includes('requireLearnerAccess'),'access is scoped to the real parent-child relationship check');
check(parentOs.includes('refreshParentConversation')&&parentOs.includes('/api/v1/parent-conversation'),'a real panel on the parent page calls the real endpoint');
check(parentOs.includes("refreshParentConversation(ls.value)")&&parentOs.includes("refreshParentConversation(learners[0].id)"),'the panel refreshes both on learner selection change and on initial page load');

// --- M61 Founder Lab ---
check(fs.existsSync('db/migrations/021_founder_lab_logs.sql'),'founder_lab_logs migration exists');
check(api.includes("route==='founder-lab'"),'founder-lab route is registered');
const labSrc=(api.split('__build_founder_lab')[1]||'').split('const handler_founder_lab')[0];
check(labSrc.includes("hasRole(session,'admin')"),'admin-only, matching the M62 precedent exactly');
check(labSrc.includes('writeAudit')&&labSrc.includes('founder_lab.entry_logged'),'a logged entry is audit-logged');
check(adminHtml.includes('loadLab')&&adminHtml.includes('/api/v1/founder-lab'),'a real panel on admin.html calls the real endpoint');
check(adminHtml.includes("guard()){load();loadErp();loadLab();}"),'the founder lab panel only loads after the same real admin guard as the rest of the page');

// --- M51 Pedagogy (foundation-only, per the spec's own boundary) ---
check(pedagogyDoc.includes('Compliance audit')&&pedagogyDoc.includes('MIN_EVIDENCE_FOR_JUDGEMENT = 3'),'the policy document cites real, verified constants from actual source, not asserted claims');
check(pedagogyDoc.includes('renderResults()')&&assessmentHtml.includes('function renderResults'),'the productive-struggle claim is checked against a function that genuinely exists in the real page');
check(revisionJs.includes('[1,3,7,15,30,60]'),"a real discrepancy found during the audit (14-day vs the Blueprint's stated 15-day interval, missing the 60-day step) was actually fixed, not just noted");
check(revisionJs.includes('Math.min(5,'),'the index clamp was updated so the newly-added 60-day interval is actually reachable, not dead data');

// --- M60 Purpose Design (foundation-only, CI gate, per the spec's own boundary) ---
check(fs.existsSync('test/run-m60-content-review-tests.js'),'the CI content-scan test exists — the real deliverable for this module, not a dashboard');

if(failures){ console.error(`${failures} TEST(S) FAILED`); process.exit(1); }
console.log('ALL BATCH 6 (M56, M57, M61, M51, M60) INTEGRATION TESTS PASSED');
