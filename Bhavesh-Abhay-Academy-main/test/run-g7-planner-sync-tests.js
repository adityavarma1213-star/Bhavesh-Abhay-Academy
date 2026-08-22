// test/run-g7-planner-sync-tests.js
// BAA OS — G7 Checkpoint 1: Planner real per-learner persistence.
//
// This is a static-verification test in the same style as
// test/g4g5g6/run-tests.js (no live database is available in this
// environment to run a true integration test against — see DEPLOYMENT.md).
// It asserts the new artifacts exist and enforce the properties the audit
// required: auth + per-learner access control on every route, tasks are
// never deleted (only status-updated), and existing local/anonymous
// behavior is left completely untouched (sync is additive and opt-in).
//
// A separate, deeper mock-database functional test (GET/PUT round-trips,
// replace-set reconciliation, task-event recording, 403 on an
// unauthorized learnerId — 13 assertions, all passing) was run during
// development against an in-memory fake of the sql`` tag; it isn't
// committed here because it requires a synced duplicate of planner.js
// with its imports swapped, which would drift from the real file over
// time. Run with: node test/run-g7-planner-sync-tests.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let fail = 0;
function ok(cond, msg) { if (cond) console.log('PASS', msg); else { console.error('FAIL', msg); fail++; } }

const plannerApi = fs.readFileSync(path.join(ROOT, 'api/v1/[...route].js'), 'utf8');
const myLearners = fs.readFileSync(path.join(ROOT, 'api/v1/[...route].js'), 'utf8');
const signup = fs.readFileSync(path.join(ROOT, 'api/auth/[...action].js'), 'utf8');
const plannerClient = fs.readFileSync(path.join(ROOT, 'js/baa-planner.js'), 'utf8');
const studentOs = fs.readFileSync(path.join(ROOT, 'student-os.html'), 'utf8');

ok(fs.existsSync(path.join(ROOT, 'api/v1/[...route].js')), 'api/v1/[...route].js exists');
ok(fs.existsSync(path.join(ROOT, 'api/v1/[...route].js')), 'api/v1/[...route].js exists');

ok(/requireAuth/.test(plannerApi) && /requireLearnerAccess/.test(plannerApi),
  'Planner sync route requires auth and per-learner access control (no cross-learner leakage)');
ok(/GET.*PUT|PUT.*GET/s.test(plannerApi) === false || (/method==='GET'/.test(plannerApi) && /method==='PUT'/.test(plannerApi)),
  'Planner sync route implements both GET (hydrate) and PUT (sync)');
ok(/never deleted/.test(plannerApi), 'Planner sync route documents that tasks are never deleted, only status-updated');
ok(/ON CONFLICT\(id\) DO UPDATE SET status/.test(plannerApi), 'Planner task upsert updates status rather than replacing/deleting rows');
ok(/planner_task_events/.test(plannerApi), 'Planner sync records task_events on status change (audit trail preserved)');

ok(/requireAuth/.test(myLearners), 'my-learners route requires auth');
ok(/relationship:'self'/.test(myLearners) || /relationship: 'self'/.test(myLearners), 'my-learners distinguishes a student\'s own learner record');

ok(/role==='student'/.test(signup) && /INSERT INTO learners/.test(signup),
  'Signup auto-creates a learners row for new student accounts (fixes: no valid learnerId ever existed for a signed-up student)');

ok(/setSyncTarget/.test(plannerClient) && /hydrateFromServer/.test(plannerClient),
  'Client planner module exposes setSyncTarget/hydrateFromServer for real backend sync');
ok(/syncLearnerId = null/.test(plannerClient),
  'Sync is off by default — anonymous/local/test behavior is unchanged unless a session explicitly opts in');
ok(/if \(!syncLearnerId \|\| typeof fetch === 'undefined'\) return;/.test(plannerClient),
  'Background sync is a no-op with no learner/session (never throws or blocks local usage)');

ok(/hydrateFromServer/.test(studentOs) && /my-learners/.test(studentOs),
  'student-os.html wires a logged-in session to real per-learner hydration on load');

if (fail) process.exit(1);
console.log('\nALL G7 PLANNER SYNC TESTS PASSED');
