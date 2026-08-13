#!/usr/bin/env node
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const c={window:{localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{},key:()=>null,length:0}}};
vm.createContext(c);
vm.runInContext(fs.readFileSync('js/baa-governance.js','utf8'),c);
const api=c.window.BAAGovernance;
assert.ok(api);
assert.equal(c.window.BAAGovernance.create({type:'prediction'}).item.status,'pending_human_review');
console.log('M59 PASS');
