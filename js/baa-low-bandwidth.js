/* BAA M41 — Smart Low-Bandwidth Learning.
   Adds local data-saver preferences plus an authenticated server persistence bridge.
   It does not claim true offline synchronization or automatically infer connectivity.
*/
(function(global){
'use strict';
const KEY='baa_low_bandwidth_v1';
const MODES=['auto','text','audio','lite'];
function defaults(){return {schemaVersion:1,enabled:false,contentMode:'auto'};}
function get(){try{const x=JSON.parse(localStorage.getItem(KEY)||'null');return x&&x.schemaVersion===1?x:defaults();}catch(_){return defaults();}}
function set(enabled,contentMode){
  if(typeof enabled!=='boolean'||!MODES.includes(contentMode))return {ok:false,error:'INVALID_LOW_BANDWIDTH_MODE'};
  const s={schemaVersion:1,enabled,contentMode};
  try{localStorage.setItem(KEY,JSON.stringify(s));return {ok:true,error:null,state:s};}
  catch(_){return {ok:false,error:'LOW_BANDWIDTH_STORAGE_FAILED'};}
}
function authOptions(method){return {method,credentials:'include',cache:'no-store',headers:{'Accept':'application/json','Content-Type':'application/json'}};}
async function getServer(learnerId){
  const id=String(learnerId||'').trim();
  if(!id)return {ok:false,error:'LEARNER_ID_REQUIRED'};
  try{
    const r=await fetch('/api/m41-low-bandwidth?learnerId='+encodeURIComponent(id),authOptions('GET'));
    const data=await r.json().catch(()=>null);
    if(!r.ok||!data?.ok)return {ok:false,error:data?.error?.code||'LOW_BANDWIDTH_LOAD_FAILED'};
    if(data.preference)set(data.preference.enabled,data.preference.contentMode);
    return {ok:true,preference:data.preference,updatedAt:data.updatedAt||null};
  }catch(_){return {ok:false,error:'LOW_BANDWIDTH_LOAD_FAILED'};}
}
async function setServer(learnerId,enabled,contentMode){
  const id=String(learnerId||'').trim();
  const local=set(enabled,contentMode);
  if(!local.ok)return local;
  if(!id)return {ok:false,error:'LEARNER_ID_REQUIRED',state:local.state};
  try{
    const opts=authOptions('PUT');
    opts.body=JSON.stringify({enabled,contentMode});
    const r=await fetch('/api/m41-low-bandwidth?learnerId='+encodeURIComponent(id),opts);
    const data=await r.json().catch(()=>null);
    if(!r.ok||!data?.ok)return {ok:false,error:data?.error?.code||'LOW_BANDWIDTH_SAVE_FAILED',state:local.state};
    return {ok:true,error:null,state:data.preference||local.state};
  }catch(_){return {ok:false,error:'LOW_BANDWIDTH_SAVE_FAILED',state:local.state};}
}
global.BAALowBandwidth={get,set,getServer,setServer};
})(window);
