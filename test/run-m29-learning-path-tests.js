#!/usr/bin/env node
const fs=require('fs');const assert=require('assert');
const api=fs.readFileSync('api/m29-learning-paths.js','utf8');
const bridge=fs.readFileSync('js/baa-m29-learning-paths-server.js','utf8');
const ui=fs.readFileSync('js/baa-m29-learning-paths-ui.js','utf8');
const catalogue=fs.readFileSync('js/baa-guide-catalogue.js','utf8');
const checks=[
 ['API requires auth',/requireAuth/.test(api)],
 ['API enforces learner ownership',/requireLearnerAccess/.test(api)],
 ['API reads learning evidence',/learning_evidence/.test(api)],
 ['API preserves evidence priority',/evidence_priority_queue/.test(api)],
 ['API avoids prerequisite claim',/prerequisiteClaim:null/.test(api)],
 ['API limits path size',/clamp\(Number\(req\.query\?\.limit\)/.test(api)],
 ['client bridge uses credentials',/credentials:\s*['"]include['"]/.test(bridge)],
 ['client bridge exports BAAM29Server',/global\.BAAM29Server\s*=/.test(bridge)],
 ['UI renders current node',/CURRENT NODE/.test(ui)],
 ['shared bootstrap loads M29 bridges',/baa-m29-learning-paths-server\.js/.test(catalogue)&&/baa-m29-learning-paths-ui\.js/.test(catalogue)]
];
let passed=0;for(const [name,ok] of checks){assert.ok(ok,name);passed++;console.log('PASS',name)}console.log(`M29 contract: ${passed}/${checks.length}`);
