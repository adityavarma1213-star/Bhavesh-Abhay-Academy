/* BAA Module 25 — AI Goal Tracker. Reuses the real Planner goal store and adds evidence-linked progress. */
(function(global){
'use strict';
let serverSnapshot=null;
function getGoals(){
 const planner=global.BAAPlanner;if(!planner)return [];
 const goals=planner.getGoals();
 const summary=global.BAAIntelligence&&global.BAAIntelligence.getLearningSummary?global.BAAIntelligence.getLearningSummary():null;
 return goals.map(g=>({...g,relatedConcepts:summary?[...summary.struggling,...summary.needsRevision,...summary.learning].filter(c=>g.text.toLowerCase().includes(c.conceptLabel.split(' ')[0].toLowerCase())).map(c=>c.concept):[]}));
}
async function loadServerGoals(learnerId){
 const id=String(learnerId||global.BAA_LEARNER_ID||'').trim();
 if(!id) return {ok:false,error:{code:'LEARNER_ID_REQUIRED'}};
 const response=await fetch(`/api/m25-goal-tracker?learnerId=${encodeURIComponent(id)}`,{credentials:'include',headers:{Accept:'application/json'}});
 const payload=await response.json().catch(()=>({}));
 if(!response.ok) throw new Error(payload?.error?.message||'Unable to load server goal progress.');
 serverSnapshot=payload;
 try{global.dispatchEvent(new CustomEvent('baa:goals-server-updated',{detail:payload}));}catch(_){ }
 return payload;
}
function getServerGoals(){return serverSnapshot?.goals||[];}
global.BAAGoals={getGoals,loadServerGoals,getServerGoals};
})(window);
