#!/usr/bin/env node
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const c={window:{localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{},key:()=>null,length:0}}};
vm.createContext(c);
vm.runInContext(fs.readFileSync('js/baa-mistakes.js','utf8'),c);
const api=c.window.BAAMistakes;
assert.ok(api);
assert.equal(api.classify({concept:'x'}).confidence,'low');
assert.equal(api.classify({concept:'x',reasonType:'concept_gap'}).confidence,'medium');
assert.equal(typeof api.load,'function');
const endpoint=fs.readFileSync('api/m52-mistakes.js','utf8');
assert(endpoint.includes('requireLearnerAccess'));
assert(endpoint.includes('commonMistakes'));
assert(endpoint.includes('reasonSummary'));
assert(endpoint.includes('learning_evidence'));
console.log('M52 PASS — classification, server ownership, common-mistake and reason-summary contracts');
