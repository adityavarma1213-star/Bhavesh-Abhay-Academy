#!/usr/bin/env node
/** M06 — fresh authenticated assessment snapshot contract. */
const fs=require('fs');
const assert=require('assert');
const bridge=fs.readFileSync('js/baa-m06-assessment-fresh-sync.js','utf8');
const catalogue=fs.readFileSync('js/baa-guide-catalogue.js','utf8');
const engine=fs.readFileSync('js/baa-assessment.js','utf8');
let passed=0;
function test(name,fn){try{fn();passed++;console.log(`PASS ${name}`)}catch(e){console.error(`FAIL ${name}\n${e.stack||e}`);process.exitCode=1}}
test('Bridge targets authenticated assessment snapshots',()=>{assert.ok(bridge.includes("/api/v1/assessment"));assert.ok(bridge.includes("url.searchParams.has('learnerId')"));});
test('Bridge only hardens GET snapshots',()=>{assert.ok(bridge.includes("method === 'GET'"));});
test('Bridge sends the authenticated session',()=>{assert.ok(bridge.includes("options.credentials = options.credentials || 'include'"));});
test('Bridge forbids cached learner snapshots',()=>{assert.ok(bridge.includes("options.cache = 'no-store'"));});
test('Bridge requests JSON',()=>{assert.ok(bridge.includes("headers.set('Accept', 'application/json')"));});
test('Bridge leaves unrelated requests untouched',()=>{assert.ok(bridge.includes('return originalFetch(input, init)'));});
test('Bridge is idempotent',()=>{assert.ok(bridge.includes('__BAA_M06_FRESH_SYNC__'));});
test('Bridge exposes an explicit integration contract',()=>{assert.ok(bridge.includes('BAAM06FreshSync'));});
test('Shared bootstrap loads the M06 bridge',()=>{assert.ok(catalogue.includes('baa-m06-assessment-fresh-sync.js'));});
test('Assessment engine retains server hydration path',()=>{assert.ok(engine.includes('hydrateFromServer'));assert.ok(engine.includes('/api/v1/assessment?learnerId='));});
console.log(`\nM06 fresh-sync: ${passed}/10 PASS`);
if(process.exitCode)process.exit(process.exitCode);
