#!/usr/bin/env node
const fs=require('fs');
const files={
  bridge:fs.readFileSync('js/baa-teacher-server-dashboard.js','utf8'),
  catalogue:fs.readFileSync('js/baa-guide-catalogue.js','utf8'),
  serverView:fs.readFileSync('js/baa-server-learner-view.js','utf8')
};
const checks=[
  ['teacher dashboard bridge exists',files.bridge.includes('baaTeacherServerDashboard')],
  ['teacher route scoped',files.bridge.includes("endsWith('/teacher-os.html')")],
  ['authenticated server helper required',files.bridge.includes('BAAServerLearnerView')],
  ['server snapshot rendered',files.bridge.includes('snapshot?.assessments')],
  ['server evidence rendered',files.bridge.includes('snapshot?.concepts')],
  ['no local fallback claim',files.bridge.includes('No browser-local learner data')],
  ['server learner helper bootstrapped',files.catalogue.includes("baa-server-learner-view.js")],
  ['teacher dashboard bridge bootstrapped',files.catalogue.includes("baa-teacher-server-dashboard.js")],
  ['learner overview uses credentials',files.serverView.includes("credentials:'include'" )],
  ['role enforcement includes teacher',files.serverView.includes("expected==='teacher'")]
];
let failed=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed++;}
console.log(`M14 teacher dashboard contract: ${checks.length-failed}/${checks.length}`);
process.exitCode=failed?1:0;
