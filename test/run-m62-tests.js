#!/usr/bin/env node
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const c={window:{localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{},key:()=>null,length:0}}};
vm.createContext(c);
vm.runInContext(fs.readFileSync('js/baa-ai-council.js','utf8'),c);
const api=c.window.BAAAICouncil;
assert.ok(api);
assert.equal(c.window.BAAAICouncil.consensus(c.window.BAAAICouncil.createReview('safety',['A']).review).status,'awaiting_reviews');
console.log('M62 PASS');
