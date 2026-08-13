/* BAA Module 24 — AI Revision Engine. Evidence-based spaced-review schedule, not a claim of validated medical/scientific timing. */
(function(global){
'use strict';
const INTERVALS=[1,3,7,14,30];
function getRevisionPlan(){
 const a=global.BAAAssessment;if(!a)return [];
 const memory=Object.values(a.getLearningMemory());
 const now=Date.now();
 return memory.map(m=>{
   const last=Date.parse(m.lastUpdated||'');
   const days=Number.isFinite(last)?Math.max(0,Math.floor((now-last)/86400000)):0;
   const idx=m.status==='needs_revision'||m.status==='struggling'?0:m.status==='learning'?1:Math.min(4,Math.floor(m.evidenceCount/3));
   const interval=INTERVALS[idx];
   return {concept:m.concept,subject:m.subject,status:m.status,evidenceCount:m.evidenceCount,reviewIntervalDays:interval,due:days>=interval,reason:`Review interval selected from current evidence state "${m.status}".`};
 });
}
global.BAARevision={getRevisionPlan};
})(window);
