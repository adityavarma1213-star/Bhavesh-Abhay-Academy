// test/run-m64-board-registry-tests.js
// BAA M64 — India Board & Exam Registry (Blueprint V3.2, IB-01/IB-02).
//
// Unlike the static pattern-matching style used for some earlier router
// additions in this file's history (see run-g7-planner-sync-tests.js's own
// comment on why it didn't commit a full mock-DB test), this test DOES
// extract and actually execute the real board-registry handler code from
// api/v1/[...route].js against an in-memory fake `sql` tagged-template
// function — because a schema/contract + concurrency claim for a new
// module needs more than "the right identifiers appear in the source".
//
// Coverage, mapped to the blueprint's own gates:
//   G1 schema/contract — migration 023 has the columns/constraints the API assumes
//   G2 handler         — GET list/GET by id/POST create/PATCH update actually run
//   G3 authorization    — non-admin cannot create or update a board
//   G5 concurrency      — a stale expectedVersion on PATCH is rejected, not silently applied
//
// This is a mock-database test, not a live-database test — POSTGRES_URL is
// not configured in this environment, so this cannot and does not claim
// live-database verification (see REPO-TRUTH-REPORT-2026-09-02.md).

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
let failures = 0;
async function test(name, fn) {
  try { await fn(); console.log('PASS:', name); }
  catch (e) { console.error('FAIL:', name, '\n ', e.stack || e); failures++; }
}

// ---------- G1: schema/contract check against the actual migration file ----------
const migration = fs.readFileSync(path.join(ROOT, 'db/migrations/023_board_registry.sql'), 'utf8');

function testSchema(name, fn) {
  try { fn(); console.log('PASS:', name); }
  catch (e) { console.error('FAIL:', name, '\n ', e.stack || e); failures++; }
}

testSchema('G1: boards table has the columns the API depends on', () => {
  for (const col of ['id', 'name', 'short_name', 'board_type', 'state_ut', 'official_source_url', 'verification_status', 'verification_note', 'status', 'version', 'created_at', 'updated_at']) {
    assert.ok(migration.includes(col), `boards table missing column referenced by API: ${col}`);
  }
});
testSchema('G1: board_type is constrained to the three documented values', () => {
  assert.ok(/board_type IN \('national', 'state_ut', 'international'\)/.test(migration));
});
testSchema('G1: boards.id is the primary key (uniqueness the API\'s 409-on-duplicate relies on)', () => {
  assert.ok(/id TEXT PRIMARY KEY/.test(migration));
});
testSchema('G1: an append-only audit table exists for governance actions', () => {
  assert.ok(migration.includes('board_registry_audit'));
});
testSchema('G1: seed data is provenance-honest — CISCE is needs_review, not falsely verified', () => {
  const cisceLine = migration.split('\n').find(l => l.trim().startsWith("('cisce'"));
  assert.ok(cisceLine, 'could not find the CISCE seed row');
  assert.ok(cisceLine.includes('needs_review'), 'CISCE seed row must reflect the real domain-ambiguity finding, not a confident verified claim');
});
testSchema('G1: no State/UT board is seeded without the same verification effort (no hard-coded single-board claim)', () => {
  assert.ok(!/'state_ut'/.test(migration.split('INSERT INTO boards')[1] || ''), 'a state_ut board should not be seeded without individual verification in this pass');
});

// ---------- G2/G3/G5: extract and actually run the real handler ----------
function extractBoardRegistryBlock() {
  const src = fs.readFileSync(path.join(ROOT, 'api/v1/[...route].js'), 'utf8');
  const startMarker = '/* ================ board-registry.js ================ */';
  const start = src.indexOf(startMarker);
  assert.ok(start >= 0, 'board-registry.js block marker not found in api/v1/[...route].js');
  const afterStart = src.indexOf('\n', start) + 1;
  const nextMarker = src.indexOf('\nexport default async function handler', afterStart);
  assert.ok(nextMarker > afterStart, 'could not find the end of the board-registry.js block');
  return src.slice(afterStart, nextMarker);
}

