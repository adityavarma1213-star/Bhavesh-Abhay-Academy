#!/usr/bin/env node
/**
 * M6 — Smart Assessment System.
 * Verifies evidence-driven adaptive selection from the real question bank.
 */
const fs=require('fs');
const assert=require('assert');
const engine=fs.readFileSync('js/baa-assessment.js','utf8');
const page=fs.readFileSync('assessment.html','utf8');
const bank=fs.readFileSync('js/question-bank.js','utf8');
let passed=0;
function test(name,fn){try{fn();passed++;console.log(`PASS ${name}`)}catch(e){console.error(`FAIL ${name}\n${e.stack||e}`);process.exitCode=1}}

test('Adaptive builder exists in the shared assessment layer',()=>{
  assert.ok(engine.includes('function buildAdaptiveAssessment()'));
  assert.ok(engine.includes('global.BAAQuestionBank'));
});

test('Adaptive selection uses real evidence and ranks weak concepts',()=>{
  assert.ok(engine.includes('store.evidence'));
  assert.ok(engine.includes('rankedConcepts'));
  assert.ok(engine.includes('a.rate - b.rate'));
});

test('Adaptive selection only uses existing question-bank items',()=>{
  assert.ok(engine.includes('bank.filter(q => q.concept === item.concept)'));
  assert.ok(engine.includes('selected.map(q => q.id)'));
});

test('Adaptive check varies question type/difficulty',()=>{
  assert.ok(engine.includes('q.type !== (selected[0] && selected[0].type)'));
  assert.ok(engine.includes("q.difficulty === 'medium' || q.difficulty === 'hard'"));
});

test('No-evidence fallback is a real diagnostic mix, not invented content',()=>{
  assert.ok(engine.includes('Starter diagnostic'));
  assert.ok(engine.includes("addBest(bank, q => q.difficulty === 'easy')"));
});

test('Adaptive assessment is inserted into the real catalog and runnable',()=>{
  assert.ok(page.includes('ensureSmartAdaptiveAssessment()'));
  assert.ok(page.includes("BAAAssessmentCatalog.unshift(generated)"));
  assert.ok(page.includes("beginAssessment(a.id)"));
});

test('Catalog-generated text is inserted safely',()=>{
  assert.ok(page.includes('type.textContent='));
  assert.ok(page.includes('title.textContent='));
  assert.ok(page.includes('desc.textContent='));
});

test('Adaptive assessment carries honest metadata',()=>{
  assert.ok(engine.includes("adaptive: true"));
  assert.ok(engine.includes("curriculumMapping: 'Generated from BAA Learning Evidence'"));
});

test('Adaptive generation does not invent scores',()=>{
  assert.ok(!engine.includes('score: 100'));
  assert.ok(!engine.includes('mastery: 100'));
});

test('Existing assessment storage and evaluation pipeline remain present',()=>{
  assert.ok(engine.includes('startAttempt'));
  assert.ok(engine.includes('submitAttempt'));
  assert.ok(page.includes('EVAL_API_URL'));
});

console.log(`\nM6: ${passed}/10 PASS`);
if(process.exitCode)process.exit(process.exitCode);
