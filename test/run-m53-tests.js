#!/usr/bin/env node
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const source=fs.readFileSync('js/baa-outcomes.js','utf8');
const c={window:{localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{},key:()=>null,length:0},fetch:async()=>({ok:true,json:async()=>({outcomes:[]})})}};
vm.createContext(c);
vm.runInContext(source,c);
const api=c.window.BAAOutcomes;
assert.ok(api);
assert.equal(api.compare(40,60).absoluteChange,20);
assert.equal(api.retention(80,70).interpretation,'declined');
assert.ok(/credentials:\s*'include'/.test(source),'M53 load must send authenticated session credentials');
assert.ok(/Accept:\s*'application\/json'/.test(source),'M53 load must request JSON explicitly');
console.log('M53 PASS');
