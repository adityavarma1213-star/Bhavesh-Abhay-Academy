#!/usr/bin/env node
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const c={window:{localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{},key:()=>null,length:0}}};
vm.createContext(c);
vm.runInContext(fs.readFileSync('js/baa-voice.js','utf8'),c);
const api=c.window.BAAVoice;
assert.ok(api);
assert.ok(c.window.BAAVoice.capabilities());
console.log('M32 PASS');
