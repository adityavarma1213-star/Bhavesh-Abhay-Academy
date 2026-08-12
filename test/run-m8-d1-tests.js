// BAA OS — Module 8 checkpoint M8-D1 tests.
// Covers Homework Scanner -> shared Teacher Review surface integration.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let failures = 0;
function assert(cond, msg) { if (!cond) { console.error('FAIL:', msg); failures++; } else console.log('PASS:', msg); }
function makeLocalStorage(seed) {
  const data = Object.assign({}, seed || {});
  return { getItem:k=>(k in data?data[k]:null), setItem:(k,v)=>{data[k]=String(v);}, removeItem:k=>{delete data[k];}, clear:()=>Object.keys(data).forEach(k=>delete data[k]) };
}
function fresh(ls) {
  global.localStorage = ls;
  global.window = global;
  delete require.cache[require.resolve(path.join(ROOT,'js/baa-homework.js'))];
  return require(path.join(ROOT,'js/baa-homework.js'));
}
function seedEvaluated() {
  return JSON.stringify({
    meta:{schemaVersion:1,storageType:'LOCAL_BROWSER_STORAGE_TESTING_ONLY',createdAt:new Date().toISOString()},
    submissions:[{
      id:'hw_test_1', submittedAt:new Date().toISOString(), inputType:'text', text:'Solve 2+2 and explain.', subjectHint:'Mathematics',
      attachments:[], status:'evaluated', lastEvaluationError:null,
      evaluation:{schemaVersion:1,evaluationType:'image_or_text',overallAssessment:'needs_improvement',summary:'AI summary',strengths:['clear start'],mistakes:['missing explanation'],suggestions:['show steps'],confidence:'low',humanReviewRequired:true,humanReviewReasons:['low confidence'],evaluatedAt:new Date().toISOString(),imageEvaluated:false}
    }]
  });
}
function testQueueAndReview(){
  const ls=makeLocalStorage({'baa_section_m8_homework_v1':seedEvaluated(),'baa_student_name':'Bhavesh'});
  const H=fresh(ls);
  const submission=H.getSubmission('hw_test_1');
  const created=H.createHomeworkReview(submission);
  assert(created.ok===true,'D1-1: evaluated homework creates a review row');
  assert(created.review.teacherStatus==='pending','D1-2: homework review starts pending');
  assert(H.getHomeworkReviewQueue({status:'pending'}).length===1,'D1-3: pending homework appears in review queue');
  const original=JSON.stringify(submission.evaluation);
  const edited=H.submitHomeworkReview(created.review.id,{action:'edit',reviewer:'Teacher',finalAssessment:'Teacher assessment',finalSummary:'Teacher summary',teacherComment:'Please show all steps.'});
  assert(!edited.error && edited.review.teacherStatus==='edited','D1-4: teacher can save an edited homework evaluation');
  const stored=H.getSubmission('hw_test_1');
  assert(JSON.stringify(stored.evaluation)===original,'D1-5: original AI evaluation remains unchanged after human edit');
  assert(stored.review.finalAssessment==='Teacher assessment','D1-6: final human assessment is stored separately');
  assert(stored.review.decisionHistory.length===0,'D1-7: first human decision has no fake prior history');
  const accepted=H.submitHomeworkReview(created.review.id,{action:'accept',reviewer:'Teacher 2'});
  assert(!accepted.error && accepted.review.teacherStatus==='accepted','D1-8: re-review can accept the homework');
  assert(accepted.review.decisionHistory.length===1,'D1-9: prior human decision is preserved in decision history');
}
function testGuards(){
  const H=fresh(makeLocalStorage());
  const notEval=H.createHomeworkReview({id:'x',status:'received',evaluation:null});
  assert(notEval.error==='HOMEWORK_NOT_EVALUATED','D1-10: non-evaluated homework cannot enter review queue');
}
function testSourceContract(){
  const html=fs.readFileSync(path.join(ROOT,'teacher-review.html'),'utf8');
  const js=fs.readFileSync(path.join(ROOT,'js/baa-homework.js'),'utf8');
  assert(html.includes('js/baa-homework.js'),'D1-11: Teacher Review page loads Homework data layer');
  assert(html.includes('renderHomeworkCard'),'D1-12: Teacher Review page renders homework review cards');
  assert(html.includes('doHomeworkReview'),'D1-13: Teacher Review page wires homework review actions');
  assert(js.includes('createHomeworkReview'),'D1-14: Homework data layer exposes review creation');
  assert(js.includes('originalAiEvaluation'),'D1-15: original AI evaluation is explicitly preserved');
}
testQueueAndReview();
testGuards();
testSourceContract();
if(failures){console.error(`\n${failures} M8-D1 TEST(S) FAILED`);process.exit(1);}
console.log('\nALL M8-D1 TESTS PASSED');
