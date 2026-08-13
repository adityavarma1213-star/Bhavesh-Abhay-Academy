/* BAA M55 — Student Data Trust & Fresh-Start Controls.
   Gives the student a previewable, explicit reset plan before clearing BAA
   local data. Production account/cloud deletion remains a server dependency. */
(function(global){
'use strict';
function plan(keys){if(!Array.isArray(keys))return {ok:false,error:'INVALID_RESET_KEYS'};return {ok:true,error:null,keys:keys.filter(k=>typeof k==='string').sort(),confirmationRequired:true};}
function apply(keys,confirm){if(confirm!==true)return {ok:false,error:'RESET_CONFIRMATION_REQUIRED'};if(!Array.isArray(keys))return {ok:false,error:'INVALID_RESET_KEYS'};try{keys.forEach(k=>{if(typeof k==='string')localStorage.removeItem(k);});return {ok:true,error:null,removedCount:keys.length};}catch(_){return {ok:false,error:'RESET_FAILED'};}}
global.BAAFreshStart={plan,apply};
})(window);
