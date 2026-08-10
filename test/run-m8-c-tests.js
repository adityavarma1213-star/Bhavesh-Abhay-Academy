// BAA OS — Module 8 Checkpoint M8-C tests.
// Covers PDF validation, metadata-only persistence, and browser-side extraction contract.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let failures = 0;
function assert(cond, msg) { if (!cond) { console.error('FAIL:', msg); failures++; } else console.log('PASS:', msg); }
function makeLocalStorage() { const data = {}; return { getItem:k=>(k in data?data[k]:null), setItem:(k,v)=>{data[k]=String(v);}, removeItem:k=>{delete data[k];}, clear:()=>Object.keys(data).forEach(k=>delete data[k]) }; }
function freshHomework(ls) { global.localStorage=ls; global.window=global; delete require.cache[require.resolve(path.join(ROOT,'js/baa-homework.js'))]; return require(path.join(ROOT,'js/baa-homework.js')); }
function freshPdf(mockPdfJs) { global.pdfjsLib = mockPdfJs; delete require.cache[require.resolve(path.join(ROOT,'js/baa-homework-pdf.js'))]; require(path.join(ROOT,'js/baa-homework-pdf.js')); return global.BAAHomeworkPDF; }
function fakeFile(type, size, name='homework.pdf') { return { type, size, name, arrayBuffer: async()=>new ArrayBuffer(size) }; }

function testValidation() {
  const PDF = freshPdf({});
  assert(PDF.validatePdfFile(null).error === 'PDF_REQUIRED','C-1: missing PDF is rejected');
  assert(PDF.validatePdfFile(fakeFile('text/plain',100)).error === 'INVALID_PDF_TYPE','C-2: non-PDF MIME type is rejected');
  assert(PDF.validatePdfFile(fakeFile('application/pdf',21*1024*1024)).error === 'PDF_TOO_LARGE','C-3: PDFs over 20 MB are rejected');
  assert(PDF.validatePdfFile(fakeFile('application/pdf',100)).ok === true,'C-4: valid PDF metadata passes validation');
}

async function testExtraction() {
  const PDF = freshPdf({
    getDocument: () => ({ promise: Promise.resolve({
      numPages: 2,
      getPage: async (n) => ({ getTextContent: async () => ({ items: [{str: n === 1 ? 'Question 1' : 'Answer 1'}] }) })
    }) })
  });
  const result = await PDF.extractText(fakeFile('application/pdf',1234,'math-homework.pdf'));
  assert(result.ok === true,'C-5: selectable PDF text is extracted');
  assert(result.text.includes('Question 1') && result.text.includes('Answer 1'),'C-6: extracted text preserves page content');
  assert(result.pages === 2 && result.attachment.pageCount === 2,'C-7: page count is returned in metadata');
  assert(result.attachment.fileName === 'math-homework.pdf','C-8: filename is returned as metadata');
}

async function testScannedPdfHonesty() {
  const PDF = freshPdf({
    getDocument: () => ({ promise: Promise.resolve({
      numPages: 1,
      getPage: async () => ({ getTextContent: async () => ({ items: [] }) })
    }) })
  });
  const result = await PDF.extractText(fakeFile('application/pdf',100,'scan.pdf'));
  assert(result.ok === false && result.error === 'PDF_NO_EXTRACTABLE_TEXT','C-9: image-only/scanned PDF is rejected honestly without pretending OCR occurred');
}

function testMetadataOnlyPersistence() {
  const BAAHomework = freshHomework(makeLocalStorage());
  const result = BAAHomework.submitHomeworkText({
    text: 'PDF homework extracted text',
    pdf: { mimeType:'application/pdf', originalSizeBytes:1234, pageCount:2, extractedChars:27, fileName:'math.pdf' }
  });
  assert(result.ok === true,'C-10: PDF-derived homework can be stored');
  assert(result.submission.inputType === 'text+pdf','C-11: PDF submission type is recorded honestly');
  assert(result.submission.attachments[0].type === 'pdf','C-12: PDF attachment metadata is persisted');
  assert(!('data' in result.submission.attachments[0]) && !('base64' in result.submission.attachments[0]),'C-13: raw PDF bytes are not persisted');
}

function testSourceContract() {
  const html=fs.readFileSync(path.join(ROOT,'homework-scanner.html'),'utf8');
  const js=fs.readFileSync(path.join(ROOT,'js/baa-homework-pdf.js'),'utf8');
  assert(html.includes('accept="application/pdf,.pdf"'),'C-14: Homework Scanner exposes PDF file input');
  assert(html.includes('pdf.min.js'),'C-15: PDF.js external dependency is loaded');
  assert(html.includes('PDF_NO_EXTRACTABLE_TEXT'),'C-16: scanned/image-only PDF has an honest UI state');
  assert(js.includes('MAX_PDF_SIZE_BYTES = 20 * 1024 * 1024'),'C-17: PDF size limit is enforced');
  assert(js.includes('MAX_PDF_PAGES = 40'),'C-18: PDF page limit is enforced');
  assert(js.includes('MAX_EXTRACTED_CHARS = 8000'),'C-19: extracted text is bounded to the homework text limit');
}

async function main(){
  testValidation();
  await testExtraction();
  await testScannedPdfHonesty();
  testMetadataOnlyPersistence();
  testSourceContract();
  if(failures){console.error(`\n${failures} M8-C TEST(S) FAILED`);process.exit(1);} 
  console.log('\nALL M8-C TESTS PASSED');
}
main();
