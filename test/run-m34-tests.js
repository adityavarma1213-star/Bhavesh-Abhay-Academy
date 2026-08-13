#!/usr/bin/env node
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const c={window:{localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{},key:()=>null,length:0}}};
vm.createContext(c);
vm.runInContext(fs.readFileSync('js/baa-school.js','utf8'),c);
const api=c.window.BAASchool;
assert.ok(api);
assert.equal(c.window.BAASchool.addStudent({name:''}).error,'INVALID_STUDENT');
console.log('M34 PASS');
