/* BAA M39 — AI Review & Appeal System.
   Creates an auditable local appeal record. Production human review must be
   performed by an authorized teacher/reviewer; this module never auto-approves an appeal. */
(function(global){
'use strict';
const KEY='baa_appeals_v1';
const MAX_APPEALS=500;
const MAX_REASON_LENGTH=2000;
const MAX_TARGET_ID_LENGTH=200;
const MAX_REVIEWER_NOTE_LENGTH=2000;
function load(){try{const x=JSON.parse(localStorage.getItem(KEY)||'null');return Array.isArray(x)?x.slice(-MAX_APPEALS):[];}catch(_){return [];}}
function persist(items){try{localStorage.setItem(KEY,JSON.stringify(items.slice(-MAX_APPEALS)));return true;}catch(_){return false;}}
function create(input){
 if(!input||typeof input!=='object'||typeof input.reason!=='string'||!input.reason.trim())return {ok:false,error:'INVALID_APPEAL'};
 const reason=input.reason.trim();
 const targetId=String(input.targetId||'').trim();
 if(reason.length>MAX_REASON_LENGTH)return {ok:false,error:'APPEAL_REASON_TOO_LONG'};
 if(targetId.length>MAX_TARGET_ID_LENGTH)return {ok:false,error:'APPEAL_TARGET_ID_TOO_LONG'};
 const a=load();
 const now=new Date().toISOString();
 const item={id:'appeal_'+Date.now()+'_'+Math.random().toString(36).slice(2,8),targetId,reason,status:'submitted',createdAt:now,history:[{status:'submitted',at:now}]};
 a.push(item);
 if(persist(a))return {ok:true,error:null,appeal:item};
 return {ok:false,error:'APPEAL_STORAGE_FAILED'};
}
function updateStatus(id,status,reviewerNote){
 if(typeof id!=='string'||id.length>200||!['under_review','accepted','rejected','needs_human_review'].includes(status))return {ok:false,error:'INVALID_APPEAL_STATUS'};
 const note=typeof reviewerNote==='string'?reviewerNote.trim():'';
 if(note.length>MAX_REVIEWER_NOTE_LENGTH)return {ok:false,error:'REVIEWER_NOTE_TOO_LONG'};
 const a=load(),item=a.find(x=>x&&x.id===id);
 if(!item)return {ok:false,error:'APPEAL_NOT_FOUND'};
 item.status=status;item.reviewerNote=note;item.history=Array.isArray(item.history)?item.history:[];item.history.push({status,at:new Date().toISOString()});
 if(persist(a))return {ok:true,error:null,appeal:item};
 return {ok:false,error:'APPEAL_STORAGE_FAILED'};
}
function list(){return {ok:true,error:null,appeals:load()};}
global.BAAAppeals={create,updateStatus,list};
})(window);
