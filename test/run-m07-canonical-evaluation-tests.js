#!/usr/bin/env node
import fs from 'node:fs';
import process from 'node:process';

const source = fs.readFileSync(new URL('../api/evaluate.js', import.meta.url), 'utf8');

const checks = [
  ['evaluation imports database access', /import\s+\{\s*sql\s*\}\s+from\s+['"]\.\/\_lib\/db\.js['"]/],
  ['evaluation requires authenticated session', /requireAuth\(req\)/],
  ['evaluation requires attempt id', /attemptId and questionId are required/],
  ['evaluation loads recorded assessment attempt', /FROM assessment_attempts aa/],
  ['evaluation joins canonical assessment questions', /JOIN assessment_questions aq/],
  ['evaluation joins canonical question bank', /JOIN questions q/],
  ['evaluation binds attempt to authenticated learner', /l\.user_id\s*=\s*\$\{session\.user_id\}/],
  ['evaluation rejects unowned or unrecorded questions', /not owned by the authenticated learner or is not part of the recorded attempt/],
  ['evaluation uses canonical question text', /text:\s*canonicalQuestion\.text/],
  ['evaluation uses canonical marks', /marks:\s*Number\(canonicalQuestion\.marks\)/],
  ['evaluation uses canonical model answer', /modelAnswer:\s*canonicalQuestion\.model_answer/],
  ['evaluation does not pass client question into the Gemini prompt after validation', /const \{ studentAnswer \} = validated;/],
  ['evaluation responses are private and uncached', /Cache-Control['"]:\s*['"]private, no-store, max-age=0/],
];

let failed = 0;
for (const [name, pattern] of checks) {
  const ok = pattern.test(source);
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}`);
  if (!ok) failed += 1;
}

console.log(`M07 canonical evaluation contract: ${checks.length - failed}/${checks.length} checks passed.`);
if (failed) process.exit(1);
