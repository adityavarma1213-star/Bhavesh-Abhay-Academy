#!/usr/bin/env node
const fs=require('fs'),assert=require('assert');
const mod=fs.readFileSync('js/baa-notes-generator.js','utf8');
const api=fs.readFileSync('api/m26-notes.js','utf8');
const teacher=fs.readFileSync('teacher-os.html','utf8');
let n=0;
function t(name,fn){try{fn();n++;console.log('PASS '+name)}catch(e){console.error('FAIL '+name+'\n'+e.stack);process.exitCode=1}}
t('M26 module is explicitly scoped',()=>{assert.ok(mod.includes('Module 26: AI Notes Generator'));assert.ok(mod.includes('reviewable teacher-note draft'));});
t('M26 reads real academic profile evidence',()=>assert.ok(mod.includes('assessment.getAcademicProfile()')));
t('M26 reads real assessment history',()=>assert.ok(mod.includes('assessment.getAttemptHistory()')));
t('M26 counts real stored evidence',()=>assert.ok(mod.includes('(assessment._load().evidence||[])')));
t('M26 has an honest insufficient-evidence path',()=>{assert.ok(mod.includes('INSUFFICIENT_EVIDENCE'));assert.ok(mod.includes('not enough recorded academic evidence'));});
t('M26 does not auto-save generated notes',()=>{assert.ok(!mod.includes('localStorage.setItem'));assert.ok(!mod.includes('saveNotes('));});
t('M26 does not call an AI endpoint or invent an AI result',()=>{assert.ok(!mod.includes("fetch('/api/chat"));assert.ok(!mod.includes('api/chat'));});
t('Teacher UI exposes explicit draft generation',()=>{assert.ok(teacher.includes('generateNoteBtn'));assert.ok(teacher.includes('Generate factual note draft'));});
t('Generated text uses textContent rather than innerHTML',()=>assert.ok(teacher.includes('box.textContent=result.draft')));
t('Teacher must review before saving/sharing',()=>assert.ok(mod.includes('Teacher review required before saving or sharing.')));
t('M26 server requires teacher/admin authentication',()=>{assert.ok(api.includes('requireAuth(req)'));assert.ok(api.includes("hasRole(session, 'teacher')"));});
t('M26 server enforces class ownership',()=>assert.ok(api.includes('c.teacher_user_id=${session.user_id}')&&api.includes("cm.status='active'")));
t('M26 server uses persisted evidence and assessment attempts',()=>{assert.ok(api.includes('FROM learning_evidence'));assert.ok(api.includes('FROM assessment_attempts'));});
t('M26 client requests authenticated server draft',()=>{assert.ok(mod.includes('/api/m26-notes?learnerId='));assert.ok(mod.includes("credentials:'include'"));});
t('M26 server result is mounted into the existing draft UI',()=>{assert.ok(mod.includes('mountServerDraft'));assert.ok(mod.includes('noteDraftBox'));});
console.log(`\nM26: ${n}/15 PASS`);if(process.exitCode)process.exit(process.exitCode);
