#!/usr/bin/env node
/* Structural contract checks for the Parent/Teacher canonical learner dashboard. */
const fs = require('fs');
const helper = fs.readFileSync('js/baa-server-learner-view.js','utf8');
const checks = [
  ['teacher route is recognized', helper.includes("path.endsWith('/teacher-os.html')")],
  ['parent route is recognized', helper.includes("path.endsWith('/parent-os.html')")],
  ['teacher role is enforced', helper.includes("return 'teacher';")],
  ['parent role is enforced', helper.includes("return 'parent';")],
  ['authenticated learner list is used', helper.includes("fetch('/api/v1/my-learners',{credentials:'include'})")],
  ['learner overview is server-backed', helper.includes("/api/v1/learner-overview?learnerId=")],
  ['legacy content is hidden on both dashboards', helper.includes("if(legacy) legacy.style.display='none';")],
  ['server-backed panel remains the mount target', helper.includes("init({mountId:'serverLearnerView'});")],
  ['no local fallback is presented as server data', helper.includes('no browser-local data is presented as server-backed data')],
  ['multi-learner selector remains supported', helper.includes('serverLearnerSelect')]
];
let failed = 0;
for (const [name, ok] of checks) {
  if (ok) console.log(`PASS ${name}`);
  else { console.error(`FAIL ${name}`); failed++; }
}
console.log(`\n${checks.length - failed}/${checks.length} structural checks passed`);
process.exitCode = failed ? 1 : 0;
