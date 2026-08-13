#!/usr/bin/env node
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const c={window:{localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{},key:()=>null,length:0}}};
vm.createContext(c);
vm.runInContext(fs.readFileSync('js/baa-trust.js','utf8'),c);
const api=c.window.BAATrust;
assert.ok(api);
assert.ok(api && typeof api === 'object');
console.log('M37 PASS');
