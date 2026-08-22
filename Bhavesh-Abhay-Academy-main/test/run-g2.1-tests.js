// test/run-g2.1-tests.js
// BAA OS — Section G2.1 tests.
//
// Covers G2.1's exact scope: the two authentication tables added to
// db/schema.sql (`credentials`, `auth_sessions`) and their supporting
// index. This is static schema-structure analysis only — same
// approach as PART 1 of test/run-g1-tests.js — because, like G1,
// G2.1 is schema/design only: there is no live database to execute
// this against (see SCHEMA.md section 12 and section 15).
//
// This file deliberately does NOT test:
//   - any signup/login/session-issuance code (none exists yet — G2.3)
//   - any data-access repository/adapter change (none exists yet — G2.2)
//   - any password hashing behavior (not implemented — algorithm is
//     just a recorded label on the credentials table)
//
// Run with: node test/run-g2.1-tests.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failures++; }
  else console.log('PASS:', msg);
}

function testG21SchemaAdditions() {
  const sql = fs.readFileSync(path.join(ROOT, 'db', 'schema.sql'), 'utf8');

  const tableNames = [];
  const tableRe = /CREATE TABLE (\w+)\s*\(/g;
  let m;
  while ((m = tableRe.exec(sql))) tableNames.push(m[1]);

  // G1 baseline was 29 tables; G2.1 adds exactly 2 (credentials, auth_sessions).
  assert(tableNames.includes('credentials'), 'G1: credentials table exists');
  assert(tableNames.includes('auth_sessions'), 'G2: auth_sessions table exists');
  assert(tableNames.filter(t => t === 'credentials').length === 1, 'G3: credentials defined exactly once');
  assert(tableNames.filter(t => t === 'auth_sessions').length === 1, 'G4: auth_sessions defined exactly once');

  const dupes = tableNames.filter((t, i) => tableNames.indexOf(t) !== i);
  assert(dupes.length === 0, `G5: no duplicate CREATE TABLE names introduced (dupes: ${dupes.join(', ') || 'none'})`);

  const tableBlocks = sql.split(/CREATE TABLE /).slice(1);
  const credBlock = tableBlocks.find(b => b.startsWith('credentials'));
  const sessBlock = tableBlocks.find(b => b.startsWith('auth_sessions'));

  assert(!!credBlock && /PRIMARY KEY/.test(credBlock), 'G6: credentials has a PRIMARY KEY');
  assert(!!sessBlock && /PRIMARY KEY/.test(sessBlock), 'G7: auth_sessions has a PRIMARY KEY');

  // credentials: user_id PK+FK, password_hash NOT NULL, no plaintext password column.
  assert(/user_id\s+TEXT PRIMARY KEY REFERENCES users\(id\)/.test(credBlock),
    'G8: credentials.user_id is PK and FKs to users(id)');
  assert(/password_hash\s+TEXT NOT NULL/.test(credBlock),
    'G9: credentials.password_hash is NOT NULL');
  assert(!/\bpassword\s+TEXT/.test(credBlock),
    'G10: credentials never stores a raw/plaintext password column');

  // auth_sessions: id PK, user_id FK, token_hash unique, expires_at, revoked_at (soft-delete).
  assert(/id\s+TEXT PRIMARY KEY/.test(sessBlock), 'G11: auth_sessions.id is PK');
  assert(/user_id\s+TEXT NOT NULL REFERENCES users\(id\)/.test(sessBlock),
    'G12: auth_sessions.user_id FKs to users(id)');
  assert(/token_hash\s+TEXT NOT NULL UNIQUE/.test(sessBlock),
    'G13: auth_sessions.token_hash is NOT NULL and UNIQUE');
  assert(!/\btoken\s+TEXT/.test(sessBlock),
    'G14: auth_sessions never stores a raw/unhashed token column');
  assert(/expires_at\s+TIMESTAMPTZ NOT NULL/.test(sessBlock),
    'G15: auth_sessions.expires_at is NOT NULL');
  assert(/revoked_at\s+TIMESTAMPTZ/.test(sessBlock),
    'G16: auth_sessions.revoked_at exists (soft-delete pattern, matches G1 lifecycle convention)');

  // Supporting index exists.
  assert(/CREATE INDEX idx_auth_sessions_user ON auth_sessions\(user_id\)/.test(sql),
    'G17: idx_auth_sessions_user index exists');

  // Every REFERENCES target introduced/touched still resolves to a real table
  // (re-check globally, since this is the same invariant G1's S4 checks).
  const refRe = /REFERENCES (\w+)\(/g;
  const missingRefs = [];
  while ((m = refRe.exec(sql))) {
    if (!tableNames.includes(m[1])) missingRefs.push(m[1]);
  }
  assert(missingRefs.length === 0,
    `G18: every REFERENCES target table exists in schema.sql (missing: ${[...new Set(missingRefs)].join(', ') || 'none'})`);

  // Design-only status is documented in-file for the new section, same as
  // the rest of schema.sql (honesty requirement carried over from G1).
  assert(/Section G2\.1 — SCHEMA \/ DESIGN ONLY/.test(sql),
    'G19: new section is explicitly labeled schema/design only, in-file');
  assert(/STATUS: CANONICAL POSTGRESQL SCHEMA/i.test(sql) && /deployment-specific/i.test(sql),
    'G20: schema header reflects the current canonical/migration status without claiming a production database is embedded');
}

function testNothingElseChanged() {
  const sql = fs.readFileSync(path.join(ROOT, 'db', 'schema.sql'), 'utf8');
  const tableNames = [];
  const tableRe = /CREATE TABLE (\w+)\s*\(/g;
  let m;
  while ((m = tableRe.exec(sql))) tableNames.push(m[1]);

  // G1's 29 original tables, unchanged names, still all present.
  const g1Tables = [
    'users', 'user_roles', 'learners', 'parent_learner', 'teacher_learner',
    'classes', 'class_members', 'learning_profiles', 'questions', 'assessments',
    'assessment_questions', 'assessment_attempts', 'assessment_answers',
    'assessment_results', 'ai_evaluation_records', 'teacher_reviews',
    'teacher_notes', 'learning_evidence', 'learning_memory',
    'learning_memory_history', 'mistake_patterns', 'mistake_pattern_occurrences',
    'planner_preferences', 'planner_goals', 'planner_upcoming_assessments',
    'planner_tasks', 'planner_task_events', 'consent_preferences', 'audit_log',
  ];
  assert(g1Tables.length === 29, 'N1: 29 G1 tables tracked for regression (sanity check on this test itself)');
  const missing = g1Tables.filter(t => !tableNames.includes(t));
  assert(missing.length === 0, `N2: every G1 table still exists, untouched (missing: ${missing.join(', ') || 'none'})`);
  assert(tableNames.length === 31, `N3: exactly 29 G1 tables + 2 G2.1 tables = 31 total (found ${tableNames.length})`);
}

testG21SchemaAdditions();
testNothingElseChanged();

if (failures > 0) {
  console.error(`\n${failures} G2.1 TEST(S) FAILED`);
  process.exit(1);
} else {
  console.log('\nALL G2.1 TESTS PASSED');
}
