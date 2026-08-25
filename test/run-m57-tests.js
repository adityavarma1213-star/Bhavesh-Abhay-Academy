#!/usr/bin/env node
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const c={window:{localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{},key:()=>null,length:0}}};
vm.createContext(c);
vm.runInContext(fs.readFileSync('js/baa-parent-conversation.js','utf8'),c);
const api=c.window.BAAParentConversation;
assert.ok(api);
assert.equal(api.prompts({topic:'Algebra'}).prompts.length,4);
const endpoint=fs.readFileSync('api/m57-parent-conversation.js','utf8');
assert(endpoint.includes('parent_learner'));
assert(endpoint.includes("status='active'"));
assert(endpoint.includes('LEARNER_ACCESS_DENIED'));
console.log('M57 PASS — prompt generation and parent-learner ownership contract');
