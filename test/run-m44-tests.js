#!/usr/bin/env node
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const c={window:{localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{},key:()=>null,length:0}}};
vm.createContext(c);
vm.runInContext(fs.readFileSync('js/baa-career-prep.js','utf8'),c);
const api=c.window.BAACareerPrep;
assert.ok(api);
assert.deepEqual(c.window.BAACareerPrep.gap({skills:['HTML']},['HTML','JS']).missing,['JS']);
console.log('M44 PASS');
