const fs=require('fs');
const pedagogy=fs.readFileSync('api/m51-pedagogy.js','utf8');
const client=fs.readFileSync('js/baa-pedagogy.js','utf8');
const ui=fs.readFileSync('js/baa-m51-pedagogy-server-ui.js','utf8');
const bootstrap=fs.readFileSync('js/baa-guide-catalogue.js','utf8');
const checks=[
 ['M51 API requires authenticated session',/requireAuth\(req\)/.test(pedagogy)],
 ['M51 API enforces learner ownership',/requireLearnerAccess\(session,learnerId\)/.test(pedagogy)],
 ['M51 API reads persisted learning evidence',/FROM learning_evidence/.test(pedagogy)],
 ['M51 API returns evidence-derived concepts',/const concepts=Object\.values\(grouped\)/.test(pedagogy)],
 ['M51 client sends authenticated credentials',/credentials:'include'/.test(client)],
 ['M51 client requests JSON',/Accept:'application\/json'/.test(client)],
 ['M51 UI does not substitute local data',/No local data was substituted/.test(ui)],
 ['M51 UI renders server evidence',/Server evidence/.test(ui)&&/item\.accuracy/.test(ui)],
 ['M51 UI mounts on Teacher OS',/teacher-os\.html/.test(ui)],
 ['M51 UI is loaded by shared bootstrap',/baa-m51-pedagogy-server-ui\.js/.test(bootstrap)]
];
let failed=0;for(const [name,ok] of checks){if(!ok){console.error('FAIL',name);failed++;}else console.log('PASS',name);}console.log(`${checks.length-failed}/${checks.length} M51 server/UI checks passed`);process.exitCode=failed?1:0;
