/* M12 server Guardian UI contract checks. */
const fs = require('fs');
const ui = fs.readFileSync('js/baa-m12-guardian-server-ui.js','utf8');
const api = fs.readFileSync('api/m12-guardian.js','utf8');
const catalogue = fs.readFileSync('js/baa-guide-catalogue.js','utf8');
const checks = [
  ['UI exists', ui.includes('BAAM12GuardianServerUI')],
  ['Student OS scoped', ui.includes("/student-os\\.html$/i")],
  ['authenticated learner id', ui.includes('BAA_LEARNER_ID')],
  ['credentialed server request', ui.includes("credentials:'include'")],
  ['server endpoint', ui.includes('/api/m12-guardian')],
  ['server failure avoids local truth', ui.includes('No local browser state is being presented as server evidence')],
  ['academic-only limitation rendered', ui.includes('not a diagnosis')],
  ['API requires auth', api.includes('requireAuth(req)')],
  ['API enforces learner access', api.includes('requireLearnerAccess(session, learnerId)')],
  ['API reads learning memory', api.includes('FROM learning_memory')],
  ['API reads assessment attempts', api.includes('FROM assessment_attempts')],
  ['API states academic-only scope', api.includes("scope: 'academic_support_only'")],
  ['shared bootstrap loads UI', catalogue.includes("baa-m12-guardian-server-ui.js")],
];
let failures = 0;
for (const [name, ok] of checks) {
  if (ok) console.log(`PASS ${name}`); else { console.error(`FAIL ${name}`); failures += 1; }
}
console.log(`M12 server UI contract: ${checks.length - failures}/${checks.length}`);
process.exitCode = failures ? 1 : 0;
