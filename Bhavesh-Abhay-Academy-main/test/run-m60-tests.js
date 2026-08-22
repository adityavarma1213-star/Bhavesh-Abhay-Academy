#!/usr/bin/env node
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const c={window:{localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{},key:()=>null,length:0}}};
vm.createContext(c);
vm.runInContext(fs.readFileSync('js/baa-purpose-design.js','utf8'),c);
const api=c.window.BAAPurposeDesign;
assert.ok(api);
assert.equal(c.window.BAAPurposeDesign.safeCopy('You failed').safe,false);
console.log('M60 PASS');
