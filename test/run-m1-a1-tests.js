#!/usr/bin/env node
/**
 * M1-A1 focused tests.
 * Covers validation, honest failure, plan normalization, UI wiring, and regression safety.
 */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const apiCode = fs.readFileSync('api/ai-mode.js', 'utf8');
const student = fs.readFileSync('student-os.html', 'utf8');
const client = fs.readFileSync('js/baa-ai-mode.js', 'utf8');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { console.error(`FAIL ${name}\n${e.stack || e}`); process.exitCode = 1; }
}

const sandbox = { console, setTimeout, clearTimeout, fetch: async()=>{}, process:{env:{}}, Response, Date, JSON, Math, Set, Map, Number, String, Object, Array };
vm.createContext(sandbox);
const apiTestCode = apiCode
  .replace(/export\s+const\s+config\s*=\s*\{[^;]+;\s*/s, '')
  .replace(/export\s+default\s+async function handler/, 'async function handler')
  .replace(/export\s+function/g, 'function');
vm.runInContext(apiTestCode, sandbox);
const validateBody = sandbox.validateBody;
const normalizePlan = sandbox.normalizePlan;

test('Valid bounded request passes validation', () => {
  const v = validateBody({
    goal:'Improve fractions',
    availableMinutesPerDay:30,
    concepts:[{concept:'fractions',state:'needs_revision',confidence:'medium',evidenceCount:4}],
    upcomingAssessments:[{title:'Math test',subject:'Math',date:'2026-08-20'}]
  });
  assert.ok(!v.error);
  assert.strictEqual(v.availableMinutesPerDay,30);
});

test('Missing goal is rejected', () => {
  const v = validateBody({goal:'',availableMinutesPerDay:30,concepts:[]});
  assert.strictEqual(v.error.code,'GOAL_REQUIRED');
});

test('Invalid concept shape is rejected', () => {
  const v = validateBody({
    goal:'Study',availableMinutesPerDay:30,
    concepts:[{concept:'x',state:'made_up',confidence:'high',evidenceCount:3}]
  });
  assert.strictEqual(v.error.code,'INVALID_CONCEPT');
});

test('Time budget is enforced', () => {
  const input = validateBody({goal:'Study',availableMinutesPerDay:20,concepts:[]});
  const n = normalizePlan({
    schemaVersion:1,mode:'ai',summary:'Plan',
    steps:[
      {title:'Study',minutes:15,type:'learn',reason:'Goal'},
      {title:'Practice',minutes:10,type:'practice',reason:'Goal'}
    ]
  }, input);
  assert.strictEqual(n.error.code,'PLAN_EXCEEDS_TIME');
});

test('Valid AI plan is normalized', () => {
  const input = validateBody({goal:'Study',availableMinutesPerDay:30,concepts:[]});
  const n = normalizePlan({
    schemaVersion:1,mode:'ai',summary:'Focus on fractions',
    steps:[
      {title:'Review fractions',minutes:10,type:'review',reason:'Needs revision evidence.'},
      {title:'Practice fractions',minutes:15,type:'practice',reason:'Practice supports the goal.'}
    ]
  }, input);
  assert.ok(!n.error);
  assert.strictEqual(n.plan.totalMinutes,25);
  assert.strictEqual(n.plan.evidenceBound,true);
});

test('Malformed AI plan is rejected instead of displayed', () => {
  const input = validateBody({goal:'Study',availableMinutesPerDay:30,concepts:[]});
  const n = normalizePlan({schemaVersion:99,mode:'ai',steps:[]}, input);
  assert.strictEqual(n.error.code,'INVALID_AI_PLAN');
});

test('Student OS contains the AI Mode UI and client wiring', () => {
  assert.ok(student.includes('aiModeGenerateBtn'));
  assert.ok(student.includes('js/baa-ai-mode.js'));
  assert.ok(student.includes('BAAAIMode'));
  assert.ok(client.includes('/api/ai-mode.js'));
});

test('Client renderer uses textContent, not dynamic innerHTML, for AI output', () => {
  assert.ok(client.includes('container.textContent ='));
  assert.ok(client.includes('title.textContent = step.title'));
  assert.ok(!client.includes('container.innerHTML'));
});

test('M8 files remain present', () => {
  for (const f of [
    'SECTION-M8-STATUS.md','js/baa-homework.js','js/baa-homework-pdf.js',
    'js/baa-homework-image.js','api/evaluate-homework.js'
  ]) assert.ok(fs.existsSync(f), f);
});

console.log(`\nM1-A1: ${passed}/9 PASS`);
if (process.exitCode) process.exit(process.exitCode);
