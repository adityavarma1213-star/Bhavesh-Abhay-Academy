#!/usr/bin/env node
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const c={window:{localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{},key:()=>null,length:0}}};
vm.createContext(c);
vm.runInContext(fs.readFileSync('js/baa-anti-cheating.js','utf8'),c);
const api=c.window.BAAAntiCheating;
assert.ok(api);
assert.equal(c.window.BAAAntiCheating.risk(c.window.BAAAntiCheating.startSession()).level,'normal');
console.log('M42 PASS');
