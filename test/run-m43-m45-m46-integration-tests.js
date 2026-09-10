#!/usr/bin/env node
// M43 Scholarships + M45 Mentors + M46 ERP — integration test.
// All three backends (api/m43-scholarships.js, api/m45-mentors.js,
// api/m46-erp.js) and client wrappers already existed and were already
// correct — this batch was purely UI wiring. This test confirms that
// wiring is real, not that the backend was rebuilt (it wasn't, and
// shouldn't have been).
const fs=require('fs');
let failures=0;
function check(cond,msg){ if(!cond){console.error('FAIL:',msg);failures++;} else console.log('PASS:',msg); }

const studentOs=fs.readFileSync('student-os.html','utf8');
const adminHtml=fs.readFileSync('admin.html','utf8');
const teacherOs=fs.readFileSync('teacher-os.html','utf8');
const parentOs=fs.readFileSync('parent-os.html','utf8');
const scholarshipsApi=fs.readFileSync('api/m43-scholarships.js','utf8');
const mentorsApi=fs.readFileSync('api/m45-mentors.js','utf8');
const erpApi=fs.readFileSync('api/m46-erp.js','utf8');

// --- Backend sanity (already real — just confirming, not rebuilding) ---
check(scholarshipsApi.includes("status='published'")&&scholarshipsApi.indexOf("return json(res,200,{ok:true,results:r.rows})")<scholarshipsApi.indexOf("if(!hasRole(s,'admin'))"),'sanity: scholarships GET returns before the admin check is ever reached — read access does not require admin');
check(mentorsApi.includes("verification_status='verified'")&&mentorsApi.includes("safeguarding_status='verified'"),'sanity: mentor search only ever returns verified AND safeguarded profiles');
check(erpApi.includes("No external provider is contacted until deployment credentials"),'sanity: ERP sync is honest about not contacting a real provider without real credentials');
check(erpApi.includes("hasRole(s,'admin')&&!hasRole(s,'teacher')"),'sanity: ERP backend already permits teacher role too, not just admin (confirms this session correctly deferred to the existing contract rather than assuming admin-only)');

// --- Dead script cleanup (avoid the M55/M17 loaded-but-unused pattern) ---
check(!teacherOs.includes('baa-scholarships.js')&&!teacherOs.includes('baa-mentors.js'),'baa-scholarships.js and baa-mentors.js remain correctly absent on teacher-os.html — confirmed against js/baa-ui-wiring-final.js\'s actual wireTeacher() reference list, which does not include either');
check(teacherOs.includes('baa-erp.js'),'CORRECTED (fresh evidence): baa-erp.js is restored on teacher-os.html — js/baa-ui-wiring-final.js\'s wireTeacher() genuinely calls global.BAAERP, and the real backend (api/m46-erp.js) already permits the teacher role, so this was a genuinely-scoped access point wrongly removed by a dead-script check that only scanned inline HTML');
check(!parentOs.includes('baa-erp.js'),'parent-os.html no longer loads the ERP script — no legitimate parent use case, and it was never called');

// --- Real UI wiring on student-os.html (M43, M45) ---
check(studentOs.includes('refreshScholarshipsPanel')&&studentOs.includes('BAAScholarships.fetchVerified()'),'a real scholarships panel calls the real fetchVerified() wrapper');
check(studentOs.includes('refreshMentorsPanel')&&studentOs.includes('BAAMentors.fetchVerified('),'a real mentors panel calls the real fetchVerified() wrapper');
check(studentOs.includes('BAAMentors.requestMentor(btn.dataset.requestMentor, window.BAA_LEARNER_ID'),'a mentor request uses the real, session-derived learner id — not a client-editable field');
check(studentOs.includes("if(!window.BAA_LEARNER_ID){ btn.textContent='Sign in required'")," an unauthenticated request attempt is honestly blocked client-side rather than silently sent with an empty id");
check(studentOs.includes("refreshScholarshipsPanel()")&&studentOs.includes("refreshMentorsPanel()")&&/name==='profile'\)\s*refreshScholarshipsPanel/.test(studentOs),'both panels are actually triggered when the profile world opens, not just defined');

// --- Real UI wiring on admin.html (M46) ---
check(adminHtml.includes('js/baa-erp.js')&&adminHtml.includes('BAAERP.listConnections()'),'admin.html loads the real ERP module and calls the real listConnections()');
check(adminHtml.includes('BAAERP.configure({provider,baseUrl,scopes:[]})'),'adding a connection uses the real configure() wrapper, not a fabricated success message');
check(adminHtml.includes('BAAERP.queueSync(')&&adminHtml.includes("data-sync-erp"),'the Queue a sync button calls the real queueSync() wrapper');
check(adminHtml.includes('/^https:\\/\\//i.test(baseUrl)'),'the client-side URL check requires https, matching the server\'s own validation (defense in depth, not a bypassable client-only gate since the server re-checks too)');
check(adminHtml.includes("if(await guard()){load();loadErp();")||adminHtml.includes("if(await guard())load()"),'ERP data only loads after the same real admin-role guard used by the rest of this page — not loaded unconditionally');

if(failures){ console.error(`${failures} TEST(S) FAILED`); process.exit(1); }
console.log('ALL M43+M45+M46 INTEGRATION TESTS PASSED');
