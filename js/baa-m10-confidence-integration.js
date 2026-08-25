/* BAA M10 — server-backed confidence bridge. */
(function(global){
  'use strict';
  async function load(learnerId){
    if(!learnerId) return {status:'unavailable',error:'LEARNER_ID_REQUIRED'};
    try{
      const response=await fetch(`/api/m10-confidence?learnerId=${encodeURIComponent(learnerId)}`,{credentials:'include'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok) return {status:'unavailable',error:data?.error?.code||'CONFIDENCE_SERVER_UNAVAILABLE',httpStatus:response.status};
      return {status:'ready',...data};
    }catch{return {status:'unavailable',error:'CONFIDENCE_SERVER_UNAVAILABLE'};}
  }
  global.BAAM10Confidence={load};
})(window);
