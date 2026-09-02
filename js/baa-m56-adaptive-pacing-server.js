// BAA M56 — client bridge for the authenticated pacing recommendation API.
(function(global){
  'use strict';
  const API='/api/m56-adaptive-pacing';
  const MAX_RESPONSE_BYTES=1024*1024;
  async function readJsonResponse(response){
    const declared=Number(response?.headers?.get?.('content-length')||0);
    if(Number.isFinite(declared)&&declared>MAX_RESPONSE_BYTES)throw new Error('PACING_RESPONSE_TOO_LARGE');
    if(!response?.body?.getReader){
      const text=await response.text();
      if(new TextEncoder().encode(text).byteLength>MAX_RESPONSE_BYTES)throw new Error('PACING_RESPONSE_TOO_LARGE');
      return JSON.parse(text);
    }
    const reader=response.body.getReader();
    const decoder=new TextDecoder();
    let bytes=0;
    let text='';
    try{
      while(true){
        const chunk=await reader.read();
        if(chunk.done)break;
        bytes+=chunk.value?.byteLength||0;
        if(bytes>MAX_RESPONSE_BYTES){try{await reader.cancel();}catch(_){}throw new Error('PACING_RESPONSE_TOO_LARGE');}
        text+=decoder.decode(chunk.value,{stream:true});
      }
      text+=decoder.decode();
      return JSON.parse(text);
    }finally{try{reader.releaseLock();}catch(_) {}}
  }
  async function recommendServer(input){
    const response=await fetch(API,{method:'POST',credentials:'include',cache:'no-store',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(input||{})});
    let payload=null;
    try { payload=await readJsonResponse(response); } catch(error) {
      const oversized=error?.message==='PACING_RESPONSE_TOO_LARGE';
      const invalid=new Error(oversized?'Adaptive pacing server response is too large.':'Invalid adaptive pacing server response.');
      invalid.code=oversized?'PACING_RESPONSE_TOO_LARGE':'PACING_INVALID_RESPONSE';
      invalid.status=502;
      throw invalid;
    }
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
