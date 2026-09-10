#!/usr/bin/env node
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const c={window:{localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{},key:()=>null,length:0}}};
vm.createContext(c);
vm.runInContext(fs.readFileSync('js/baa-pedagogy.js','utf8'),c);
const api=c.window.BAAPedagogy;
assert.ok(api);
assert.equal(c.window.BAAPedagogy.chooseAction('struggling'),'guided_reteach');
console.log('M51 PASS');
