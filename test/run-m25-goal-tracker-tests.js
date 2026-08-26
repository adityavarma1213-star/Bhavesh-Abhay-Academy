/* M25 contract checks: source-level verification for server-backed goal progress. */
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const api=fs.readFileSync(path.join(root,'api/m25-goal-tracker.js'),'utf8');
const client=fs.readFileSync(path.join(root,'js/baa-goals.js'),'utf8');
const checks=[
 ['API authenticates requests',/requireAuth\(req\)/.test(api)],
 ['API enforces learner ownership',/requireLearnerAccess\(session, learnerId\)/.test(api)],
 ['API reads planner goals',/FROM planner_goals/.test(api)],
 ['API reads learning evidence',/FROM learning_evidence/.test(api)],
 ['API derives evidence-linked accuracy',/accuracy/.test(api)&&/evidenceCount/.test(api)],
 ['API exposes explicit no-evidence state',/no_evidence/.test(api)],
 ['API returns matched concepts',/matchedConcepts/.test(api)],
 ['API avoids outcome prediction claims',/does not claim to predict outcomes/.test(api)],
 ['Client calls authenticated M25 endpoint',/api\/m25-goal-tracker/.test(client)&&/credentials:'include'/.test(client)],
 ['Client exposes server goal snapshot',/getServerGoals/.test(client)],
 ['Client auto-loads server progress',/DOMContentLoaded/.test(client)&&/autoLoad/.test(client)],
 ['Client renders a Student OS goal panel',/baa-m25-goal-panel/.test(client)&&/renderServerGoals/.test(client)],
 ['Client emits server update event',/baa:goals-server-updated/.test(client)],
];
let passed=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(ok)passed++;}
console.log(`M25 contract checks: ${passed}/${checks.length}`);
if(passed!==checks.length)process.exit(1);
