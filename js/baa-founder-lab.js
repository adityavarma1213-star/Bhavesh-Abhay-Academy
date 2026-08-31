/* BAA M61 — One-Year Private Testing & Founder Lab.
   Defines controlled private-cohort and experiment lifecycle primitives.
   It does not claim that a real one-year longitudinal study has occurred. */
(function(global){
'use strict';
const STATUSES=['planned','active','paused','completed','archived'];
const MAX_METRICS=32;
function clean(v,max=500){return String(v==null?'':v).trim().slice(0,max);}
function secureId(prefix){
  const cryptoApi=global.crypto;
  if(cryptoApi&&typeof cryptoApi.randomUUID==='function')return `${prefix}-${cryptoApi.randomUUID()}`;
  if(cryptoApi&&typeof cryptoApi.getRandomValues==='function'){
    const bytes=new Uint8Array(16);cryptoApi.getRandomValues(bytes);
    return `${prefix}-${Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;
}
function validTimestamp(value){
  if(value==null||value==='') return true;
  if(typeof value!=='string'||value.length>64) return false;
  const parsed=Date.parse(value);
  return Number.isFinite(parsed);
}
function normalizedTimestamp(value){return value==null||value===''?new Date().toISOString():new Date(value).toISOString();}
function cohort(input){
  if(!input||typeof input!=='object'||typeof input.id!=='string'||!input.id.trim())return {ok:false,error:'INVALID_COHORT'};
  if(!validTimestamp(input.createdAt))return {ok:false,error:'INVALID_CREATED_AT'};
  const participants=Number.isInteger(input.participantLimit)&&input.participantLimit>0?Math.min(input.participantLimit,10000):null;
  return {ok:true,error:null,cohort:{id:clean(input.id,120),label:clean(input.label||'Private cohort',160),consentRequired:true,participantLimit:participants,status:STATUSES.includes(input.status)?input.status:'planned',createdAt:normalizedTimestamp(input.createdAt)}};
}
function experiment(input){
  if(!input||typeof input!=='object'||typeof input.name!=='string'||!input.name.trim())return {ok:false,error:'INVALID_EXPERIMENT'};
  if(!validTimestamp(input.createdAt))return {ok:false,error:'INVALID_CREATED_AT'};
  const metrics=Array.isArray(input.metrics)?[...new Set(input.metrics.map(v=>clean(v,120)).filter(Boolean))].slice(0,MAX_METRICS):[];
  if(!metrics.length)return {ok:false,error:'NO_EXPERIMENT_METRICS'};
  return {ok:true,error:null,experiment:{id:clean(input.id||secureId('exp'),120),name:clean(input.name,200),hypothesis:clean(input.hypothesis,1000),status:STATUSES.includes(input.status)?input.status:'planned',metrics,owner:clean(input.owner||'',160)||null,createdAt:normalizedTimestamp(input.createdAt),updatedAt:new Date().toISOString()}};
}
function transition(record,next){
  if(!record||typeof record!=='object'||!STATUSES.includes(record.status))return {ok:false,error:'INVALID_RECORD'};
  if(!STATUSES.includes(next))return {ok:false,error:'INVALID_STATUS'};
  const allowed={planned:['active','archived'],active:['paused','completed','archived'],paused:['active','archived'],completed:['archived'],archived:[]};
  if(!allowed[record.status].includes(next))return {ok:false,error:'INVALID_TRANSITION'};
  return {ok:true,error:null,record:{...record,status:next,updatedAt:new Date().toISOString()}};
}
function observation(input){
  if(!input||typeof input!=='object'||!String(input.metric||'').trim())return {ok:false,error:'INVALID_OBSERVATION'};
  if(input.consentGranted!==true)return {ok:false,error:'CONSENT_REQUIRED'};
  if(!String(input.experimentId||'').trim())return {ok:false,error:'EXPERIMENT_ID_REQUIRED'};
  if(!validTimestamp(input.observedAt))return {ok:false,error:'INVALID_OBSERVED_AT'};
  const value=input.value;
  if(typeof value!=='number'&&typeof value!=='string'&&typeof value!=='boolean')return {ok:false,error:'INVALID_OBSERVATION_VALUE'};
  if(typeof value==='number'&&!Number.isFinite(value))return {ok:false,error:'INVALID_OBSERVATION_VALUE'};
  return {ok:true,error:null,observation:{experimentId:clean(input.experimentId,120),metric:clean(input.metric,120),value,participantRef:clean(input.participantRef,160)||null,consentGranted:true,observedAt:normalizedTimestamp(input.observedAt)}};
}
global.BAAFounderLab={cohort,experiment,transition,observation,statuses:STATUSES};
})(window);
