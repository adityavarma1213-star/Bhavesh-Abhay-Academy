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
function competitionSummary(results){
  const rows=Array.isArray(results)?results:[];
  const byCategory={};
  const byLevel={};
  rows.forEach(item=>{
    const category=String(item?.category||'Uncategorised').trim()||'Uncategorised';
    const level=String(item?.level||'Unspecified').trim()||'Unspecified';
    byCategory[category]=(byCategory[category]||0)+1;
    byLevel[level]=(byLevel[level]||0)+1;
  });
  return {count:rows.length,byCategory,byLevel,hasLiveData:rows.length>0};
}
function validateCompetition(item){
  if(!item||typeof item!=='object')return {ok:false,error:'INVALID_COMPETITION'};
  const name=String(item.name||'').trim();
  const url=String(item.url||'').trim();
  if(!name)return {ok:false,error:'MISSING_COMPETITION_NAME'};
  if(!/^https:\/\//i.test(url))return {ok:false,error:'INVALID_COMPETITION_URL'};
  return {ok:true,error:null,competition:{id:String(item.id||'').trim(),name:name.slice(0,240),provider:String(item.provider||'').trim().slice(0,160),category:String(item.category||'').trim().slice(0,120),level:String(item.level||'').trim().slice(0,120),url}};
}
global.BAAOlympiad={buildPlan,searchCompetitions,competitionSummary,validateCompetition};
})(window);
