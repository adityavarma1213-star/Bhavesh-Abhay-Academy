#!/usr/bin/env node
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const specs={
51:['js/baa-pedagogy.js','BAAPedagogy'],52:['js/baa-mistakes.js','BAAMistakes'],53:['js/baa-outcomes.js','BAAOutcomes'],
54:['js/baa-cognitive-safety.js','BAACognitiveSafety'],55:['js/baa-fresh-start.js','BAAFreshStart'],56:['js/baa-adaptive-pacing.js','BAAPacing'],
57:['js/baa-parent-conversation.js','BAAParentConversation'],58:['js/baa-teacher-diagnostic.js','BAATeacherDiagnostic'],
59:['js/baa-governance.js','BAAGovernance'],60:['js/baa-purpose-design.js','BAAPurposeDesign'],
61:['js/baa-founder-lab.js','BAAFounderLab'],62:['js/baa-ai-council.js','BAAAICouncil']};
let n=0;function t(name,fn){try{fn();n++;console.log('PASS '+name)}catch(e){console.error('FAIL '+name+'\n'+e.stack);process.exitCode=1}}
for(const [m,[f,a]] of Object.entries(specs))t(`M${m} exports ${a}`,()=>{assert.ok(fs.existsSync(f));const c={window:{}};vm.createContext(c);vm.runInContext(fs.readFileSync(f,'utf8'),c);assert.ok(c.window[a]);});
t('M51 chooses a pedagogy action',()=>{const c={window:{}};vm.createContext(c);vm.runInContext(fs.readFileSync(specs[51][0],'utf8'),c);assert.equal(c.window.BAAPedagogy.chooseAction('struggling'),'guided_reteach');});
t('M52 labels unknown root cause honestly',()=>{const c={window:{}};vm.createContext(c);vm.runInContext(fs.readFileSync(specs[52][0],'utf8'),c);assert.equal(c.window.BAAMistakes.classify({concept:'x'}).confidence,'low');});
t('M53 computes comparable change',()=>{const c={window:{}};vm.createContext(c);vm.runInContext(fs.readFileSync(specs[53][0],'utf8'),c);assert.equal(c.window.BAAOutcomes.compare(40,60).absoluteChange,20);});
t('M54 rejects malformed safety input',()=>{const c={window:{}};vm.createContext(c);vm.runInContext(fs.readFileSync(specs[54][0],'utf8'),c);assert.equal(c.window.BAACognitiveSafety.check({}).error,'INVALID_WELLBEING_VALUES');});
t('M55 requires explicit reset confirmation',()=>{const c={window:{localStorage:{removeItem:()=>{}}}};vm.createContext(c);vm.runInContext(fs.readFileSync(specs[55][0],'utf8'),c);assert.equal(c.window.BAAFreshStart.apply(['x'],false).error,'RESET_CONFIRMATION_REQUIRED');});
t('M56 adapts scope from explicit inputs',()=>{const c={window:{}};vm.createContext(c);vm.runInContext(fs.readFileSync(specs[56][0],'utf8'),c);assert.equal(c.window.BAAPacing.recommend({availableMinutes:30,plannedMinutes:60,energyLevel:4}).action,'reduce_scope');});
t('M57 creates neutral parent prompts',()=>{const c={window:{}};vm.createContext(c);vm.runInContext(fs.readFileSync(specs[57][0],'utf8'),c);assert.equal(c.window.BAAParentConversation.prompts({topic:'Algebra'}).prompts.length,4);});
t('M58 groups evidence for differentiated teaching',()=>{const c={window:{}};vm.createContext(c);vm.runInContext(fs.readFileSync(specs[58][0],'utf8'),c);assert.equal(c.window.BAATeacherDiagnostic.group([{studentId:'1',state:'struggling'}]).groups.reteach[0],'1');});
t('M59 requires human decision',()=>{const c={window:{}};vm.createContext(c);vm.runInContext(fs.readFileSync(specs[59][0],'utf8'),c);let x=c.window.BAAGovernance.create({type:'prediction'}).item;assert.equal(x.status,'pending_human_review');});
t('M60 detects configured harmful UI copy',()=>{const c={window:{}};vm.createContext(c);vm.runInContext(fs.readFileSync(specs[60][0],'utf8'),c);assert.equal(c.window.BAAPurposeDesign.safeCopy('You failed').safe,false);});
t('M61 does not claim real study results',()=>{const c={window:{}};vm.createContext(c);vm.runInContext(fs.readFileSync(specs[61][0],'utf8'),c);assert.equal(c.window.BAAFounderLab.cohort({id:'c1'}).cohort.status,'planned');});
t('M62 requires actual reviewer responses',()=>{const c={window:{}};vm.createContext(c);vm.runInContext(fs.readFileSync(specs[62][0],'utf8'),c);let x=c.window.BAAAICouncil.createReview('safety',['A','B']).review;assert.equal(c.window.BAAAICouncil.consensus(x).status,'awaiting_reviews');});
const ui=fs.readFileSync('student-os.html','utf8');
const parentUi=fs.readFileSync('parent-os.html','utf8');
t('M51-M62 scripts integrated',()=>Object.entries(specs).forEach(([m,[f]])=>{
  // M55's real, working implementation is BAATrust.freshStart() in
  // js/baa-trust.js (wired to the Start Fresh button in trust-privacy.html).
  // The standalone js/baa-fresh-start.js used to be loaded on this page but
  // its apply()/plan() were never called from anywhere — dead code that
  // looked wired but wasn't. It was removed from student-os.html for that
  // reason; js/baa-fresh-start.js itself is unchanged and still passes the
  // per-module check above.
  //
  // M56 and M57 followed the same pattern in a later batch: their
  // standalone files (js/baa-adaptive-pacing.js, js/baa-parent-
  // conversation.js) were loaded but never called from any page — the
  // real logic now runs server-side (mirrored, unchanged) via
  // /api/v1/adaptive-pacing and /api/v1/parent-conversation. Their dead
  // script tags were removed; the real UI evidence is checked instead.
  if(m==='56'){ assert.ok(ui.includes('renderAdaptivePacing')&&ui.includes('/api/v1/adaptive-pacing')); return; }
  if(m==='57'){ assert.ok(parentUi.includes('refreshParentConversation')&&parentUi.includes('/api/v1/parent-conversation')); return; }
  const expected = m==='55' ? 'baa-trust.js' : f.replace('js/','');
  assert.ok(ui.includes(expected));
}));
console.log(`\nM51–M62 focused: ${n}/25 PASS`);if(process.exitCode)process.exit(process.exitCode);
