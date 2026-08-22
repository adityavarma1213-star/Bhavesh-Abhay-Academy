// test/run-m8-a2-tests.js
// BAA OS — Module 8 Checkpoint M8-A2 tests.
//
// Covers js/baa-homework.js's image ATTACHMENT METADATA handling added in
// M8-A2 (select/preview/compression itself lives in js/baa-homework-image.js,
// which is DOM/canvas-dependent browser code — same convention as the
// pre-existing js/image.js, neither of which has Node-level unit coverage
// in this project; see that file's header). This suite focuses on what
// CAN be verified without a browser:
//   - image metadata is validated and stored honestly
//   - raw image bytes are never accepted or persisted by the data layer
//   - inputType reflects reality (text vs text+image)
//   - existing M8-A1 text-only workflow is fully preserved (regression)
//
// Run with: node test/run-m8-a2-tests.js
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

function freshHomework(ls) {
  global.localStorage = ls;
  global.window = global;
  delete require.cache[require.resolve(path.join(ROOT, 'js/baa-homework.js'))];
  return require(path.join(ROOT, 'js/baa-homework.js'));
}

// ---------------- M8-A1 regression: text-only still works ----------------

function testTextOnlyStillWorks() {
  const BAAHomework = freshHomework(makeLocalStorage());
  const res = BAAHomework.submitHomeworkText({ text: 'Solve for x: 2x + 4 = 10', subjectHint: 'Algebra' });
  assert(res.ok === true, 'T1: text-only submission still succeeds (M8-A1 preserved)');
  assert(res.submission.inputType === 'text', 'T2: text-only submission is honestly labeled inputType "text"');
  assert(Array.isArray(res.submission.attachments) && res.submission.attachments.length === 0, 'T3: text-only submission has an empty attachments array');
  assert(res.submission.status === 'received' && res.submission.evaluation === null, 'T4: text-only submission is honestly "received", never fabricated as evaluated');
}

function testTextTooShortStillRejected() {
  const BAAHomework = freshHomework(makeLocalStorage());
  const res = BAAHomework.submitHomeworkText({ text: 'hi' });
  assert(res.ok === false && res.error === 'TEXT_TOO_SHORT', 'T5: below-minimum text is still rejected (M8-A1 regression)');
}

// ---------------- M8-A2: image metadata attachment ----------------

function testValidImageMetadataAccepted() {
  const BAAHomework = freshHomework(makeLocalStorage());
  const res = BAAHomework.submitHomeworkText({
    text: 'Here is my worked solution, see the attached photo too.',
    image: { mimeType: 'image/jpeg', originalSizeBytes: 2_400_000, compressedSizeBytes: 380_000, width: 1600, height: 1200, fileName: 'worksheet.jpg' },
  });
  assert(res.ok === true, 'I1: text + valid image metadata submission succeeds');
  assert(res.submission.inputType === 'text+image', 'I2: submission is honestly labeled inputType "text+image"');
  assert(res.submission.attachments.length === 1 && res.submission.attachments[0].type === 'image', 'I3: attachments array records exactly one image attachment');
  assert(res.submission.attachments[0].mimeType === 'image/jpeg', 'I4: attachment mime type is recorded correctly');
  assert(res.submission.attachments[0].compressedSizeBytes === 380_000, 'I5: compressed size metadata is recorded correctly');
}

function testAllSupportedMimeTypesAccepted() {
  const BAAHomework = freshHomework(makeLocalStorage());
  ['image/png', 'image/jpeg', 'image/webp'].forEach((mime) => {
    const res = BAAHomework.submitHomeworkText({ text: 'Homework with a photo attached here.', image: { mimeType: mime, originalSizeBytes: 100, compressedSizeBytes: 90 } });
    assert(res.ok === true && res.submission.attachments[0].mimeType === mime, `I6: supported mime type ${mime} is accepted`);
  });
}

function testUnsupportedMimeTypeRejected() {
  const BAAHomework = freshHomework(makeLocalStorage());
  const res = BAAHomework.submitHomeworkText({ text: 'Homework with a bad file type attached.', image: { mimeType: 'application/pdf', originalSizeBytes: 100, compressedSizeBytes: 90 } });
  assert(res.ok === false && res.error === 'INVALID_IMAGE_METADATA', 'I7: an unsupported/invalid attachment mime type is honestly rejected, not silently accepted');
}

function testMalformedImageMetadataRejected() {
  const BAAHomework = freshHomework(makeLocalStorage());
  const res1 = BAAHomework.submitHomeworkText({ text: 'Homework with malformed metadata.', image: 'not-an-object' });
  assert(res1.ok === false && res1.error === 'INVALID_IMAGE_METADATA', 'I8: a non-object image argument is rejected');

  const res2 = BAAHomework.submitHomeworkText({ text: 'Homework with missing mime type.', image: {} });
  assert(res2.ok === false && res2.error === 'INVALID_IMAGE_METADATA', 'I9: image metadata missing a supported mimeType is rejected');
}

