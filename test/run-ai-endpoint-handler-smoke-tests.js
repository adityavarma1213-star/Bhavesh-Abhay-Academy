// BAA — AI-endpoint handler smoke tests. Added 2026-08-29.
//
// WHY THIS EXISTS: an independent audit on 2026-08-29 found that
// api/ai-mode.js, api/evaluate.js, and api/evaluate-homework.js called
// corsHeaders/jsonError/jsonResponse/getClientIp helper functions that were
// not defined or imported anywhere in those files. Every request to those
// three endpoints threw ReferenceError, regardless of auth, rate limiting,
// or Gemini connectivity. It went undetected because every existing test
// for these files (run-m1-a1-tests.js, run-m8-*-tests.js, etc.) only
// extracts and calls pure logic functions like validateBody/normalizePlan
// out of the source via vm — none of them ever call the real exported
// `handler(req)` the way an actual HTTP request would.
//
// This test closes that gap: it loads each file's real handler function
// (stripping only the module imports, mocking their behavior) and actually
// invokes it with a Request, twice — once with no GEMINI_API_KEY configured
// (exercises the early-return path) and once with a key set but no valid
// session (exercises the requireAuth/jsonError path, which is exactly the
// code path that was broken). If any referenced helper is undefined, this
// throws immediately and the test fails loudly instead of silently.
//
// This is a smoke test, not a full contract test: it does not call Gemini,
// does not touch the database, and does not replace the existing
// validation/normalization unit tests for these files. It only proves the
// handler function itself is callable end-to-end and returns a well-formed
// Response with the headers every other endpoint in this app carries.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
let failures = 0;
function test(name, fn) {
  try { fn(); console.log('PASS:', name); }
  catch (e) { console.error('FAIL:', name, '\n ', e.stack || e); failures++; }
}
async function asyncTest(name, fn) {
  try { await fn(); console.log('PASS:', name); }
  catch (e) { console.error('FAIL:', name, '\n ', e.stack || e); failures++; }
}

function loadHandler(relFile) {
  let src = fs.readFileSync(path.join(ROOT, relFile), 'utf8');
  src = src
    .replace(/export\s+const\s+config\s*=\s*\{[^;]+;\s*/s, '')
    .replace(/import\s+\{\s*requireAuth\s*\}\s+from\s+['"]\.\/_lib\/auth\.js['"];\s*/s, '')
    .replace(/import\s+\{\s*consumeAiRateLimit\s*\}\s+from\s+['"]\.\/_lib\/ai-rate-limit\.js['"];\s*/s, '')
    .replace(/import\s+\{\s*issueAssessmentVerdict\s*\}\s+from\s+['"]\.\/_lib\/assessment-verdict\.js['"];\s*/s, '')
    .replace(/import\s+\{\s*issueHomeworkVerdict,\s*hashHomeworkText\s*\}\s+from\s+['"]\.\/_lib\/assessment-verdict\.js['"];\s*/s, '')
    .replace(/export\s+default\s+async function handler/, 'async function handler')
    .replace(/export\s+function/g, 'function');

  const sandbox = {
    console, setTimeout, clearTimeout, Date, Math, JSON, Set, Map, Number, String, Object, Array, Error, Promise,
    process: { env: {} },
    Response, Request, Headers,
    AbortController,
    fetch: async () => { throw new Error('handler reached fetch() before returning — auth/config gate did not short-circuit as expected'); },
    // Mocks below intentionally mirror the real modules' contracts, not their
    // implementations — this test is about the handler's own wiring, not
    // about auth/rate-limit behavior (those have their own tests).
    requireAuth: async () => { const e = new Error('Authentication required.'); e.status = 401; throw e; },
    consumeAiRateLimit: async () => ({ limited: false }),
    issueAssessmentVerdict: () => 'mock-verdict-token',
    issueHomeworkVerdict: () => 'mock-verdict-token',
    hashHomeworkText: () => 'mock-hash',
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: relFile });
  if (typeof sandbox.handler !== 'function') {
    throw new Error(`${relFile}: no exported default handler function found after transform`);
  }
  return sandbox.handler;
}

function makeRequest() {
  return new Request('https://example.com/api/probe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
}

const FILES = ['api/chat.js', 'api/ai-mode.js', 'api/evaluate.js', 'api/evaluate-homework.js'];

(async () => {
  for (const file of FILES) {
    await asyncTest(`${file}: handler is callable and returns a Response with no configured API key`, async () => {
      const handler = loadHandler(file);
      const res = await handler(makeRequest());
      assert.ok(res instanceof Response, `${file} must return a Response`);
      assert.ok(res.status >= 400 && res.status < 600, `${file} should reject an unconfigured/unauthenticated request, got ${res.status}`);
    });
  }

  for (const file of FILES) {
    await asyncTest(`${file}: handler reaches the auth gate and fails closed with Cache-Control: no-store`, async () => {
      let src = fs.readFileSync(path.join(ROOT, file), 'utf8');
      src = src
        .replace(/export\s+const\s+config\s*=\s*\{[^;]+;\s*/s, '')
        .replace(/import\s+\{\s*requireAuth\s*\}\s+from\s+['"]\.\/_lib\/auth\.js['"];\s*/s, '')
        .replace(/import\s+\{\s*consumeAiRateLimit\s*\}\s+from\s+['"]\.\/_lib\/ai-rate-limit\.js['"];\s*/s, '')
        .replace(/import\s+\{\s*issueAssessmentVerdict\s*\}\s+from\s+['"]\.\/_lib\/assessment-verdict\.js['"];\s*/s, '')
        .replace(/import\s+\{\s*issueHomeworkVerdict,\s*hashHomeworkText\s*\}\s+from\s+['"]\.\/_lib\/assessment-verdict\.js['"];\s*/s, '')
        .replace(/export\s+default\s+async function handler/, 'async function handler')
        .replace(/export\s+function/g, 'function');
      const sandbox = {
        console, setTimeout, clearTimeout, Date, Math, JSON, Set, Map, Number, String, Object, Array, Error, Promise,
        process: { env: { GEMINI_API_KEY: 'test-key-not-real' } },
        Response, Request, Headers,
        AbortController,
        fetch: async () => { throw new Error('handler reached fetch() before the auth check rejected the request'); },
        requireAuth: async () => { const e = new Error('Authentication required.'); e.status = 401; throw e; },
        consumeAiRateLimit: async () => ({ limited: false }),
        issueAssessmentVerdict: () => 'mock-verdict-token',
        issueHomeworkVerdict: () => 'mock-verdict-token',
        hashHomeworkText: () => 'mock-hash',
      };
      vm.createContext(sandbox);
      vm.runInContext(src, sandbox, { filename: file });
      const res = await sandbox.handler(makeRequest());
      assert.strictEqual(res.status, 401, `${file} must return 401 when requireAuth rejects, got ${res.status}`);
      assert.strictEqual(res.headers.get('cache-control'), 'no-store', `${file} must set Cache-Control: no-store on its error response`);
    });
  }

  console.log(failures === 0 ? '\nAI ENDPOINT HANDLER SMOKE TESTS PASSED' : `\n${failures} AI ENDPOINT HANDLER SMOKE TEST(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})();
