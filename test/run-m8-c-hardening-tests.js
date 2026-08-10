// BAA OS — M8-C hardening tests.
// Covers the shared attachment contract, server-side PDF-text validation,
// documentation traceability, and regression-facing source contracts.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
let failures = 0;
function assert(cond, msg) { if (!cond) { console.error('FAIL:', msg); failures++; } else console.log('PASS:', msg); }

function loadBase() {
  global.window = global;
  delete global.BAAHomeworkAttachmentBase;
  delete require.cache[require.resolve(path.join(ROOT, 'js/baa-homework-attachment-base.js'))];
  require(path.join(ROOT, 'js/baa-homework-attachment-base.js'));
  return global.BAAHomeworkAttachmentBase;
}

function loadServerValidation() {
  const source = fs.readFileSync(path.join(ROOT, 'api/evaluate-homework.js'), 'utf8')
    .replace("export const config = { runtime: 'edge' };", "const config = { runtime: 'edge' };")
    .replace('export default async function handler(req) {', 'async function handler(req) {')
    + '\nmodule.exports = { validateHomeworkText, validateBody };\n';
  const sandbox = {
    module: { exports: {} },
    exports: {},
    process: { env: {} },
    fetch: async () => { throw new Error('not called in validation tests'); },
    Response: class Response {},
    AbortController: class AbortController { abort() {} },
    setTimeout,
    clearTimeout,
    Date,
    Math,
    JSON,
    Error,
    Promise,
  };
  vm.runInNewContext(source, sandbox, { filename: 'evaluate-homework.js' });
  return sandbox.module.exports;
}

function testSharedAttachmentContract() {
  const Base = loadBase();
  assert(Base.validateCommonFile(null).error === 'FILE_REQUIRED', 'H-1: missing file is rejected');
  assert(Base.validateCommonFile({ size: 0 }).error === 'INVALID_FILE_SIZE', 'H-2: zero-byte file is rejected');
  assert(Base.validateCommonFile({ size: 100 }).ok === true, 'H-3: valid file metadata passes common validation');
  const image = Base.buildBaseAttachment({ type: 'image', mimeType: 'image/jpeg', sizeBytes: 1234, fileName: 'photo.jpg' });
  assert(image && image.type === 'image' && image.mimeType === 'image/jpeg' && image.sizeBytes === 1234, 'H-4: image uses common metadata shape');
  const pdf = Base.buildBaseAttachment({ type: 'pdf', mimeType: 'application/pdf', sizeBytes: 5678, fileName: '<script>.pdf' });
  assert(pdf && pdf.type === 'pdf' && pdf.fileName === '<script>.pdf', 'H-5: PDF uses the same common metadata shape');
}

function testServerPdfValidation() {
  const { validateHomeworkText, validateBody } = loadServerValidation();
  assert(validateHomeworkText('Normal extracted homework text', true).text === 'Normal extracted homework text', 'H-6: server accepts valid extracted PDF text');
  assert(validateHomeworkText('a'.repeat(8001)).error === 'TEXT_TOO_LONG', 'H-7: server independently rejects oversized extracted PDF text');
  assert(validateHomeworkText('abc\u0000def').error === 'INVALID_TEXT_CONTENT', 'H-8: server rejects corrupted/control-heavy PDF text');
  assert(validateHomeworkText('  \n\t ').error === 'text is required', 'H-9: server rejects empty/meaningless PDF text');
  assert(validateBody({ text: 'valid homework', imageAttached: false }).text === 'valid homework', 'H-10: server accepts the existing request contract while re-validating text');
  assert(validateBody({ text: 'valid homework', imageAttached: 'yes' }).error === 'imageAttached must be a boolean', 'H-11: server rejects malformed existing metadata');
}

function testSourceAndDocs() {
  const html = fs.readFileSync(path.join(ROOT, 'homework-scanner.html'), 'utf8');
  const image = fs.readFileSync(path.join(ROOT, 'js/baa-homework-image.js'), 'utf8');
  const pdf = fs.readFileSync(path.join(ROOT, 'js/baa-homework-pdf.js'), 'utf8');
  const homework = fs.readFileSync(path.join(ROOT, 'js/baa-homework.js'), 'utf8');
  const api = fs.readFileSync(path.join(ROOT, 'api/evaluate-homework.js'), 'utf8');
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const deploy = fs.readFileSync(path.join(ROOT, 'DEPLOYMENT.md'), 'utf8');
  const status = fs.readFileSync(path.join(ROOT, 'SECTION-M8-STATUS.md'), 'utf8');
  assert(html.indexOf('js/baa-homework-attachment-base.js') < html.indexOf('js/baa-homework-image.js'), 'H-12: shared attachment contract loads before image module');
  assert(image.includes('window.BAAHomeworkAttachmentBase') && image.includes('const base = window.BAAHomeworkAttachmentBase') && image.includes('buildBaseAttachment'), 'H-13: image module uses shared attachment contract');
  assert(pdf.includes('BAAHomeworkAttachmentBase'), 'H-14: PDF module uses shared attachment contract');
  assert(!homework.includes('pdfAttached:'), 'H-15: hardening preserves the existing B1 request contract');
  assert(api.includes('TEXT_TOO_LONG') && api.includes('INVALID_TEXT_CONTENT'), 'H-16: server has explicit extracted-text validation error codes');
  assert(api.includes('MAX_CONTROL_CHAR_RATIO'), 'H-17: server performs basic content-sanity validation');
  assert(readme.includes('## Module 8 — AI Homework Scanner (M8-A1 → M8-C)'), 'H-18: README has consolidated Module 8 A1-C documentation');
  assert(deploy.includes('### Module 8 M8-C — PDF support and hardening'), 'H-19: deployment docs include M8-C deployment notes');
  assert(status.includes('M8-D2') && status.includes('M8-C component status'), 'H-20: Module 8 status document records current scope and deferred work');
}

testSharedAttachmentContract();
testServerPdfValidation();
testSourceAndDocs();
if (failures) { console.error(`\n${failures} M8-C HARDENING TEST(S) FAILED`); process.exit(1); }
console.log('\nALL M8-C HARDENING TESTS PASSED');
