/* BAA M46 — School ERP Integration.
   Vendor-neutral configuration is server-backed. No provider credential is
   stored in source or browser storage, and no live provider is claimed until
   deployment secrets and an adapter are configured. */
(function(global){
'use strict';
const ALLOWED=['students','attendance','timetable','homework','exams'];
function validateConfig(c){if(!c||typeof c!=='object'||typeof c.provider!=='string'||!c.provider.trim())return {ok:false,error:'INVALID_ERP_CONFIG'};if(!Array.isArray(c.scopes)||c.scopes.some(x=>!ALLOWED.includes(x)))return {ok:false,error:'INVALID_ERP_SCOPE'};return {ok:true,error:null,config:{provider:c.provider.trim(),scopes:c.scopes.slice()}};}
function buildPayload(type,data){if(!ALLOWED.includes(type))return {ok:false,error:'INVALID_ERP_DATA_TYPE'};if(!data||typeof data!=='object')return {ok:false,error:'INVALID_ERP_PAYLOAD'};return {ok:true,error:null,payload:{schemaVersion:1,type,data}};}
async function listConnections(){const r=await fetch('/api/m46-erp').catch(()=>null);if(!r)return {ok:false,error:'ERP_SERVER_UNAVAILABLE',connections:[]};const b=await r.json().catch(()=>({}));return r.ok&&b.ok?b:{ok:false,error:b?.error?.code||'ERP_SERVER_ERROR',connections:[]};}
async function configure(config){const check=validateConfig({...config,scopes:Array.isArray(config?.scopes)?config.scopes:[]});if(!check.ok)return check;const r=await fetch('/api/m46-erp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(config)}).catch(()=>null);if(!r)return {ok:false,error:'ERP_SERVER_UNAVAILABLE'};const b=await r.json().catch(()=>({}));return r.ok&&b.ok?b:{ok:false,error:b?.error?.code||'ERP_CONFIG_FAILED'};}
async function queueSync(id,entityType='students',direction='pull'){const r=await fetch('/api/m46-erp?id='+encodeURIComponent(id)+'&action=sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({entityType,direction})}).catch(()=>null);if(!r)return {ok:false,error:'ERP_SERVER_UNAVAILABLE'};const b=await r.json().catch(()=>({}));return r.ok&&b.ok?b:{ok:false,error:b?.error?.code||'ERP_SYNC_FAILED'};}
global.BAAERP={validateConfig,buildPayload,listConnections,configure,queueSync};
})(window);
