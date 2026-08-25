#!/usr/bin/env node
const fs=require('fs'),assert=require('assert'),vm=require('vm');
const c={window:{BAAAssessment:{_load:()=>({attempts:[{status:'submitted'}],evidence:[{correctness:'correct'}]} )},BAARewards:{getState:()=>({xp:10})},BAALearningPaths:{getCurrentPath:()=>({nodes:[{state:'struggling'}]})},fetch:async()=>({ok:true,json:async()=>({ok:true})})}};
vm.createContext(c);vm.runInContext(fs.readFileSync('js/baa-insights.js','utf8'),c);
const api=c.window.BAAInsights;assert.equal(api.build().metrics.completedAssessments,1);assert.equal(api.build().metrics.accuracyPercent,100);assert.equal(typeof api.load,'function');
const endpoint=fs.readFileSync('api/m36-insights.js','utf8');assert(endpoint.includes('requireLearnerAccess'));assert(endpoint.includes('learning_evidence'));assert(endpoint.includes('INSIGHTS_VIEW'));
console.log('M36 PASS — local metrics, server evidence API contract, ownership guard');
