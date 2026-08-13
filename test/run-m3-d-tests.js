#!/usr/bin/env node
/**
 * M3-D — final Hybrid integration/hardening checkpoint.
 * Tests reset, summary, persisted corruption, limits, and source integrity.
 * Does not add server persistence or new AI behavior.
 */
const fs=require('fs');
const vm=require('vm');
const assert=require('assert');

const code=fs.readFileSync('js/baa-hybrid-mode.js','utf8');
const student=fs.readFileSync('student-os.html','utf8');

let passed=0;
function test(name,fn){
  try{fn();passed++;console.log(`PASS ${name}`);}
  catch(e){console.error(`FAIL ${name}\n${e.stack||e}`);process.exitCode=1;}
}

const storage=new Map();
const localStorage={
  getItem:k=>storage.has(k)?storage.get(k):null,
  setItem:(k,v)=>storage.set(k,v),
  removeItem:k=>storage.delete(k),
};
const sandbox={console,localStorage,window:null,Date,Math,Set,Map,Number,String,Object,Array,JSON};
sandbox.window=sandbox;
vm.createContext(sandbox);
vm.runInContext(code,sandbox);
const H=sandbox.BAAHybridMode;

test('Summary reports AI, Custom, active steps and minutes',()=>{
  const path=H.compose(
    {steps:[{title:'AI Learn',minutes:10,type:'learn'}]},
    {steps:[{title:'My Review',minutes:15,type:'review'}]}
  );
  const r=H.applyPriority(path,'balanced');
  const summary=H.getSummary(r.path);
  assert.strictEqual(summary.totalSteps,2);
  assert.strictEqual(summary.activeSteps,2);
  assert.strictEqual(summary.aiSteps,1);
  assert.strictEqual(summary.customSteps,1);
  assert.strictEqual(summary.totalMinutes,25);
});

test('Excluded step is omitted from active summary',()=>{
  const path=H.compose(
    {steps:[{title:'AI Learn',minutes:10,type:'learn'}]},
    {steps:[{title:'My Review',minutes:15,type:'review'}]}
  );
  path.steps[0].included=false;
  const summary=H.getSummary(path);
  assert.strictEqual(summary.totalSteps,2);
  assert.strictEqual(summary.activeSteps,1);
  assert.strictEqual(summary.totalMinutes,15);
});

test('Reset removes persisted Hybrid path safely',()=>{
  const path=H.compose(
    {steps:[{title:'AI Learn',minutes:10,type:'learn'}]},
    {steps:[{title:'My Review',minutes:15,type:'review'}]}
  );
  assert.strictEqual(H.savePath(path).ok,true);
  assert.strictEqual(H.getPath().steps.length,2);
  assert.strictEqual(H.resetPath().ok,true);
  assert.strictEqual(H.getPath().steps.length,0);
});

test('Corrupted persisted Hybrid JSON recovers to empty path',()=>{
  localStorage.setItem(H.STORAGE_KEY,'not-json');
  const path=H.getPath();
  assert.strictEqual(path.mode,'hybrid');
  assert.strictEqual(path.steps.length,0);
});

test('Hybrid step limit is enforced',()=>{
  const many=Array.from({length:40},(_,i)=>({title:`Step ${i}`,minutes:5,type:'learn'}));
  const path=H.compose({steps:many},{steps:many});
  assert.ok(path.steps.length<=H.MAX_STEPS);
});

test('Source counts remain accurate after priority resolution',()=>{
  const path=H.compose(
    {steps:[{title:'Same',minutes:10,type:'learn'},{title:'AI Only',minutes:5,type:'learn'}]},
    {steps:[{title:'Same',minutes:20,type:'practice'},{title:'Student Only',minutes:5,type:'learn'}]}
  );
  const r=H.applyPriority(path,'student');
  const summary=H.getSummary(r.path);
  assert.strictEqual(summary.aiSteps,1);
  assert.strictEqual(summary.customSteps,2);
});

test('Reset is exposed in Student OS',()=>{
  assert.ok(student.includes('hybridModeResetBtn'));
  assert.ok(student.includes('Reset Hybrid Path'));
});

test('M1/M2 references remain present and M4 is not introduced',()=>{
  assert.ok(student.includes('BAAAIMode'));
  assert.ok(student.includes('BAACustomMode'));
  assert.ok(!student.includes('BAA_M4'));
});

console.log(`\nM3-D: ${passed}/8 PASS`);
if(process.exitCode)process.exit(process.exitCode);
