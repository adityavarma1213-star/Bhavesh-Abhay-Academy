import fs from 'node:fs';
import assert from 'node:assert/strict';

const guard=fs.readFileSync('js/baa-m06-progression-guard.js','utf8');
const catalogue=fs.readFileSync('js/baa-guide-catalogue.js','utf8');
const api=fs.readFileSync('api/m06-mastery-gate.js','utf8');

const checks={
  serverGateIsAuthoritative: /requireAuth\(req\)[\s\S]*requireLearnerAccess\(session, learnerId\)/.test(api),
  guardUsesGateApi: guard.includes("/api/m06-mastery-gate.js"),
  guardUsesAuthenticatedTransport: guard.includes("credentials:'include'"),
  guardDisablesCaching: guard.includes("cache:'no-store'"),
  guardRequiresFullScope: /!s\.learnerId\|\|!s\.subject\|\|!s\.chapter/.test(guard),
  guardBlocksLockedState: /gate\.status==='locked'/.test(guard),
  guardOnlyTargetsAssessment: /\/assessment\\\.html\$\/i/.test(guard),
  guardInterceptsAssessmentLinks: /document\.addEventListener\('click',intercept,true\)/.test(guard),
  guardProvidesReturnPath: /student-os\.html/.test(guard),
  bootstrapLoadsGuard: catalogue.includes("js/baa-m06-progression-guard.js")
};

for(const [name,ok] of Object.entries(checks)) assert.equal(ok,true,`M06 progression guard check failed: ${name}`);
console.log(`M06 progression guard: ${Object.keys(checks).length}/${Object.keys(checks).length} structural checks passed.`);
