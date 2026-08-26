/* M11 server recommendation UI contract checks. */
const fs = require('fs');
const ui = fs.readFileSync('js/baa-m11-planner-server-ui.js','utf8');
const bridge = fs.readFileSync('js/baa-planner-server-recommendations.js','utf8');
const catalogue = fs.readFileSync('js/baa-guide-catalogue.js','utf8');
const api = fs.readFileSync('api/m11-planner-recommendations.js','utf8');
const checks = [
  ['UI exists', ui.includes('BAAM11PlannerServerUI')],
  ['Student OS scoped', ui.includes("/student-os\\.html$/i")],
  ['authenticated learner id', ui.includes('BAA_LEARNER_ID')],
  ['server bridge called', ui.includes('BAAPlannerServerRecommendations.load')],
  ['server failure is explicit', ui.includes('No local evidence is being presented as server data')],
  ['recommendations rendered', ui.includes('payload.recommendations')],
  ['evidence count rendered', ui.includes('evidenceCount')],
  ['server bridge uses credentials', bridge.includes("credentials: 'include'")],
  ['API requires auth', api.includes('requireAuth(req)')],
  ['API enforces learner access', api.includes('requireLearnerAccess(session, learnerId)')],
  ['API reads learning evidence', api.includes('FROM learning_evidence')],
  ['shared bootstrap loads bridge', catalogue.includes("baa-planner-server-recommendations.js")],
  ['shared bootstrap loads UI', catalogue.includes("baa-m11-planner-server-ui.js")],
];
let failures = 0;
for (const [name, ok] of checks) {
  if (ok) console.log(`PASS ${name}`); else { console.error(`FAIL ${name}`); failures += 1; }
}
console.log(`M11 server UI contract: ${checks.length - failures}/${checks.length}`);
process.exitCode = failures ? 1 : 0;
