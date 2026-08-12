/* BAA Module 23 — AI Strength Recognition. Evidence-backed strengths only. */
(function(global){
'use strict';
function getStrengths(){
 const a=global.BAAAssessment;if(!a)return [];
 return Object.values(a.getLearningMemory())
   .filter(x=>x.status==='mastered'||x.status==='strong')
   .sort((a,b)=>b.correctCount-b.correctCount||b.evidenceCount-a.evidenceCount)
   .map(x=>({concept:x.concept,subject:x.subject,evidenceCount:x.evidenceCount,correctCount:x.correctCount,status:x.status,reason:`Evidence shows ${x.correctCount}/${x.evidenceCount} correct.`}));
}
global.BAAStrength={getStrengths};
})(window);
