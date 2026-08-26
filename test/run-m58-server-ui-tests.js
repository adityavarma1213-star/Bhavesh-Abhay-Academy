#!/usr/bin/env node
/* M58 server-backed Teacher Diagnostic UI contract checks. */
const fs=require('fs');
const api=fs.readFileSync('api/m58-teacher-diagnostic.js','utf8');
const ui=fs.readFileSync('js/baa-m58-teacher-diagnostic-ui.js','utf8');
const catalogue=fs.readFileSync('js/baa-guide-catalogue.js','utf8');
const checks=[
 ['M58 API requires authentication',/requireAuth\(req\)/.test(api)],
 ['M58 API enforces teacher/admin role',/hasRole\(session, 'teacher'\)/.test(api)&&/hasRole\(session, 'admin'\)/.test(api)],
 ['M58 API enforces teacher class ownership',/teacher_user_id=\$\{session\.user_id\}/.test(api)],
 ['M58 API uses active class membership',/class_members cm/.test(api)&&/cm\.status='active'/.test(api)],
 ['M58 API uses persisted assessment evidence',/assessment_attempts aa/.test(api)&&/aa\.status='submitted'/.test(api)],
 ['M58 API returns instructional groups',/reteach: \[\]/.test(api)&&/insufficientEvidence: \[\]/.test(api)],
 ['M58 API states non-diagnostic limitation',/not a psychological diagnosis/.test(api)],
 ['M58 UI sends credentials',/credentials:'include'/.test(ui)],
 ['M58 UI consumes server endpoint',/\/api\/m58-teacher-diagnostic\.js/.test(ui)],
 ['M58 UI renders diagnostic table and groups',/Teacher Diagnostic &amp; Differentiation/.test(ui)&&/Reteach/.test(ui)&&/Average/.test(ui)],
 ['M58 UI mounts from existing class context',/data-baa-institution-analytics/.test(ui)&&/data-class-id/.test(ui)],
 ['Shared bootstrap loads M58 UI',/baa-m58-teacher-diagnostic-ui\.js/.test(catalogue)]
];
let failed=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed++;}
process.exitCode=failed?1:0;
console.log(`M58 server UI contract: ${checks.length-failed}/${checks.length}`);
