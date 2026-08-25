/* BAA M50 — Plugin & Integration Marketplace.
   Validates a declarative plugin manifest but never executes arbitrary plugin
   code. Production marketplace signing, sandboxing and permissions are required. */
(function(global){
'use strict';
const PERMISSIONS=['read_learning','write_learning','read_calendar','read_assessment'];
const STORE='baa:m50:marketplace:v1';
function clean(v,max=180){return String(v==null?'':v).trim().slice(0,max);}
function validateManifest(m){
 if(!m||typeof m!=='object'||typeof m.id!=='string'||!m.id.trim())return {ok:false,error:'INVALID_PLUGIN_ID'};
 if(!Array.isArray(m.permissions)||m.permissions.some(p=>!PERMISSIONS.includes(p)))return {ok:false,error:'INVALID_PLUGIN_PERMISSION'};
 if(typeof m.entry!=='string'||!/^https:\/\//.test(m.entry))return {ok:false,error:'INVALID_PLUGIN_ENTRY'};
 const version=clean(m.version||'0.0.0',32);
 if(!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version))return {ok:false,error:'INVALID_PLUGIN_VERSION'};
 return {ok:true,error:null,manifest:{id:clean(m.id,80),name:clean(m.name||m.id,120),description:clean(m.description,400),version,permissions:m.permissions.slice(),entry:m.entry}};
}
function load(){try{const raw=global.localStorage.getItem(STORE);const parsed=JSON.parse(raw||'{"catalog":[],"installed":[]}');return {catalog:Array.isArray(parsed.catalog)?parsed.catalog:[],installed:Array.isArray(parsed.installed)?parsed.installed:[]};}catch(_){return {catalog:[],installed:[]};}}
function save(state){try{global.localStorage.setItem(STORE,JSON.stringify(state));return true;}catch(_){return false;}}
function register(manifest){const checked=validateManifest(manifest);if(!checked.ok)return checked;const state=load();const i=state.catalog.findIndex(p=>p.id===checked.manifest.id);const item=Object.assign({},checked.manifest,{updatedAt:new Date().toISOString(),source:'local-catalog'});if(i>=0)state.catalog[i]=item;else state.catalog.push(item);return save(state)?{ok:true,error:null,plugin:item}:{ok:false,error:'MARKETPLACE_PERSISTENCE_UNAVAILABLE'};}
function list(options){const o=options&&typeof options==='object'?options:{};const q=clean(o.query,120).toLowerCase();const permission=clean(o.permission,60);const state=load();return {ok:true,error:null,plugins:state.catalog.filter(p=>(!q||`${p.id} ${p.name} ${p.description}`.toLowerCase().includes(q))&&(!permission||p.permissions.includes(permission))).map(p=>Object.assign({},p,{installed:state.installed.some(x=>x.id===p.id)}))};}
function install(id){const state=load();const plugin=state.catalog.find(p=>p.id===id);if(!plugin)return {ok:false,error:'PLUGIN_NOT_FOUND'};if(!state.installed.some(p=>p.id===id))state.installed.push({id,version:plugin.version,installedAt:new Date().toISOString(),enabled:false,approvedPermissions:[]});return save(state)?{ok:true,error:null,plugin}:{ok:false,error:'MARKETPLACE_PERSISTENCE_UNAVAILABLE'};}
function setEnabled(id,enabled,approvedPermissions){const state=load();const item=state.installed.find(p=>p.id===id);if(!item)return {ok:false,error:'PLUGIN_NOT_INSTALLED'};const plugin=state.catalog.find(p=>p.id===id);if(!plugin)return {ok:false,error:'PLUGIN_NOT_FOUND'};const approved=Array.isArray(approvedPermissions)?approvedPermissions.filter(p=>plugin.permissions.includes(p)):item.approvedPermissions||[];if(enabled&&approved.length!==plugin.permissions.length)return {ok:false,error:'PLUGIN_PERMISSIONS_NOT_APPROVED'};item.enabled=Boolean(enabled);item.approvedPermissions=approved;item.updatedAt=new Date().toISOString();return save(state)?{ok:true,error:null,plugin:Object.assign({},plugin,{enabled:item.enabled,approvedPermissions:approved})}:{ok:false,error:'MARKETPLACE_PERSISTENCE_UNAVAILABLE'};}
function uninstall(id){const state=load();const before=state.installed.length;state.installed=state.installed.filter(p=>p.id!==id);if(before===state.installed.length)return {ok:false,error:'PLUGIN_NOT_INSTALLED'};return save(state)?{ok:true,error:null,removed:id}:{ok:false,error:'MARKETPLACE_PERSISTENCE_UNAVAILABLE'};}
function installed(){const state=load();return {ok:true,error:null,plugins:state.installed.map(i=>{const p=state.catalog.find(x=>x.id===i.id);return Object.assign({},p||{id:i.id},i);})};}
global.BAAPlugins={validateManifest,register,list,install,setEnabled,uninstall,installed,permissions:()=>PERMISSIONS.slice()};
})(window);
