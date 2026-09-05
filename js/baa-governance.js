/* BAA M59 — Human-in-the-Loop Learning Governance.
   Creates explicit review queues for consequential AI actions. No action is
   marked approved without an authorized human status transition. */
(function(global){
'use strict';
const MAX_ACTION_TYPE=120;
const MAX_REVIEWER_NOTE=1000;
let sequence=0;
function create(action){
  if(!action||typeof action!=='object'||typeof action.type!=='string'||!action.type.trim())return {ok:false,error:'INVALID_GOVERNANCE_ACTION'};
  const type=action.type.trim();
  if(type.length>MAX_ACTION_TYPE)return {ok:false,error:'ACTION_TYPE_TOO_LONG'};
  const now=Date.now();
  sequence=(sequence+1)%1000000;
  const entropy=Math.random().toString(36).slice(2,10);
  return {ok:true,error:null,item:{id:'gov_'+now+'_'+sequence+'_'+entropy,type,status:'pending_human_review',createdAt:new Date(now).toISOString(),decision:null}};
}
function decide(item,decision,note){
  if(!item||typeof item!=='object'||!['approve','reject','request_more_evidence'].includes(decision))return {ok:false,error:'INVALID_HUMAN_DECISION'};
  if(item.status!=='pending_human_review')return {ok:false,error:'GOVERNANCE_ACTION_ALREADY_DECIDED'};
  const reviewerNote=String(note||'').trim();
  if(reviewerNote.length>MAX_REVIEWER_NOTE)return {ok:false,error:'REVIEWER_NOTE_TOO_LONG'};
  item.status=decision==='approve'?'approved':decision==='reject'?'rejected':'needs_more_evidence';
  item.decision=decision;
  item.reviewerNote=reviewerNote;
  item.reviewedAt=new Date().toISOString();
  return {ok:true,error:null,item};
}
global.BAAGovernance={create,decide};
})(window);
