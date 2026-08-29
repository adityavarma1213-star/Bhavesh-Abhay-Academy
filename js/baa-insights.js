/* BAA M36 — AI Insights Dashboard.
   Computes a transparent summary from existing BAA evidence; no invented
   academic score is generated. Missing data is reported as insufficient evidence. */
(function(global){
'use strict';
function number(x){return Number.isFinite(Number(x))?Number(x):0;}
function build(){
 let assessment=global.BAAAssessment&&typeof global.BAAAssessment._load==='function'?global.BAAAssessment._load():null;
 let rewards=global.BAARewards&&typeof global.BAARewards.getState==='function'?global.BAARewards.getState():null;
 let paths=global.BAALearningPaths&&typeof global.BAALearningPaths.getCurrentPath==='function'?global.BAALearningPaths.getCurrentPath(null,12):null;
 const attempts=assessment&&Array.isArray(assessment.attempts)?assessment.attempts:[],evidence=assessment&&Array.isArray(assessment.evidence)?assessment.evidence:[];
 const completed=attempts.filter(a=>a&&a.status==='submitted').length,correct=evidence.filter(e=>e&&e.correctness==='correct').length;
 const accuracy=evidence.length?Number((correct/evidence.length*100).toFixed(1)):null;
 const weak=paths&&paths.nodes?paths.nodes.filter(n=>['needs_revision','struggling'].includes(n.state)).length:null;
 const strong=paths&&paths.nodes?paths.nodes.filter(n=>['mastered','strong'].includes(n.state)).length:null;
 return {ok:true,error:null,metrics:{completedAssessments:completed,answeredQuestions:evidence.length,accuracyPercent:accuracy,weakConceptCount:weak,strongConceptCount:strong,xp:rewards&&rewards.xp!=null?number(rewards.xp):null},evidenceQuality:evidence.length?'measured':'insufficient_evidence'};
}
async function load(learnerId){
 const id=String(learnerId||'').trim();
 if(!id)throw new Error('learnerId is required.');
 const response=await fetch('/api/m36-insights?learnerId='+encodeURIComponent(id),{
   credentials:'include',
   cache:'no-store',
   headers:{Accept:'application/json'}
 });
 const body=await response.json().catch(()=>({}));
 if(!response.ok)throw Object.assign(new Error(body?.error?.message||'Unable to load insights.'),{status:response.status,code:body?.error?.code});
 return body;
}
global.BAAInsights={build,load};
})(window);
