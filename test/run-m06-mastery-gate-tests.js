import fs from 'node:fs';
import assert from 'node:assert/strict';

const api=fs.readFileSync(new URL('../api/m06-mastery-gate.js',import.meta.url),'utf8');
const client=fs.readFileSync(new URL('../js/baa-mastery-gate.js',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../db/migrations/007_mastery_gates_and_forecast.sql',import.meta.url),'utf8');
const checks=[
  ['authenticated gate access',/requireAuth\(req\)/.test(api)],
  ['learner authorization',/requireLearnerAccess\(session, learnerId\)/.test(api)],
  ['evidence-backed gate evaluation',/FROM learning_evidence le/.test(api)],
  ['persisted progression gate',/INSERT INTO learning_progression_gates/.test(api)],
  ['persisted findings',/INSERT INTO learning_gate_findings/.test(api)],
  ['parent role required for bypass',/hasRole\(session,'parent'\)/.test(api)],
  ['active parent relationship',/parent_learner/.test(api)],
  ['password re-authentication',/verifyPassword\(password/.test(api)],
  ['mandatory bypass reason',/BYPASS_REASON_REQUIRED/.test(api)],
  ['bypass persistence',/INSERT INTO learning_gate_bypasses/.test(api)],
  ['bypass audit',/mastery_gate\.bypass/.test(api)],
  ['private transport',/private, no-store/.test(api)],
  ['client authenticated transport',/credentials:'include'/.test(client)],
  ['client fresh transport',/cache:'no-store'/.test(client)],
  ['schema gate table',/CREATE TABLE IF NOT EXISTS learning_progression_gates/.test(migration)],
  ['schema bypass table',/CREATE TABLE IF NOT EXISTS learning_gate_bypasses/.test(migration)]
];
for(const [name,ok] of checks) assert.equal(ok,true,name);
console.log(`M06 mastery gate contract: ${checks.length}/${checks.length} checks passed`);
