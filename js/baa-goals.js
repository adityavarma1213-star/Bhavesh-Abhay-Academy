/* BAA Module 25 — AI Goal Tracker. Reuses the real Planner goal store and adds evidence-linked progress. */
(function(global){
'use strict';
function getGoals(){
 const planner=global.BAAPlanner;if(!planner)return [];
 const goals=planner.getGoals();
 const summary=global.BAAIntelligence&&global.BAAIntelligence.getLearningSummary?global.BAAIntelligence.getLearningSummary():null;
 return goals.map(g=>({...g,relatedConcepts:summary?[...summary.struggling,...summary.needsRevision,...summary.learning].filter(c=>g.text.toLowerCase().includes(c.conceptLabel.split(' ')[0].toLowerCase())).map(c=>c.concept):[]}));
}
global.BAAGoals={getGoals};
})(window);
