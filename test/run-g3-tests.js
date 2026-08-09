// test/run-g3-tests.js
// BAA OS — Section G3 tests.
//
// Covers:
//   - authorizationRepository.js: role assign/revoke/check, parent/teacher
//     relationship linking, class/class-member management, and the
//     canAccessLearner / canAccessClass decision functions.
//   - localStorageAdapter.js's new authorization storage methods.
//   - databaseAdapter.js's new stub methods (still honestly throw).
//   - that G3 does not disturb Sections A/B/C/D or the G1/G2/G2.1 stores
//     (regression; full A/B/C/D/G1/G2/G2.1 suites are also re-run
//     separately by their own files — this file adds a targeted check
//     that the G2 accounts key specifically is untouched by G3 writes).
//
// Run with: node test/run-g3-tests.js
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

function freshAuthzRepo(adapter) {
  delete require.cache[require.resolve('../js/data-access/repositories/authorizationRepository.js')];
  const AuthorizationRepository = require('../js/data-access/repositories/authorizationRepository.js');
  return AuthorizationRepository.getRepo(adapter);
}

// ---------------- Roles ----------------

async function testRoleAssignAndCheck() {
  const adapter = freshAdapter(makeLocalStorage());
  const authz = freshAuthzRepo(adapter);

  const res = await authz.assignRole('user_teacher_1', 'teacher');
  assert(res.ok === true && res.created === true, 'R1: assigning a documented role succeeds');
  assert(await authz.hasRole('user_teacher_1', 'teacher') === true, 'R2: hasRole recognizes the granted role');
  assert(await authz.hasRole('user_teacher_1', 'admin') === false, 'R3: hasRole honestly denies an ungranted role');

  const dup = await authz.assignRole('user_teacher_1', 'teacher');
  assert(dup.ok === true && dup.created === false, 'R4: re-assigning the same role is idempotent, not a duplicate');
  const roles = await authz.getRoles('user_teacher_1');
  assert(roles.length === 1, 'R5: user_roles has no duplicate (user_id, role) row after re-assign');
}

async function testRoleRejectsUndocumented() {
  const adapter = freshAdapter(makeLocalStorage());
  const authz = freshAuthzRepo(adapter);

  const res = await authz.assignRole('user_x', 'superadmin');
  assert(res.ok === false, 'R6: an undocumented role is rejected, not silently invented');
  assert(await authz.hasRole('user_x', 'superadmin') === false, 'R7: rejected role was never written');
}

async function testRoleRevoke() {
  const adapter = freshAdapter(makeLocalStorage());
  const authz = freshAuthzRepo(adapter);

  await authz.assignRole('user_multi', 'parent');
  await authz.assignRole('user_multi', 'teacher');
  const rev = await authz.revokeRole('user_multi', 'parent');
  assert(rev.ok === true && rev.revoked === true, 'R8: revoking a held role succeeds');
  const roles = await authz.getRoles('user_multi');
  assert(roles.indexOf('parent') === -1 && roles.indexOf('teacher') !== -1, 'R9: revoke removes only the targeted role (a user can be teacher AND parent — SCHEMA.md §3)');

  const revAgain = await authz.revokeRole('user_multi', 'parent');
  assert(revAgain.ok === true && revAgain.revoked === false, 'R10: revoking an already-absent role is idempotent, not an error');
}

// ---------------- Parent/teacher relationships + access ----------------

async function testParentAccessGranted() {
  const adapter = freshAdapter(makeLocalStorage());
  const authz = freshAuthzRepo(adapter);
  await authz.assignRole('user_parent_1', 'parent');
  await authz.linkParentToLearner('user_parent_1', 'learner_abc', 'parent');

  const decision = await authz.canAccessLearner('user_parent_1', 'learner_abc');
  assert(decision.allowed === true && decision.reason === 'parent_link', 'A1: linked parent is granted access via a real parent_learner row');
}

async function testUnauthorizedAccessDenied() {
  const adapter = freshAdapter(makeLocalStorage());
  const authz = freshAuthzRepo(adapter);
  await authz.assignRole('user_stranger', 'parent');
  // no link created

  const decision = await authz.canAccessLearner('user_stranger', 'learner_abc');
  assert(decision.allowed === false && decision.reason === 'no_relationship', 'A2: an unlinked user is denied, never granted by default');
}

