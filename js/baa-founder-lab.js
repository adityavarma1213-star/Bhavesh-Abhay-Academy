/* BAA M61 — One-Year Private Testing & Founder Lab.
   Defines a controlled local test-cohort record and experiment log. It does
   not claim a real one-year longitudinal study has occurred. */
(function(global){
'use strict';
function cohort(input){if(!input||typeof input!=='object'||typeof input.id!=='string'||!input.id.trim())return {ok:false,error:'INVALID_COHORT'};return {ok:true,error:null,cohort:{id:input.id.trim(),label:String(input.label||'Private cohort').trim(),consentRequired:true,status:'planned',createdAt:new Date().toISOString()}};}
function experiment(input){if(!input||typeof input!=='object'||typeof input.name!=='string'||!input.name.trim())return {ok:false,error:'INVALID_EXPERIMENT'};return {ok:true,error:null,experiment:{name:input.name.trim(),hypothesis:String(input.hypothesis||'').trim(),status:'planned',metrics:Array.isArray(input.metrics)?input.metrics:[]}};}
global.BAAFounderLab={cohort,experiment};
})(window);
