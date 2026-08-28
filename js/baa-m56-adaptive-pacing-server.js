// BAA M56 — client bridge for the authenticated pacing recommendation API.
(function(global){
  'use strict';
  const API='/api/m56-adaptive-pacing';
  async function recommendServer(input){
    const response=await fetch(API,{method:'POST',credentials:'include',cache:'no-store',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(input||{})});
    let payload=null;
    try { payload=await response.json(); } catch {}
    if(!response.ok || !payload?.ok){
      const error=new Error(payload?.error?.message||'Adaptive pacing request failed.');
      error.code=payload?.error?.code||'PACING_REQUEST_FAILED';
      error.status=response.status;
      throw error;
    }
    return payload;
  }
  global.BAAM56Server={recommend:recommendServer};
})(window);
