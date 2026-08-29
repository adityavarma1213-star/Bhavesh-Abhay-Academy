// M15 Parent Approval Mode — source contract checks.
import fs from 'node:fs';

const api = fs.readFileSync(new URL('../api/m15-parent-policy.js', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../db/migrations/025_m15_parent_policies.sql', import.meta.url), 'utf8');
const client = fs.readFileSync(new URL('../js/baa-m15-parent-policy.js', import.meta.url), 'utf8');

const checks = [
  ['Authentication enforced', api.includes('requireAuth(req)'), 'policy API requires a live session'],
  ['Parent/admin role gate', api.includes("hasRole(session, 'parent')") && api.includes("hasRole(session, 'admin')"), 'only parent/admin can mutate policy'],
  ['Parent learner ownership', api.includes('FROM parent_learner') && api.includes("status='active'"), 'parent must be actively linked to learner'],
  ['Server persistence', api.includes('parent_ai_policies'), 'policy is stored server-side'],
  ['Server no-store policy', api.includes("res.setHeader('Cache-Control', 'private, no-store, max-age=0')"), 'learner policy responses cannot be cached'],
  ['Policy audit import', api.includes("import { json, writeAudit } from './_lib/security.js';"), 'policy mutations use the shared audit helper'],
  ['Policy mutation audit', api.includes("action: 'PARENT_AI_POLICY_UPDATED'") && api.includes('await writeAudit'), 'successful policy changes are auditable'],
  ['Policy version returned', api.includes('updatedAtFrom') && api.includes('RETURNING tutor_enabled'), 'server returns a version for optimistic concurrency'],
  ['Stale policy conflict', api.includes("POLICY_CONFLICT") && api.includes('expectedUpdatedAt'), 'stale parent writes are rejected instead of silently overwriting newer state'],
  ['Tutor control', migration.includes('tutor_enabled BOOLEAN'), 'Tutor enable/disable is persisted'],
  ['Mentor control', migration.includes('mentor_enabled BOOLEAN'), 'Mentor enable/disable is persisted'],
  ['Planner control', migration.includes('planner_enabled BOOLEAN'), 'Planner enable/disable is persisted'],
  ['Planner minute cap', migration.includes('planner_daily_minutes INTEGER') && migration.includes('BETWEEN 0 AND 480'), 'server bounds daily planner minutes'],
  ['Credentialed client GET', client.includes("credentials: 'include'") && client.includes('/api/m15-parent-policy?learnerId='), 'client reads server policy with session credentials'],
  ['Fresh client GET', client.includes("cache: 'no-store'") && client.includes('Accept: \'application/json\''), 'client reads a fresh policy snapshot'],
  ['Credentialed client POST', client.includes("method: 'POST'") && client.includes("credentials: 'include'") && client.includes('/api/m15-parent-policy'), 'client writes server policy with session credentials'],
  ['Fresh client POST', client.includes("method: 'POST'") && client.includes("cache: 'no-store'"), 'policy mutations are not cached'],
  ['Client version tracking', client.includes('const versions = new Map()') && client.includes('rememberVersion'), 'client carries the last server version into subsequent writes'],
];

let failed = 0;
for (const [name, ok, why] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name} — ${why}`);
  if (!ok) failed++;
}
console.log(`M15 parent policy contract: ${checks.length - failed}/${checks.length}`);
if (failed) process.exit(1);
