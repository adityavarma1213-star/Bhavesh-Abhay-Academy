// M52 server-backed UI contract checks.
import fs from 'node:fs';
const ui=fs.readFileSync(new URL('../js/baa-m52-mistake-server-ui.js',import.meta.url),'utf8');
const catalogue=fs.readFileSync(new URL('../js/baa-guide-catalogue.js',import.meta.url),'utf8');
const api=fs.readFileSync(new URL('../api/m52-mistakes.js',import.meta.url),'utf8');
const checks=[
  ['M52 UI bridge exists',ui.includes('BAAM52MistakeServerUI'),'server-backed UI module is present'],
  ['Authenticated request',ui.includes("credentials:'include'"),'browser sends session credentials'],
  ['M52 endpoint wired',ui.includes('/api/m52-mistakes'),'UI consumes the real M52 API'],
  ['Learner scoping',ui.includes('BAA_LEARNER_ID')&&ui.includes('learnerId'),'request is learner-scoped'],
  ['Common mistakes rendered',ui.includes('commonMistakes'),'server common-mistake rollup reaches the UI'],
  ['Grouped mistakes rendered',ui.includes('payload.groups'),'server archetype groups reach the UI'],
  ['No local substitute on failure',ui.includes('No local substitute is shown'),'server failure is not disguised as local production data'],
  ['No diagnosis claim',ui.includes('does not diagnose psychological causes'),'M52 safety boundary is visible'],
  ['API enforces ownership',api.includes('requireLearnerAccess(session, learnerId)'),'server authorization remains authoritative'],
  ['Shared bootstrap wiring',catalogue.includes('js/baa-m52-mistake-server-ui.js'),'Student OS receives M52 through centralized wiring'],
];
let failed=0;for(const [name,ok,why] of checks){console.log(`${ok?'PASS':'FAIL'} — ${name} — ${why}`);if(!ok)failed++;}
console.log(`M52 server UI contract: ${checks.length-failed}/${checks.length}`);if(failed)process.exit(1);
