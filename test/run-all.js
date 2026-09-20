#!/usr/bin/env node
// test/run-all.js
//
// Root-cause fix for a gap found during forensic audit: package.json's
// "test" script was a hand-maintained chain of `node test/run-X.js &&
// node test/run-Y.js && ...` that only covered 12 of the 140 test files
// in this directory (all 15 of the M64–M78 India Board suites, among
// others, were never wired in). A hand-maintained list will drift again
// the next time a test file is added and this script is forgotten.
//
// This runner instead discovers every test file automatically:
//   - every test/*.js file (excluding this file itself)
//   - every test/<subdir>/run-tests.js file (e.g. test/g4g5g6/run-tests.js)
// and runs each as its own child process, so a crash in one file cannot
// prevent the rest from running and being reported.
//
// Exit code is 0 only if every discovered file exits 0.
import { readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const SELF = path.basename(fileURLToPath(import.meta.url));

function discover(dir) {
  const files = [];
  for (const entry of readdirSync(dir).sort()) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      const nested = path.join(full, 'run-tests.js');
      try { if (statSync(nested).isFile()) files.push(nested); } catch { /* no run-tests.js in this subdir */ }
    } else if (entry.endsWith('.js') && entry !== SELF) {
      files.push(full);
    }
  }
  return files;
}

const files = discover(TEST_DIR);
console.log(`Discovered ${files.length} test file(s) under test/.\n`);

let failed = 0;
const results = [];
for (const file of files) {
  const rel = path.relative(process.cwd(), file);
  const res = spawnSync(process.execPath, [file], { stdio: 'inherit' });
  const ok = res.status === 0;
  if (!ok) failed++;
  results.push({ rel, ok, status: res.status });
}

console.log('\n==================== TEST SUMMARY ====================');
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.rel}${r.ok ? '' : `  (exit ${r.status})`}`);
}
console.log(`\n${results.length - failed}/${results.length} test files passed.`);

if (failed > 0) {
  console.error(`\n${failed} test file(s) FAILED.`);
  process.exit(1);
}
console.log('\nALL TEST FILES PASSED.');
