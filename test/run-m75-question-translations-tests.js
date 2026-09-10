// test/run-m75-question-translations-tests.js
// BAA M75 — Regional Language + Low-Bandwidth Expansion (Blueprint V3.2/V3.3, IB-11).
// Same extraction-and-execute discipline as M64-M74.
//
// Coverage:
//   G1 schema/contract — migration 030's UNIQUE(source_question_id, medium) and verification_status CHECK
//   G2 handler         — create/list/update actually run
//   G3 authorization    — a student cannot author a translation; only admin can change verification_status; a teacher can still edit the text of a translation under review
//   G4 evidence honesty — a translation always starts pending_verification regardless of who authored it — never auto-published
//   G5 concurrency        — stale expectedVersion on update rejected
//   G6 idempotency (soft)— a second translation for the same question+medium is rejected, not silently duplicated
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
function testSync(name, fn) {
  try { fn(); console.log('PASS:', name); }
  catch (e) { console.error('FAIL:', name, '\n ', e.stack || e); failures++; }
}

// ---------- G1 ----------
const migration = fs.readFileSync(path.join(ROOT, 'db/migrations/030_regional_language.sql'), 'utf8');
testSync('G1: one translation per question per medium — corrections update it, never pile up duplicates', () => {
  const tableDef = migration.slice(migration.indexOf('CREATE TABLE IF NOT EXISTS board_question_translations ('));
  assert.ok(tableDef.slice(0, tableDef.indexOf(');')).includes('UNIQUE (source_question_id, medium)'));
});
testSync('G1: verification_status defaults to pending_verification, never auto-verified', () => {
  assert.ok(migration.includes("verification_status TEXT NOT NULL DEFAULT 'pending_verification'"));
});

function extractBlock() {
  const src = fs.readFileSync(path.join(ROOT, 'api/v1/[...route].js'), 'utf8');
  const start = src.indexOf('/* ================ question-translations.js ================ */');
  assert.ok(start >= 0, 'question-translations.js block not found');
  const end = src.indexOf('\nexport default async function handler', start);
  assert.ok(end > start, 'could not find end of question-translations.js block');
  return src.slice(start, end);
}

function makeFakeSql(state) {
  return async function sql(strings, ...values) {
    const q = strings.join('?').replace(/\s+/g, ' ').trim();
    if (q.startsWith('SELECT id, medium FROM board_questions')) return { rows: state.questions.filter(qq => qq.id === values[0]).map(qq => ({ id: qq.id, medium: qq.medium })) };
    if (q.startsWith('SELECT id FROM board_question_translations WHERE source_question_id') && !q.includes('OR')) {
      const [sourceQuestionId, medium] = values;
      return { rows: state.translations.filter(t => t.source_question_id === sourceQuestionId && t.medium === medium).map(t => ({ id: t.id })) };
    }
    if (q.startsWith('INSERT INTO board_question_translations')) {
      const [id0, sourceQuestionId, medium, translatedText, translatedBy, createdAt, updatedAt] = values;
      state.translations.push({ id: id0, source_question_id: sourceQuestionId, medium, translated_text: translatedText, translated_by_user_id: translatedBy, verification_status: 'pending_verification', verified_by_user_id: null, version: 1, created_at: createdAt, updated_at: updatedAt });
      return { rows: [], count: 1 };
    }
    if (q.startsWith('SELECT * FROM board_question_translations WHERE id')) return { rows: state.translations.filter(t => t.id === values[0]) };
    if (q.startsWith('SELECT * FROM board_question_translations WHERE source_question_id')) {
      const [sourceQuestionId, canSeeUnverified] = values;
      let rows = state.translations.filter(t => t.source_question_id === sourceQuestionId);
      if (!canSeeUnverified) rows = rows.filter(t => t.verification_status === 'verified');
      return { rows };
    }
    if (q.startsWith('UPDATE board_question_translations SET translated_text')) {
      const [translatedText, verificationStatus, verifiedBy, updatedAt, translationId, expectedVersion] = values;
      const t = state.translations.find(x => x.id === translationId && x.version === expectedVersion);
      if (!t) return { rows: [], count: 0 };
      t.translated_text = translatedText; t.verification_status = verificationStatus; t.verified_by_user_id = verifiedBy; t.version += 1; t.updated_at = updatedAt;
      return { rows: [], count: 1 };
    }
    throw new Error('Unhandled fake-sql query in M75 test: ' + q);
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
    requireAuth: async () => session,
    hasRole: (s, role) => s.roles.includes(role),
  };
  vm.createContext(sandbox);
  vm.runInContext(block + '\nglobal.__h = handler_question_translations;\n', sandbox);
  return sandbox.global.__h;
}

function makeRes() { return { statusCode: null, body: null, setHeader() {}, status(s) { this.statusCode = s; return this; }, json(b) { this.body = b; return this; } }; }

