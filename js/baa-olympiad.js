/* BAA M49 — Olympiad & Competition Center.
   Practice plans remain deterministic. Live contest data comes only from the
   authenticated server adapter and is never fabricated in the browser. */
(function(global){
'use strict';
function buildPlan(topics,days){if(!Array.isArray(topics)||!topics.length)return {ok:false,error:'NO_TOPICS'};if(!Number.isInteger(days)||days<1||days>365)return {ok:false,error:'INVALID_PLAN_DAYS'};const plan=[];for(let d=0;d<days;d++)plan.push({day:d+1,topic:topics[d%topics.length],focus:d%3===0?'concept':d%3===1?'practice':'review'});return {ok:true,error:null,plan};}
async function searchCompetitions(filters={}){
  const params=new URLSearchParams();
  ['country','level','category'].forEach(key=>{const value=String(filters[key]||'').trim();if(value)params.set(key,value.slice(0,80));});
  const response=await fetch(`/api/m49-competitions${params.toString()?`?${params}`:''}`,{method:'GET',credentials:'include',headers:{Accept:'application/json'}});
  let body=null;try{body=await response.json();}catch(_){body=null;}
  if(!response.ok)return {ok:false,live:false,results:[],error:body?.error?.code||'COMPETITION_SEARCH_FAILED',message:body?.error?.message||'Unable to load competition data.'};
  return {ok:true,live:Boolean(body?.live),providerConfigured:Boolean(body?.providerConfigured),results:Array.isArray(body?.results)?body.results:[],message:body?.message||null};
}
global.BAAOlympiad={buildPlan,searchCompetitions};
})(window);
