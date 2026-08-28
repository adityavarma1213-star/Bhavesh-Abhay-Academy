#!/usr/bin/env node
import fs from 'node:fs';
const client=fs.readFileSync(new URL('../js/baa-career-prep.js',import.meta.url),'utf8');
const server=fs.readFileSync(new URL('../api/m44-career-prep.js',import.meta.url),'utf8');
const checks=[
 ['client sends session credentials',/credentials:'include'/.test(client)],
 ['client forces fresh responses',/cache:'no-store'/.test(client)],
 ['client requests JSON',/Accept:'application\/json'/.test(client)],
 ['client keeps POST JSON content type',/Content-Type:'application\/json'/.test(client)],
 ['server uses authenticated session',/requireAuth\(req\)/.test(server)],
 ['server enforces learner access',/requireLearnerAccess\(session,learnerId\)/.test(server)],
 ['server persists profile',/career_prep_profiles/.test(server)],
];
let failed=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed++;}
console.log(`M44 fresh transport contract: ${checks.length-failed}/${checks.length}`);process.exitCode=failed?1:0;
