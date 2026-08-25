#!/usr/bin/env node
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const c={window:{BAAAssessment:{_load:()=>({learningMemory:{x:{concept:'algebra',subject:'math',topic:'linear',status:'mastered',evidenceCount:2,correctCount:2,lastUpdated:'2026-01-01'}},attempts:[],evidence:[1]},getStudentName:()=> 'Test'},fetch:async()=>({ok:true,json:async()=>({ok:true})})}};
vm.createContext(c);
vm.runInContext(fs.readFileSync('js/baa-learning-passport.js','utf8'),c);
const api=c.window.BAALearningPassport;
assert.equal(api.build().competencies.length,1);
assert.equal(api.build().status,'local_testing_record');
assert.equal(typeof api.load,'function');
assert.equal(JSON.parse(api.exportJson(api.build())).schemaVersion,1);
const endpoint=fs.readFileSync('api/m19-passport.js','utf8');
assert(endpoint.includes('requireLearnerAccess'));
assert(endpoint.includes('LEARNING_PASSPORT_VIEW'));
assert(endpoint.includes('learning_evidence'));
console.log('M19 PASS — local fallback, server evidence API contract, ownership guard');
