#!/usr/bin/env node
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const c={window:{localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{},key:()=>null,length:0}}};
vm.createContext(c);
vm.runInContext(fs.readFileSync('js/baa-purpose-design.js','utf8'),c);
const api=c.window.BAAPurposeDesign;
assert.ok(api);
assert.equal(api.safeCopy('You failed').safe,false);
assert.equal(api.safeCopy('Act now or lose your chance').safe,false);
assert.equal(api.safeCopy('You can choose what to study next.').safe,true);
const safe=api.auditSurface({dismissible:true,studentChoiceVisible:true,emotionInference:false,urgentLanguage:false,copy:'Choose your next step.'});
assert.equal(safe.safe,true);
const unsafe=api.auditSurface({dismissible:false,studentChoiceVisible:false,emotionInference:true,urgentLanguage:true,copy:'You failed. Act now or lose your chance.'});
assert.equal(unsafe.safe,false);
assert.ok(unsafe.issues.includes('MISSING_CLEAR_DISMISS'));
assert.ok(unsafe.issues.includes('EMOTION_INFERENCE_NOT_ALLOWED'));
assert.ok(unsafe.issues.includes('UNSAFE_COPY'));
console.log('M60 PASS');
