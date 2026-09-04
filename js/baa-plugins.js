/* BAA M50 — Plugin & Integration Marketplace.
   Validates a declarative plugin manifest but never executes arbitrary plugin
   code. Production marketplace signing, sandboxing and permissions are required. */
(function(global){
'use strict';
const PERMISSIONS=['read_learning','write_learning','read_calendar','read_assessment'];
const STORE='baa:m50:marketplace:v1';
const ID_RE=/^[a-z0-9](?:[a-z0-9._-]{0,78}[a-z0-9])?$/;
function clean(v,max=180){return String(v==null?'':v).trim().slice(0,max);}
function validateEntry(value){
 try{
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.port)return false;
  if(url.hostname==='localhost'||url.hostname.endsWith('.localhost'))return false;
  if(!url.hostname||url.hostname.includes('..'))return false;
  return true;
 }catch(_){return false;}
}
function validateManifest(m){
 if(!m||typeof m!=='object'||typeof m.id!=='string'||!m.id.trim())return {ok:false,error:'INVALID_PLUGIN_ID'};
 const id=clean(m.id,80).toLowerCase();
 if(!ID_RE.test(id))return {ok:false,error:'INVALID_PLUGIN_ID'};
 if(!Array.isArray(m.permissions)||m.permissions.length>PERMISSIONS.length||new Set(m.permissions).size!==m.permissions.length||m.permissions.some(p=>!PERMISSIONS.includes(p)))return {ok:false,error:'INVALID_PLUGIN_PERMISSION'};
 if(typeof m.entry!=='string'||!validateEntry(m.entry.trim()))return {ok:false,error:'INVALID_PLUGIN_ENTRY'};
 const version=clean(m.version||'0.0.0',32);
 if(!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version))return {ok:false,error:'INVALID_PLUGIN_VERSION'};
 return {ok:true,error:null,manifest:{id,name:clean(m.name||id,120),description:clean(m.description,400),version,permissions:m.permissions.slice(),entry:m.entry.trim()}};
}
function load(){try{const raw=global.localStorage.getItem(STORE);const parsed=JSON.parse(raw||'{"catalog":[],"installed":[]}');return {catalog:Array.isArray(parsed.catalog)?parsed.catalog:[],installed:Array.isArray(parsed.installed)?parsed.installed:[]};}catch(_){return {catalog:[],installed:[]};}}
function save(state){try{global.localStorage.setItem(STORE,JSON.stringify(state));return true;}catch(_){return false;}}
function register(manifest){const checked=validateManifest(manifest);if(!checked.ok)return checked;const state=load();const i=state.catalog.findIndex(p=>p.id===checked.manifest.id);const item=Object.assign({},checked.manifest,{updatedAt:new Date().toISOString(),source:'local-catalog'});if(i>=0)state.catalog[i]=item;else state.catalog.push(item);return save(state)?{ok:true,error:null,plugin:item}:{ok:false,error:'MARKETPLACE_PERSISTENCE_UNAVAILABLE'};}
function list(options){const o=options&&typeof options==='object'?options:{};const q=clean(o.query,120).toLowerCase();const permission=clean(o.permission,60);const state=load();return {ok:true,error:null,plugins:state.catalog.filter(p=>(!q||`${p.id} ${p.name} ${p.description}`.toLowerCase().includes(q))&&(!permission||p.permissions.includes(permission))).map(p=>Object.assign({},p,{installed:state.installed.some(x=>x.id===p.id)}))};}
function install(id){const normalized=clean(id,80).toLowerCase();if(!ID_RE.test(normalized))return {ok:false,error:'INVALID_PLUGIN_ID'};const state=load();const plugin=state.catalog.find(p=>p.id===normalized);if(!plugin)return {ok:false,error:'PLUGIN_NOT_FOUND'};const existing=state.installed.find(p=>p.id===normalized);if(existing&&existing.version!==plugin.version){existing.version=plugin.version;existing.enabled=false;existing.approvedPermissions=[];existing.updatedAt=new Date().toISOString();}else if(!existing)state.installed.push({id:normalized,version:plugin.version,installedAt:new Date().toISOString(),enabled:false,approvedPermissions:[]});return save(state)?{ok:true,error:null,plugin}:{ok:false,error:'MARKETPLACE_PERSISTENCE_UNAVAILABLE'};}
function setEnabled(id,enabled,approvedPermissions){const normalized=clean(id,80).toLowerCase();if(!ID_RE.test(normalized))return {ok:false,error:'INVALID_PLUGIN_ID'};const state=load();const item=state.installed.find(p=>p.id===normalized);if(!item)return {ok:false,error:'PLUGIN_NOT_INSTALLED'};const plugin=state.catalog.find(p=>p.id===normalized);if(!plugin)return {ok:false,error:'PLUGIN_NOT_FOUND'};if(item.version!==plugin.version)return {ok:false,error:'PLUGIN_UPDATE_REQUIRED'};const approved=Array.isArray(approvedPermissions)?approvedPermissions.filter(p=>plugin.permissions.includes(p)):item.approvedPermissions||[];if(enabled&&approved.length!==plugin.permissions.length)return {ok:false,error:'PLUGIN_PERMISSIONS_NOT_APPROVED'};item.enabled=Boolean(enabled);item.approvedPermissions=approved;item.updatedAt=new Date().toISOString();return save(state)?{ok:true,error:null,plugin:Object.assign({},plugin,{enabled:item.enabled,approvedPermissions:approved})}:{ok:false,error:'MARKETPLACE_PERSISTENCE_UNAVAILABLE'};}
function uninstall(id){const normalized=clean(id,80).toLowerCase();if(!ID_RE.test(normalized))return {ok:false,error:'INVALID_PLUGIN_ID'};const state=load();const before=state.installed.length;state.installed=state.installed.filter(p=>p.id!==normalized);if(before===state.installed.length)return {ok:false,error:'PLUGIN_NOT_INSTALLED'};return save(state)?{ok:true,error:null,removed:normalized}:{ok:false,error:'MARKETPLACE_PERSISTENCE_UNAVAILABLE'};}
function installed(){const state=load();return {ok:true,error:null,plugins:state.installed.map(i=>{const p=state.catalog.find(x=>x.id===i.id);return Object.assign({},p||{id:i.id},i);})};}
global.BAAPlugins={validateManifest,register,list,install,setEnabled,uninstall,installed,permissions:()=>PERMISSIONS.slice()};
})(window);
