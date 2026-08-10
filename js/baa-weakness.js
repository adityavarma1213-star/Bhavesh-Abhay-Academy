/* BAA Module 22 — AI Weakness Detection. Repeated evidence patterns only; no diagnosis. */
(function(global){
'use strict';
function getWeaknesses(){
 const a=global.BAAAssessment;if(!a)return [];
 const m=Object.values(a.getLearningMemory());
 return m.filter(x=>x.status==='needs_revision'||x.status==='struggling')
   .sort((a,b)=>{const ar=a.evidenceCount?a.correctCount/a.evidenceCount:1;const br=b.evidenceCount?b.correctCount/b.evidenceCount:1;return ar-br;})
   .map(x=>({concept:x.concept,subject:x.subject,evidenceCount:x.evidenceCount,correctCount:x.correctCount,status:x.status,reason:`Recent evidence is below the mastery threshold (${x.correctCount}/${x.evidenceCount} correct).`}));
}
global.BAAWeakness={getWeaknesses};
})(window);
