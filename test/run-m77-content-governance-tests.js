// test/run-m77-content-governance-tests.js
// BAA M77 — Content Governance & Certification (Blueprint V3.2/V3.3).
// Same extraction-and-execute discipline as M64-M76.
//
// Coverage:
//   G3 authorization    — only admin can certify or view the dashboard; teacher/admin can view history
//   G4 evidence honesty — certification is impossible unless content is ALREADY verified (+published where applicable) — never a shortcut around a module's own governance gate
//   G2 handler         — certify/history/dashboard all actually run against real rows
//
// NOT LIVE-VERIFIED — DATABASE ACCESS UNAVAILABLE.

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

function extractBlock() {
  const src = fs.readFileSync(path.join(ROOT, 'api/v1/[...route].js'), 'utf8');
  const start = src.indexOf('/* ================ content-governance.js ================ */');
  assert.ok(start >= 0, 'content-governance.js block not found');
  const end = src.indexOf('\nexport default async function handler', start);
  assert.ok(end > start, 'could not find end of content-governance.js block');
  return src.slice(start, end);
}

function makeFakeSql(state) {
  return async function sql(strings, ...values) {
    const q = strings.join('?').replace(/\s+/g, ' ').trim();
    if (q.startsWith('SELECT status, verification_status FROM board_questions')) return { rows: state.boardQuestions.filter(b => b.id === values[0]).map(b => ({ status: b.status, verification_status: b.verification_status })) };
    if (q.startsWith('SELECT status, verification_status FROM exam_papers')) return { rows: state.examPapers.filter(b => b.id === values[0]).map(b => ({ status: b.status, verification_status: b.verification_status })) };
    if (q.startsWith('SELECT verification_status FROM board_question_translations')) return { rows: state.translations.filter(b => b.id === values[0]).map(b => ({ verification_status: b.verification_status })) };
    if (q.startsWith('INSERT INTO certification_events')) { const [id0, contentType, contentId, userId, note, createdAt] = values; state.events.push({ id: id0, content_type: contentType, content_id: contentId, certified_by_user_id: userId, note, created_at: createdAt }); return { rows: [], count: 1 }; }
    if (q.startsWith('SELECT id, certified_by_user_id, note, created_at FROM certification_events')) { const [contentType, contentId] = values; return { rows: state.events.filter(e => e.content_type === contentType && e.content_id === contentId) }; }
    if (q.startsWith('SELECT status, verification_status, COUNT(*)::int AS count FROM board_questions')) return { rows: state.dashboard?.boardQuestions || [] };
    if (q.startsWith('SELECT status, verification_status, COUNT(*)::int AS count FROM exam_papers')) return { rows: state.dashboard?.examPapers || [] };
    if (q.startsWith('SELECT verification_status, COUNT(*)::int AS count FROM board_question_translations')) return { rows: state.dashboard?.translations || [] };
    if (q.startsWith('SELECT status, COUNT(*)::int AS count FROM ingestion_jobs')) return { rows: state.dashboard?.ingestionJobs || [] };
    throw new Error('Unhandled fake-sql query in M77 test: ' + q);
  };
}

function loadHandler(state, session) {
  const block = extractBlock();
  const sandbox = {
    console, Date, JSON, Math, Number, String, Object, Array, Set, Map, Error, Promise, RegExp,
    global: {},
    sql: makeFakeSql(state),
    json: (res, status, body) => { res.statusCode = status; res.body = body; return res; },
    id: (p) => `${p}_${Math.random().toString(36).slice(2, 8)}`,
    writeAudit: async () => {},
    requireAuth: async () => session,
    hasRole: (s, role) => s.roles.includes(role),
  };
  vm.createContext(sandbox);
  vm.runInContext(block + '\nglobal.__h = handler_content_governance;\n', sandbox);
  return sandbox.global.__h;
}

function makeRes() { return { statusCode: null, body: null, setHeader() {}, status(s) { this.statusCode = s; return this; }, json(b) { this.body = b; return this; } }; }

const adminSession = { user_id: 'u_admin', roles: ['admin'] };
const teacherSession = { user_id: 'u_teacher', roles: ['teacher'] };

function freshState() { return { boardQuestions: [], examPapers: [], translations: [], events: [] }; }

