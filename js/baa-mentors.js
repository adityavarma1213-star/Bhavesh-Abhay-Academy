/* BAA M45 — Mentor Marketplace.
   Search reads only verified + safeguarded profiles. Requests are server-
   authorized. Identity verification, payments and safeguarding remain real
   operational gates and are never fabricated. */
(function(global){
'use strict';
function validate(m){if(!m||typeof m!=='object'||typeof m.name!=='string'||!m.name.trim())return {ok:false,error:'INVALID_MENTOR'};if(!Array.isArray(m.subjects))return {ok:false,error:'INVALID_MENTOR_SUBJECTS'};return {ok:true,error:null,mentor:{name:m.name.trim(),subjects:m.subjects.filter(x=>typeof x==='string'),verified:!!m.verified}};}
function search(mentors,subject){if(!Array.isArray(mentors))return {ok:false,error:'INVALID_MENTOR_LIST',results:[]};return {ok:true,error:null,results:mentors.filter(m=>m&&(!subject||Array.isArray(m.subjects)&&m.subjects.includes(subject))) };}
async function fetchVerified(subject){
  const q=subject?'?subject='+encodeURIComponent(subject):'';
  const r=await fetch('/api/m45-mentors'+q).catch(()=>null);
  if(!r) return {ok:false,error:'MENTOR_SERVER_UNAVAILABLE',results:[]};
  const body=await r.json().catch(()=>({}));
  if(!r.ok||!body.ok) return {ok:false,error:body?.error?.code||'MENTOR_SERVER_ERROR',results:[]};
  return {ok:true,error:null,results:Array.isArray(body.results)?body.results:[]};
}
async function requestMentor(mentorId,learnerId,details={}){
  const r=await fetch('/api/m45-mentors',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mentorId,learnerId,requestedStart:details.requestedStart||null,notes:details.notes||''})}).catch(()=>null);
  if(!r) return {ok:false,error:'MENTOR_SERVER_UNAVAILABLE'};
  const body=await r.json().catch(()=>({}));
  return r.ok&&body.ok?body:{ok:false,error:body?.error?.code||'MENTOR_REQUEST_FAILED'};
}
global.BAAMentors={validate,search,fetchVerified,requestMentor};
})(window);
