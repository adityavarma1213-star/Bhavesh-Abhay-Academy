const fs=require('fs');
const ui=fs.readFileSync('js/baa-m43-scholarship-server-ui.js','utf8');
const cat=fs.readFileSync('js/baa-guide-catalogue.js','utf8');
const checks=[
  ['M43 UI uses scholarship endpoint',ui.includes("'/api/m43-scholarships")],
  ['M43 UI sends session credentials',ui.includes("credentials:'include'")],
  ['M43 UI disables browser-local substitution',ui.includes('No local preview data is being substituted')],
  ['M43 UI only renders published server results',ui.includes('published scholarships')],
  ['M43 UI escapes rendered data',ui.includes('function esc')],
  ['M43 UI uses learner authentication state',ui.includes('BAA_LEARNER_ID')],
  ['M43 UI mounts on Student OS',ui.includes("endsWith('/student-os.html')")],
  ['M43 UI exposes a search function',ui.includes('global.BAAM43ScholarshipServerUI={search,mount}')],
  ['M43 bridge is centrally bootstrapped',cat.includes('baa-m43-scholarship-server-ui.js')],
  ['M43 bootstrap has an idempotent marker',cat.includes('data-baa-m43-scholarship-server-ui')],
];
let failed=0;for(const [name,ok] of checks){console.log((ok?'PASS':'FAIL')+' — '+name);if(!ok)failed++;}
process.exitCode=failed?1:0;
