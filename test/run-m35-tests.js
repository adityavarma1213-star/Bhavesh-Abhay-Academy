#!/usr/bin/env node
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const c={window:{localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{},key:()=>null,length:0}}};
vm.createContext(c);
vm.runInContext(fs.readFileSync('js/baa-community.js','utf8'),c);
const api=c.window.BAACommunity;
assert.ok(api);
assert.equal(c.window.BAACommunity.moderate('suicide').error,'POST_BLOCKED_BY_SAFETY_FILTER');
console.log('M35 PASS');
