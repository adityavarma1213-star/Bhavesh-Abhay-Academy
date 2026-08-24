#!/usr/bin/env node
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const source = fs.readFileSync('js/baa-learning-resources.js', 'utf8');
const store = new Map();
const context = {
  window: {},
  localStorage: {
    getItem: (k) => store.has(k) ? store.get(k) : null,
    setItem: (k, v) => store.set(k, String(v)),
  },
};
context.window.localStorage = context.localStorage;
context.window.BAAAssessment = {
  getAcademicProfile: () => ({ strengths: [], weaknesses: [
    { concept: 'linear-equations', subject: 'Math', status: 'needs_revision', evidenceCount: 3 }
  ] }),
};
context.BAAAssessment = context.window.BAAAssessment;
vm.runInNewContext(source, context);
const mod = context.window.BAALearningResources;
let n = 0;
function t(name, fn) { try { fn(); n++; console.log('PASS ' + name); } catch (e) { console.error('FAIL ' + name + '\n' + e.stack); process.exitCode = 1; } }

t('M27 module exports resource API', () => assert.ok(mod && typeof mod.getRecommendations === 'function'));
t('M27 rejects invalid preference', () => { const r=mod.setPreference('diagnostic-learning-style'); assert.strictEqual(r.ok, false); assert.strictEqual(r.error, 'INVALID_RESOURCE_FORMAT'); });
t('M27 accepts explicit student format preference', () => {
  const r = mod.setPreference('visual');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(mod.getPreference(), 'visual');
});
t('M27 uses real academic evidence', () => {
  const r = mod.getRecommendations(8);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.recommendations[0].concept, 'linear-equations');
  assert.strictEqual(r.recommendations[0].evidenceCount, 3);
});
t('M27 supports multimodal formats', () => {
  const r = mod.getRecommendations(8);
  const formats = new Set(r.recommendations.map(x => x.format));
  assert.ok(formats.has('visual'));
  assert.ok(formats.has('video'));
  assert.ok(formats.has('practice'));
});
t('M27 encodes external search query safely', () => {
  const original = context.window.BAAAssessment.getAcademicProfile;
  context.window.BAAAssessment.getAcademicProfile = () => ({ strengths: [], weaknesses: [
    { concept: 'fractions & ratios', subject: 'Math', status: 'learning', evidenceCount: 1 }
  ]});
  const r = mod.getRecommendations(8);
  assert.ok(r.recommendations.some(x => x.url.includes('%26')));
  context.window.BAAAssessment.getAcademicProfile = original;
});
t('M27 does not claim psychological learning styles', () => assert.ok(!source.includes('psychological learning style')));
console.log(`\nM27: ${n}/7 PASS`);
if (process.exitCode) process.exit(process.exitCode);
