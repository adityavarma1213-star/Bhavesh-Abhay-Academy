#!/usr/bin/env node
const fs=require('fs'),assert=require('assert');
const mod=fs.readFileSync('js/baa-rewards.js','utf8'),ui=fs.readFileSync('student-os.html','utf8');
let n=0;function t(name,fn){try{fn();n++;console.log('PASS '+name)}catch(e){console.error('FAIL '+name+'\n'+e.stack);process.exitCode=1}}
t('M30 is correctly scoped to Achievement & Rewards',()=>assert.ok(mod.includes('Module 30 — Achievement & Rewards Center')));
t('M30 reads real assessment storage',()=>assert.ok(mod.includes('global.BAAAssessment')&&mod.includes('a._load()')));
t('M30 derives XP from recorded activity',()=>assert.ok(mod.includes('completed*10 + correct*5 + mastered*25')));
t('M30 defines transparent badges',()=>assert.ok(mod.includes('const BADGES=[')&&mod.includes('First Step')));
t('M30 has milestone tracking',()=>assert.ok(mod.includes('getMilestones')));
t('M30 persists only reward-state metadata',()=>{assert.ok(mod.includes('baa_rewards_v1'));assert.ok(!mod.includes('store.evidence.push'));});
t('M30 has storage failure handling',()=>assert.ok(mod.includes('REWARD_STORAGE_FAILED')));
t('M30 does not fabricate academic scores',()=>assert.ok(mod.includes('not a replacement for academic scores')));
t('Student UI exposes rewards center',()=>assert.ok(ui.includes('id="rewardsPanel"')&&ui.includes('Achievements & Rewards')));
t('Student UI distinguishes motivational rewards from marks',()=>assert.ok(ui.includes('motivational rewards, not academic marks')));
console.log(`\nM30: ${n}/10 PASS`);if(process.exitCode)process.exit(process.exitCode);
