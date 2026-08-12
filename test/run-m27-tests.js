#!/usr/bin/env node
const fs=require('fs'),assert=require('assert');
const mod=fs.readFileSync('js/baa-learning-resources.js','utf8');
const student=fs.readFileSync('student-os.html','utf8');
let n=0;
function t(name,fn){try{fn();n++;console.log('PASS '+name)}catch(e){console.error('FAIL '+name+'\n'+e.stack);process.exitCode=1}}
t('M27 is explicitly scoped to resource curation',()=>assert.ok(mod.includes('Module 27 — AI Learning Resources')));
t('M27 uses real learning evidence',()=>assert.ok(mod.includes('BAAAssessment')&&mod.includes('getConceptStates')));
t('M27 supports multimodal formats',()=>['visual','video','interactive','practice'].forEach(x=>assert.ok(mod.includes(`id:'${x}'`))));
t('M27 supports explicit student format preference',()=>{assert.ok(mod.includes('baa_resource_preferences'));assert.ok(mod.includes('setPreference'))});
t('M27 does not diagnose a learning style',()=>assert.ok(mod.includes('does NOT diagnose a "learning style"')));
t('M27 has honest provider/search targets',()=>{assert.ok(mod.includes('Khan Academy search'));assert.ok(mod.includes('YouTube search'));assert.ok(mod.includes('PhET search'))});
t('M27 uses encoded query parameters',()=>assert.ok(mod.includes('encodeURIComponent(q)')));
t('M27 has a safe storage failure path',()=>assert.ok(mod.includes('PREFERENCE_STORAGE_FAILED')));
t('Student UI exposes format preference',()=>assert.ok(student.includes('id="resourceFormat"')));
t('Student UI uses rel noopener for external links',()=>assert.ok(student.includes('rel="noopener noreferrer"')));
console.log(`\nM27: ${n}/10 PASS`);
if(process.exitCode)process.exit(process.exitCode);
