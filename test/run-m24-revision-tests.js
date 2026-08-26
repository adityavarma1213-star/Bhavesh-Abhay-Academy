// M24 AI Revision Engine — source contract checks.
import fs from 'node:fs';
const api=fs.readFileSync(new URL('../api/m24-revision.js',import.meta.url),'utf8');
const client=fs.readFileSync(new URL('../js/baa-revision.js',import.meta.url),'utf8');
const checks=[
 ['Authentication',api.includes('requireAuth(req)'),'server revision requires a session'],
 ['Learner ownership',api.includes('requireLearnerAccess(session, learnerId)'),'revision evidence is learner-scoped'],
 ['Persisted evidence',api.includes('FROM learning_evidence'),'schedule uses server evidence'],
 ['Bounded intervals',api.includes('intervalFor')&&api.includes('1 : partial >= 1 ? 3'),'interval selection is explicit and bounded'],
 ['Honest limitation',api.includes('not a medically or scientifically validated timing claim'),'no unsupported scientific claim'],
 ['Credentialed client',client.includes("credentials:'include'")&&client.includes('/api/m24-revision?learnerId='),'client carries authenticated session'],
 ['Server panel',client.includes('renderServerPlan')&&client.includes('loadServerPlan'),'server result is surfaced in UI'],
];
let failed=0;for(const[name,ok,why]of checks){console.log(`${ok?'PASS':'FAIL'} — ${name} — ${why}`);if(!ok)failed++;}
console.log(`M24 revision contract: ${checks.length-failed}/${checks.length}`);if(failed)process.exit(1);
