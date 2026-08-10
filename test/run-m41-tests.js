#!/usr/bin/env node
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const c={window:{localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{},key:()=>null,length:0}}};
vm.createContext(c);
vm.runInContext(fs.readFileSync('js/baa-low-bandwidth.js','utf8'),c);
const api=c.window.BAALowBandwidth;
assert.ok(api);
assert.equal(c.window.BAALowBandwidth.set(true,'bad').error,'INVALID_LOW_BANDWIDTH_MODE');
console.log('M41 PASS');
