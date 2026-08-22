/* BAA M59 — Human-in-the-Loop Learning Governance.
   Creates explicit review queues for consequential AI actions. No action is
   marked approved without an authorized human status transition. */
(function(global){
'use strict';
function create(action){if(!action||typeof action!=='object'||typeof action.type!=='string'||!action.type.trim())return {ok:false,error:'INVALID_GOVERNANCE_ACTION'};return {ok:true,error:null,item:{id:'gov_'+Date.now(),type:action.type.trim(),status:'pending_human_review',createdAt:new Date().toISOString(),decision:null}};}
function decide(item,decision,note){if(!item||typeof item!=='object'||!['approve','reject','request_more_evidence'].includes(decision))return {ok:false,error:'INVALID_HUMAN_DECISION'};item.status=decision==='approve'?'approved':decision==='reject'?'rejected':'needs_more_evidence';item.decision=decision;item.reviewerNote=String(note||'').trim();item.reviewedAt=new Date().toISOString();return {ok:true,error:null,item};}
global.BAAGovernance={create,decide};
})(window);
