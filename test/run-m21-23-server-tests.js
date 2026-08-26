/* Structural contract checks for the M21–M23 server evidence boundary. */
const fs=require('fs');
const api=fs.readFileSync('api/m21-23-evidence.js','utf8');
const bridge=fs.readFileSync('js/baa-m21-23-server.js','utf8');
const catalogue=fs.readFileSync('js/baa-guide-catalogue.js','utf8');
const checks=[
  ['server auth',api.includes('requireAuth')],
  ['learner ownership',api.includes('requireLearnerAccess')],
  ['authoritative learning evidence',api.includes('FROM learning_evidence')],
  ['weakness aggregation',api.includes('weaknesses')&&api.includes("accuracy < 0.6")],
  ['strength aggregation',api.includes('strengths')&&api.includes("accuracy >= 0.8")],
  ['practice prioritization',api.includes('prioritizedConcepts')],
  ['insufficient evidence guard',api.includes('insufficientEvidence')],
  ['authenticated client request',bridge.includes("credentials:'include'")],
  ['server-backed practice render',bridge.includes('practiceFromServer')],
  ['server-backed weakness render',bridge.includes('data.weaknesses')],
  ['server-backed strength render',bridge.includes('data.strengths')],
  ['shared bootstrap wiring',catalogue.includes("js/baa-m21-23-server.js")]
];
let failed=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed++;}
process.exitCode=failed?1:0;
