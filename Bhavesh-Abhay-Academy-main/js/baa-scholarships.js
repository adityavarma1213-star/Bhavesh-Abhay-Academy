/* BAA M43 — AI Scholarship Finder.
   Ranks only records returned by the authenticated BAA scholarship service.
   It never invents a scholarship, deadline, amount, or eligibility fact. */
(function(global){
'use strict';
const MAX_RESPONSE_BYTES=1024*1024;
async function readJson(response){
  const declared=Number(response?.headers?.get?.('content-length'));
  if(Number.isFinite(declared)&&declared>MAX_RESPONSE_BYTES){try{response.body?.cancel?.();}catch(_){}throw new Error('SCHOLARSHIP_RESPONSE_TOO_LARGE');}
  try{
    if(response?.body&&typeof response.body.getReader==='function'){
      const reader=response.body.getReader(); const chunks=[]; let total=0;
      while(true){const part=await reader.read();if(part.done)break;const size=part.value?.byteLength||0;total+=size;if(total>MAX_RESPONSE_BYTES){try{await reader.cancel();}catch(_){}throw new Error('SCHOLARSHIP_RESPONSE_TOO_LARGE');}chunks.push(part.value);}
      const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
      return JSON.parse(new TextDecoder().decode(bytes));
    }
    const text=await response.text();
    if(new TextEncoder().encode(text).byteLength>MAX_RESPONSE_BYTES)throw new Error('SCHOLARSHIP_RESPONSE_TOO_LARGE');
    return JSON.parse(text);
  }catch(error){
    if(error?.message==='SCHOLARSHIP_RESPONSE_TOO_LARGE')throw error;
    throw new Error('SCHOLARSHIP_INVALID_RESPONSE');
  }
}
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
    let payload;
    try{payload=await readJson(response);}catch(e){return {ok:false,error:e?.message||'SCHOLARSHIP_INVALID_RESPONSE',results:[]};}
    if(!response.ok)return {ok:false,error:payload?.error?.code||'SCHOLARSHIP_REQUEST_FAILED',results:[]};
    return {ok:true,error:null,results:Array.isArray(payload?.results)?payload.results:[]};
  }catch(e){
    return {ok:false,error:e?.message==='SCHOLARSHIP_RESPONSE_TOO_LARGE'?'SCHOLARSHIP_RESPONSE_TOO_LARGE':'SCHOLARSHIP_REQUEST_FAILED',results:[]};
  }
}
global.BAAScholarships={filter,rank,fetchServer};
})(window);