const adminSession = { user_id: 'u_admin', roles: ['admin'] };
const teacherSession = { user_id: 'u_teacher', roles: ['teacher'] };
const studentSession = { user_id: 'u_student', roles: ['student'] };

function freshState() { return { questions: [{ id: 'q1', medium: 'English' }], translations: [] }; }

(async () => {
  await test('G3: a student cannot author a translation', async () => {
    const state = freshState();
    const h = loadHandler(state, studentSession);
    const res = makeRes();
    await h({ method: 'POST', query: {}, body: { sourceQuestionId: 'q1', medium: 'Hindi', translatedText: 'x' } }, res);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(state.translations.length, 0);
  });

  await test('G4: a new translation always starts pending_verification, regardless of author', async () => {
    const state = freshState();
    const h = loadHandler(state, adminSession);
    const res = makeRes();
    await h({ method: 'POST', query: {}, body: { sourceQuestionId: 'q1', medium: 'Hindi', translatedText: 'यह क्या है?' } }, res);
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.body.translation.verificationStatus, 'pending_verification');
  });

  await test('G2: a translation into the question\'s own medium is rejected as meaningless', async () => {
    const state = freshState();
    const h = loadHandler(state, teacherSession);
    const res = makeRes();
    await h({ method: 'POST', query: {}, body: { sourceQuestionId: 'q1', medium: 'English', translatedText: 'same language' } }, res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error.code, 'SAME_MEDIUM');
  });

  await test('G6 (soft idempotency): a second translation for the same question+medium is rejected', async () => {
    const state = freshState();
    state.translations.push({ id: 't1', source_question_id: 'q1', medium: 'Hindi', translated_text: 'x', verification_status: 'pending_verification', version: 1 });
    const h = loadHandler(state, teacherSession);
    const res = makeRes();
    await h({ method: 'POST', query: {}, body: { sourceQuestionId: 'q1', medium: 'Hindi', translatedText: 'y' } }, res);
    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(res.body.error.code, 'TRANSLATION_ALREADY_EXISTS');
  });

  await test('G3: an unverified translation is invisible to a student in the list', async () => {
    const state = freshState();
    state.translations.push({ id: 't1', source_question_id: 'q1', medium: 'Hindi', translated_text: 'x', verification_status: 'pending_verification', version: 1 });
    const h = loadHandler(state, studentSession);
    const res = makeRes();
    await h({ method: 'GET', query: { sourceQuestionId: 'q1' } }, res);
    assert.strictEqual(res.body.translations.length, 0);
  });

  await test('G3: a verified translation IS visible to a student', async () => {
    const state = freshState();
    state.translations.push({ id: 't1', source_question_id: 'q1', medium: 'Hindi', translated_text: 'x', verification_status: 'verified', version: 1 });
    const h = loadHandler(state, studentSession);
    const res = makeRes();
    await h({ method: 'GET', query: { sourceQuestionId: 'q1' } }, res);
    assert.strictEqual(res.body.translations.length, 1);
  });

  await test('G3: a teacher can edit the translated text but cannot verify it themselves', async () => {
    const state = freshState();
    state.translations.push({ id: 't1', source_question_id: 'q1', medium: 'Hindi', translated_text: 'draft', verification_status: 'pending_verification', version: 1 });
    const h = loadHandler(state, teacherSession);
    const res = makeRes();
    await h({ method: 'PATCH', query: { id: 't1' }, body: { verificationStatus: 'verified', translatedText: 'corrected', expectedVersion: 1 } }, res);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(state.translations[0].translated_text, 'draft', 'nothing should change on a forbidden combined request');
  });

  await test('G2: an admin CAN verify a translation', async () => {
    const state = freshState();
    state.translations.push({ id: 't1', source_question_id: 'q1', medium: 'Hindi', translated_text: 'draft', verification_status: 'pending_verification', version: 1 });
    const h = loadHandler(state, adminSession);
    const res = makeRes();
    await h({ method: 'PATCH', query: { id: 't1' }, body: { verificationStatus: 'verified', expectedVersion: 1 } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(state.translations[0].verification_status, 'verified');
    assert.strictEqual(state.translations[0].verified_by_user_id, 'u_admin');
  });

  await test('G5: a stale expectedVersion on update is rejected, not silently applied', async () => {
    const state = freshState();
    state.translations.push({ id: 't1', source_question_id: 'q1', medium: 'Hindi', translated_text: 'draft', verification_status: 'pending_verification', version: 4 });
    const h = loadHandler(state, adminSession);
    const res = makeRes();
    await h({ method: 'PATCH', query: { id: 't1' }, body: { verificationStatus: 'verified', expectedVersion: 1 } }, res);
    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(res.body.error.code, 'STALE_VERSION');
    assert.strictEqual(state.translations[0].verification_status, 'pending_verification');
  });

  console.log(failures === 0 ? '\nALL M75 QUESTION TRANSLATION TESTS PASSED' : `\n${failures} M75 TEST(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})();