function testNoImageMeansNoAttachment() {
  const BAAHomework = freshHomework(makeLocalStorage());
  const res = BAAHomework.submitHomeworkText({ text: 'Homework with no photo this time.' });
  assert(res.ok === true && res.submission.attachments.length === 0 && res.submission.inputType === 'text', 'I10: omitting image entirely behaves exactly like M8-A1 (no attachment, inputType "text")');

  const res2 = BAAHomework.submitHomeworkText({ text: 'Homework with an explicit null image.', image: null });
  assert(res2.ok === true && res2.submission.attachments.length === 0, 'I11: explicitly passing image: null is treated the same as omitting it');
}

// ---------------- M8-A2 privacy: never persist raw image bytes ----------------

function testRawImageBytesNeverPersisted() {
  const ls = makeLocalStorage();
  const BAAHomework = freshHomework(ls);
  const fakeDataUrl = 'data:image/jpeg;base64,' + 'A'.repeat(5000); // simulate a real base64 payload
  const res = BAAHomework.submitHomeworkText({
    text: 'Homework with a photo — the payload below must never be stored.',
    image: { mimeType: 'image/jpeg', originalSizeBytes: 5000, compressedSizeBytes: 3750, dataUrl: fakeDataUrl, data: fakeDataUrl },
  });
  assert(res.ok === true, 'P1: submission with (deliberately, incorrectly) attempted raw bytes still succeeds using only the honest metadata fields');
  assert(res.submission.attachments[0].dataUrl === undefined && res.submission.attachments[0].data === undefined, 'P2: even if a caller mistakenly includes dataUrl/data, buildImageAttachment strips them — never persisted');

  const rawStoredJson = ls._raw[BAAHomework.STORAGE_KEY];
  assert(typeof rawStoredJson === 'string' && rawStoredJson.indexOf(fakeDataUrl) === -1, 'P3: the actual localStorage payload never contains the base64 image data anywhere');
}

function testAttachmentHasNoDataField() {
  const BAAHomework = freshHomework(makeLocalStorage());
  const res = BAAHomework.submitHomeworkText({
    text: 'Homework with a clean photo attachment.',
    image: { mimeType: 'image/png', originalSizeBytes: 500, compressedSizeBytes: 400, width: 800, height: 600, fileName: 'scan.png' },
  });
  const attachment = res.submission.attachments[0];
  const keys = Object.keys(attachment).sort();
  assert(keys.indexOf('data') === -1 && keys.indexOf('dataUrl') === -1 && keys.indexOf('base64') === -1, 'P4: the persisted attachment object exposes only metadata keys, never an image-bytes field');
}

// ---------------- Regression: M8-A2 doesn't disturb other sections ----------------

function testOtherSectionsUntouchedByM8A2() {
  const ls = makeLocalStorage();
  ls.setItem('baa_student_name', 'Priya');
  ls.setItem('baa_section_b_data_v1', JSON.stringify({ meta: {}, attempts: ['seed'] }));
  ls.setItem('baa_section_g2_accounts_v1', JSON.stringify({ users: ['seed'] }));

  const BAAHomework = freshHomework(ls);
  BAAHomework.submitHomeworkText({ text: 'Some homework text here.', image: { mimeType: 'image/jpeg', originalSizeBytes: 10, compressedSizeBytes: 10 } });

  assert(ls.getItem('baa_student_name') === 'Priya', 'R1: unrelated Section A key untouched by M8-A2 writes');
  assert(JSON.parse(ls.getItem('baa_section_b_data_v1')).attempts[0] === 'seed', 'R2: Section B store untouched by M8-A2 writes');
  assert(JSON.parse(ls.getItem('baa_section_g2_accounts_v1')).users[0] === 'seed', 'R3: Section G2 accounts store untouched by M8-A2 writes');
}

function main() {
  testTextOnlyStillWorks();
  testTextTooShortStillRejected();
  testValidImageMetadataAccepted();
  testAllSupportedMimeTypesAccepted();
  testUnsupportedMimeTypeRejected();
  testMalformedImageMetadataRejected();
  testNoImageMeansNoAttachment();
  testRawImageBytesNeverPersisted();
  testAttachmentHasNoDataField();
  testOtherSectionsUntouchedByM8A2();

  if (failures > 0) {
    console.error(`\n${failures} FAILURE(S)`);
    process.exit(1);
  }
  console.log('\nALL M8-A2 FOCUSED TESTS PASSED');
}

main();
