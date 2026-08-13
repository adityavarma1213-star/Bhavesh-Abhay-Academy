/* BAA Module 21 — Personalized Practice Engine. Evidence-driven question selection from the real bank. */
(function(global){
'use strict';
function getPracticeSet(limit=5){
 const a=global.BAAAssessment,b=global.BAAQuestionBank;
 if(!a||!Array.isArray(b))return [];
 const memory=Object.values(a.getLearningMemory());
 const weak=memory.filter(x=>x.status==='needs_revision'||x.status==='learning').sort((x,y)=>x.correctCount/x.evidenceCount-y.correctCount/y.evidenceCount);
 const used=new Set(),out=[];
 for(const m of weak){
   const q=b.find(x=>x.concept===m.concept&&!used.has(x.id));
   if(q){out.push(q);used.add(q.id);}
   if(out.length>=limit)break;
 }
 if(out.length<limit)b.forEach(q=>{if(out.length<limit&&!used.has(q.id)){out.push(q);used.add(q.id);}});
 return out;
}
global.BAAPractice={getPracticeSet};
})(window);
