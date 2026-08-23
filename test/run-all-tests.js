#!/usr/bin/env node
'use strict';

/* Honest repository-wide test gate.
 * Runs every executable test/run*.js file except this runner itself.
 * A test process is successful only when every discovered test exits 0.
 * This intentionally does not claim browser/live-deployment coverage.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const dir = __dirname;
const files = fs.readdirSync(dir)
  .filter(name => /^run-.*\.js$/.test(name) && name !== 'run-all-tests.js')
  .sort();

if (!files.length) {
  console.error('No repository test runners discovered.');
  process.exit(1);
}

let failed = 0;
for (const file of files) {
  console.log(`\n=== TEST ${file} ===`);
  const result = spawnSync(process.execPath, [path.join(dir, file)], {
    cwd: path.resolve(dir, '..'),
    stdio: 'inherit',
    env: process.env
  });
  if (result.error || result.status !== 0) {
    failed++;
    console.error(`FAILED: ${file}`);
  }
}

console.log(`\nRepository test gate: ${files.length - failed}/${files.length} test runners passed.`);
process.exit(failed === 0 ? 0 : 1);
