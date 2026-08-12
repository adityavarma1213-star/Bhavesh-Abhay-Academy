#!/usr/bin/env node
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const c={window:{localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{},key:()=>null,length:0}}};
vm.createContext(c);
vm.runInContext(fs.readFileSync('js/baa-teacher-diagnostic.js','utf8'),c);
const api=c.window.BAATeacherDiagnostic;
assert.ok(api);
assert.equal(c.window.BAATeacherDiagnostic.group([{studentId:'1',state:'struggling'}]).groups.reteach[0],'1');
console.log('M58 PASS');
