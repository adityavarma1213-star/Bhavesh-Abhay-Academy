const fs=require('fs');
const api=fs.readFileSync('api/m27-learning-resources.js','utf8');
const bridge=fs.readFileSync('js/baa-m27-learning-resources-server.js','utf8');
const checks=[
 ['auth',api.includes('requireAuth(req)')],
 ['ownership',api.includes('requireLearnerAccess(session,learnerId)')],
 ['server evidence',api.includes('FROM learning_evidence')],
 ['bounded concepts',api.includes('LIMIT 100')],
 ['safe query encoding',api.includes('encodeURIComponent')],
 ['known formats only',api.includes("new Set(['visual','video','interactive','practice'])")],
 ['honest external boundary',api.includes('not BAA-validated resources')],
 ['credentialed client',bridge.includes("credentials:'include'")],
 ['authenticated endpoint',bridge.includes('/api/m27-learning-resources?')],
 ['bounded client result',bridge.includes('slice(0,Math.max(1,Math.min(20')]
];
let failed=0; for(const [name,ok] of checks){if(!ok){console.error('FAIL',name);failed++;}else console.log('PASS',name);}
console.log(`M27 server contract: ${checks.length-failed}/${checks.length}`);
process.exitCode=failed?1:0;
