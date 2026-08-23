#!/usr/bin/env node
const fs=require('fs'),assert=require('assert'),vm=require('vm');
function load(path,apiName){
  const context={window:{},fetch:async()=>({ok:true,json:async()=>({ok:true,results:[],connections:[]})})};
  vm.createContext(context); vm.runInContext(fs.readFileSync(path,'utf8'),context); assert.ok(context.window[apiName],path+' must expose '+apiName); return context.window[apiName];
}
const scholarships=load('js/baa-scholarships.js','BAAScholarships');
assert.equal(scholarships.filter([{country:'IN'}],{country:'IN'}).results.length,1);
assert.equal(typeof scholarships.fetchPublished,'function');
const mentors=load('js/baa-mentors.js','BAAMentors');
assert.equal(mentors.search([{subjects:['Math']}],'Math').results.length,1);
assert.equal(typeof mentors.fetchVerified,'function'); assert.equal(typeof mentors.requestMentor,'function');
const erp=load('js/baa-erp.js','BAAERP');
assert.equal(erp.validateConfig({provider:'Test',scopes:['students']}).ok,true);
assert.equal(typeof erp.listConnections,'function'); assert.equal(typeof erp.configure,'function'); assert.equal(typeof erp.queueSync,'function');
console.log('EXTERNAL MODULE CONTRACTS PASS');
