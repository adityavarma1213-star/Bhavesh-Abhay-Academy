#!/usr/bin/env node
'use strict';

const fs=require('fs');
const vm=require('vm');
const path=require('path');

const source=fs.readFileSync(path.join(__dirname,'..','js','baa-career.js'),'utf8');
const context={
  console,
  window:null,
  BAAAssessment:{
    getAcademicProfile(){
      return {
        strengths:[{id:'ev-1',concept:'coding'}],
        weaknesses:[{id:'ev-2',concept:'logic'}]
      };
    }
  }
};
context.window=context;
vm.createContext(context);
vm.runInContext(source,context,{filename:'baa-career.js'});
const plan=context.BAACareer.getPlan('Software Development');
if(!plan||plan.track!=='Software Development') throw new Error('M20 career plan was not created');
if(!Array.isArray(plan.skills)||plan.skills.length!==5) throw new Error('M20 career skill mapping is incomplete');
if(!plan.methodology||!Array.isArray(plan.limitations)) throw new Error('M20 explainability metadata is missing');
const coding=plan.skills.find(x=>x.skill==='coding');
const logic=plan.skills.find(x=>x.skill==='logic');
if(coding?.status!=='strength_evidence'||coding.evidenceCount<1) throw new Error('M20 strength evidence was not surfaced');
if(logic?.status!=='support_needed'||logic.evidenceCount<1) throw new Error('M20 support-needed evidence was not surfaced');
console.log('M20 career explainability gate: PASS');
