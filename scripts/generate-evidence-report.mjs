#!/usr/bin/env node
/**
 * BAA evidence snapshot generator.
 *
 * Generates repository-derived module evidence instead of relying on manually
 * typed claims. It intentionally reports "verification pending" where live
 * database/browser evidence is not available to this script.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const testDir = path.join(root, 'test');
const sectionFiles = fs.existsSync(root)
  ? fs.readdirSync(root).filter((name) => /^SECTION-M\d+-STATUS\.md$/i.test(name)).sort()
  : [];
const runners = fs.existsSync(testDir)
  ? fs.readdirSync(testDir).filter((name) => /^run-.*\.js$/i.test(name) && name !== 'run-all-tests.js').sort()
  : [];

function git(args) {
  try { return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim(); }
  catch { return 'unavailable'; }
}

const commit = git(['rev-parse', 'HEAD']);
const branch = git(['branch', '--show-current']);
const generatedAt = new Date().toISOString();

const modules = sectionFiles.map((file) => {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  const match = file.match(/SECTION-M(\d+)-STATUS/i);
  const module = `M${match?.[1] ?? '??'}`;
  const lower = text.toLowerCase();
  const pending = /production verification|server dependency|remains pending|requires.*verification|not.*claim/.test(lower);
  const hasTest = /test\//i.test(text);
  return {
    module,
    file,
    status: pending ? 'IMPLEMENTED_OR_PARTIAL; PRODUCTION_VERIFICATION_PENDING' : (hasTest ? 'IMPLEMENTED_WITH_TEST_EVIDENCE' : 'STATUS_REQUIRES_REVIEW'),
    has_test_reference: hasTest,
  };
});

const report = {
  generated_at: generatedAt,
  git_commit: commit,
  git_branch: branch,
  test_runner_count: runners.length,
  test_runners: runners,
  module_status_files: modules.length,
  modules,
  verification_boundary: 'This snapshot is repository-derived. It does not claim live PostgreSQL, deployed-browser, provider, backup-retention, or legal certification unless those are independently supplied as evidence.'
};

const outDir = path.join(root, 'evidence');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, 'latest-evidence.json');
fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
console.log(`Generated ${out}`);
console.log(`Commit: ${commit}`);
console.log(`Test runners discovered: ${runners.length}`);
console.log(`Module status files discovered: ${modules.length}`);
