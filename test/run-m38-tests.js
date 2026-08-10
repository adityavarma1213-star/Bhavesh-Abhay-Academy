#!/usr/bin/env node
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const c={window:{localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{},key:()=>null,length:0}}};
vm.createContext(c);
vm.runInContext(fs.readFileSync('js/baa-explainability.js','utf8'),c);
const api=c.window.BAAExplainability;
assert.ok(api);
assert.ok(c.window.BAAExplainability.explain({evidenceCount:1}).ok);
console.log('M38 PASS');
