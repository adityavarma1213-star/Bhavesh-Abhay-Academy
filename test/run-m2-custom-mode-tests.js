// BAA OS — Module 2 Custom Mode focused tests.
// Exercises valid input, invalid input, persistence, reordering and completion.

const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const source = fs.readFileSync(require('path').join(__dirname, '..', 'js', 'baa-custom-mode.js'), 'utf8');
const store = new Map();
const localStorage = {
  getItem: (key) => store.has(key) ? store.get(key) : null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};
const context = { window: { localStorage }, localStorage, console };
vm.createContext(context);
vm.runInContext(source, context, { filename: 'baa-custom-mode.js' });
const M = context.window.BAACustomMode;

function test(name, fn) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (err) { console.error(`FAIL ${name}`); throw err; }
}

test('valid step is accepted', () => {
  const result = M.validateStep({ title: 'Revise fractions', minutes: 20, type: 'review' });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.value.title, 'Revise fractions');
});

test('invalid minutes are rejected', () => {
  assert.strictEqual(M.validateStep({ title: 'Too short', minutes: 2, type: 'learn' }).ok, false);
  assert.strictEqual(M.validateStep({ title: 'Too long', minutes: 181, type: 'learn' }).ok, false);
});

test('invalid type is rejected', () => {
  assert.strictEqual(M.validateStep({ title: 'Bad type', minutes: 10, type: 'magic' }).ok, false);
});

test('student path persists with schema and mode', () => {
  const result = M.addStep('Learn algebra', 25, 'learn');
  assert.strictEqual(result.ok, true);
  const path = M.getPath();
  assert.strictEqual(path.schemaVersion, 1);
  assert.strictEqual(path.mode, 'custom');
  assert.strictEqual(path.steps.length, 1);
});

test('second step can be added and reordered', () => {
  assert.strictEqual(M.addStep('Practice algebra', 15, 'practice').ok, true);
  let path = M.getPath();
  const second = path.steps[1];
  assert.strictEqual(M.moveStep(second.id, 'up').ok, true);
  path = M.getPath();
  assert.strictEqual(path.steps[0].title, 'Practice algebra');
});

test('completion toggles without changing task identity', () => {
  const path = M.getPath();
  const id = path.steps[0].id;
  assert.strictEqual(M.toggleStep(id).ok, true);
  const after = M.getPath();
  assert.strictEqual(after.steps[0].id, id);
  assert.strictEqual(after.steps[0].completed, true);
});

test('removal removes only the selected step', () => {
  const path = M.getPath();
  const id = path.steps[0].id;
  assert.strictEqual(M.removeStep(id).ok, true);
  const after = M.getPath();
  assert.strictEqual(after.steps.some((step) => step.id === id), false);
  assert.strictEqual(after.steps.length, 1);
});


test('corrupted earlier step does not steal later step metadata', () => {
  const corrupted = {
    schemaVersion: 1,
    mode: 'custom',
    steps: [
      { id: 'bad-id', title: '', minutes: 20, type: 'learn', completed: true },
      { id: 'good-id', title: 'Valid later step', minutes: 30, type: 'practice', completed: false },
    ],
  };
  const normalized = M.normalizePath(corrupted);
  assert.strictEqual(normalized.steps.length, 1);
  assert.strictEqual(normalized.steps[0].id, 'good-id');
  assert.strictEqual(normalized.steps[0].title, 'Valid later step');
  assert.strictEqual(normalized.steps[0].completed, false);
});

test('clear returns an empty custom path', () => {
  assert.strictEqual(M.clearPath().ok, true);
  const path = M.getPath();
  assert.strictEqual(path.steps.length, 0);
});

console.log('M2 Custom Mode tests: 9/9 PASS');
