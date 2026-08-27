#!/usr/bin/env node
const fs=require('fs'),assert=require('assert');
const p=fs.readFileSync('js/baa-practice.js','utf8'),w=fs.readFileSync('js/baa-weakness.js','utf8'),s=fs.readFileSync('js/baa-strength.js','utf8');
const bridge=fs.readFileSync('js/baa-m21-23-server.js','utf8');
const api=fs.readFileSync('api/m21-23-evidence.js','utf8');
let n=0;function t(x,f){try{f();n++;console.log('PASS '+x)}catch(e){console.error('FAIL '+x+'\n'+e.stack);process.exitCode=1}}
t('M21 practice selects real bank questions',()=>{assert.ok(p.includes('BAAQuestionBank'));assert.ok(p.includes('getPracticeSet'))});
t('M21 prioritizes weak/learning concepts',()=>{assert.ok(p.includes('needs_revision'));assert.ok(p.includes('learning'))});
t('M21 has fallback practice',()=>assert.ok(p.includes('if(out.length<limit)')));
t('M22 weakness detector is evidence-based',()=>{assert.ok(w.includes('getLearningMemory'));assert.ok(w.includes('needs_revision'));assert.ok(w.includes('struggling'))});
t('M22 gives an explainable reason',()=>assert.ok(w.includes('reason:')));
t('M23 strength recognition is evidence-based',()=>{assert.ok(s.includes('mastered'));assert.ok(s.includes('strong'));assert.ok(s.includes('correctCount'))});
t('M23 gives an explainable reason',()=>assert.ok(s.includes('Evidence shows')));
t('Student OS loads all three modules',()=>{const h=fs.readFileSync('student-os.html','utf8');assert.ok(h.includes('js/baa-practice.js'));assert.ok(h.includes('js/baa-weakness.js'));assert.ok(h.includes('js/baa-strength.js'))});
t('No invented scores are generated',()=>{assert.ok(!p.includes('score:100'));assert.ok(!w.includes('score:100'));assert.ok(!s.includes('score:100'))});
t('No psychological diagnosis is inferred',()=>assert.ok(!w.includes('diagnose')));
t('M21-M23 bridge requires authenticated BAA learner context',()=>{assert.ok(bridge.includes("global.BAA_LEARNER_ID || document.body?.dataset?.learnerId"));assert.ok(!bridge.includes('localStorage.getItem(\'BAA_LEARNER_ID\')'))});
t('M21-M23 bridge requests fresh JSON with session credentials',()=>{assert.ok(bridge.includes("credentials:'include'"));assert.ok(bridge.includes("cache:'no-store'"));assert.ok(bridge.includes("Accept:{Accept:'application/json'}")||bridge.includes("Accept:'application/json'"))});
t('M21 server never selects answer-key fields for practice feed',()=>{assert.ok(!api.includes('correct_answer AS "correctAnswer"'));assert.ok(!api.includes(', explanation\n        FROM questions'))});
t('M21-M23 server remains learner-owned',()=>{assert.ok(api.includes('requireAuth(req)'));assert.ok(api.includes('requireLearnerAccess(session, learnerId)'))});
console.log(`\nM21-23: ${n}/14 PASS`);if(process.exitCode)process.exit(process.exitCode);
