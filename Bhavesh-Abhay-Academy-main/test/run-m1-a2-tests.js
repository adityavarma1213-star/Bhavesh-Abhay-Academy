#!/usr/bin/env node
/**
 * M1-A2 — AI Mode adaptive regeneration.
 * Tests valid/invalid previous plans, adaptation flags, client wiring,
 * honest no-previous-plan behavior, and regression file preservation.
 */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const apiCode = fs.readFileSync('api/ai-mode.js','utf8');
const clientCode = fs.readFileSync('js/baa-ai-mode.js','utf8');
const student = fs.readFileSync('student-os.html','utf8');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch(e){ console.error(`FAIL ${name}\n${e.stack||e}`); process.exitCode=1; }
}

const sandbox = {console,setTimeout,clearTimeout,fetch:async()=>{},process:{env:{}},Response,Date,JSON,Math,Set,Map,Number,String,Object,Array};
vm.createContext(sandbox);
const apiTestCode = apiCode
  .replace(/export\s+const\s+config\s*=\s*\{[^;]+;\s*/s,'')
  .replace(/import\s+\{\s*requireAuth\s*\}\s+from\s+['"]\.\/\_lib\/auth\.js['"];\s*/s,'')
  .replace(/import\s+\{\s*consumeAiRateLimit\s*\}\s+from\s+['"]\.\/\_lib\/ai-rate-limit\.js['"];\s*/s,'')
  .replace(/export\s+default\s+async function handler/,'async function handler')
  .replace(/export\s+function/g,'function');
vm.runInContext(apiTestCode,sandbox);

const validateBody=sandbox.validateBody;
const normalizePlan=sandbox.normalizePlan;

function validBody() {
  return {
    goal:'Improve fractions',
    availableMinutesPerDay:30,
    concepts:[{concept:'fractions',state:'needs_revision',confidence:'medium',evidenceCount:4}],
    upcomingAssessments:[]
  };
}
const previousPlan={
  schemaVersion:1, mode:'ai', summary:'Review fractions',
  steps:[{title:'Review fractions',minutes:10,type:'review'}],
  totalMinutes:10
};

test('Valid previous plan is accepted',()=>{
  const v=validateBody({...validBody(),previousPlan});
  assert.ok(!v.error);
  assert.ok(v.previousPlan);
});

test('Malformed previous plan is rejected',()=>{
  const v=validateBody({...validBody(),previousPlan:{schemaVersion:99,mode:'ai',steps:[]}});
  assert.strictEqual(v.error.code,'INVALID_PREVIOUS_PLAN');
});

test('Plan without previous plan is marked non-adaptive',()=>{
  const input=validateBody(validBody());
  const n=normalizePlan({
    schemaVersion:1,mode:'ai',summary:'Plan',
    steps:[{title:'Practice fractions',minutes:20,type:'practice',reason:'Needs revision evidence.'}]
  },input);
  assert.ok(!n.error);
  assert.strictEqual(n.plan.adaptedFromPreviousPlan,false);
});

test('Plan with previous plan is marked adaptive',()=>{
  const input=validateBody({...validBody(),previousPlan});
  const n=normalizePlan({
    schemaVersion:1,mode:'ai',summary:'Updated plan',
    steps:[{title:'Practice fractions',minutes:20,type:'practice',reason:'Latest evidence shows needs revision.'}]
  },input);
  assert.ok(!n.error);
  assert.strictEqual(n.plan.adaptedFromPreviousPlan,true);
});

test('Client exposes adaptive action',()=>{
  assert.ok(clientCode.includes('async function adaptPlan'));
  assert.ok(clientCode.includes('NO_PREVIOUS_PLAN'));
  assert.ok(clientCode.includes('previousPlan'));
});

test('Student OS exposes Adapt to latest evidence control',()=>{
  assert.ok(student.includes('aiModeAdaptBtn'));
  assert.ok(student.includes('Adapt to latest evidence'));
});

test('Existing M8 and M10 files remain present',()=>{
  for(const f of [
    'SECTION-M8-STATUS.md','js/baa-homework.js','js/baa-homework-pdf.js',
    'js/baa-intelligence.js','test/run-m10-c1-tests.js'
  ]) assert.ok(fs.existsSync(f),f);
});

console.log(`\nM1-A2: ${passed}/7 PASS`);
if(process.exitCode) process.exit(process.exitCode);
