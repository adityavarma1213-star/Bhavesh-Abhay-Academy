/* BAA M46 — School ERP Integration.
   Provides a vendor-neutral adapter contract and payload validation. It does
   not connect to a real ERP without explicit credentials/endpoint configuration. */
(function(global){
'use strict';
const ALLOWED=['students','attendance','timetable','homework','exams'];
function validateConfig(c){if(!c||typeof c!=='object'||typeof c.provider!=='string'||!c.provider.trim())return {ok:false,error:'INVALID_ERP_CONFIG'};if(!Array.isArray(c.scopes)||c.scopes.some(x=>!ALLOWED.includes(x)))return {ok:false,error:'INVALID_ERP_SCOPE'};return {ok:true,error:null,config:{provider:c.provider.trim(),scopes:c.scopes.slice()}};}
function buildPayload(type,data){if(!ALLOWED.includes(type))return {ok:false,error:'INVALID_ERP_DATA_TYPE'};if(!data||typeof data!=='object')return {ok:false,error:'INVALID_ERP_PAYLOAD'};return {ok:true,error:null,payload:{schemaVersion:1,type,data}};}
global.BAAERP={validateConfig,buildPayload};
})(window);
