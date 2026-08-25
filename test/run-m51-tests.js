#!/usr/bin/env node
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const c={window:{localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{},key:()=>null,length:0}}};
vm.createContext(c);
vm.runInContext(fs.readFileSync('js/baa-pedagogy.js','utf8'),c);
const api=c.window.BAAPedagogy;
assert.ok(api);
assert.equal(api.chooseAction('struggling'),'guided_reteach');
assert.equal(typeof api.load,'function');
assert.equal(typeof api.mount,'function');
const server=fs.readFileSync('api/m51-pedagogy.js','utf8');
assert.match(server,/requireAuth/);
assert.match(server,/requireLearnerAccess/);
assert.match(server,/learning_evidence/);
assert.match(server,/productiveStruggle/);
console.log('M51 PASS');
