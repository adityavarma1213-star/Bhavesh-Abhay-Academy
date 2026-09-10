#!/usr/bin/env node
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const c={window:{localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{},key:()=>null,length:0}}};
vm.createContext(c);
vm.runInContext(fs.readFileSync('js/baa-insights.js','utf8'),c);
const api=c.window.BAAInsights;
assert.ok(api);
assert.equal(c.window.BAAInsights.build().evidenceQuality,'insufficient_evidence');
console.log('M36 PASS');
