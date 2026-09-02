/* BAA M10 — server-backed confidence bridge. */
(function(global){
  'use strict';
  const MAX_RESPONSE_BYTES=1024*1024;
  async function readJsonResponse(response){
    const contentLength=Number(response.headers?.get?.('content-length')||0);
    if(Number.isFinite(contentLength)&&contentLength>MAX_RESPONSE_BYTES)return null;
    if(response.body&&typeof response.body.getReader==='function'){
      const reader=response.body.getReader();const chunks=[];let total=0;
      try{
        while(true){
          const part=await reader.read();
          if(part.done)break;
          total+=part.value?.byteLength||0;
          if(total>MAX_RESPONSE_BYTES){await reader.cancel();return null;}
          chunks.push(part.value);
        }
      }catch(_){try{await reader.cancel();}catch(_e){}return null;}
      const bytes=new Uint8Array(total);let offset=0;
      for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      try{return JSON.parse(new TextDecoder().decode(bytes));}catch(_){return null;}
    }
    try{
      const text=await response.text();
      if(new TextEncoder().encode(text).byteLength>MAX_RESPONSE_BYTES)return null;
      return JSON.parse(text);
    }catch(_){return null;}
  }
  async function load(learnerId){
    if(!learnerId)return {status:'unavailable',error:'LEARNER_ID_REQUIRED'};
    try{
      const response=await fetch(`/api/m10-confidence?learnerId=${encodeURIComponent(learnerId)}`,{
        credentials:'include',cache:'no-store',headers:{Accept:'application/json'}
      });
      const data=await readJsonResponse(response);
      if(!data)return {status:'unavailable',error:'CONFIDENCE_INVALID_RESPONSE',httpStatus:response.status};
      if(!response.ok)return {status:'unavailable',error:data?.error?.code||'CONFIDENCE_SERVER_UNAVAILABLE',httpStatus:response.status};
      return {status:'ready',...data};
    }catch{return {status:'unavailable',error:'CONFIDENCE_SERVER_UNAVAILABLE'};}
  }
  global.BAAM10Confidence={load};
})(window);