function makeFakeSql(state) {
  // A tiny subset of the `postgres` tagged-template contract, just enough
  // for the queries board-registry.js actually issues. Not a general SQL
  // engine — it pattern-matches on the query shape, which is legitimate
  // for a handler-level test as long as every query the handler issues is
  // represented (asserted implicitly: any unhandled shape throws below).
  return async function sql(strings, ...values) {
    const q = strings.join('?').replace(/\s+/g, ' ').trim();
    if (q.startsWith('SELECT * FROM boards WHERE id = ?')) {
      const [boardId] = values;
      const rows = state.boards.filter(b => b.id === boardId);
      return { rows };
    }
    if (q.startsWith('SELECT id FROM boards WHERE id = ?')) {
      const [boardId] = values;
      return { rows: state.boards.filter(b => b.id === boardId).map(b => ({ id: b.id })) };
    }
    if (q.startsWith('SELECT * FROM boards WHERE')) {
      const [boardType, boardType2, stateUt, stateUt2, includeInactive] = values;
      let rows = state.boards.slice();
      if (boardType) rows = rows.filter(b => b.board_type === boardType);
      if (stateUt) rows = rows.filter(b => b.state_ut === stateUt);
      if (!includeInactive) rows = rows.filter(b => b.status === 'active');
      rows = rows.slice().sort((a, b) => a.board_type.localeCompare(b.board_type) || a.name.localeCompare(b.name));
      return { rows };
    }
    if (q.startsWith('SELECT id, year_label')) {
      const [boardId] = values;
      return { rows: state.academicYears.filter(y => y.board_id === boardId) };
    }
    if (q.startsWith('INSERT INTO boards')) {
      const [boardId, name, shortName, boardType, stateUt, url, verStatus, verNote, status, version, createdAt, updatedAt] = values;
      state.boards.push({ id: boardId, name, short_name: shortName, board_type: boardType, state_ut: stateUt, official_source_url: url, verification_status: verStatus, verification_note: verNote, status, version, created_at: createdAt, updated_at: updatedAt });
      return { rows: [], count: 1 };
    }
    if (q.startsWith('INSERT INTO board_registry_audit')) {
      state.audit.push(values);
      return { rows: [], count: 1 };
    }
    if (q.startsWith('UPDATE boards SET')) {
      const [status, verStatus, verNote, url, updatedAt, boardId, expectedVersion] = values;
      const board = state.boards.find(b => b.id === boardId && b.version === expectedVersion);
      if (!board) return { rows: [], count: 0 };
      board.status = status; board.verification_status = verStatus; board.verification_note = verNote;
      board.official_source_url = url; board.version += 1; board.updated_at = updatedAt;
      return { rows: [], count: 1 };
    }
    throw new Error('Unhandled fake-sql query shape in test: ' + q);
  };
}

function loadHandler(state, session) {
  const block = extractBoardRegistryBlock();
  const src = block + '\nglobal.__handler = handler_board_registry;\n';
  const sandbox = {
    console, Date, JSON, Math, Number, String, Object, Array, Set, Map, Error, Promise, RegExp,
    global: {},
    sql: makeFakeSql(state),
    json: (res, status, body) => { res.statusCode = status; res.body = body; return res; },
    id: (prefix) => `${prefix}_test_${Math.random().toString(36).slice(2, 8)}`,
    writeAudit: async () => {},
    requireAuth: async () => session,
    hasRole: (s, role) => s.roles.includes(role),
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'board-registry.js (extracted)' });
  return sandbox.global.__handler;
}

function makeRes() {
  return { statusCode: null, body: null, setHeader() {}, status(s) { this.statusCode = s; return this; }, json(b) { this.body = b; return this; } };
}

const adminSession = { user_id: 'u_admin', roles: ['admin'] };
const studentSession = { user_id: 'u_student', roles: ['student'] };

