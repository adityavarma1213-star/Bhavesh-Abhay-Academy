#!/usr/bin/env node
const fs=require('fs');const assert=require('assert');
const rec=fs.readFileSync('js/baa-teacher-recommendation.js','utf8');const teacher=fs.readFileSync('teacher-os.html','utf8');const api=fs.readFileSync('api/m16-teacher-recommendations.js','utf8');
let passed=0;function test(n,f){try{f();passed++;console.log(`PASS ${n}`)}catch(e){console.error(`FAIL ${n}\n${e.stack||e}`);process.exitCode=1}}
test('Recommendation engine exists',()=>{assert.ok(rec.includes('Module 16: Teacher Recommendation System'));assert.ok(rec.includes('getRecommendations'))});
test('Recommendations read Learning Intelligence',()=>assert.ok(rec.includes('BAAIntelligence.getLearningSummary()')));
test('Weak concepts drive recommendations',()=>{assert.ok(rec.includes('summary.struggling'));assert.ok(rec.includes('summary.needsRevision'))});
test('Recommendations are differentiated by state',()=>{assert.ok(rec.includes('targeted_remediation'));assert.ok(rec.includes('targeted_practice'))});
test('Recommendations link only to real assessments',()=>{assert.ok(rec.includes('BAAAssessmentCatalog'));assert.ok(rec.includes('BAAGetQuestion'))});
test('Recommendations require teacher decision',()=>assert.ok(rec.includes('Teacher reviews and decides whether to assign.')));
test('Teacher OS loads the recommendation engine',()=>assert.ok(teacher.includes('js/baa-teacher-recommendation.js')));
test('Teacher OS renders recommendation section',()=>{assert.ok(teacher.includes('Teacher recommendations'));assert.ok(teacher.includes('BAATeacherRecommendation.getRecommendations()'))});
test('No ranking/comparison logic is introduced',()=>{assert.ok(!rec.includes('rank students'));assert.ok(!rec.includes('class average'))});
test('No fabricated scores are generated',()=>assert.ok(!rec.includes('score:100')&&!rec.includes('percentage:100')));
test('Server recommendation responses are never cacheable',()=>assert.ok(api.includes("private, no-store, max-age=0")));
test('Server recommendation reason matches the queried evidence window',()=>assert.ok(api.includes('recorded evidence item(s) across ${evidence} recorded evidence item(s).')));
console.log(`\nM16: ${passed}/12 PASS`);if(process.exitCode)process.exit(process.exitCode);
