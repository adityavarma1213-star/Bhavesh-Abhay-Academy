#!/usr/bin/env node
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const c={window:{localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{},key:()=>null,length:0}}};
vm.createContext(c);
vm.runInContext(fs.readFileSync('js/baa-olympiad.js','utf8'),c);
const api=c.window.BAAOlympiad;
assert.ok(api);
assert.equal(c.window.BAAOlympiad.buildPlan(['Algebra'],0).error,'INVALID_PLAN_DAYS');
console.log('M49 PASS');
