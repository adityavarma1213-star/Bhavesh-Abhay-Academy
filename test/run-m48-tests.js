#!/usr/bin/env node
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const c={window:{localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{},key:()=>null,length:0}}};
vm.createContext(c);
vm.runInContext(fs.readFileSync('js/baa-global-collab.js','utf8'),c);
const api=c.window.BAAGlobalCollab;
assert.ok(api);
assert.equal(c.window.BAAGlobalCollab.validateProject({title:'x',region:'IN'}).ok,true);
console.log('M48 PASS');
