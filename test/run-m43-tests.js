#!/usr/bin/env node
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const c={window:{localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{},key:()=>null,length:0}},URLSearchParams,fetch:async()=>({ok:true,json:async()=>({ok:true,results:[]})})};
vm.createContext(c);
vm.runInContext(fs.readFileSync('js/baa-scholarships.js','utf8'),c);
const api=c.window.BAAScholarships;
assert.ok(api);
assert.deepEqual(api.filter(null,{}).results,[]);
assert.equal(api.filter([{country:'IN',level:'9',fields:['science']},{country:'US'}],{country:'IN'}).results.length,1);
assert.equal(api.rank([{matchScore:2},{matchScore:9}]).results[0].matchScore,9);
assert.equal(typeof api.mount,'function');
console.log('M43 PASS');
