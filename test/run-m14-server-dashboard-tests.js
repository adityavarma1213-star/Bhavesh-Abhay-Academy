import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../js/baa-server-learner-view.js', import.meta.url), 'utf8');

assert.match(source, /parent-os\.html/);
assert.match(source, /credentials:'include'/);
assert.match(source, /api\/v1\/my-learners/);
assert.match(source, /api\/v1\/learner-overview/);
assert.match(source, /legacy\.style\.display='none'/);
assert.match(source, /autoMountPrivateParentView/);
assert.match(source, /No learner is connected to this account yet/);
assert.match(source, /does not silently present browser-local data/);

console.log('M14 server-backed parent dashboard contract: 8/8 checks passed');
