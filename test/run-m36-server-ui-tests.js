/* M36 server-backed Insights UI contract checks. */
const fs=require('fs');
const ui=fs.readFileSync('js/baa-m36-insights-server-ui.js','utf8');
const api=fs.readFileSync('api/m36-insights.js','utf8');
const moduleSource=fs.readFileSync('js/baa-insights.js','utf8');
const catalogue=fs.readFileSync('js/baa-guide-catalogue.js','utf8');
const checks=[
 ['UI exists',ui.includes('BAAM36InsightsServerUI')],
 ['Student OS scoped',ui.includes("/student-os\\.html$/i")],
 ['learner id',ui.includes('BAA_LEARNER_ID')],
 ['server load',ui.includes('BAAInsights.load')],
 ['server failure avoids preview',ui.includes('No local preview is being presented as server data')],
 ['metrics rendered',ui.includes('completedAssessments')&&ui.includes('accuracyPercent')],
 ['API requires auth',api.includes('requireAuth(req)')],
 ['API learner access',api.includes('requireLearnerAccess(session,learnerId)')],
 ['API evidence',api.includes('FROM learning_evidence')],
 ['API audit',api.includes('INSIGHTS_VIEW')],
 ['module exposes load',moduleSource.includes('global.BAAInsights={build,load}')],
 ['bootstrap loads UI',catalogue.includes('baa-m36-insights-server-ui.js')],
];
let failures=0;for(const [name,ok] of checks){if(ok)console.log('PASS '+name);else{console.error('FAIL '+name);failures++;}}console.log(`M36 server UI contract: ${checks.length-failures}/${checks.length}`);process.exitCode=failures?1:0;
