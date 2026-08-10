// BAA OS — Module 8 checkpoint M8-D2 tests.
// Covers evidence-gated Homework -> Learning Memory / Mistake Archeology integration.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let failures = 0;
function assert(cond, msg) { if (!cond) { console.error('FAIL:', msg); failures++; } else console.log('PASS:', msg); }
function makeLocalStorage(seed) {
  const data = Object.assign({}, seed || {});
  return { getItem:k=>(k in data?data[k]:null), setItem:(k,v)=>{data[k]=String(v);}, removeItem:k=>{delete data[k];}, clear:()=>Object.keys(data).forEach(k=>delete data[k]) };
}
function freshAssessment(ls) {
  global.localStorage = ls;
  global.window = global;
  delete require.cache[require.resolve(path.join(ROOT,'js/baa-assessment.js'))];
  require(path.join(ROOT,'js/baa-assessment.js'));
  return global.BAAAssessment;
}
function freshHomework(ls, fetchImpl) {
  global.localStorage = ls;
  global.window = global;
  global.fetch = fetchImpl;
  delete require.cache[require.resolve(path.join(ROOT,'js/baa-assessment.js'))];
  require(path.join(ROOT,'js/baa-assessment.js'));
  global.BAAAssessment = global.BAAAssessment;
  delete require.cache[require.resolve(path.join(ROOT,'js/baa-homework.js'))];
  return require(path.join(ROOT,'js/baa-homework.js'));
}
function jsonResponse(status, body) { return Promise.resolve({ok:status>=200&&status<300,status,json:()=>Promise.resolve(body)}); }

function testDirectEvidenceIntegration() {
  const A = freshAssessment(makeLocalStorage());
  const result = A.recordHomeworkEvaluation({
    submissionId:'hw_d2_1',
    submittedAt:new Date().toISOString(),
    subjectHint:'Mathematics',
    evaluation:{schemaVersion:1,learningSignals:[
      {concept:'Linear equations',outcome:'good',errorType:null,confidence:'high'},
      {concept:'Algebraic signs',outcome:'needs_improvement',errorType:'sign error',confidence:'high'},
      {concept:'Uncertain area',outcome:'uncertain',errorType:null,confidence:'high'},
      {concept:'Low confidence area',outcome:'good',errorType:null,confidence:'low'},
    ]}
  });
  assert(result.ok===true && result.evidenceIds.length===2,'D2-1: only high-confidence, non-uncertain learning signals become evidence');
  const store=A._load();
  assert(store.evidence.length===2,'D2-2: homework evidence is stored in Section B evidence');
  assert(store.evidence[0].evidenceType==='homework_evaluation' && store.evidence[0].source==='module_8_homework_scanner','D2-3: evidence is explicitly typed and sourced as homework');
  assert(store.evidence[1].errorType==='sign error','D2-4: concrete homework error type is preserved for Mistake Archeology');
  assert(store.learningMemory['Linear equations']?.status==='insufficient_evidence','D2-5: Learning Memory uses the existing evidence gate instead of claiming mastery from one submission');
}

function testDuplicateProtection() {
  const A = freshAssessment(makeLocalStorage());
  const payload={submissionId:'hw_d2_dup',submittedAt:new Date().toISOString(),subjectHint:'Science',evaluation:{schemaVersion:1,learningSignals:[{concept:'Cells',outcome:'good',errorType:null,confidence:'high'}]}};
  const first=A.recordHomeworkEvaluation(payload);
  const second=A.recordHomeworkEvaluation(payload);
  assert(first.evidenceIds.length===1,'D2-6: first integration records evidence');
  assert(second.evidenceIds.length===0,'D2-7: repeated integration does not duplicate evidence');
  assert(A._load().evidence.length===1,'D2-8: evidence remains single-row after repeated integration');
}

async function testHomeworkPath() {
  const response={schemaVersion:1,evaluationType:'text_only',overallAssessment:'good',summary:'Clear work.',strengths:['Good method'],mistakes:[],suggestions:['Review one step'],confidence:'high',humanReviewRequired:false,humanReviewReasons:[],imageEvaluated:false,learningSignals:[{concept:'Fractions',outcome:'good',errorType:null,confidence:'high'}]};
  const H=freshHomework(makeLocalStorage(),()=>jsonResponse(200,response));
  const sub=H.submitHomeworkText({text:'Explain how you solved the fraction problem.',subjectHint:'Mathematics'});
  const result=await H.evaluateSubmission(sub.submission.id,'/api/evaluate-homework');
  assert(result.ok===true,'D2-9: normal Homework Scanner evaluation still succeeds');
  assert(result.submission.learningIntegration?.status==='integrated','D2-10: evaluated homework records successful Learning Memory integration');
  assert(result.submission.learningIntegration.evidenceIds.length===1,'D2-11: Homework Scanner records the created evidence id');
  const store=global.BAAAssessment._load();
  assert(store.evidence.some(e=>e.attemptId===sub.submission.id && e.evidenceType==='homework_evaluation'),'D2-12: Homework evidence is linked back to the homework submission');
}

function testSourceContracts() {
  const assessment=fs.readFileSync(path.join(ROOT,'js/baa-assessment.js'),'utf8');
  const homework=fs.readFileSync(path.join(ROOT,'js/baa-homework.js'),'utf8');
  const endpoint=fs.readFileSync(path.join(ROOT,'api/evaluate-homework.js'),'utf8');
  const html=fs.readFileSync(path.join(ROOT,'homework-scanner.html'),'utf8');
  assert(assessment.includes('recordHomeworkEvaluation'),'D2-13: Section B exposes a dedicated homework evidence integration API');
  assert(assessment.includes("evidenceType: 'homework_evaluation'"),'D2-14: Section B marks homework evidence with a distinct evidence type');
  assert(homework.includes('learningIntegration'),'D2-15: Homework data layer records integration status honestly');
  assert(endpoint.includes('learningSignals'),'D2-16: evaluation endpoint provides explicit learning signals');
  assert(html.includes('js/baa-assessment.js'),'D2-17: Homework Scanner loads the existing Learning Memory engine');
}

(async()=>{ testDirectEvidenceIntegration(); testDuplicateProtection(); await testHomeworkPath(); testSourceContracts(); if(failures){console.error(`\n${failures} M8-D2 TEST(S) FAILED`);process.exit(1);} console.log('\nALL M8-D2 TESTS PASSED'); })();
