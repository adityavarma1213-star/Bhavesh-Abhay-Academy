/* BAA M62 — BAA AI Council.
   Creates a structured multi-reviewer decision record. It does not pretend
   that other AI models were consulted unless actual reviewer results are supplied. */
(function(global){
'use strict';
const MAX_TOPIC=300, MAX_REVIEWERS=12, MAX_RESPONSE=4000;
const STATUSES=['awaiting_reviews','ready_for_decision','decided'];
function clean(v,max){return String(v==null?'':v).trim().slice(0,max);}
function secureId(){
  const c=global.crypto;
  if(c&&typeof c.randomUUID==='function')return 'council_'+c.randomUUID();
  if(c&&typeof c.getRandomValues==='function'){
    const b=new Uint8Array(16);c.getRandomValues(b);
    return 'council_'+Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
  }
  return 'council_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10);
}
function createReview(topic,reviewers){
  if(typeof topic!=='string'||!topic.trim()||!Array.isArray(reviewers)||!reviewers.length)return {ok:false,error:'INVALID_COUNCIL_REVIEW'};
  const normalized=[...new Set(reviewers.filter(x=>typeof x==='string').map(x=>clean(x,120)).filter(Boolean))];
  if(!normalized.length||normalized.length>MAX_REVIEWERS)return {ok:false,error:'INVALID_COUNCIL_REVIEWERS'};
  return {ok:true,error:null,review:{id:secureId(),topic:clean(topic,MAX_TOPIC),reviewers:normalized,responses:[],status:'awaiting_reviews',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}};
}
function addResponse(review,reviewer,response){
  if(!review||!Array.isArray(review.reviewers)||!Array.isArray(review.responses)||typeof reviewer!=='string'||typeof response!=='string'||!response.trim())return {ok:false,error:'INVALID_COUNCIL_RESPONSE'};
  if(review.status==='decided')return {ok:false,error:'COUNCIL_ALREADY_DECIDED'};
  const who=clean(reviewer,120);
  if(!review.reviewers.includes(who))return {ok:false,error:'REVIEWER_NOT_ASSIGNED'};
  if(review.responses.some(x=>x.reviewer===who))return {ok:false,error:'REVIEWER_ALREADY_RESPONDED'};
  review.responses.push({reviewer:who,response:clean(response,MAX_RESPONSE),at:new Date().toISOString()});
  review.status=review.responses.length>=review.reviewers.length?'ready_for_decision':'awaiting_reviews';
  review.updatedAt=new Date().toISOString();
  return {ok:true,error:null,review};
}
function consensus(review){
  if(!review||!Array.isArray(review.reviewers)||!Array.isArray(review.responses)||!STATUSES.includes(review.status))return {ok:false,error:'INVALID_COUNCIL_RECORD'};
  const required=review.reviewers.length, responded=new Set(review.responses.map(x=>x&&x.reviewer).filter(Boolean)).size;
  return {ok:true,error:null,responded,required,status:responded>=required?'ready_for_decision':'awaiting_reviews'};
}
global.BAAAICouncil={createReview,addResponse,consensus};
})(window);
