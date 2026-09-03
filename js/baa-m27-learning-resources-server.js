/* M27 server bridge. Keeps external-resource destinations conservative while moving learner evidence to the authenticated server. */
(function(global){
'use strict';
const MAX_RESPONSE_BYTES=1024*1024;
async function readJson(response){
  const declared=Number(response?.headers?.get?.('content-length'));
  if(Number.isFinite(declared)&&declared>MAX_RESPONSE_BYTES){try{response.body?.cancel?.();}catch(_){}return {ok:false,error:'LEARNING_RESOURCES_RESPONSE_TOO_LARGE'};}
  if(!response?.body||typeof response.body.getReader!=='function'){
    try{
      const text=await response.text();
      const bytes=typeof TextEncoder!=='undefined'?new TextEncoder().encode(text):null;
      if((bytes?bytes.byteLength:typeof Buffer!=='undefined'?Buffer.byteLength(text,'utf8'):text.length)>MAX_RESPONSE_BYTES)return {ok:false,error:'LEARNING_RESOURCES_RESPONSE_TOO_LARGE'};
      return {ok:true,body:JSON.parse(text)};
    }catch(error){return {ok:false,error:error?.message==='LEARNING_RESOURCES_RESPONSE_TOO_LARGE'?'LEARNING_RESOURCES_RESPONSE_TOO_LARGE':'LEARNING_RESOURCES_INVALID_RESPONSE'};}
  }
  const reader=response.body.getReader(),chunks=[];let total=0;
  try{
    while(true){const part=await reader.read();if(part.done)break;const chunk=part.value instanceof Uint8Array?part.value:new Uint8Array(part.value||[]);total+=chunk.byteLength;if(total>MAX_RESPONSE_BYTES){try{await reader.cancel();}catch(_){}return {ok:false,error:'LEARNING_RESOURCES_RESPONSE_TOO_LARGE'};}chunks.push(chunk);}
    const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    try{return {ok:true,body:JSON.parse(new TextDecoder().decode(bytes))};}catch(_){return {ok:false,error:'LEARNING_RESOURCES_INVALID_RESPONSE'};}
  }catch(_){try{await reader.cancel();}catch(_){}return {ok:false,error:'LEARNING_RESOURCES_INVALID_RESPONSE'};}
}
function learnerId(){return String(global.BAA_LEARNER_ID||document.body?.dataset?.learnerId||'').trim();}
async function getServerRecommendations(format,limit){
  const id=learnerId();
  if(!id)return {ok:false,error:'LEARNER_ID_REQUIRED',recommendations:[]};
  const params=new URLSearchParams({learnerId:id});
  if(format)params.set('format',String(format));
  const response=await fetch('/api/m27-learning-resources?'+params.toString(),{credentials:'include',cache:'no-store',headers:{Accept:'application/json'}});
  const parsed=await readJson(response);
  if(!parsed.ok)return {ok:false,error:parsed.error,recommendations:[]};
  const body=parsed.body||{};
  if(!response.ok)return {ok:false,error:body?.error?.code||'LEARNING_RESOURCES_FAILED',recommendations:[]};
  const recommendations=Array.isArray(body.recommendations)?body.recommendations.slice(0,Math.max(1,Math.min(20,Number(limit)||8))):[];
  return {...body,recommendations};
}
global.BAAM27Server={getServerRecommendations,maxResponseBytes:MAX_RESPONSE_BYTES};
})(window);
