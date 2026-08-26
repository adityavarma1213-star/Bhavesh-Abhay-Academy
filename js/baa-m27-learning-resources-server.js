/* M27 server bridge. Keeps external-resource destinations conservative while moving learner evidence to the authenticated server. */
(function(global){
'use strict';
function learnerId(){return String(global.BAA_LEARNER_ID||document.body?.dataset?.learnerId||'').trim();}
async function getServerRecommendations(format,limit){
  const id=learnerId();
  if(!id)return {ok:false,error:'LEARNER_ID_REQUIRED',recommendations:[]};
  const params=new URLSearchParams({learnerId:id});
  if(format)params.set('format',String(format));
  const response=await fetch('/api/m27-learning-resources?'+params.toString(),{credentials:'include',headers:{Accept:'application/json'}});
  let body={};
  try{body=await response.json();}catch(_){body={};}
  if(!response.ok)return {ok:false,error:body?.error?.code||'LEARNING_RESOURCES_FAILED',recommendations:[]};
  const recommendations=Array.isArray(body.recommendations)?body.recommendations.slice(0,Math.max(1,Math.min(20,Number(limit)||8))):[];
  return {...body,recommendations};
}
global.BAAM27Server={getServerRecommendations};
})(window);
