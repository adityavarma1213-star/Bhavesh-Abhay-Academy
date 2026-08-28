// BAA M55 — Student Data Trust & Fresh-Start Controls.
// Local reset remains previewable; authenticated server deletion is explicit
// and permanent and therefore requires a second confirmation at the API.
(function(global){
'use strict';
function plan(keys){if(!Array.isArray(keys))return {ok:false,error:'INVALID_RESET_KEYS'};return {ok:true,error:null,keys:keys.filter(k=>typeof k==='string').sort(),confirmationRequired:true};}
function apply(keys,confirm){if(confirm!==true)return {ok:false,error:'RESET_CONFIRMATION_REQUIRED'};if(!Array.isArray(keys))return {ok:false,error:'INVALID_RESET_KEYS'};try{keys.forEach(k=>{if(typeof k==='string')localStorage.removeItem(k);});return {ok:true,error:null,removedCount:keys.length};}catch(_){return {ok:false,error:'RESET_FAILED'};}}
const JSON_HEADERS={Accept:'application/json'};
async function serverStatus(learnerId){
  const url=learnerId?`/api/m55-data-trust.js?learnerId=${encodeURIComponent(learnerId)}`:'/api/m55-data-trust.js';
  const response=await fetch(url,{credentials:'include',cache:'no-store',headers:JSON_HEADERS});
  const data=await response.json().catch(()=>({ok:false,error:{code:'INVALID_RESPONSE',message:'Invalid server response.'}}));
  if(!response.ok)throw Object.assign(new Error(data?.error?.message||'Unable to load server deletion status.'),{code:data?.error?.code,status:response.status,data});
  return data;
}
async function deleteServerData(learnerId,confirm){
  const response=await fetch('/api/m55-data-trust.js',{method:'POST',credentials:'include',cache:'no-store',headers:{'Content-Type':'application/json',...JSON_HEADERS},body:JSON.stringify({action:'delete',learnerId:learnerId||undefined,confirm:confirm===true})});
  const data=await response.json().catch(()=>({ok:false,error:{code:'INVALID_RESPONSE',message:'Invalid server response.'}}));
  if(!response.ok)throw Object.assign(new Error(data?.error?.message||'Unable to delete server data.'),{code:data?.error?.code,status:response.status,data});
  return data;
}
global.BAAFreshStart={plan,apply,serverStatus,deleteServerData};
})(window);
