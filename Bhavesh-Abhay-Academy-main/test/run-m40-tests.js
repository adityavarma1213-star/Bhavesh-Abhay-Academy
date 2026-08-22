#!/usr/bin/env node
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const c={window:{localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{},key:()=>null,length:0}}};
vm.createContext(c);
vm.runInContext(fs.readFileSync('js/baa-curriculum.js','utf8'),c);
const api=c.window.BAACurriculum;
assert.ok(api);
assert.equal(c.window.BAACurriculum.setProfile('UNKNOWN','9','Math').error,'INVALID_CURRICULUM_PROFILE');
console.log('M40 PASS');
