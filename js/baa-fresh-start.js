// BAA M55 — Student Data Trust & Fresh-Start Controls.
// Local reset remains previewable; authenticated server deletion is explicit
// and permanent and therefore requires a second confirmation at the API.
(function(global){
'use strict';
function plan(keys){if(!Array.isArray(keys))return {ok:false,error:'INVALID_RESET_KEYS'};return {ok:true,error:null,keys:keys.filter(k=>typeof k==='string').sort(),confirmationRequired:true};}
function apply(keys,confirm){if(confirm!==true)return {ok:false,error:'RESET_CONFIRMATION_REQUIRED'};if(!Array.isArray(keys))return {ok:false,error:'INVALID_RESET_KEYS'};try{keys.forEach(k=>{if(typeof k==='string')localStorage.removeItem(k);});return {ok:true,error:null,removedCount:keys.length};}catch(_){return {ok:false,error:'RESET_FAILED'};}}
const JSON_HEADERS={Accept:'application/json'};
const MAX_SERVER_RESPONSE_BYTES=1024*1024;
async function readServerJson(response){
  const declared=Number(response?.headers?.get?.('content-length')||0);
  if(Number.isFinite(declared)&&declared>MAX_SERVER_RESPONSE_BYTES)throw new Error('FRESH_START_RESPONSE_TOO_LARGE');
  if(!response?.body?.getReader){
    const text=await response.text();
    if(new TextEncoder().encode(text).byteLength>MAX_SERVER_RESPONSE_BYTES)throw new Error('FRESH_START_RESPONSE_TOO_LARGE');
    return JSON.parse(text);
  }
  const reader=response.body.getReader(); const decoder=new TextDecoder(); let bytes=0; let text='';
  try{
    while(true){
      const chunk=await reader.read(); if(chunk.done)break;
      bytes+=chunk.value.byteLength;
      if(bytes>MAX_SERVER_RESPONSE_BYTES){try{await reader.cancel();}catch(_){} throw new Error('FRESH_START_RESPONSE_TOO_LARGE');}
      text+=decoder.decode(chunk.value,{stream:true});
    }
    text+=decoder.decode(); return JSON.parse(text);
  }finally{try{reader.releaseLock();}catch(_) {}}
}
async function serverStatus(learnerId){
  const url=learnerId?`/api/m55-data-trust.js?learnerId=${encodeURIComponent(learnerId)}`:'/api/m55-data-trust.js';
  const response=await fetch(url,{credentials:'include',cache:'no-store',headers:JSON_HEADERS});
  let data={};
  try{data=await readServerJson(response);}catch(error){
    if(error?.message==='FRESH_START_RESPONSE_TOO_LARGE')throw Object.assign(new Error('Server response is too large.'),{code:error.message,status:502});
    data={ok:false,error:{code:'INVALID_RESPONSE',message:'Invalid server response.'}};
  }
  if(!response.ok)throw Object.assign(new Error(data?.error?.message||'Unable to load server deletion status.'),{code:data?.error?.code,status:response.status,data});
  return data;
}
async function deleteServerData(learnerId,confirm){
  const response=await fetch('/api/m55-data-trust.js',{method:'POST',credentials:'include',cache:'no-store',headers:{'Content-Type':'application/json',...JSON_HEADERS},body:JSON.stringify({action:'delete',learnerId:learnerId||undefined,confirm:confirm===true})});
  let data={};
  try{data=await readServerJson(response);}catch(error){
    if(error?.message==='FRESH_START_RESPONSE_TOO_LARGE')throw Object.assign(new Error('Server response is too large.'),{code:error.message,status:502});
    data={ok:false,error:{code:'INVALID_RESPONSE',message:'Invalid server response.'}};
  }
  if(!response.ok)throw Object.assign(new Error(data?.error?.message||'Unable to delete server data.'),{code:data?.error?.code,status:response.status,data});
  return data;
}
global.BAAFreshStart={plan,apply,serverStatus,deleteServerData};
})(window);
