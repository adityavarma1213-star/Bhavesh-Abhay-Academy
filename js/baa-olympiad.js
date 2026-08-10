/* BAA M49 — Olympiad & Competition Center.
   Creates deterministic practice plans from supplied topics and difficulty.
   It does not claim current contest dates or eligibility without verified data. */
(function(global){
'use strict';
function buildPlan(topics,days){if(!Array.isArray(topics)||!topics.length)return {ok:false,error:'NO_TOPICS'};if(!Number.isInteger(days)||days<1||days>365)return {ok:false,error:'INVALID_PLAN_DAYS'};const plan=[];for(let d=0;d<days;d++)plan.push({day:d+1,topic:topics[d%topics.length],focus:d%3===0?'concept':d%3===1?'practice':'review'});return {ok:true,error:null,plan};}
global.BAAOlympiad={buildPlan};
})(window);
