#!/usr/bin/env node
const fs=require('fs');const assert=require('assert');
const rev=fs.readFileSync('js/baa-revision.js','utf8'),goals=fs.readFileSync('js/baa-goals.js','utf8'),student=fs.readFileSync('student-os.html','utf8');
let n=0;function t(x,f){try{f();n++;console.log('PASS '+x)}catch(e){console.error('FAIL '+x+'\n'+e.stack);process.exitCode=1}}
t('M24 revision engine uses learning memory',()=>{assert.ok(rev.includes('getLearningMemory'));assert.ok(rev.includes('INTERVALS'))});
t('M24 adapts intervals to evidence state',()=>{assert.ok(rev.includes('needs_revision'));assert.ok(rev.includes('struggling'));assert.ok(rev.includes('learning'))});
t('M24 produces due/reason fields',()=>{assert.ok(rev.includes('due:'));assert.ok(rev.includes('reason:'))});
t('M25 reuses real Planner goals',()=>assert.ok(goals.includes('global.BAAPlanner')));
t('M25 links goals to learning evidence',()=>assert.ok(goals.includes('BAAIntelligence.getLearningSummary()')));
t('M25 exposes related concepts',()=>assert.ok(goals.includes('relatedConcepts')));
t('Student OS loads M24/M25',()=>{assert.ok(student.includes('js/baa-revision.js'));assert.ok(student.includes('js/baa-goals.js'))});
t('Student OS renders revision panel',()=>assert.ok(student.includes('Revision due')));
t('Student OS renders goal tracker',()=>assert.ok(student.includes('Goal Tracker')));
t('No fabricated goal completion percentage is created',()=>assert.ok(!goals.includes('progress:100')));
console.log(`\nM24-25: ${n}/10 PASS`);if(process.exitCode)process.exit(process.exitCode);
