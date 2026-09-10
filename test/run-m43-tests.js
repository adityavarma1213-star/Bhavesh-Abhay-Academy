#!/usr/bin/env node
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const c={window:{localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{},key:()=>null,length:0}}};
vm.createContext(c);
vm.runInContext(fs.readFileSync('js/baa-scholarships.js','utf8'),c);
const api=c.window.BAAScholarships;
assert.ok(api);
assert.deepEqual(c.window.BAAScholarships.filter(null,{}).results,[]);
console.log('M43 PASS');
