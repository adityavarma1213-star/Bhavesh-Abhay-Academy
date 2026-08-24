#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const testDir = path.join(root, 'test');
const matrixPath = path.join(root, 'MODULE-62-COMPLETION-MATRIX.json');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const runners = fs.existsSync(testDir)
  ? fs.readdirSync(testDir).filter(name => /^run-.*\.js$/.test(name) && name !== 'run-all-tests.js').sort()
  : [];

const matrix = fs.existsSync(matrixPath) ? readJson(matrixPath) : null;
const modules = Array.isArray(matrix) ? matrix : (matrix?.modules || []);
const claimedCompletion = matrix?.completion ?? null;

const lines = [];
lines.push('# BAA GENERATED COMPLETION EVIDENCE');
lines.push('');
lines.push(`Generated at: ${new Date().toISOString()}`);
lines.push('');
lines.push('## Test discovery');
lines.push(`- Executable test runners discovered: **${runners.length}**`);
for (const runner of runners) lines.push(`- ${runner}`);
lines.push('');
lines.push('## Module matrix');
lines.push(`- Matrix records discovered: **${modules.length}**`);
lines.push(`- Matrix-declared completion: **${claimedCompletion ?? 'not declared'}**`);
if (claimedCompletion === '100%' || claimedCompletion === '100') {
  lines.push('- ⚠️ **100% is a claim in the matrix, not proof of production/statutory completion.**');
  lines.push('- Production database, deployed-browser, external-provider, and legal gates must be evidenced separately.');
}
lines.push('');
lines.push('## Integrity rules');
lines.push('- This report is generated from repository files; it does not infer legal compliance.');
lines.push('- Test discovery count is not the same as test pass count. Run `npm test` to establish execution results.');
lines.push('- A module status document is evidence of a claim, not independent proof of runtime behavior.');
lines.push('- Production/statutory completion requires the applicable runtime, database, deployment, security, and legal gates to pass.');

const out = path.join(root, 'GENERATED-COMPLETION-EVIDENCE.md');
fs.writeFileSync(out, lines.join('\n') + '\n');
console.log(`Wrote ${path.relative(root, out)}`);
console.log(`Discovered ${runners.length} executable test runners.`);
console.log(`Matrix records: ${modules.length}; declared completion: ${claimedCompletion ?? 'none'}`);
