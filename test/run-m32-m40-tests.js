#!/usr/bin/env node
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const root='.';
const files={
32:'js/baa-voice.js',33:'js/baa-labs.js',34:'js/baa-school.js',35:'js/baa-community.js',
36:'js/baa-insights.js',38:'js/baa-explainability.js',39:'js/baa-appeals.js',40:'js/baa-curriculum.js'
};
let n=0;
function t(name,fn){try{fn();n++;console.log('PASS '+name)}catch(e){console.error('FAIL '+name+'\n'+e.stack);process.exitCode=1}}
for(const [m,f] of Object.entries(files)){
 t(`M${m} file exists`,()=>assert.ok(fs.existsSync(f)));
 t(`M${m} has module header`,()=>assert.ok(fs.readFileSync(f,'utf8').includes(`M${m}`)));
}
t('M32 capability API is defensive',()=>{
 const c={window:{}};vm.createContext(c);vm.runInContext(fs.readFileSync(files[32],'utf8'),c);
 assert.ok(c.window.BAAVoice.capabilities().ok);
 assert.equal(c.window.BAAVoice.speak('',null).error,'SPEECH_SYNTHESIS_UNSUPPORTED');
});
t('M33 rejects invalid lab input',()=>{
 const c={window:{}};vm.createContext(c);vm.runInContext(fs.readFileSync(files[33],'utf8'),c);
 assert.equal(c.window.BAALabs.run('projectile',{velocity:-1,angle:45}).error,'INVALID_PROJECTILE_INPUT');
 assert.ok(c.window.BAALabs.run('ohm',{voltage:10,resistance:5}).result.currentAmps===2);
});
t('M34 rejects invalid student',()=>{
 const c={window:{localStorage:{getItem:()=>null,setItem:()=>{}}}};vm.createContext(c);vm.runInContext(fs.readFileSync(files[34],'utf8'),c);
 assert.equal(c.window.BAASchool.addStudent({name:''}).error,'INVALID_STUDENT');
});
t('M35 moderation blocks explicit unsafe content',()=>{
 const c={window:{}};vm.createContext(c);vm.runInContext(fs.readFileSync(files[35],'utf8'),c);
 assert.equal(c.window.BAACommunity.moderate('This is about suicide').error,'POST_BLOCKED_BY_SAFETY_FILTER');
});
t('M36 reports insufficient evidence instead of fabricating accuracy',()=>{
 const c={window:{}};vm.createContext(c);vm.runInContext(fs.readFileSync(files[36],'utf8'),c);
 const x=c.window.BAAInsights.build();assert.ok(x.ok);assert.equal(x.evidenceQuality,'insufficient_evidence');
});
t('M37 original trust module remains present',()=>assert.ok(fs.readFileSync('js/baa-trust.js','utf8').includes('BAATrust')));
t('M38 explanation uses explicit evidence fields',()=>{
 const c={window:{}};vm.createContext(c);vm.runInContext(fs.readFileSync(files[38],'utf8'),c);
 const x=c.window.BAAExplainability.explain({evidenceCount:3,state:'learning',source:'assessment'});
 assert.ok(x.ok&&x.reasons.length===3);
});
t('M39 appeal cannot auto-approve invalid status',()=>{
 const c={window:{localStorage:{getItem:()=>null,setItem:()=>{}}}};vm.createContext(c);vm.runInContext(fs.readFileSync(files[39],'utf8'),c);
 assert.equal(c.window.BAAAppeals.updateStatus('missing','accepted').error,'APPEAL_NOT_FOUND');
});
t('M40 validates curriculum profile',()=>{
 const c={window:{localStorage:{getItem:()=>null,setItem:()=>{}}}};vm.createContext(c);vm.runInContext(fs.readFileSync(files[40],'utf8'),c);
 assert.equal(c.window.BAACurriculum.setProfile('UNKNOWN','9','Math').error,'INVALID_CURRICULUM_PROFILE');
});
const ui=fs.readFileSync('student-os.html','utf8');
t('M32-M40 scripts are integrated',()=>{
 ['baa-voice.js','baa-labs.js','baa-school.js','baa-community.js','baa-insights.js','baa-explainability.js','baa-appeals.js','baa-curriculum.js']
 .forEach(x=>assert.ok(ui.includes(x)));
 assert.ok(ui.includes('ecosystemHub'));
});
console.log(`\nM32–M40 focused: ${n}/18 PASS`);
if(process.exitCode)process.exit(process.exitCode);
