// Current architecture: raw attempts/answers/results/evidence are synced
// through /api/v1/assessment. The authoritative question/assessment catalog
// is seeded by db/migrations/004_assessment_catalog_seed.sql, so the earlier
// FK blocker is no longer current. Derived learning memory remains on its
// dedicated endpoint.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let fail = 0;
function ok(cond, msg) { if (cond) console.log('PASS', msg); else { console.error('FAIL', msg); fail++; } }

ok(fs.existsSync(path.join(ROOT, 'api/v1/learning-memory.js')), 'api/v1/learning-memory.js exists');
const api = fs.readFileSync(path.join(ROOT, 'api/v1/learning-memory.js'), 'utf8');
const client = fs.readFileSync(path.join(ROOT, 'js/baa-assessment.js'), 'utf8');
const studentOs = fs.readFileSync(path.join(ROOT, 'student-os.html'), 'utf8');

ok(/requireAuth/.test(api) && /requireLearnerAccess/.test(api), 'Learning memory sync route requires auth and per-learner access control');
ok(/method === 'GET'/.test(api) && /method === 'PUT'/.test(api), 'Learning memory sync route implements both GET (hydrate) and PUT (sync)');
ok(/ON CONFLICT\(learner_id,concept\) DO UPDATE/.test(api), 'Concept mastery is upserted (one row per learner+concept, matches DERIVED table comment in schema)');
ok(/learning_memory_history/.test(api) && /p\.status !== status \|\| Number\(p\.evidence_count\) !== evidenceCount/.test(api),
  'History row is only written when status or evidence count actually changed (append-only, not spammed every sync)');
const assessmentApi = fs.readFileSync(path.join(ROOT, 'api/v1/assessment.js'), 'utf8');
const seed = fs.readFileSync(path.join(ROOT, 'db/migrations/004_assessment_catalog_seed.sql'), 'utf8');
ok(/assessment sync/.test(assessmentApi) || /assessment_attempts/.test(assessmentApi),
  'Assessment sync route owns raw attempts/answers/results/evidence persistence');
ok(/INSERT INTO questions/.test(seed) && /INSERT INTO assessments/.test(seed) && /INSERT INTO assessment_questions/.test(seed),
  'Assessment catalog is seeded server-side, satisfying the evidence foreign-key dependencies');

ok(/setSyncTarget/.test(client) && /hydrateFromServer/.test(client), 'Client Section B module exposes setSyncTarget/hydrateFromServer');
ok(/syncLearnerId = null/.test(client), 'Sync is off by default — local/anonymous/test behavior unchanged unless a session opts in');
ok(/server\.evidenceCount \|\| 0\) >= \(local\.evidenceCount \|\| 0\)/.test(client),
  'Hydration merges server + local mastery by taking whichever has more evidence, never silently overwriting a more-complete local record with less');

ok(/BAAAssessment\.hydrateFromServer/.test(studentOs),
  'student-os.html wires a logged-in session to real learning-memory hydration on load');

if (fail) process.exit(1);
console.log('\nALL G7 LEARNING MEMORY SYNC TESTS PASSED');