async function testParentRevocationRemovesAccess() {
  const adapter = freshAdapter(makeLocalStorage());
  const authz = freshAuthzRepo(adapter);
  await authz.linkParentToLearner('user_parent_2', 'learner_xyz');
  assert((await authz.canAccessLearner('user_parent_2', 'learner_xyz')).allowed === true, 'A3: link grants access');

  await authz.revokeParentLink('user_parent_2', 'learner_xyz');
  const decision = await authz.canAccessLearner('user_parent_2', 'learner_xyz');
  assert(decision.allowed === false, 'A4: a revoked parent_learner link no longer grants access (status honored, row not deleted)');
}

async function testTeacherDirectLinkAccess() {
  const adapter = freshAdapter(makeLocalStorage());
  const authz = freshAuthzRepo(adapter);
  await authz.linkTeacherToLearner('user_teacher_2', 'learner_direct');
  const decision = await authz.canAccessLearner('user_teacher_2', 'learner_direct');
  assert(decision.allowed === true && decision.reason === 'teacher_link', 'A5: a direct teacher_learner link grants access');
}

async function testTeacherClassAccess() {
  const adapter = freshAdapter(makeLocalStorage());
  const authz = freshAuthzRepo(adapter);
  const clsRes = await authz.createClass('user_teacher_3', 'Algebra I', 'Mathematics');
  assert(clsRes.ok === true, 'A6: class creation succeeds');
  await authz.addClassMember(clsRes.class.id, 'learner_in_class');

  const allowed = await authz.canAccessLearner('user_teacher_3', 'learner_in_class');
  assert(allowed.allowed === true && allowed.reason === 'class_membership', 'A7: teacher of the class can access an active class member');

  const rosterCheck = await authz.canAccessClass('user_teacher_3', clsRes.class.id);
  assert(rosterCheck.allowed === true && rosterCheck.reason === 'class_owner', 'A8: the owning teacher can access the class roster');

  const otherTeacher = await authz.canAccessClass('user_teacher_other', clsRes.class.id);
  assert(otherTeacher.allowed === false, 'A9: a different teacher cannot access someone else\'s class roster');
}

async function testClassMemberRemoval() {
  const adapter = freshAdapter(makeLocalStorage());
  const authz = freshAuthzRepo(adapter);
  const cls = (await authz.createClass('user_teacher_4', 'Geometry')).class;
  await authz.addClassMember(cls.id, 'learner_leaving');
  await authz.removeClassMember(cls.id, 'learner_leaving');

  const decision = await authz.canAccessLearner('user_teacher_4', 'learner_leaving');
  assert(decision.allowed === false, 'A10: a removed class member no longer grants the teacher access');
}

async function testAdminAlwaysAllowed() {
  const adapter = freshAdapter(makeLocalStorage());
  const authz = freshAuthzRepo(adapter);
  await authz.assignRole('user_admin_1', 'admin');
  const decision = await authz.canAccessLearner('user_admin_1', 'learner_anything_not_linked');
  assert(decision.allowed === true && decision.reason === 'admin', 'A11: an admin role holder is granted access without needing a relationship row');
}

async function testSelfAccessRequiresOwnershipAndRole() {
  const adapter = freshAdapter(makeLocalStorage());
  const authz = freshAuthzRepo(adapter);
  await authz.assignRole('user_student_1', 'student');

  const ownSelf = await authz.canAccessLearner('user_student_1', 'learner_own', 'user_student_1');
  assert(ownSelf.allowed === true && ownSelf.reason === 'self', 'A12: a student can access their own learner record (learners.user_id match)');

  const someoneElse = await authz.canAccessLearner('user_student_1', 'learner_other', 'user_someone_else');
  assert(someoneElse.allowed === false, 'A13: a student cannot access a learner record owned by a different user');

  const unknownOwnership = await authz.canAccessLearner('user_student_1', 'learner_unlinked', null);
  assert(unknownOwnership.allowed === false, 'A14: unknown learner ownership never silently grants self-access');
}

async function testResourceOwnershipDenialsAreExplicit() {
  const adapter = freshAdapter(makeLocalStorage());
  const authz = freshAuthzRepo(adapter);
  const decision = await authz.canAccessLearner('', '');
  assert(decision.allowed === false && decision.reason === 'missing_identifier', 'A15: missing identifiers are denied with an explicit reason, never treated as a pass');
}

// ---------------- Backward compatibility / adapter / stub honesty ----------------

async function testAuthorizationStoreDefaultsEmpty() {
  const adapter = freshAdapter(makeLocalStorage());
  const store = adapter.getAuthorizationStore();
  assert(Array.isArray(store.userRoles) && store.userRoles.length === 0, 'B1: authorization store starts empty (no fabricated roles)');
  assert(Array.isArray(store.parentLearner) && store.parentLearner.length === 0, 'B2: authorization store starts with no fabricated parent links');
  assert(Array.isArray(store.classes) && store.classes.length === 0, 'B3: authorization store starts with no fabricated classes');
}

