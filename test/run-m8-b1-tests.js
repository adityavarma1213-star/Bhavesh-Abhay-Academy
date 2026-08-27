// test/run-m8-b1-tests.js
// BAA OS — Module 8 Checkpoint M8-B1 tests.
//
// Covers js/baa-homework.js's evaluateSubmission() (added in M8-B1), using a
// mocked global.fetch — no real network call, no dependency on
// GEMINI_API_KEY being present. The actual Vercel Edge Function in
// api/evaluate-homework.js uses `export default` (ESM), which this
// project's CommonJS test harness cannot require() directly — same
// situation as api/chat.js and api/evaluate.js, neither of which has
// Node-level unit coverage here either (see run-m8-a2-tests.js header for
// the same convention re: browser/runtime-only code). What CAN and IS
// covered at the Node level: the client-side integration logic that calls
// that endpoint and honestly records success/failure — which is exactly
// where a fabrication bug would actually show up.
//
// Run with: node test/run-m8-b1-tests.js
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

function freshHomework(ls, fetchImpl) {
  global.localStorage = ls;
  global.window = global;
  global.fetch = fetchImpl;
  delete require.cache[require.resolve(path.join(ROOT, 'js/baa-homework.js'))];
  return require(path.join(ROOT, 'js/baa-homework.js'));
}

function jsonResponse(status, body, headers = {}) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[name] || headers[name.toLowerCase()] || null },
    json: () => Promise.resolve(body),
  });
}

async function testMissingApiUrlRejected() {
  const BAAHomework = freshHomework(makeLocalStorage(), () => { throw new Error('should not be called'); });
  const submitRes = BAAHomework.submitHomeworkText({ text: 'Explain photosynthesis in your own words.' });
  const res = await BAAHomework.evaluateSubmission(submitRes.submission.id, undefined);
  assert(res.ok === false && res.error === 'MISSING_API_URL', 'B1: evaluateSubmission with no URL fails honestly, never calls fetch');
}

async function testUnknownSubmissionRejected() {
  const BAAHomework = freshHomework(makeLocalStorage(), () => { throw new Error('should not be called'); });
  const res = await BAAHomework.evaluateSubmission('does-not-exist', 'https://example.test/api/evaluate-homework');
  assert(res.ok === false && res.error === 'SUBMISSION_NOT_FOUND', 'B2: evaluating an unknown submission id fails honestly');
}

async function testSuccessfulEvaluationRecorded() {
  let capturedOptions = null;
  const fetchImpl = (url, opts) => {
    capturedOptions = opts;
    return jsonResponse(200, {
      schemaVersion: 1,
      evaluationType: 'image_or_text',
      overallAssessment: 'good',
      summary: 'Solid attempt with one small gap.',
      strengths: ['Correct method'],
      mistakes: ['Missed the final simplification step'],
      suggestions: ['Double-check the last line'],
      confidence: 'high',
      humanReviewRequired: false,
      humanReviewReasons: [],
      imageEvaluated: false,
    });
  };
  const BAAHomework = freshHomework(makeLocalStorage(), fetchImpl);
  const submitRes = BAAHomework.submitHomeworkText({ text: 'My worked answer to Q3...' });
  const res = await BAAHomework.evaluateSubmission(submitRes.submission.id, 'https://example.test/api/evaluate-homework');

  assert(res.ok === true, 'B3: successful evaluation call reports ok:true');
  assert(res.submission.status === 'evaluated', 'B4: status becomes "evaluated" on success');
  assert(res.submission.evaluation && res.submission.evaluation.overallAssessment === 'good', 'B5: evaluation result is recorded on the submission');
  assert(res.submission.evaluation.imageEvaluated === false, 'B6: text-only submission honestly marks imageEvaluated:false');
  assert(res.submission.lastEvaluationError === null, 'B7: no error recorded on a successful evaluation');
  assert(capturedOptions?.credentials === 'include', 'B8: evaluation request includes the authenticated session credentials');
  assert(capturedOptions?.cache === 'no-store', 'B9: learner homework evaluation request disables caching');
  assert(capturedOptions?.headers?.Accept === 'application/json', 'B10: evaluation request explicitly requests JSON');

  const stored = BAAHomework.getSubmission(submitRes.submission.id);
  assert(stored.status === 'evaluated', 'B11: persisted store reflects the evaluated status (not just the in-memory return value)');
}

