#!/usr/bin/env node
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const c={window:{localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{},key:()=>null,length:0}}};
vm.createContext(c);
vm.runInContext(fs.readFileSync('js/baa-founder-lab.js','utf8'),c);
const api=c.window.BAAFounderLab;
assert.ok(api);
assert.equal(c.window.BAAFounderLab.cohort({id:'c1'}).cohort.status,'planned');
console.log('M61 PASS');
