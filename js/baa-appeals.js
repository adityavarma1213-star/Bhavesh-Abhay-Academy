/* BAA M39 — AI Review & Appeal System.
   Creates an auditable local appeal record. Production human review must be
   performed by an authorized teacher/reviewer; this module never auto-approves an appeal. */
(function(global){
'use strict';
const KEY='baa_appeals_v1';
function load(){try{const x=JSON.parse(localStorage.getItem(KEY)||'null');return Array.isArray(x)?x:[];}catch(_){return [];}}
function create(input){if(!input||typeof input!=='object'||typeof input.reason!=='string'||!input.reason.trim())return {ok:false,error:'INVALID_APPEAL'};const a=load();const item={id:'appeal_'+Date.now(),targetId:String(input.targetId||''),reason:input.reason.trim(),status:'submitted',createdAt:new Date().toISOString(),history:[{status:'submitted',at:new Date().toISOString()}]};a.push(item);try{localStorage.setItem(KEY,JSON.stringify(a));return {ok:true,error:null,appeal:item};}catch(_){return {ok:false,error:'APPEAL_STORAGE_FAILED'};}}
function updateStatus(id,status,reviewerNote){if(typeof id!=='string'||!['under_review','accepted','rejected','needs_human_review'].includes(status))return {ok:false,error:'INVALID_APPEAL_STATUS'};const a=load(),item=a.find(x=>x.id===id);if(!item)return {ok:false,error:'APPEAL_NOT_FOUND'};item.status=status;item.reviewerNote=typeof reviewerNote==='string'?reviewerNote.trim():'';item.history.push({status,at:new Date().toISOString()});try{localStorage.setItem(KEY,JSON.stringify(a));return {ok:true,error:null,appeal:item};}catch(_){return {ok:false,error:'APPEAL_STORAGE_FAILED'};}}
function list(){return {ok:true,error:null,appeals:load()};}
global.BAAAppeals={create,updateStatus,list};
})(window);
