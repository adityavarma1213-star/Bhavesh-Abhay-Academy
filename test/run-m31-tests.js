#!/usr/bin/env node
const fs=require('fs'),assert=require('assert');
const lang=fs.readFileSync('js/baa-language.js','utf8'),ui=fs.readFileSync('student-os.html','utf8'),api=fs.readFileSync('api/chat.js','utf8');
let n=0;function t(name,fn){try{fn();n++;console.log('PASS '+name)}catch(e){console.error('FAIL '+name+'\n'+e.stack);process.exitCode=1}}
t('M31 module scope is documented',()=>assert.ok(lang.includes('Module 31 — Multilingual Learning Ecosystem')));
t('M31 includes seven regional Indian languages',()=>['hi','mr','gu','bn','ta','te','kn'].forEach(x=>assert.ok(lang.includes(`code:'${x}'`))));
t('M31 includes English fallback',()=>assert.ok(lang.includes("code:'en'")));
t('M31 UI exposes language selector',()=>assert.ok(ui.includes('id="responseLanguage"')));
t('M31 persists a versioned preference',()=>assert.ok(ui.includes('BAA_LANGUAGE_SCHEMA_VERSION')));
t('M31 sends language to the backend',()=>assert.ok(ui.includes('responseLanguage: getResponseLanguage()')));
t('M31 backend validates language',()=>assert.ok(api.includes('allowedResponseLanguages')));
t('M31 backend has safe fallback',()=>assert.ok(api.includes("safeResponseLanguage")&&api.includes(" : 'en'")));
t('M31 protects technical content',()=>assert.ok(api.includes('Preserve mathematical notation, code, proper nouns')));
t('M31 states translation limitation',()=>assert.ok(lang.includes('does not claim professional translation or dialect certification')));
console.log(`\nM31: ${n}/10 PASS`);if(process.exitCode)process.exit(process.exitCode);
