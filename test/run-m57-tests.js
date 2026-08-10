#!/usr/bin/env node
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const c={window:{localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{},key:()=>null,length:0}}};
vm.createContext(c);
vm.runInContext(fs.readFileSync('js/baa-parent-conversation.js','utf8'),c);
const api=c.window.BAAParentConversation;
assert.ok(api);
assert.equal(c.window.BAAParentConversation.prompts({topic:'Algebra'}).prompts.length,4);
console.log('M57 PASS');
