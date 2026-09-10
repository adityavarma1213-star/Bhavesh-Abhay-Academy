/* BAA M62 — BAA AI Council.
   Creates a structured multi-reviewer decision record. It does not pretend
   that other AI models were consulted unless actual reviewer results are supplied. */
(function(global){
'use strict';
function createReview(topic,reviewers){if(typeof topic!=='string'||!topic.trim()||!Array.isArray(reviewers)||!reviewers.length)return {ok:false,error:'INVALID_COUNCIL_REVIEW'};return {ok:true,error:null,review:{id:'council_'+Date.now(),topic:topic.trim(),reviewers:reviewers.filter(x=>typeof x==='string'),responses:[],status:'awaiting_reviews'}};}
function addResponse(review,reviewer,response){if(!review||typeof reviewer!=='string'||typeof response!=='string'||!response.trim())return {ok:false,error:'INVALID_COUNCIL_RESPONSE'};review.responses.push({reviewer,response:response.trim(),at:new Date().toISOString()});return {ok:true,error:null,review};}
function consensus(review){if(!review||!Array.isArray(review.responses))return {ok:false,error:'INVALID_COUNCIL_RECORD'};return {ok:true,error:null,responded:review.responses.length,required:review.reviewers.length,status:review.responses.length>=review.reviewers.length?'ready_for_decision':'awaiting_reviews'};}
global.BAAAICouncil={createReview,addResponse,consensus};
})(window);
