#!/usr/bin/env node
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const specs={
41:['js/baa-low-bandwidth.js','BAALowBandwidth'],
42:['js/baa-anti-cheating.js','BAAAntiCheating'],
43:['js/baa-scholarships.js','BAAScholarships'],
44:['js/baa-career-prep.js','BAACareerPrep'],
45:['js/baa-mentors.js','BAAMentors'],
46:['js/baa-erp.js','BAAERP'],
47:['js/baa-institution.js','BAAInstitution'],
48:['js/baa-global-collab.js','BAAGlobalCollab'],
49:['js/baa-olympiad.js','BAAOlympiad'],
50:['js/baa-plugins.js','BAAPlugins']
};
let n=0;
function t(name,fn){try{fn();n++;console.log('PASS '+name)}catch(e){console.error('FAIL '+name+'\n'+e.stack);process.exitCode=1}}
for(const [m,[file,api]] of Object.entries(specs)){
 t(`M${m} exists and exports ${api}`,()=>{assert.ok(fs.existsSync(file));const c={window:{}};vm.createContext(c);vm.runInContext(fs.readFileSync(file,'utf8'),c);assert.ok(c.window[api]);});
}
t('M41 rejects invalid mode',()=>{const c={window:{localStorage:{getItem:()=>null,setItem:()=>{}}}};vm.createContext(c);vm.runInContext(fs.readFileSync(specs[41][0],'utf8'),c);assert.equal(c.window.BAALowBandwidth.set(true,'bad').error,'INVALID_LOW_BANDWIDTH_MODE');});
t('M42 treats integrity as signal not proof',()=>{const c={window:{}};vm.createContext(c);vm.runInContext(fs.readFileSync(specs[42][0],'utf8'),c);const s=c.window.BAAAntiCheating.startSession();c.window.BAAAntiCheating.recordVisibility(s,true);assert.equal(c.window.BAAAntiCheating.risk(s).level,'normal');});
t('M43 does not fabricate records',()=>{const c={window:{}};vm.createContext(c);vm.runInContext(fs.readFileSync(specs[43][0],'utf8'),c);assert.deepEqual(c.window.BAAScholarships.filter(null,{}).results,[]);});
t('M44 computes skill gaps',()=>{const c={window:{}};vm.createContext(c);vm.runInContext(fs.readFileSync(specs[44][0],'utf8'),c);const p=c.window.BAACareerPrep.profile({skills:['HTML','CSS']}).profile;assert.deepEqual(c.window.BAACareerPrep.gap(p,['HTML','JS']).missing,['JS']);});
t('M45 rejects malformed mentor',()=>{const c={window:{}};vm.createContext(c);vm.runInContext(fs.readFileSync(specs[45][0],'utf8'),c);assert.equal(c.window.BAAMentors.validate({name:'A'}).error,'INVALID_MENTOR_SUBJECTS');});
t('M46 validates vendor-neutral ERP payload',()=>{const c={window:{}};vm.createContext(c);vm.runInContext(fs.readFileSync(specs[46][0],'utf8'),c);assert.equal(c.window.BAAERP.buildPayload('bad',{}).error,'INVALID_ERP_DATA_TYPE');});
t('M47 reports insufficient evidence for empty institution data',()=>{const c={window:{}};vm.createContext(c);vm.runInContext(fs.readFileSync(specs[47][0],'utf8'),c);assert.equal(c.window.BAAInstitution.summarize([]).evidenceQuality,'insufficient_evidence');});
t('M48 prevents duplicate participant',()=>{const c={window:{}};vm.createContext(c);vm.runInContext(fs.readFileSync(specs[48][0],'utf8'),c);let p=c.window.BAAGlobalCollab.validateProject({title:'x',region:'IN'}).project;c.window.BAAGlobalCollab.join(p,{id:'1'});assert.equal(c.window.BAAGlobalCollab.join(p,{id:'1'}).error,'ALREADY_JOINED');});
t('M49 rejects invalid plan length',()=>{const c={window:{}};vm.createContext(c);vm.runInContext(fs.readFileSync(specs[49][0],'utf8'),c);assert.equal(c.window.BAAOlympiad.buildPlan(['Algebra'],0).error,'INVALID_PLAN_DAYS');});
t('M50 rejects unsafe plugin entry/permission',()=>{const c={window:{}};vm.createContext(c);vm.runInContext(fs.readFileSync(specs[50][0],'utf8'),c);assert.equal(c.window.BAAPlugins.validateManifest({id:'x',permissions:['write_admin'],entry:'https://x'}).error,'INVALID_PLUGIN_PERMISSION');assert.equal(c.window.BAAPlugins.validateManifest({id:'x',permissions:[],entry:'javascript:x'}).error,'INVALID_PLUGIN_ENTRY');});
const ui=fs.readFileSync('student-os.html','utf8');
t('M41-M50 scripts integrated',()=>Object.values(specs).forEach(([f])=>assert.ok(ui.includes(f.replace('js/','')))));
console.log(`\nM41–M50 focused: ${n}/21 PASS`);if(process.exitCode)process.exit(process.exitCode);
