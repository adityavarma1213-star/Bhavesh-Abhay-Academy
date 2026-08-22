#!/usr/bin/env node
/**
 * M10-C1 — AI Confidence Meter
 * Tests the evidence-backed confidence summary and Student OS wiring.
 * Does not test live AI calls; it tests deterministic behavior from stored evidence.
 */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (err) { console.error(`FAIL ${name}\n${err.stack || err}`); process.exitCode = 1; }
}

const assessmentPath = 'js/baa-assessment.js';
const intelligencePath = 'js/baa-intelligence.js';
const assessmentCode = fs.readFileSync(assessmentPath, 'utf8');
const intelligenceCode = fs.readFileSync(intelligencePath, 'utf8');

function makeContext(store) {
  const ctx = {
    console,
    localStorage: {
      getItem: () => JSON.stringify(store),
      setItem: () => {}
    },
    window: null,
    Date,
    Math,
    JSON,
    Set,
    Object,
    Array,
    String,
    Number,
    Boolean,
    parseInt,
    parseFloat,
    isNaN
  };
  ctx.window = ctx;
  vm.runInNewContext(assessmentCode, ctx, {filename: assessmentPath});
  vm.runInNewContext(intelligenceCode, ctx, {filename: intelligencePath});
  return ctx;
}

function baseStore(evidence) {
  return {
    version: 4,
    attempts: [],
    evidence,
    learningMemory: evidence.reduce((m, e) => {
      m[e.concept] = {
        concept: e.concept, subject: e.subject || 'Math', topic: e.topic || e.concept,
        evidenceCount: (m[e.concept]?.evidenceCount || 0) + 1,
        correctCount: (m[e.concept]?.correctCount || 0) + (e.correctness === 'correct' ? 1 : 0),
        lastUpdated: e.timestamp,
        status: ((m[e.concept]?.correctCount || 0) + (e.correctness === 'correct' ? 1 : 0)) / ((m[e.concept]?.evidenceCount || 0) + 1) >= 0.8 ? 'mastered' : 'learning'
      };
      return m;
    }, {}),
    mistakePatterns: [],
    teacherReviews: [],
    meta: { schemaVersion: 1, storageType: 'LOCAL_BROWSER_STORAGE_TESTING_ONLY' }
  };
}
function ev(concept, i, confidence='high', correctness='correct') {
  return {
    id: `${concept}-${i}`, concept, subject:'Math', topic:concept,
    correctness, confidence, timestamp:`2026-08-${String(i).padStart(2,'0')}T10:00:00.000Z`,
    questionType: i % 2 ? 'mcq' : 'short_answer', difficulty: i % 2 ? 'medium' : 'hard'
  };
}

test('No evidence returns insufficient_evidence', () => {
  const ctx = makeContext(baseStore([]));
  const s = ctx.BAAIntelligence.getConfidenceSummary();
  assert.strictEqual(s.band, 'insufficient_evidence');
  assert.strictEqual(s.eligibleConcepts, 0);
});

test('Three high-confidence rows return medium confidence', () => {
  const ctx = makeContext(baseStore([1,2,3].map(i => ev('fractions', i))));
  const s = ctx.BAAIntelligence.getConfidenceSummary();
  assert.strictEqual(s.band, 'medium');
  assert.strictEqual(s.eligibleConcepts, 1);
});

test('Six high-confidence rows return high confidence', () => {
  const ctx = makeContext(baseStore([1,2,3,4,5,6].map(i => ev('fractions', i))));
  const s = ctx.BAAIntelligence.getConfidenceSummary();
  assert.strictEqual(s.band, 'high');
});

test('Low-confidence evidence conservatively lowers the aggregate band', () => {
  const rows = [1,2,3,4,5,6].map(i => ev('fractions', i));
  rows[5].confidence = 'low';
  const ctx = makeContext(baseStore(rows));
  const s = ctx.BAAIntelligence.getConfidenceSummary();
  assert.strictEqual(s.band, 'low');
});

test('Multiple concepts use the weakest represented evidence band', () => {
  const rows = [1,2,3,4,5,6].map(i => ev('fractions', i))
    .concat([1,2,3].map(i => ev('algebra', i, 'medium')));
  const ctx = makeContext(baseStore(rows));
  const s = ctx.BAAIntelligence.getConfidenceSummary();
  assert.strictEqual(s.band, 'medium');
  assert.strictEqual(s.eligibleConcepts, 2);
});

const student = fs.readFileSync('student-os.html', 'utf8');
test('Student OS contains the confidence meter and real-data renderer', () => {
  assert.ok(student.includes('pfConfidenceMeter'));
  assert.ok(student.includes('BAAIntelligence.getConfidenceSummary()'));
  assert.ok(student.includes("Confidence in BAA's learning picture"));
  assert.ok(student.includes('No numeric percentage is shown'));
});

console.log(`\nM10-C1: ${passed}/6 PASS`);
if (process.exitCode) process.exit(process.exitCode);
