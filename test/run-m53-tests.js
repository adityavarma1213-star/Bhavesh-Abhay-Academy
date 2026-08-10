#!/usr/bin/env node
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const c={window:{localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{},key:()=>null,length:0}}};
vm.createContext(c);
vm.runInContext(fs.readFileSync('js/baa-outcomes.js','utf8'),c);
const api=c.window.BAAOutcomes;
assert.ok(api);
assert.equal(c.window.BAAOutcomes.compare(40,60).absoluteChange,20);
console.log('M53 PASS');
