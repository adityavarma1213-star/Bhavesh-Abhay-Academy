#!/usr/bin/env node
const fs=require('fs');
const api=fs.readFileSync('api/m31-language-preference.js','utf8');
const bridge=fs.readFileSync('js/baa-m31-language-server-sync.js','utf8');
const migration=fs.readFileSync('db/migrations/032_m31_language_preferences.sql','utf8');
const guide=fs.readFileSync('js/baa-guide-catalogue.js','utf8');
const checks=[
  ['API authenticates',api.includes('requireAuth(req)')],
  ['API verifies learner access',api.includes('requireLearnerAccess(session, learnerId)')],
  ['API validates bounded language catalogue',api.includes("new Set(['en','hi','mr','gu','bn','ta','te','kn'])")],
  ['API uses no-store',api.includes("private, no-store, max-age=0")],
  ['API persists with PostgreSQL',api.includes('learner_language_preferences') && api.includes('ON CONFLICT(learner_id)')],
  ['Migration owns preference by learner',migration.includes('learner_id TEXT PRIMARY KEY REFERENCES users(id)')],
  ['Bridge uses authenticated transport',bridge.includes("credentials:'include'")],
  ['Bridge uses fresh transport',bridge.includes("cache:'no-store'")],
  ['Bridge syncs existing language control',bridge.includes('global.saveResponseLanguage')],
  ['Shared bootstrap loads M31 bridge',guide.includes("baa-m31-language-server-sync.js")]
];
let failed=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed++;}
if(failed) process.exit(1);
console.log(`M31 server-language contract: ${checks.length}/${checks.length} PASS`);
