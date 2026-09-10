/* BAA M50 — Plugin & Integration Marketplace.
   Validates a declarative plugin manifest but never executes arbitrary plugin
   code. Production marketplace signing, sandboxing and permissions are required. */
(function(global){
'use strict';
const PERMISSIONS=['read_learning','write_learning','read_calendar','read_assessment'];
function validateManifest(m){if(!m||typeof m!=='object'||typeof m.id!=='string'||!m.id.trim())return {ok:false,error:'INVALID_PLUGIN_ID'};if(!Array.isArray(m.permissions)||m.permissions.some(p=>!PERMISSIONS.includes(p)))return {ok:false,error:'INVALID_PLUGIN_PERMISSION'};if(typeof m.entry!=='string'||!/^https:\/\//.test(m.entry))return {ok:false,error:'INVALID_PLUGIN_ENTRY'};return {ok:true,error:null,manifest:{id:m.id.trim(),name:String(m.name||m.id).trim(),permissions:m.permissions.slice(),entry:m.entry}};}
global.BAAPlugins={validateManifest,permissions:()=>PERMISSIONS.slice()};
})(window);