async function testDatabaseAdapterStubsHonestlyThrow() {
  delete require.cache[require.resolve('../js/data-access/adapters/databaseAdapter.js')];
  const DatabaseAdapter = require('../js/data-access/adapters/databaseAdapter.js');
  let threw = false;
  try { DatabaseAdapter.getAuthorizationStore(); } catch (e) { threw = e.code === 'DATABASE_NOT_CONNECTED'; }
  assert(threw, 'B4: DatabaseAdapter.getAuthorizationStore() honestly throws DATABASE_NOT_CONNECTED, never fabricates data');

  threw = false;
  try { DatabaseAdapter.saveAuthorizationStore(); } catch (e) { threw = e.code === 'DATABASE_NOT_CONNECTED'; }
  assert(threw, 'B5: DatabaseAdapter.saveAuthorizationStore() honestly throws DATABASE_NOT_CONNECTED, never fabricates data');
}

async function testG2AccountsStoreUntouchedByG3() {
  const ls = makeLocalStorage();
  const adapter = freshAdapter(ls);
  const authz = freshAuthzRepo(adapter);

  // Seed a G2-shaped accounts store the way accountRepository.js would.
  adapter.saveAccountsStore({
    users: [{ id: 'user_1', display_name: 'Ada', email: 'ada@example.com', created_at: 'x', updated_at: 'x', deactivated_at: null }],
    credentials: [{ user_id: 'user_1', password_hash: 'salt:hash', algorithm: 'sha256-salted-local-only', created_at: 'x', updated_at: 'x' }],
    sessions: [],
  });
  const before = JSON.stringify(adapter.getAccountsStore());

  await authz.assignRole('user_1', 'student');
  await authz.linkParentToLearner('user_parent', 'learner_1');
  await authz.createClass('user_1', 'Some Class');

  const after = JSON.stringify(adapter.getAccountsStore());
  assert(before === after, 'N1: G2 accounts store (users/credentials/sessions) is byte-for-byte untouched by G3 writes');
  assert(ls._raw['baa_section_g2_accounts_v1'] !== undefined, 'N2: G2 accounts localStorage key still exists, unaltered');
  assert(ls._raw['baa_section_g3_authorization_v1'] !== undefined, 'N3: G3 uses its own new localStorage key, not a reshaped G2 key');
}

async function testSectionABCDUntouchedByG3() {
  const ls = makeLocalStorage();
  ls.setItem('baa_student_name', 'Priya');
  ls.setItem('baa_section_b_data_v1', JSON.stringify({ meta: {}, attempts: ['seed'] }));
  ls.setItem('baa_section_c_planner_v1', JSON.stringify({ meta: {}, tasks: ['seed'] }));
  ls.setItem('baa_section_d_teacher_notes_v1', JSON.stringify([{ id: 'n1', text: 'seed', createdAt: 'x' }]));

  const adapter = freshAdapter(ls);
  const authz = freshAuthzRepo(adapter);
  await authz.assignRole('user_1', 'teacher');
  await authz.linkTeacherToLearner('user_1', 'learner_1');

  assert(ls.getItem('baa_student_name') === 'Priya', 'N4: Section A student name untouched by G3');
  assert(JSON.parse(ls.getItem('baa_section_b_data_v1')).attempts[0] === 'seed', 'N5: Section B store untouched by G3');
  assert(JSON.parse(ls.getItem('baa_section_c_planner_v1')).tasks[0] === 'seed', 'N6: Section C store untouched by G3');
  assert(JSON.parse(ls.getItem('baa_section_d_teacher_notes_v1'))[0].text === 'seed', 'N7: Section D notes untouched by G3');
}

async function main() {
  await testRoleAssignAndCheck();
  await testRoleRejectsUndocumented();
  await testRoleRevoke();
  await testParentAccessGranted();
  await testUnauthorizedAccessDenied();
  await testParentRevocationRemovesAccess();
  await testTeacherDirectLinkAccess();
  await testTeacherClassAccess();
  await testClassMemberRemoval();
  await testAdminAlwaysAllowed();
  await testSelfAccessRequiresOwnershipAndRole();
  await testResourceOwnershipDenialsAreExplicit();
  await testAuthorizationStoreDefaultsEmpty();
  await testDatabaseAdapterStubsHonestlyThrow();
  await testG2AccountsStoreUntouchedByG3();
  await testSectionABCDUntouchedByG3();

  if (failures > 0) {
    console.error(`\n${failures} FAILURE(S)`);
    process.exit(1);
  }
  console.log('\nALL G3 TESTS PASSED');
}

main();
