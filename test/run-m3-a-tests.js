#!/usr/bin/env node
/**
 * M3-A — Hybrid Mode foundation.
 * Covers AI+Custom composition, malformed input, persistence, and UI wiring.
 */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const code = fs.readFileSync('js/baa-hybrid-mode.js','utf8');
const student = fs.readFileSync('student-os.html','utf8');
const ai = fs.readFileSync('js/baa-ai-mode.js','utf8');
const custom = fs.readFileSync('js/baa-custom-mode.js','utf8');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch(e){ console.error(`FAIL ${name}\n${e.stack||e}`); process.exitCode=1; }
}

const storage = new Map();
const localStorage = {
  getItem: (k) => storage.has(k) ? storage.get(k) : null,
  setItem: (k,v) => storage.set(k,v),
  removeItem: (k) => storage.delete(k),
};
const sandbox = { console, localStorage, window: null, Date, Math, Set, Map, Number, String, Object, Array, JSON };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const H = sandbox.BAAHybridMode;

test('AI and Custom steps compose into one Hybrid path', () => {
  const path = H.compose(
    { steps: [{ title:'Review algebra', minutes:10, type:'review', reason:'AI evidence' }] },
    { steps: [{ id:'c1', title:'My practice', minutes:15, type:'practice', completed:true }] }
  );
  assert.strictEqual(path.mode, 'hybrid');
  assert.strictEqual(path.steps.length, 2);
  assert.strictEqual(path.sources.ai, 1);
  assert.strictEqual(path.sources.custom, 1);
  assert.strictEqual(path.totalMinutes, 25);
});

test('Malformed steps are rejected rather than copied', () => {
  const path = H.compose(
    { steps: [{ title:'', minutes:1, type:'bad' }, { title:'Valid AI', minutes:10, type:'learn' }] },
    { steps: [{ title:'Valid custom', minutes:10, type:'practice' }, null] }
  );
  assert.strictEqual(path.steps.length, 2);
});

test('Hybrid step source is explicit', () => {
  const path = H.compose(
    { steps: [{ title:'AI step', minutes:10, type:'learn' }] },
    { steps: [{ title:'Student step', minutes:10, type:'practice' }] }
  );
  assert.strictEqual(path.steps[0].source, 'ai');
  assert.strictEqual(path.steps[1].source, 'custom');
});

test('Maximum Hybrid step count is enforced', () => {
  const many = Array.from({length:20}, (_,i) => ({title:`Step ${i}`,minutes:5,type:'learn'}));
  const path = H.compose({steps:many},{steps:many});
  assert.ok(path.steps.length <= H.MAX_STEPS);
});

test('Hybrid path persists and can be read back', () => {
  const path = H.compose(
    { steps: [{ title:'AI step', minutes:10, type:'learn' }] },
    { steps: [{ title:'Student step', minutes:10, type:'practice' }] }
  );
  const saved = H.savePath(path);
  assert.strictEqual(saved.ok, true);
  const loaded = H.getPath();
  assert.strictEqual(loaded.mode, 'hybrid');
  assert.strictEqual(loaded.steps.length, 2);
});

test('Corrupt persisted Hybrid data fails safely', () => {
  localStorage.setItem(H.STORAGE_KEY, '{bad-json');
  const loaded = H.getPath();
  assert.strictEqual(loaded.mode, 'hybrid');
  assert.strictEqual(Array.isArray(loaded.steps), true);
  assert.strictEqual(loaded.steps.length, 0);
});

test('Student OS loads Hybrid Mode and exposes the control', () => {
  assert.ok(student.includes('js/baa-hybrid-mode.js'));
  assert.ok(student.includes('hybridModeBtn'));
  assert.ok(student.includes('Create Hybrid Path'));
});

test('M1 and M2 APIs remain present', () => {
  assert.ok(ai.includes('BAAAIMode'));
  assert.ok(custom.includes('BAACustomMode'));
});

console.log(`\nM3-A: ${passed}/8 PASS`);
if (process.exitCode) process.exit(process.exitCode);
