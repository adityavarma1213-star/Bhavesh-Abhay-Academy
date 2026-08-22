#!/usr/bin/env node
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const c={window:{localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{},key:()=>null,length:0}}};
vm.createContext(c);
vm.runInContext(fs.readFileSync('js/baa-institution.js','utf8'),c);
const api=c.window.BAAInstitution;
assert.ok(api);
assert.equal(c.window.BAAInstitution.summarize([]).evidenceQuality,'insufficient_evidence');
console.log('M47 PASS');
