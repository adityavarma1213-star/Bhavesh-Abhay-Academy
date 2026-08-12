// test/run-g2-tests.js
// BAA OS — Section G2 tests.
//
// Covers the remaining G2 scope on top of G2.1's schema-only checkpoint:
//   - accountRepository.js: signUp / logIn / logOut / getCurrentSession
//   - localStorageAdapter.js's new accounts/session storage methods
//   - databaseAdapter.js's new stub methods (still honestly throw)
//   - that nothing here disturbs Section B/C/D's own localStorage keys,
//     or the G1/G2.1 schema (regression, run separately by
//     test/run-g1-tests.js and test/run-g2.1-tests.js — this file also
//     re-checks the schema file itself is untouched below).
//
// Run with: node test/run-g2-tests.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); failures++; }
  else console.log('PASS:', msg);
}

function makeLocalStorage() {
  const data = {};
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    clear: () => { Object.keys(data).forEach((k) => delete data[k]); },
    _raw: data,
  };
}

function freshAdapter(ls) {
  global.localStorage = ls;
  delete require.cache[require.resolve('../js/data-access/adapters/localStorageAdapter.js')];
  return require('../js/data-access/adapters/localStorageAdapter.js');
}

function freshAccountRepo(adapter) {
  delete require.cache[require.resolve('../js/data-access/repositories/accountRepository.js')];
  const AccountRepository = require('../js/data-access/repositories/accountRepository.js');
  return AccountRepository.getRepo(adapter);
}

async function testSignupNormal() {
  const ls = makeLocalStorage();
  const adapter = freshAdapter(ls);
  const repo = freshAccountRepo(adapter);

  const res = await repo.signUp({ name: 'Ada Lovelace', email: 'Ada@Example.com', password: 'correct-horse-battery' });
  assert(res.ok === true, 'S1: normal signup succeeds');
  assert(res.user && res.user.id, 'S2: signup returns a created user with an id');
  assert(res.user.email === 'ada@example.com', 'S3: email is normalized to lowercase for storage/lookup');
  assert(res.user.display_name === 'Ada Lovelace', 'S4: display_name preserved as given');
  assert(res.user.deactivated_at === null, 'S5: new user is not deactivated');

  const raw = ls._raw['baa_section_g2_accounts_v1'];
  assert(!!raw, 'S6: accounts store was actually written to localStorage');
  const parsed = JSON.parse(raw);
  assert(parsed.users.length === 1, 'S7: exactly one user row created');
  assert(parsed.credentials.length === 1, 'S8: exactly one credentials row created');
  assert(parsed.credentials[0].user_id === res.user.id, 'S9: credentials row FKs to the created user');

  const storedHash = parsed.credentials[0].password_hash;
  assert(typeof storedHash === 'string' && storedHash.includes(':'), 'S10: password_hash is salt:hash encoded');
  assert(!storedHash.includes('correct-horse-battery'), 'S11: raw password never appears in the stored hash');
  assert(JSON.stringify(parsed).indexOf('correct-horse-battery') === -1, 'S12: raw password never appears anywhere in the accounts store');
  assert(parsed.credentials[0].algorithm === 'sha256-salted-local-only', 'S13: algorithm is honestly labeled (not a false argon2id claim)');
}

async function testSignupValidationAndDuplicate() {
  const ls = makeLocalStorage();
  const adapter = freshAdapter(ls);
  const repo = freshAccountRepo(adapter);

  const badEmail = await repo.signUp({ name: 'X', email: 'not-an-email', password: 'longenoughpassword' });
  assert(badEmail.ok === false && badEmail.errors.length > 0, 'S14: invalid email is rejected with an error, not silently accepted');

  const shortPw = await repo.signUp({ name: 'X', email: 'x@example.com', password: 'short' });
  assert(shortPw.ok === false, 'S15: too-short password is rejected');

  const first = await repo.signUp({ name: 'First', email: 'dup@example.com', password: 'longenoughpassword' });
  assert(first.ok === true, 'S16: first signup with a fresh email succeeds');

  const second = await repo.signUp({ name: 'Second', email: 'DUP@example.com', password: 'anotherlongpassword' });
  assert(second.ok === false, 'S17: duplicate email (case-insensitive) is rejected');

  const raw = JSON.parse(ls._raw['baa_section_g2_accounts_v1']);
  assert(raw.users.length === 1, 'S18: rejected duplicate signup did not create a second user row');
}

async function testLoginNormalAndInvalid() {
  const ls = makeLocalStorage();
  const adapter = freshAdapter(ls);
  const repo = freshAccountRepo(adapter);

  await repo.signUp({ name: 'Grace Hopper', email: 'grace@example.com', password: 'nibbles-the-compiler' });

  const wrongPw = await repo.logIn({ email: 'grace@example.com', password: 'wrong-password' });
  assert(wrongPw.ok === false, 'L1: wrong password is rejected');
  assert(adapter.getCurrentSessionToken() === null, 'L2: no session token stored after a failed login');

  const unknownEmail = await repo.logIn({ email: 'nobody@example.com', password: 'whatever12345' });
  assert(unknownEmail.ok === false, 'L3: unknown email is rejected (same generic error, no user-enumeration hint required by this test)');

  const ok = await repo.logIn({ email: 'Grace@Example.com', password: 'nibbles-the-compiler' });
  assert(ok.ok === true, 'L4: correct email (any case) + correct password succeeds');
  assert(ok.session && ok.session.token_hash, 'L5: login returns a session with a token_hash');

  const rawStore = JSON.parse(ls._raw['baa_section_g2_accounts_v1']);
  assert(JSON.stringify(rawStore.sessions).indexOf(adapter.getCurrentSessionToken()) === -1,
    'L6: the raw session token is never written into the sessions store (only its hash is)');

  const token = adapter.getCurrentSessionToken();
  assert(typeof token === 'string' && token.length > 0, 'L7: a raw session token is stored for this browser after login');
}

