/* BAA M43 — AI Scholarship Finder.
   Local filtering remains deterministic; server methods read only published
   records and never invent scholarship facts. */
(function(global){
'use strict';
function filter(records,criteria){if(!Array.isArray(records))return {ok:false,error:'INVALID_SCHOLARSHIP_DATA',results:[]};criteria=criteria&&typeof criteria==='object'?criteria:{};const results=records.filter(r=>r&&(!criteria.country||r.country===criteria.country)&&(!criteria.level||r.level===criteria.level)&&(!criteria.field||Array.isArray(r.fields)&&r.fields.includes(criteria.field)));return {ok:true,error:null,results};}
function rank(records){if(!Array.isArray(records))return {ok:false,error:'INVALID_SCHOLARSHIP_DATA',results:[]};return {ok:true,error:null,results:records.slice().sort((a,b)=>Number(b.matchScore||0)-Number(a.matchScore||0))};}
async function fetchPublished(criteria={}){
  const q=new URLSearchParams(); for(const k of ['country','level','field']) if(criteria[k]) q.set(k,String(criteria[k]));
  const r=await fetch('/api/m43-scholarships'+(q.toString()?'?'+q:'')).catch(()=>null);
  if(!r) return {ok:false,error:'SCHOLARSHIP_SERVER_UNAVAILABLE',results:[]};
  const body=await r.json().catch(()=>({}));
  if(!r.ok||!body.ok) return {ok:false,error:body?.error?.code||'SCHOLARSHIP_SERVER_ERROR',results:[]};
  return {ok:true,error:null,results:Array.isArray(body.results)?body.results:[]};
}
global.BAAScholarships={filter,rank,fetchPublished};
})(window);
