#!/usr/bin/env node
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const c={window:{localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{},key:()=>null,length:0}}};
vm.createContext(c);
vm.runInContext(fs.readFileSync('js/baa-appeals.js','utf8'),c);
const api=c.window.BAAAppeals;
assert.ok(api);
assert.equal(c.window.BAAAppeals.updateStatus('missing','accepted').error,'APPEAL_NOT_FOUND');
console.log('M39 PASS');
