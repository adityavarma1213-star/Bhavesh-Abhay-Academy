#!/usr/bin/env node
const fs=require('fs'),assert=require('assert'),vm=require('vm');
let fetchOptions=null;
const c={window:{localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{},key:()=>null,length:0}},URLSearchParams,fetch:async(_url,options)=>{fetchOptions=options;return {ok:true,json:async()=>({ok:true,results:[]})}}};
vm.createContext(c);
vm.runInContext(fs.readFileSync('js/baa-scholarships.js','utf8'),c);
const api=c.window.BAAScholarships;
assert.ok(api);
assert.deepEqual(api.filter(null,{}).results,[]);
assert.equal(api.filter([{country:'IN',level:'9',fields:['science']},{country:'US'}],{country:'IN'}).results.length,1);
assert.equal(api.rank([{matchScore:2},{matchScore:9}]).results[0].matchScore,9);
assert.equal(typeof api.mount,'function');
(async()=>{
  await api.fetchPublished({country:'IN'});
  assert.equal(fetchOptions.credentials,'include');
  assert.equal(fetchOptions.headers.Accept,'application/json');
  console.log('M43 PASS');
})().catch(err=>{console.error(err);process.exit(1);});