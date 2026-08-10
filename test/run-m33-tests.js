#!/usr/bin/env node
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const c={window:{localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{},key:()=>null,length:0}}};
vm.createContext(c);
vm.runInContext(fs.readFileSync('js/baa-labs.js','utf8'),c);
const api=c.window.BAALabs;
assert.ok(api);
assert.equal(c.window.BAALabs.run('ohm',{voltage:10,resistance:5}).result.currentAmps,2);
console.log('M33 PASS');
