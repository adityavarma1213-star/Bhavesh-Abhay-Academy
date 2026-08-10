#!/usr/bin/env node
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const c={window:{localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{},key:()=>null,length:0}}};
vm.createContext(c);
vm.runInContext(fs.readFileSync('js/baa-cognitive-safety.js','utf8'),c);
const api=c.window.BAACognitiveSafety;
assert.ok(api);
assert.equal(c.window.BAACognitiveSafety.check({}).error,'INVALID_WELLBEING_VALUES');
console.log('M54 PASS');
