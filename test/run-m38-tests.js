#!/usr/bin/env node
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const c={window:{localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{},key:()=>null,length:0}}};
vm.createContext(c);
vm.runInContext(fs.readFileSync('js/baa-explainability.js','utf8'),c);
const api=c.window.BAAExplainability;
assert.ok(api);
assert.ok(api.explain({evidenceCount:1,correctCount:1,state:'developing',source:'assessment'}).ok);
assert.equal(api.explain({evidenceCount:'not-a-number'}).error,'INVALID_EVIDENCE_COUNT');
assert.equal(api.explain({correctCount:-1}).error,'INVALID_CORRECT_COUNT');
const result=api.explain({evidenceCount:2,state:'  steady  ',source:'assessment feed'});
assert.ok(result.reasons.some(x=>x.includes('steady')));
assert.ok(result.reasons.some(x=>x.includes('assessment feed')));
assert.ok(result.limitation.includes('stored evidence'));
console.log('M38 PASS');
