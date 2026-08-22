const fs=require('fs');
const assert=require('assert');
const map=fs.readFileSync('feature-map.html','utf8');
const audit=fs.readFileSync('BLUEPRINT-ROADMAP-DEEP-AUDIT-2026-08-22.md','utf8');

const moduleMatches=[...map.matchAll(/\[(\d+),'([^']+)'/g)].map(m=>Number(m[1]));
assert.strictEqual(moduleMatches.length,62,'Feature Explorer must contain exactly 62 M62 modules');
assert.deepStrictEqual(moduleMatches,[...Array(62)].map((_,i)=>i+1),'Feature Explorer module numbering must be contiguous M1-M62');
for(let i=1;i<=62;i++) assert(audit.includes(`| ${i} | `),`Deep audit must contain module ${i}`);
assert(audit.includes('deployed-browser acceptance'),'Audit must retain the strict deployed-browser acceptance gate');
assert(audit.includes('External dependency rule'),'Audit must retain the external dependency rule');
console.log('BLUEPRINT AUDIT COVERAGE TEST PASSED — M1-M62');