(async () => {
  await test('G3: a teacher cannot certify content', async () => {
    const state = freshState();
    state.boardQuestions.push({ id: 'q1', status: 'published', verification_status: 'verified' });
    const h = loadHandler(state, teacherSession);
    const res = makeRes();
    await h({ method: 'POST', query: {}, body: { contentType: 'board_question', contentId: 'q1' } }, res);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(state.events.length, 0);
  });

  await test('G4: content that is not yet verified cannot be certified', async () => {
    const state = freshState();
    state.boardQuestions.push({ id: 'q1', status: 'published', verification_status: 'pending_verification' });
    const h = loadHandler(state, adminSession);
    const res = makeRes();
    await h({ method: 'POST', query: {}, body: { contentType: 'board_question', contentId: 'q1' } }, res);
    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(res.body.error.code, 'NOT_VERIFIED');
  });

  await test('G4: verified but NOT published content cannot be certified', async () => {
    const state = freshState();
    state.boardQuestions.push({ id: 'q1', status: 'draft', verification_status: 'verified' });
    const h = loadHandler(state, adminSession);
    const res = makeRes();
    await h({ method: 'POST', query: {}, body: { contentType: 'board_question', contentId: 'q1' } }, res);
    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(res.body.error.code, 'NOT_PUBLISHED');
  });

  await test('G2: verified + published content CAN be certified, and it is logged permanently', async () => {
    const state = freshState();
    state.boardQuestions.push({ id: 'q1', status: 'published', verification_status: 'verified' });
    const h = loadHandler(state, adminSession);
    const res = makeRes();
    await h({ method: 'POST', query: {}, body: { contentType: 'board_question', contentId: 'q1', note: 'Matches board syllabus.' } }, res);
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(state.events.length, 1);
    assert.strictEqual(state.events[0].certified_by_user_id, 'u_admin');
  });

  await test('G4: a translation (no status column, only verification_status) can be certified once verified', async () => {
    const state = freshState();
    state.translations.push({ id: 't1', verification_status: 'verified' });
    const h = loadHandler(state, adminSession);
    const res = makeRes();
    await h({ method: 'POST', query: {}, body: { contentType: 'board_question_translation', contentId: 't1' } }, res);
    assert.strictEqual(res.statusCode, 201);
  });

  await test('G1: an invalid contentType is rejected', async () => {
    const state = freshState();
    const h = loadHandler(state, adminSession);
    const res = makeRes();
    await h({ method: 'POST', query: {}, body: { contentType: 'something_else', contentId: 'x' } }, res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error.code, 'INVALID_CONTENT_TYPE');
  });

  await test('G3: a teacher CAN view certification history (read-only)', async () => {
    const state = freshState();
    state.events.push({ id: 'e1', content_type: 'board_question', content_id: 'q1', certified_by_user_id: 'u_admin', note: null, created_at: 't' });
    const h = loadHandler(state, teacherSession);
    const res = makeRes();
    await h({ method: 'GET', query: { contentType: 'board_question', contentId: 'q1' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.certifications.length, 1);
  });

  await test('G3: only admin can view the governance dashboard', async () => {
    const state = freshState();
    const h = loadHandler(state, teacherSession);
    const res = makeRes();
    await h({ method: 'GET', query: { view: 'dashboard' } }, res);
    assert.strictEqual(res.statusCode, 403);
  });

  await test('G2: the dashboard returns real, distinct counts across all content types', async () => {
    const state = freshState();
    state.dashboard = {
      boardQuestions: [{ status: 'draft', verification_status: 'pending_verification', count: 5 }],
      examPapers: [{ status: 'published', verification_status: 'verified', count: 2 }],
      translations: [{ verification_status: 'needs_review', count: 1 }],
      ingestionJobs: [{ status: 'needs_review', count: 3 }],
    };
    const h = loadHandler(state, adminSession);
    const res = makeRes();
    await h({ method: 'GET', query: { view: 'dashboard' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.boardQuestions[0].count, 5);
    assert.strictEqual(res.body.openIngestionJobs[0].count, 3);
  });

  console.log(failures === 0 ? '\nALL M77 CONTENT GOVERNANCE TESTS PASSED' : `\n${failures} M77 TEST(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})();