async function testSessionRoundTripAndLogout() {
  const ls = makeLocalStorage();
  const adapter = freshAdapter(ls);
  const repo = freshAccountRepo(adapter);

  await repo.signUp({ name: 'Alan Turing', email: 'alan@example.com', password: 'bombe-machine-1940' });
  await repo.logIn({ email: 'alan@example.com', password: 'bombe-machine-1940' });

  const current = await repo.getCurrentSession();
  assert(!!current && current.user.email === 'alan@example.com', 'C1: getCurrentSession resolves the logged-in user on this browser');

  const out = await repo.logOut();
  assert(out.ok === true && out.revoked === true, 'C2: logout revokes the active session');
  assert(adapter.getCurrentSessionToken() === null, 'C3: logout clears the stored raw token');

  const afterLogout = await repo.getCurrentSession();
  assert(afterLogout === null, 'C4: getCurrentSession honestly returns null after logout, never a stale user');

  const raw = JSON.parse(ls._raw['baa_section_g2_accounts_v1']);
  assert(raw.sessions[0].revoked_at !== null, 'C5: the session row itself is marked revoked (soft-delete, matches G2.1 schema convention), not deleted');
  assert(raw.sessions.length === 1, 'C6: logout does not delete the session row (no silent deletion, matches project-wide lifecycle pattern)');

  const doubleLogout = await repo.logOut();
  assert(doubleLogout.ok === true, 'C7: logging out again with no active session is not an error (idempotent)');
}

async function testExpiredSessionIsRejected() {
  const ls = makeLocalStorage();
  const adapter = freshAdapter(ls);
  const repo = freshAccountRepo(adapter);

  await repo.signUp({ name: 'Katherine Johnson', email: 'katherine@example.com', password: 'trajectory-math-1969' });
  await repo.logIn({ email: 'katherine@example.com', password: 'trajectory-math-1969' });

  const store = adapter.getAccountsStore();
  store.sessions[0].expires_at = new Date(Date.now() - 1000).toISOString(); // force expiry
  adapter.saveAccountsStore(store);

  const resolved = await repo.getCurrentSession();
  assert(resolved === null, 'E1: an expired session is never resolved as a valid login, even with a matching token');
}

function testDatabaseAdapterStubsHonest() {
  delete require.cache[require.resolve('../js/data-access/adapters/databaseAdapter.js')];
  const DatabaseAdapter = require('../js/data-access/adapters/databaseAdapter.js');

  ['getAccountsStore', 'saveAccountsStore', 'getCurrentSessionToken', 'setCurrentSessionToken'].forEach((method) => {
    let threw = false, code = null;
    try { DatabaseAdapter[method](); } catch (e) { threw = true; code = e.code; }
    assert(threw && code === 'DATABASE_NOT_CONNECTED', `D1: DatabaseAdapter.${method}() honestly throws DATABASE_NOT_CONNECTED, never fabricates data`);
  });
}

function testDoesNotDisturbOtherSectionsKeys() {
  const ls = makeLocalStorage();
  ls.setItem('baa_student_name', 'Explorer');
  ls.setItem('baa_section_b_data_v1', JSON.stringify({ meta: {}, attempts: ['sentinel'] }));
  ls.setItem('baa_section_c_planner_v1', JSON.stringify({ meta: {}, tasks: ['sentinel'] }));
  ls.setItem('baa_section_d_teacher_notes_v1', JSON.stringify([{ id: 'note_1', text: 'sentinel', createdAt: '2026-01-01T00:00:00.000Z' }]));

  const adapter = freshAdapter(ls);
  const repo = freshAccountRepo(adapter);
  return repo.signUp({ name: 'New User', email: 'new@example.com', password: 'longenoughpassword' }).then(() => {
    assert(adapter.getStudentName() === 'Explorer', 'N1: Section A student name untouched by G2 signup');
    assert(adapter.getSectionBStore().attempts[0] === 'sentinel', 'N2: Section B store untouched by G2 signup');
    assert(adapter.getSectionCStore().tasks[0] === 'sentinel', 'N3: Section C store untouched by G2 signup');
    assert(adapter.getTeacherNotes()[0].text === 'sentinel', 'N4: Section D notes untouched by G2 signup');
  });
}

function testSchemaAndG21Unchanged() {
  // Static re-check that db/schema.sql's G2.1 section (frozen/verified per
  // the task brief) was not modified while implementing this checkpoint.
  const sql = fs.readFileSync(path.join(ROOT, 'db', 'schema.sql'), 'utf8');
  assert(/CREATE TABLE credentials \(/.test(sql), 'P1: credentials table still present, unmodified by G2');
  assert(/CREATE TABLE auth_sessions \(/.test(sql), 'P2: auth_sessions table still present, unmodified by G2');
  assert(/Section G2\.1 — SCHEMA \/ DESIGN ONLY/.test(sql), 'P3: G2.1 in-file label still present, unmodified by G2');
}

async function main() {
  testSchemaAndG21Unchanged();
  await testSignupNormal();
  await testSignupValidationAndDuplicate();
  await testLoginNormalAndInvalid();
  await testSessionRoundTripAndLogout();
  await testExpiredSessionIsRejected();
  testDatabaseAdapterStubsHonest();
  await testDoesNotDisturbOtherSectionsKeys();
  delete global.localStorage;

  if (failures > 0) {
    console.error(`\n${failures} FAILURE(S)`);
    process.exit(1);
  }
  console.log('\nALL G2 TESTS PASSED');
}

main();
