#!/usr/bin/env node
/**
 * M3-C — explicit Hybrid conflict/priority behavior.
 * Student can choose balanced, student-priority, or AI-priority behavior.
 * This checkpoint does not use new AI evidence and does not add server persistence.
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
const localStorage={getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,v)};
const sandbox={console,localStorage,window:null,Date,Math,Set,Map,Number,String,Object,Array,JSON};
sandbox.window=sandbox;
vm.createContext(sandbox);
vm.runInContext(code,sandbox);
const H=sandbox.BAAHybridMode;

const ai={steps:[
  {title:'Fractions practice',minutes:20,type:'practice'},
  {title:'Algebra review',minutes:10,type:'review'}
]};
const custom={steps:[
  {title:'Fractions practice',minutes:15,type:'practice'},
  {title:'Science reading',minutes:10,type:'learn'}
]};

test('Balanced keeps both sides of a same-title conflict',()=>{
  const path=H.compose(ai,custom);
  const r=H.applyPriority(path,'balanced');
  assert.strictEqual(r.ok,true);
  assert.strictEqual(r.path.priority,'balanced');
  assert.strictEqual(r.path.steps.filter(s=>s.title==='Fractions practice').length,2);
});

test('Student priority keeps the student version of a conflict',()=>{
  const path=H.compose(ai,custom);
  const r=H.applyPriority(path,'student');
  assert.strictEqual(r.ok,true);
  assert.strictEqual(r.path.steps.filter(s=>s.title==='Fractions practice').length,1);
  assert.strictEqual(r.path.steps.find(s=>s.title==='Fractions practice').source,'custom');
});

test('AI priority keeps the AI version of a conflict',()=>{
  const path=H.compose(ai,custom);
  const r=H.applyPriority(path,'ai');
  assert.strictEqual(r.ok,true);
  assert.strictEqual(r.path.steps.filter(s=>s.title==='Fractions practice').length,1);
  assert.strictEqual(r.path.steps.find(s=>s.title==='Fractions practice').source,'ai');
});

test('Invalid priority safely falls back to balanced',()=>{
  const path=H.compose(ai,custom);
  const r=H.applyPriority(path,'not-a-real-priority');
  assert.strictEqual(r.ok,true);
  assert.strictEqual(r.path.priority,'balanced');
  assert.strictEqual(r.path.steps.filter(s=>s.title==='Fractions practice').length,2);
});

test('Non-conflicting steps remain present',()=>{
  const path=H.compose(ai,custom);
  const r=H.applyPriority(path,'student');
  assert.ok(r.path.steps.some(s=>s.title==='Algebra review'));
  assert.ok(r.path.steps.some(s=>s.title==='Science reading'));
});

test('Included/excluded state survives priority resolution',()=>{
  const path=H.compose(ai,custom);
  path.steps[0].included=false;
  const r=H.applyPriority(path,'balanced');
  assert.strictEqual(r.ok,true);
  assert.strictEqual(r.path.steps[0].included,false);
  assert.strictEqual(r.path.totalMinutes,35);
});

test('Priority policy is explicit and stored',()=>{
  const path=H.compose(ai,custom);
  const r=H.applyPriority(path,'student');
  assert.ok(r.path.conflictPolicy.includes('Student-created'));
});

test('Student OS exposes the three priority choices',()=>{
  assert.ok(student.includes('hybridPrioritySelect'));
  assert.ok(student.includes('Balanced'));
  assert.ok(student.includes('Student priority'));
  assert.ok(student.includes('AI priority'));
});

console.log(`\nM3-C: ${passed}/8 PASS`);
if(process.exitCode)process.exit(process.exitCode);
