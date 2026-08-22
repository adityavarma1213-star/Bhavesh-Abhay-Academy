#!/usr/bin/env node
/**
 * M3-B — Student control over the Hybrid path.
 * Scope: include/exclude, reorder, save, and safe invalid-step handling.
 * Does not implement automatic AI conflict resolution or server persistence.
 */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const code = fs.readFileSync('js/baa-hybrid-mode.js','utf8');
const student = fs.readFileSync('student-os.html','utf8');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch(e){ console.error(`FAIL ${name}\n${e.stack||e}`); process.exitCode=1; }
}

const storage = new Map();
const localStorage = {
  getItem:k=>storage.has(k)?storage.get(k):null,
  setItem:(k,v)=>storage.set(k,v),
  removeItem:k=>storage.delete(k),
};
const sandbox={console,localStorage,window:null,Date,Math,Set,Map,Number,String,Object,Array,JSON};
sandbox.window=sandbox;
vm.createContext(sandbox);
vm.runInContext(code,sandbox);
const H=sandbox.BAAHybridMode;

const base=H.compose(
  {steps:[
    {title:'AI Learn',minutes:10,type:'learn'},
    {title:'AI Practice',minutes:15,type:'practice'}
  ]},
  {steps:[
    {title:'Student Review',minutes:10,type:'review'}
  ]}
);

test('Hybrid path contains both AI and student sources',()=>{
  assert.strictEqual(base.steps.length,3);
  assert.strictEqual(base.sources.ai,2);
  assert.strictEqual(base.sources.custom,1);
});

test('Student can exclude one Hybrid step',()=>{
  const result=H.setStepIncluded(base,base.steps[1].id,false);
  assert.strictEqual(result.ok,true);
  assert.strictEqual(H.getActiveSteps(result.path).length,2);
  assert.strictEqual(result.path.steps[1].included,false);
});

test('Student can include an excluded step again',()=>{
  const result=H.setStepIncluded({...base,steps:base.steps.map(s=>({...s,included:s.id===base.steps[1].id?false:true}))},base.steps[1].id,true);
  assert.strictEqual(result.ok,true);
  assert.strictEqual(H.getActiveSteps(result.path).length,3);
});

test('Student can reorder a Hybrid step',()=>{
  const result=H.moveStep(base,base.steps[2].id,'up');
  assert.strictEqual(result.ok,true);
  assert.strictEqual(result.path.steps[1].source,'custom');
});

test('Invalid step id returns an honest error',()=>{
  const result=H.setStepIncluded(base,'missing-id',false);
  assert.strictEqual(result.ok,false);
  assert.strictEqual(result.error.code,'STEP_NOT_FOUND');
});

test('Student-adjusted path recalculates active minutes',()=>{
  const adjusted={...base,steps:base.steps.map((s,i)=>({...s,included:i!==0}))};
  const result=H.saveStudentAdjustedPath(adjusted);
  assert.strictEqual(result.ok,true);
  assert.strictEqual(result.path.steps[0].included, false);
  assert.strictEqual(result.path.totalMinutes,25);
});

test('Student-adjusted path persists',()=>{
  const result=H.saveStudentAdjustedPath(base);
  assert.strictEqual(result.ok,true);
  const loaded=H.getPath();
  assert.strictEqual(loaded.mode,'hybrid');
  assert.strictEqual(loaded.steps.length,3);
});

test('Student OS exposes Hybrid controls and accessible buttons',()=>{
  assert.ok(student.includes('hybridModeControls'));
  assert.ok(student.includes('Include'));
  assert.ok(student.includes('Exclude'));
  assert.ok(student.includes('aria-label'));
});

console.log(`\nM3-B: ${passed}/8 PASS`);
if(process.exitCode) process.exit(process.exitCode);