(async () => {
  await test('G2: GET (list) returns active boards, newest schema shape', async () => {
    const state = { boards: [{ id: 'cbse', name: 'Central Board of Secondary Education', short_name: 'CBSE', board_type: 'national', state_ut: null, official_source_url: 'https://www.cbse.gov.in', verification_status: 'verified', verification_note: null, status: 'active', version: 1, created_at: 't', updated_at: 't' }], academicYears: [], audit: [] };
    const handler = loadHandler(state, studentSession);
    const req = { method: 'GET', query: {} };
    const res = makeRes();
    await handler(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.boards.length, 1);
    assert.strictEqual(res.body.boards[0].shortName, 'CBSE');
  });

  await test('G2: GET by id 404s cleanly for an unknown board', async () => {
    const state = { boards: [], academicYears: [], audit: [] };
    const handler = loadHandler(state, studentSession);
    const req = { method: 'GET', query: { id: 'does-not-exist' } };
    const res = makeRes();
    await handler(req, res);
    assert.strictEqual(res.statusCode, 404);
    assert.strictEqual(res.body.error.code, 'BOARD_NOT_FOUND');
  });

  await test('G3: a non-admin cannot create a board (403, no row written)', async () => {
    const state = { boards: [], academicYears: [], audit: [] };
    const handler = loadHandler(state, studentSession);
    const req = { method: 'POST', query: {}, body: { id: 'new-board', name: 'X', shortName: 'X', boardType: 'national', officialSourceUrl: 'https://example.gov.in' } };
    const res = makeRes();
    await handler(req, res);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(state.boards.length, 0, 'no board should have been written by a non-admin request');
  });

  await test('G2: an admin can create a board with valid data', async () => {
    const state = { boards: [], academicYears: [], audit: [] };
    const handler = loadHandler(state, adminSession);
    const req = { method: 'POST', query: {}, body: { id: 'mh-ssc', name: 'Maharashtra State Board of Secondary and Higher Secondary Education', shortName: 'MSBSHSE', boardType: 'state_ut', stateUt: 'Maharashtra', officialSourceUrl: 'https://mahahsscboard.in', verificationStatus: 'pending_verification' } };
    const res = makeRes();
    await handler(req, res);
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(state.boards.length, 1);
    assert.strictEqual(state.audit.length, 1, 'a governance audit row must be written on create');
  });

  await test('G2: creating a state_ut board without stateUt is rejected', async () => {
    const state = { boards: [], academicYears: [], audit: [] };
    const handler = loadHandler(state, adminSession);
    const req = { method: 'POST', query: {}, body: { id: 'x', name: 'X', shortName: 'X', boardType: 'state_ut', officialSourceUrl: 'https://example.gov.in' } };
    const res = makeRes();
    await handler(req, res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error.code, 'STATE_UT_REQUIRED');
  });

  await test('G2: creating with a non-https source URL is rejected (provenance is not optional)', async () => {
    const state = { boards: [], academicYears: [], audit: [] };
    const handler = loadHandler(state, adminSession);
    const req = { method: 'POST', query: {}, body: { id: 'x', name: 'X', shortName: 'X', boardType: 'national', officialSourceUrl: 'http://example.gov.in' } };
    const res = makeRes();
    await handler(req, res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error.code, 'INVALID_SOURCE_URL');
  });

  await test('G2: duplicate board id is rejected with 409', async () => {
    const state = { boards: [{ id: 'cbse', name: 'CBSE', short_name: 'CBSE', board_type: 'national', state_ut: null, official_source_url: 'https://www.cbse.gov.in', verification_status: 'verified', verification_note: null, status: 'active', version: 1, created_at: 't', updated_at: 't' }], academicYears: [], audit: [] };
    const handler = loadHandler(state, adminSession);
    const req = { method: 'POST', query: {}, body: { id: 'cbse', name: 'X', shortName: 'X', boardType: 'national', officialSourceUrl: 'https://example.gov.in' } };
    const res = makeRes();
    await handler(req, res);
    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(res.body.error.code, 'BOARD_ALREADY_EXISTS');
  });

  await test('G3: a non-admin cannot update a board', async () => {
    const state = { boards: [{ id: 'cbse', name: 'CBSE', short_name: 'CBSE', board_type: 'national', state_ut: null, official_source_url: 'https://www.cbse.gov.in', verification_status: 'verified', verification_note: null, status: 'active', version: 1, created_at: 't', updated_at: 't' }], academicYears: [], audit: [] };
    const handler = loadHandler(state, studentSession);
    const req = { method: 'PATCH', query: { id: 'cbse' }, body: { status: 'inactive', expectedVersion: 1 } };
    const res = makeRes();
    await handler(req, res);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(state.boards[0].status, 'active', 'status must not change on a forbidden request');
  });

  await test('G5: PATCH with the correct expectedVersion succeeds and increments version', async () => {
    const state = { boards: [{ id: 'cbse', name: 'CBSE', short_name: 'CBSE', board_type: 'national', state_ut: null, official_source_url: 'https://www.cbse.gov.in', verification_status: 'verified', verification_note: null, status: 'active', version: 1, created_at: 't', updated_at: 't' }], academicYears: [], audit: [] };
    const handler = loadHandler(state, adminSession);
    const req = { method: 'PATCH', query: { id: 'cbse' }, body: { status: 'active', verificationStatus: 'verified', officialSourceUrl: 'https://www.cbse.gov.in', expectedVersion: 1 } };
    const res = makeRes();
    await handler(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(state.boards[0].version, 2);
    assert.strictEqual(state.audit.length, 1, 'a governance audit row must be written on update');
  });

  await test('G5: PATCH with a stale expectedVersion is rejected with 409, not silently applied', async () => {
    const state = { boards: [{ id: 'cbse', name: 'CBSE', short_name: 'CBSE', board_type: 'national', state_ut: null, official_source_url: 'https://www.cbse.gov.in', verification_status: 'verified', verification_note: null, status: 'active', version: 3, created_at: 't', updated_at: 't' }], academicYears: [], audit: [] };
    const handler = loadHandler(state, adminSession);
    // A caller who last read version 1 tries to update, unaware someone else already moved it to version 3.
    const req = { method: 'PATCH', query: { id: 'cbse' }, body: { status: 'inactive', verificationStatus: 'verified', officialSourceUrl: 'https://www.cbse.gov.in', expectedVersion: 1 } };
    const res = makeRes();
    await handler(req, res);
    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(res.body.error.code, 'STALE_VERSION');
    assert.strictEqual(state.boards[0].status, 'active', 'the stale write must not be applied — status must be unchanged');
    assert.strictEqual(state.boards[0].version, 3, 'version must not advance on a rejected stale write');
  });

  await test('G2: PATCH without expectedVersion is rejected (concurrency control cannot be bypassed by omission)', async () => {
    const state = { boards: [{ id: 'cbse', name: 'CBSE', short_name: 'CBSE', board_type: 'national', state_ut: null, official_source_url: 'https://www.cbse.gov.in', verification_status: 'verified', verification_note: null, status: 'active', version: 1, created_at: 't', updated_at: 't' }], academicYears: [], audit: [] };
    const handler = loadHandler(state, adminSession);
    const req = { method: 'PATCH', query: { id: 'cbse' }, body: { status: 'inactive', verificationStatus: 'verified', officialSourceUrl: 'https://www.cbse.gov.in' } };
    const res = makeRes();
    await handler(req, res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error.code, 'EXPECTED_VERSION_REQUIRED');
  });

  console.log(failures === 0 ? '\nALL M64 BOARD REGISTRY TESTS PASSED' : `\n${failures} M64 BOARD REGISTRY TEST(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})();
