#!/usr/bin/env node
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const c={window:{localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{},key:()=>null,length:0}}};
vm.createContext(c);
vm.runInContext(fs.readFileSync('js/baa-fresh-start.js','utf8'),c);
const api=c.window.BAAFreshStart;
assert.ok(api);
assert.equal(c.window.BAAFreshStart.apply(['x'],false).error,'RESET_CONFIRMATION_REQUIRED');
console.log('M55 PASS');
