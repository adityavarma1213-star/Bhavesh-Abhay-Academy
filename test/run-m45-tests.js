#!/usr/bin/env node
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const c={window:{localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{},key:()=>null,length:0}}};
vm.createContext(c);
vm.runInContext(fs.readFileSync('js/baa-mentors.js','utf8'),c);
const api=c.window.BAAMentors;
assert.ok(api);
assert.equal(c.window.BAAMentors.validate({name:'A'}).error,'INVALID_MENTOR_SUBJECTS');
console.log('M45 PASS');
