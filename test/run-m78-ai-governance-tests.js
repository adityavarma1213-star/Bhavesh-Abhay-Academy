// test/run-m78-ai-governance-tests.js
// BAA M78 — Multi-AI Innovation + Scalability Hardening (Blueprint V3.2/V3.3).
// Same extraction-and-execute discipline as M64-M77.
//
// Coverage:
//   G3 authorization — only admin can register/update providers or record decisions; any authenticated caller can log a usage event; only admin can view aggregated usage stats
//   G5 concurrency      — stale expectedVersion on provider update rejected
//   G6 idempotency (soft)— duplicate provider names rejected
//   G4 evidence honesty — usage stats response explicitly discloses it only reflects events actually recorded, not automatic instrumentation
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
  const start = src.indexOf('/* ================ ai-governance.js ================ */');
  assert.ok(start >= 0, 'ai-governance.js block not found');
  const end = src.indexOf('\nexport default async function handler', start);
  assert.ok(end > start, 'could not find end of ai-governance.js block');
  return src.slice(start, end);
}

function makeFakeSql(state) {
  return async function sql(strings, ...values) {
    const q = strings.join('?').replace(/\s+/g, ' ').trim();
    if (q.startsWith('SELECT id FROM ai_providers WHERE name')) return { rows: state.providers.filter(p => p.name === values[0]).map(p => ({ id: p.id })) };
    if (q.startsWith('INSERT INTO ai_providers')) { const [id0, name, modelId, rateLimit, notes, createdAt, updatedAt] = values; state.providers.push({ id: id0, name, model_identifier: modelId, status: 'active', rate_limit_per_minute: rateLimit, notes, version: 1, created_at: createdAt, updated_at: updatedAt }); return { rows: [], count: 1 }; }
    if (q.startsWith('SELECT * FROM ai_providers WHERE id')) return { rows: state.providers.filter(p => p.id === values[0]) };
    if (q.startsWith('UPDATE ai_providers SET status')) { const [status, updatedAt, providerId, expectedVersion] = values; const p = state.providers.find(x => x.id === providerId && x.version === expectedVersion); if (!p) return { rows: [], count: 0 }; p.status = status; p.version += 1; p.updated_at = updatedAt; return { rows: [], count: 1 }; }
    if (q.startsWith('SELECT id, name, model_identifier, status')) return { rows: state.providers };
    if (q.startsWith('SELECT id FROM ai_providers WHERE id')) return { rows: state.providers.filter(p => p.id === values[0]).map(p => ({ id: p.id })) };
    if (q.startsWith('INSERT INTO ai_usage_events')) { const [id0, providerId, endpoint, userId, status, createdAt] = values; state.usageEvents.push({ id: id0, provider_id: providerId, endpoint, user_id: userId, status, created_at: createdAt }); return { rows: [], count: 1 }; }
    if (q.startsWith('SELECT provider_id, endpoint, status, COUNT')) {
      const byKey = new Map();
      for (const e of state.usageEvents) {
        const key = `${e.provider_id}::${e.endpoint}::${e.status}`;
        if (!byKey.has(key)) byKey.set(key, { provider_id: e.provider_id, endpoint: e.endpoint, status: e.status, count: 0 });
        byKey.get(key).count += 1;
      }
      return { rows: [...byKey.values()] };
    }
    if (q.startsWith('INSERT INTO ai_governance_decisions')) { const [id0, decisionType, description, userId, createdAt] = values; state.decisions.push({ id: id0, decision_type: decisionType, description, decided_by_user_id: userId, created_at: createdAt }); return { rows: [], count: 1 }; }
    if (q.startsWith('SELECT id, decision_type, description')) return { rows: state.decisions };
    throw new Error('Unhandled fake-sql query in M78 test: ' + q);
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
  vm.runInContext(block + '\nglobal.__h = handler_ai_governance;\n', sandbox);
  return sandbox.global.__h;
}

function makeRes() { return { statusCode: null, body: null, setHeader() {}, status(s) { this.statusCode = s; return this; }, json(b) { this.body = b; return this; } }; }

const adminSession = { user_id: 'u_admin', roles: ['admin'] };
const teacherSession = { user_id: 'u_teacher', roles: ['teacher'] };
const studentSession = { user_id: 'u_student', roles: ['student'] };

function freshState() { return { providers: [], usageEvents: [], decisions: [] }; }

(async () => {
  await test('G3: a teacher cannot register an AI provider', async () => {
    const state = freshState();
    const h = loadHandler(state, teacherSession);
    const res = makeRes();
    await h({ method: 'POST', query: { resource: 'providers' }, body: { name: 'X', modelIdentifier: 'x-1' } }, res);
    assert.strictEqual(res.statusCode, 403);
  });

  await test('G6: a duplicate provider name is rejected', async () => {
    const state = freshState();
    state.providers.push({ id: 'p1', name: 'Gemini', status: 'active', version: 1 });
    const h = loadHandler(state, adminSession);
    const res = makeRes();
    await h({ method: 'POST', query: { resource: 'providers' }, body: { name: 'Gemini', modelIdentifier: 'gemini-x' } }, res);
    assert.strictEqual(res.statusCode, 409);
  });

  await test('G2: admin can register a provider and list it', async () => {
    const state = freshState();
    const h = loadHandler(state, adminSession);
    let res = makeRes();
    await h({ method: 'POST', query: { resource: 'providers' }, body: { name: 'Gemini', modelIdentifier: 'gemini-2.5-pro', rateLimitPerMinute: 60 } }, res);
    assert.strictEqual(res.statusCode, 201);
    res = makeRes();
    await h({ method: 'GET', query: { resource: 'providers' } }, res);
    assert.strictEqual(res.body.providers.length, 1);
    assert.strictEqual(res.body.providers[0].rate_limit_per_minute, 60);
  });

  await test('G5: a stale expectedVersion on provider update is rejected', async () => {
    const state = { providers: [{ id: 'p1', name: 'Gemini', status: 'active', version: 3 }], usageEvents: [], decisions: [] };
    const h = loadHandler(state, adminSession);
    const res = makeRes();
    await h({ method: 'PATCH', query: { resource: 'providers', providerId: 'p1' }, body: { status: 'deprecated', expectedVersion: 1 } }, res);
    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(state.providers[0].status, 'active');
  });

  await test('G2: admin can deprecate a provider with the correct version', async () => {
    const state = { providers: [{ id: 'p1', name: 'Gemini', status: 'active', version: 1 }], usageEvents: [], decisions: [] };
    const h = loadHandler(state, adminSession);
    const res = makeRes();
    await h({ method: 'PATCH', query: { resource: 'providers', providerId: 'p1' }, body: { status: 'deprecated', expectedVersion: 1 } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(state.providers[0].status, 'deprecated');
  });

  await test('G2: any authenticated caller can log a usage event against a real, registered provider', async () => {
    const state = { providers: [{ id: 'p1', name: 'Gemini', status: 'active', version: 1 }], usageEvents: [], decisions: [] };
    const h = loadHandler(state, studentSession);
    const res = makeRes();
    await h({ method: 'POST', query: { resource: 'usage' }, body: { providerId: 'p1', endpoint: 'ai-tutor', status: 'success' } }, res);
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(state.usageEvents.length, 1);
  });

  await test('G2: logging usage against an unregistered provider is rejected', async () => {
    const state = freshState();
    const h = loadHandler(state, studentSession);
    const res = makeRes();
    await h({ method: 'POST', query: { resource: 'usage' }, body: { providerId: 'ghost', endpoint: 'ai-tutor', status: 'success' } }, res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error.code, 'UNKNOWN_PROVIDER');
  });

  await test('G3 + G4: only admin can view usage stats, and the response honestly discloses its own scope', async () => {
    const state = { providers: [], usageEvents: [{ provider_id: 'p1', endpoint: 'ai-tutor', status: 'success' }], decisions: [] };
    let h = loadHandler(state, studentSession);
    let res = makeRes();
    await h({ method: 'GET', query: { resource: 'usage' } }, res);
    assert.strictEqual(res.statusCode, 403);

    h = loadHandler(state, adminSession);
    res = makeRes();
    await h({ method: 'GET', query: { resource: 'usage' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.usage[0].count, 1);
    assert.ok(res.body.note.includes('not automatically populated'), 'must disclose this is not automatic instrumentation of the real AI endpoints');
  });

  await test('G3: only admin can record a governance decision, and it requires a real description', async () => {
    const state = freshState();
    let h = loadHandler(state, teacherSession);
    let res = makeRes();
    await h({ method: 'POST', query: { resource: 'decisions' }, body: { decisionType: 'provider_approved', description: 'x' } }, res);
    assert.strictEqual(res.statusCode, 403);

    h = loadHandler(state, adminSession);
    res = makeRes();
    await h({ method: 'POST', query: { resource: 'decisions' }, body: { decisionType: 'provider_approved', description: '' } }, res);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error.code, 'DESCRIPTION_REQUIRED');

    res = makeRes();
    await h({ method: 'POST', query: { resource: 'decisions' }, body: { decisionType: 'duplicate_removed', description: 'Removed the parallel M06 quiz-question drafting UI in favor of M66 question-bank authoring.' } }, res);
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(state.decisions.length, 1);
  });

  await test('G3: a teacher can read the decision log (read-only)', async () => {
    const state = { providers: [], usageEvents: [], decisions: [{ id: 'd1', decision_type: 'safety_review', description: 'x', decided_by_user_id: 'u_admin', created_at: 't' }] };
    const h = loadHandler(state, teacherSession);
    const res = makeRes();
    await h({ method: 'GET', query: { resource: 'decisions' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.decisions.length, 1);
  });

  console.log(failures === 0 ? '\nALL M78 AI GOVERNANCE TESTS PASSED' : `\n${failures} M78 TEST(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})();
