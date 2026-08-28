/* BAA M43 — AI Scholarship Finder.
   Ranks only records returned by the authenticated BAA scholarship service.
   It never invents a scholarship, deadline, amount, or eligibility fact. */
(function(global){
'use strict';
function filter(records,criteria){
  if(!Array.isArray(records))return {ok:false,error:'INVALID_SCHOLARSHIP_DATA',results:[]};
  criteria=criteria&&typeof criteria==='object'?criteria:{};
  const results=records.filter(r=>r&&(!criteria.country||r.country===criteria.country)&&(!criteria.level||r.level===criteria.level)&&(!criteria.field||Array.isArray(r.fields)&&r.fields.includes(criteria.field)));
  return {ok:true,error:null,results};
}
function rank(records){
  if(!Array.isArray(records))return {ok:false,error:'INVALID_SCHOLARSHIP_DATA',results:[]};
  return {ok:true,error:null,results:records.slice().sort((a,b)=>Number(b.matchScore||0)-Number(a.matchScore||0))};
}
async function fetchServer(criteria){
  criteria=criteria&&typeof criteria==='object'?criteria:{};
  const params=new URLSearchParams();
  ['country','level','field'].forEach(k=>{if(criteria[k])params.set(k,String(criteria[k]).slice(0,80));});
  try{
    const response=await fetch('/api/m43-scholarships?'+params.toString(),{
      method:'GET',
      credentials:'include',
      cache:'no-store',
      headers:{Accept:'application/json'}
    });
    const payload=await response.json().catch(()=>null);
    if(!response.ok)return {ok:false,error:payload?.error?.code||'SCHOLARSHIP_REQUEST_FAILED',results:[]};
    return {ok:true,error:null,results:Array.isArray(payload?.results)?payload.results:[]};
  }catch(e){
    return {ok:false,error:'SCHOLARSHIP_REQUEST_FAILED',results:[]};
  }
}
global.BAAScholarships={filter,rank,fetchServer};
})(window);
