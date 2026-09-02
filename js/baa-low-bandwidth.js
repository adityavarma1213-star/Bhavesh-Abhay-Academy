/* BAA M41 — Smart Low-Bandwidth Learning.
   Persists explicit data-saver preferences locally and on the authenticated
   server. Preference writes queue while offline and use optimistic concurrency
   when they reconnect. This does not claim offline content synchronization.
*/
(function(global){
'use strict';
const KEY='baa_low_bandwidth_v1';
const META='baa_low_bandwidth_server_v1';
const QUEUE='baa_low_bandwidth_pending_v1';
const MODES=['auto','text','audio','lite'];
const MAX_RESPONSE_BYTES=1024*1024;
function defaults(){return {schemaVersion:1,enabled:false,contentMode:'auto'};}
function readJson(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'null')||fallback;}catch(_){return fallback;}}
function get(){const x=readJson(KEY,null);return x&&x.schemaVersion===1?x:defaults();}
function set(enabled,contentMode){
  if(typeof enabled!=='boolean'||!MODES.includes(contentMode))return {ok:false,error:'INVALID_LOW_BANDWIDTH_MODE'};
  const s={schemaVersion:1,enabled,contentMode};
  try{localStorage.setItem(KEY,JSON.stringify(s));return {ok:true,error:null,state:s};}
  catch(_){return {ok:false,error:'LOW_BANDWIDTH_STORAGE_FAILED'};}
}
function serverMeta(){const x=readJson(META,{});return x&&typeof x==='object'?x:{};}
function saveServerMeta(preference,updatedAt){try{localStorage.setItem(META,JSON.stringify({schemaVersion:1,preference,updatedAt:updatedAt||null}));}catch(_){} }
function pending(){const x=readJson(QUEUE,null);return x&&x.preference?x:null;}
function queue(preference,learnerId,expectedUpdatedAt){try{localStorage.setItem(QUEUE,JSON.stringify({schemaVersion:1,learnerId,preference,expectedUpdatedAt:expectedUpdatedAt||null,queuedAt:new Date().toISOString()}));return true;}catch(_){return false;}}
function clearQueue(){try{localStorage.removeItem(QUEUE);}catch(_){} }
function authOptions(method){return {method,credentials:'include',cache:'no-store',headers:{'Accept':'application/json','Content-Type':'application/json'}};}
async function readJsonResponse(response,errorCode){
  const declared=Number(response?.headers?.get?.('content-length')||0);
  if(Number.isFinite(declared)&&declared>MAX_RESPONSE_BYTES){try{response.body?.cancel?.();}catch(_){}return {ok:false,error:errorCode+'_TOO_LARGE'};}
  if(!response?.body||typeof response.body.getReader!=='function'){
    try{
      const text=await response.text();
      if(new TextEncoder().encode(text).byteLength>MAX_RESPONSE_BYTES)return {ok:false,error:errorCode+'_TOO_LARGE'};
      return {ok:true,data:JSON.parse(text)};
    }catch(_){return {ok:false,error:errorCode+'_INVALID_RESPONSE'};}
  }
  const reader=response.body.getReader();const chunks=[];let total=0;
  try{
    while(true){
      const part=await reader.read();
      if(part.done)break;
      total+=part.value?.byteLength||0;
      if(total>MAX_RESPONSE_BYTES){try{await reader.cancel();}catch(_e){}return {ok:false,error:errorCode+'_TOO_LARGE'};}
      chunks.push(part.value);
    }
  }catch(_){try{await reader.cancel();}catch(_e){}return {ok:false,error:errorCode+'_INVALID_RESPONSE'};}
  const bytes=new Uint8Array(total);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try{return {ok:true,data:JSON.parse(new TextDecoder().decode(bytes))};}
  catch(_){return {ok:false,error:errorCode+'_INVALID_RESPONSE'};}
}
async function getServer(learnerId){
  const id=String(learnerId||'').trim();
  if(!id)return {ok:false,error:'LEARNER_ID_REQUIRED'};
  try{
    const r=await fetch('/api/m41-low-bandwidth?learnerId='+encodeURIComponent(id),authOptions('GET'));
    const parsed=await readJsonResponse(r,'LOW_BANDWIDTH_RESPONSE');
    if(!parsed.ok)return {ok:false,error:parsed.error};
    const data=parsed.data;
    if(!r.ok||!data?.ok)return {ok:false,error:data?.error?.code||'LOW_BANDWIDTH_LOAD_FAILED'};
    if(data.preference){set(data.preference.enabled,data.preference.contentMode);saveServerMeta(data.preference,data.updatedAt||null);}
    const p=pending();
    if(p&&p.learnerId===id)return syncPending(id);
    return {ok:true,preference:data.preference,updatedAt:data.updatedAt||null};
  }catch(_){return {ok:false,error:'LOW_BANDWIDTH_LOAD_FAILED'};}
}
async function putServer(id,preference,expectedUpdatedAt){
  const opts=authOptions('PUT');
  opts.body=JSON.stringify({enabled:preference.enabled,contentMode:preference.contentMode,expectedUpdatedAt:expectedUpdatedAt||undefined});
  const r=await fetch('/api/m41-low-bandwidth?learnerId='+encodeURIComponent(id),opts);
  const parsed=await readJsonResponse(r,'LOW_BANDWIDTH_RESPONSE');
  if(!parsed.ok)return {ok:false,error:parsed.error,data:null};
  const data=parsed.data;
  if(!r.ok||!data?.ok)return {ok:false,error:data?.error?.code||'LOW_BANDWIDTH_SAVE_FAILED',data};
  saveServerMeta(data.preference,data.updatedAt||null);clearQueue();
  return {ok:true,error:null,state:data.preference,updatedAt:data.updatedAt||null};
}
async function setServer(learnerId,enabled,contentMode){
  const id=String(learnerId||'').trim();
  const local=set(enabled,contentMode);
  if(!local.ok)return local;
  if(!id)return {ok:false,error:'LEARNER_ID_REQUIRED',state:local.state};
  const expected=serverMeta().updatedAt||null;
  try{
    const result=await putServer(id,local.state,expected);
    if(result.ok)return result;
    if(result.error==='LOW_BANDWIDTH_CONFLICT'){
      const current=result.data?.current;
      if(current)set(current.enabled,current.contentMode);
      clearQueue();
      return {ok:false,error:result.error,state:current||get(),updatedAt:current?.updatedAt||null,conflict:true};
    }
    if(queue(local.state,id,expected))return {ok:false,error:'LOW_BANDWIDTH_SYNC_QUEUED',state:local.state,pending:true};
    return {ok:false,error:result.error,state:local.state};
  }catch(_){
    if(queue(local.state,id,expected))return {ok:false,error:'LOW_BANDWIDTH_SYNC_QUEUED',state:local.state,pending:true};
    return {ok:false,error:'LOW_BANDWIDTH_SAVE_FAILED',state:local.state};
  }
}
async function syncPending(learnerId){
  const p=pending();
  if(!p||p.learnerId!==String(learnerId||'').trim())return {ok:true,pending:false};
  try{
    const result=await putServer(p.learnerId,p.preference,p.expectedUpdatedAt);
    if(result.ok)return {...result,pending:false};
    if(result.error==='LOW_BANDWIDTH_CONFLICT'){
      clearQueue();
      const current=result.data?.current;
      if(current)set(current.enabled,current.contentMode);
      return {ok:false,error:result.error,conflict:true,pending:false,current};
    }
    return {ok:false,error:result.error,pending:true};
  }catch(_){return {ok:false,error:'LOW_BANDWIDTH_SAVE_FAILED',pending:true};}
}
function hasPending(){return Boolean(pending());}
if(typeof global.addEventListener==='function')global.addEventListener('online',function(){const p=pending();if(p)syncPending(p.learnerId);});
global.BAALowBandwidth={get,set,getServer,setServer,syncPending,hasPending};
})(window);
