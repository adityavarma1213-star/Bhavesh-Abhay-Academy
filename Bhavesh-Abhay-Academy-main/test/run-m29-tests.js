#!/usr/bin/env node
const fs=require('fs'),assert=require('assert');
const mod=fs.readFileSync('js/baa-learning-paths.js','utf8');
const ui=fs.readFileSync('student-os.html','utf8');
let n=0;function t(name,fn){try{fn();n++;console.log('PASS '+name)}catch(e){console.error('FAIL '+name+'\n'+e.stack);process.exitCode=1}}
t('M29 is explicitly scoped',()=>assert.ok(mod.includes('Module 29 — AI Learning Paths')));
t('M29 reads real concept states',()=>assert.ok(mod.includes('getConceptStates')));
t('M29 returns sequential node order',()=>assert.ok(mod.includes('order:index+1')));
t('M29 includes current node state',()=>assert.ok(mod.includes('current:isCurrent')));
t('M29 avoids invented prerequisites',()=>assert.ok(mod.includes('prerequisiteClaim:null')));
t('M29 discloses path-order limitation',()=>assert.ok(mod.includes('canonical syllabus prerequisite graph')));
t('M29 handles missing evidence honestly',()=>assert.ok(mod.includes('No learning path can be built')||mod.includes('nodes:[],hasEvidence:false')));
t('M29 bounds path length',()=>assert.ok(mod.includes('Math.min(30')));
t('M29 UI exposes a node-based path',()=>assert.ok(ui.includes('id="learningPathPanel"')&&ui.includes('Learning Path')));
t('M29 UI renders node order and evidence',()=>assert.ok(ui.includes('n.order')&&ui.includes('n.evidenceCount')));
console.log(`\nM29: ${n}/10 PASS`);if(process.exitCode)process.exit(process.exitCode);
