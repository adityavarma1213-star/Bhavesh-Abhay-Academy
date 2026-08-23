#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'student-os.html'), 'utf8');

assert.equal(
  (html.match(/id=["']baa-teacher-portal-entry["']/g) || []).length,
  1,
  'Student OS must contain exactly one static Teacher Portal entry'
);
assert.match(html, /aria-label=["']Teacher and Academic Management["']/);
assert.match(html, /href=["']account\.html\?role=teacher["']/);
assert.match(html, /Open Teacher Portal/);
assert.match(html, /position:\s*fixed/);
assert.match(html, /z-index:\s*99999/);

console.log('Teacher Portal static discoverability gate: PASS');
