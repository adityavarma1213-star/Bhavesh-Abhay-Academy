#!/usr/bin/env node
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const c={window:{localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{},key:()=>null,length:0}}};
vm.createContext(c);
vm.runInContext(fs.readFileSync('js/baa-adaptive-pacing.js','utf8'),c);
const api=c.window.BAAPacing;
assert.ok(api);
assert.equal(c.window.BAAPacing.recommend({availableMinutes:30,plannedMinutes:60,energyLevel:4}).action,'reduce_scope');
console.log('M56 PASS');
