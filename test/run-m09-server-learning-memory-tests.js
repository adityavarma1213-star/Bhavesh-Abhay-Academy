import fs from 'node:fs';

const api = fs.readFileSync(new URL('../api/m09-learning-memory.js', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../js/baa-m09-learning-memory-server-ui.js', import.meta.url), 'utf8');
const catalogue = fs.readFileSync(new URL('../js/baa-guide-catalogue.js', import.meta.url), 'utf8');

const checks = [
  ['M09 API requires authenticated session', /requireAuth\(req\)/.test(api)],
  ['M09 API enforces learner ownership', /requireLearnerAccess\(session,learnerId\)/.test(api)],
  ['M09 API reads persisted learning evidence', /FROM learning_evidence/.test(api)],
  ['M09 API groups evidence by concept', /grouped = new Map/.test(api)],
  ['M09 API uses minimum-evidence gate', /rows\.length < 3/.test(api)],
  ['M09 API returns explicit limitations', /limitations: \[/.test(api)],
  ['M09 client sends authenticated credentials', /credentials: 'include'/.test(ui)],
  ['M09 client calls server endpoint', /\/api\/m09-learning-memory/.test(ui)],
  ['M09 client avoids local-data substitution', /No browser-local profile is substituted/.test(ui)],
  ['M09 bootstrap loads server UI', /baa-m09-learning-memory-server-ui\.js/.test(catalogue)],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
if (failed.length) process.exit(1);
console.log(`M09 server learning-memory contract: ${checks.length}/${checks.length} checks passed`);
