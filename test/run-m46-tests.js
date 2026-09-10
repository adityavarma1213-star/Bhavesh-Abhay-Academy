#!/usr/bin/env node
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const c={window:{localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{},key:()=>null,length:0}}};
vm.createContext(c);
vm.runInContext(fs.readFileSync('js/baa-erp.js','utf8'),c);
const api=c.window.BAAERP;
assert.ok(api);
assert.equal(c.window.BAAERP.buildPayload('bad',{}).error,'INVALID_ERP_DATA_TYPE');
console.log('M46 PASS');