async function testImageAttachedIsSentTransiently() {
  let capturedBody = null;
  const fetchImpl = (url, opts) => {
    capturedBody = JSON.parse(opts.body);
    return jsonResponse(200, {
      schemaVersion: 1, evaluationType: 'image_or_text', overallAssessment: 'uncertain', summary: 'ok', strengths: [], mistakes: [], suggestions: [],
      confidence: 'low', humanReviewRequired: true, humanReviewReasons: ['AI confidence is low.'], imageEvaluated: false,
    });
  };
  const BAAHomework = freshHomework(makeLocalStorage(), fetchImpl);
  const submitRes = BAAHomework.submitHomeworkText({
    text: 'See attached photo of my working.',
    image: { mimeType: 'image/jpeg', originalSizeBytes: 100000, compressedSizeBytes: 50000, width: 800, height: 600, fileName: 'hw.jpg' },
    imageDataUrl: 'data:image/jpeg;base64,QUJDREVGRw==',
  });
  await BAAHomework.evaluateSubmission(submitRes.submission.id, 'https://example.test/api/evaluate-homework');

  assert(capturedBody.imageAttached === true, 'B12: request body flags imageAttached:true');
  assert(typeof capturedBody.imageDataUrl === 'string' && capturedBody.imageDataUrl.startsWith('data:image/jpeg;base64,'), 'B13: request body carries the transient compressed image data URL for evaluation');
  assert(!capturedBody.imageDataUrl.includes('hw.jpg'), 'B14: raw request contains only image bytes, not the local filename');
  assert(Object.keys(capturedBody).sort().join(',') === 'imageAttached,imageDataUrl,subjectHint,submissionId,text', 'B15: request body contains only the expected evaluation fields (submissionId added so the server can bind a signed verdict to this exact submission)');
}

async function testUpstreamErrorNeverFabricatesResult() {
  const fetchImpl = () => jsonResponse(502, { error: 'AI evaluation service is temporarily unavailable' });
  const BAAHomework = freshHomework(makeLocalStorage(), fetchImpl);
  const submitRes = BAAHomework.submitHomeworkText({ text: 'Some homework text here.' });
  const res = await BAAHomework.evaluateSubmission(submitRes.submission.id, 'https://example.test/api/evaluate-homework');

  assert(res.ok === false && res.error === 'EVALUATION_FAILED', 'B16: upstream error is reported as an honest failure');
  assert(res.submission.status === 'evaluation_failed', 'B17: status becomes "evaluation_failed", never a fake "evaluated"');
  assert(res.submission.evaluation === null, 'B18: evaluation stays null on failure — nothing fabricated');
  assert(typeof res.submission.lastEvaluationError === 'string' && res.submission.lastEvaluationError.length > 0, 'B19: a human-readable error reason is recorded');
}

async function testNetworkExceptionNeverFabricatesResult() {
  const fetchImpl = () => Promise.reject(new Error('network unreachable'));
  const BAAHomework = freshHomework(makeLocalStorage(), fetchImpl);
  const submitRes = BAAHomework.submitHomeworkText({ text: 'Some more homework text here.' });
  const res = await BAAHomework.evaluateSubmission(submitRes.submission.id, 'https://example.test/api/evaluate-homework');

  assert(res.ok === false && res.error === 'EVALUATION_FAILED', 'B20: a thrown network exception is caught and reported as an honest failure');
  assert(res.submission.status === 'evaluation_failed', 'B21: status becomes "evaluation_failed" on a network exception too');
  assert(res.submission.evaluation === null, 'B22: evaluation stays null on a network exception — nothing fabricated');
}

async function testM8A2RegressionStillHolds() {
  const BAAHomework = freshHomework(makeLocalStorage(), () => { throw new Error('should not be called'); });
  const res = BAAHomework.submitHomeworkText({ text: 'Regression check text.' });
  assert(res.submission.status === 'received' && res.submission.evaluation === null, 'B23: submitting still leaves status "received"/evaluation null until evaluateSubmission is explicitly called (M8-A2 preserved)');
}

async function main() {
  await testMissingApiUrlRejected();
  await testUnknownSubmissionRejected();
  await testSuccessfulEvaluationRecorded();
  await testImageAttachedIsSentTransiently();
  await testUpstreamErrorNeverFabricatesResult();
  await testNetworkExceptionNeverFabricatesResult();
  await testM8A2RegressionStillHolds();

  if (failures > 0) {
    console.error(`\n${failures} M8-B1 TEST(S) FAILED`);
    process.exit(1);
  }
  console.log('\nALL M8-B1 TESTS PASSED');
}

main();
