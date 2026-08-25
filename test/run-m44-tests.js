#!/usr/bin/env node
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const c={window:{localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{},key:()=>null,length:0},fetch:async()=>({ok:true,json:async()=>({ok:true})})}};
vm.createContext(c);
vm.runInContext(fs.readFileSync('js/baa-career-prep.js','utf8'),c);
const api=c.window.BAACareerPrep;
assert.ok(api);
assert.deepEqual(api.gap({skills:['HTML']},['HTML','JS']).missing,['JS']);
assert.equal(api.readiness({skills:['HTML'],projects:[{title:'site',evidenceIds:['e1']}]},['HTML']).summary.readinessLabel,'Prepared to review');
assert.equal(api.profile({goal:'AI',skills:['Python'],projects:[]}).profile.goal,'AI');
assert.equal(typeof api.load,'function');
assert.equal(typeof api.save,'function');
const endpoint=fs.readFileSync('api/m44-career-prep.js','utf8');
assert(endpoint.includes('requireLearnerAccess'));
assert(endpoint.includes('CAREER_PREP_PROFILE_UPSERT'));
const migration=fs.readFileSync('db/migrations/022_m44_career_prep.sql','utf8');
assert(migration.includes('career_prep_profiles'));
console.log('M44 PASS — profile, readiness, server API contract, persistence migration');
