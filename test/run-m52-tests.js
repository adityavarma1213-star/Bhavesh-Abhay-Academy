#!/usr/bin/env node
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const c={window:{localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{},key:()=>null,length:0}}};
vm.createContext(c);
vm.runInContext(fs.readFileSync('js/baa-mistakes.js','utf8'),c);
const api=c.window.BAAMistakes;
assert.ok(api);
assert.equal(c.window.BAAMistakes.classify({concept:'x'}).confidence,'low');
console.log('M52 PASS');
