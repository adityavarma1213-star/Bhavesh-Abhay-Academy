/* BAA M41 — Smart Low-Bandwidth Learning.
   Adds a client-side data-saver profile and content-mode preferences. It does
   not claim true offline synchronization until a server/cache layer is wired. */
(function(global){
'use strict';const KEY='baa_low_bandwidth_v1';
function get(){try{const x=JSON.parse(localStorage.getItem(KEY)||'null');return x&&x.schemaVersion===1?x:{schemaVersion:1,enabled:false,contentMode:'auto'};}catch(_){return {schemaVersion:1,enabled:false,contentMode:'auto'};}}
function set(enabled,contentMode){if(typeof enabled!=='boolean'||!['auto','text','audio','lite'].includes(contentMode))return {ok:false,error:'INVALID_LOW_BANDWIDTH_MODE'};const s={schemaVersion:1,enabled,contentMode};try{localStorage.setItem(KEY,JSON.stringify(s));return {ok:true,error:null,state:s};}catch(_){return {ok:false,error:'LOW_BANDWIDTH_STORAGE_FAILED'};}}
global.BAALowBandwidth={get,set};
})(window);
