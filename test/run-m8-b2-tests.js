// BAA OS — Module 8 Checkpoint M8-B2 tests.
// Covers the client-side structured-result contract and human-review rules.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let failures = 0;
function assert(cond, msg) { if (!cond) { console.error('FAIL:', msg); failures++; } else console.log('PASS:', msg); }
function makeLocalStorage() { const data = {}; return { getItem:k=>(k in data?data[k]:null), setItem:(k,v)=>{data[k]=String(v);}, removeItem:k=>{delete data[k];}, clear:()=>Object.keys(data).forEach(k=>delete data[k]) }; }
function freshHomework(ls, fetchImpl) { global.localStorage=ls; global.window=global; global.fetch=fetchImpl; delete require.cache[require.resolve(path.join(ROOT,'js/baa-homework.js'))]; return require(path.join(ROOT,'js/baa-homework.js')); }
function jsonResponse(status, body) { return Promise.resolve({ok:status>=200&&status<300,status,json:()=>Promise.resolve(body)}); }
async function testStructuredSchemaAccepted() {
  const BAAHomework=freshHomework(makeLocalStorage(),()=>jsonResponse(200,{schemaVersion:1,evaluationType:'text_only',overallAssessment:'good',summary:'Clear work.',strengths:['Correct method'],mistakes:[],suggestions:['Check units'],confidence:'high',humanReviewRequired:false,humanReviewReasons:[],imageEvaluated:false}));
  const sub=BAAHomework.submitHomeworkText({text:'Explain how you solved the equation.'});
  const res=await BAAHomework.evaluateSubmission(sub.submission.id,'/api/evaluate-homework');
  assert(res.ok===true,'B2-1: valid structured schema is accepted');
  assert(res.submission.evaluation.schemaVersion===1 && res.submission.evaluation.evaluationType==='text_only','B2-2: schema version and evaluation type are recorded');
  assert(res.submission.evaluation.confidence==='high' && res.submission.evaluation.humanReviewRequired===false,'B2-3: confidence and human-review flag are preserved');
}
async function testInvalidSchemaRejected() {
  const BAAHomework=freshHomework(makeLocalStorage(),()=>jsonResponse(200,{overallAssessment:'good',summary:'looks fine'}));
  const sub=BAAHomework.submitHomeworkText({text:'Homework with an invalid evaluator response.'});
  const res=await BAAHomework.evaluateSubmission(sub.submission.id,'/api/evaluate-homework');
  assert(res.ok===false && res.error==='EVALUATION_FAILED','B2-4: malformed structured result is rejected honestly');
  assert(res.submission.status==='evaluation_failed' && res.submission.evaluation===null,'B2-5: malformed result never becomes an evaluated record');
}
async function testImageForcesHumanReview() {
  const BAAHomework=freshHomework(makeLocalStorage(),()=>jsonResponse(200,{schemaVersion:1,evaluationType:'text_only',overallAssessment:'good',summary:'Text is clear.',strengths:[],mistakes:[],suggestions:[],confidence:'high',humanReviewRequired:false,humanReviewReasons:[],imageEvaluated:false}));
  const sub=BAAHomework.submitHomeworkText({text:'My answer is partly shown in the attached photo.',image:{mimeType:'image/jpeg',originalSizeBytes:1000,compressedSizeBytes:500,width:100,height:100,fileName:'hw.jpg'}});
  const res=await BAAHomework.evaluateSubmission(sub.submission.id,'/api/evaluate-homework');
  assert(res.ok===true,'B2-6: text evaluation with attached image can still succeed');
  assert(res.submission.evaluation.humanReviewRequired===true,'B2-7: attached-but-unseen image forces human review');
}
function testEndpointSchemaContractPresent() {
  const src=fs.readFileSync(path.join(ROOT,'api/evaluate-homework.js'),'utf8');
  assert(src.includes('SCHEMA_VERSION = 1'),'B2-8: endpoint defines an explicit schema version');
  assert(src.includes("EVALUATION_TYPE = 'text_only'"),'B2-9: endpoint defines an explicit evaluation type');
  assert(src.includes('humanReviewReasons'),'B2-10: endpoint exposes human-review reasons');
  assert(src.includes('imageEvaluated: false'),'B2-11: endpoint explicitly states image content was not evaluated');
  assert(src.includes('confidence'),'B2-12: endpoint validates confidence');
}
async function main(){ await testStructuredSchemaAccepted(); await testInvalidSchemaRejected(); await testImageForcesHumanReview(); testEndpointSchemaContractPresent(); if(failures){console.error(`\n${failures} M8-B2 TEST(S) FAILED`);process.exit(1);} console.log('\nALL M8-B2 TESTS PASSED'); }
main();
