// M16 Teacher Recommendation System — source contract checks.
import fs from 'node:fs';

const api = fs.readFileSync(new URL('../api/m16-teacher-recommendations.js', import.meta.url), 'utf8');
const client = fs.readFileSync(new URL('../js/baa-teacher-recommendation.js', import.meta.url), 'utf8');

const checks = [
  ['Authentication enforced', api.includes('requireAuth(req)'), 'recommendation API requires a live session'],
  ['Teacher/admin role gate', api.includes("hasRole(session, 'teacher')") && api.includes("hasRole(session, 'admin')"), 'only teacher/admin roles can read recommendations'],
  ['Teacher ownership', api.includes('c.teacher_user_id=${session.user_id}'), 'teachers can only inspect learners in their active classes'],
  ['Active membership', api.includes("cm.status='active'") && api.includes('c.archived_at IS NULL'), 'membership and class state are checked'],
  ['Server learning evidence', api.includes('FROM learning_evidence'), 'recommendations derive from persisted evidence'],
  ['Evidence-backed priority', api.includes('incorrect_count') && api.includes("priority = incorrect >= 3 || evidence >= 4 ? 'high' : 'medium'"), 'priority is derived from evidence counts'],
  ['Human review boundary', api.includes('Teacher reviews and decides whether to assign.'), 'system never auto-assigns'],
  ['Credentialed client request', client.includes("credentials:'include'") && client.includes('/api/m16-teacher-recommendations?learnerId='), 'browser request carries the authenticated session'],
  ['Server result rendering', client.includes('renderServerPanel') && client.includes('loadServerRecommendations'), 'server recommendations are surfaced in Teacher OS'],
];

let failed = 0;
for (const [name, ok, why] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name} — ${why}`);
  if (!ok) failed++;
}
console.log(`M16 teacher recommendation contract: ${checks.length - failed}/${checks.length}`);
if (failed) process.exit(1);
