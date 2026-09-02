/* M29 authenticated server bridge. */
(function(global){
'use strict';
const MAX_SERVER_RESPONSE_BYTES=1024*1024;
async function readServerJson(response){
 const declared=Number(response?.headers?.get?.('content-length'));
 if(Number.isFinite(declared)&&declared>MAX_SERVER_RESPONSE_BYTES){try{response.body?.cancel?.();}catch(_){}throw new Error('LEARNING_PATH_RESPONSE_TOO_LARGE');}
 if(!response?.body||typeof response.body.getReader!=='function'){
  try{
   const text=await response.text();
   if(new TextEncoder().encode(text).byteLength>MAX_SERVER_RESPONSE_BYTES)throw new Error('LEARNING_PATH_RESPONSE_TOO_LARGE');
   return JSON.parse(text);
  }catch(error){
   if(error?.message==='LEARNING_PATH_RESPONSE_TOO_LARGE')throw error;
   throw new Error('LEARNING_PATH_INVALID_RESPONSE');
  }
 }
 const reader=response.body.getReader(); const decoder=new TextDecoder(); let bytes=0; let text='';
 try{
  while(true){
   const chunk=await reader.read();
   if(chunk.done)break;
   bytes+=chunk.value.byteLength;
   if(bytes>MAX_SERVER_RESPONSE_BYTES){try{await reader.cancel();}catch(_){}throw new Error('LEARNING_PATH_RESPONSE_TOO_LARGE');}
   text+=decoder.decode(chunk.value,{stream:true});
  }
  text+=decoder.decode();
  try{return JSON.parse(text);}catch(_){throw new Error('LEARNING_PATH_INVALID_RESPONSE');}
 }finally{try{reader.releaseLock();}catch(_) {}}
}
async function getServerPath(subject,limit){
 const id=String(global.BAA_LEARNER_ID||document.body?.dataset?.learnerId||'').trim();
 if(!id)return {ok:false,error:'LEARNER_ID_REQUIRED',nodes:[]};
 const p=new URLSearchParams({learnerId:id});
 if(subject)p.set('subject',subject);
 if(limit)p.set('limit',String(limit));
 try{
  const r=await fetch('/api/m29-learning-paths?'+p.toString(),{credentials:'include',cache:'no-store',headers:{Accept:'application/json'}});
  let body={};
  try{body=await readServerJson(r);}catch(error){return {ok:false,error:error?.message||'LEARNING_PATH_INVALID_RESPONSE',nodes:[]};}
  if(!r.ok)return {ok:false,error:body?.error?.code||'LEARNING_PATH_FAILED',nodes:[]};
  return body;
 }catch(error){return {ok:false,error:error?.message||'LEARNING_PATH_FAILED',nodes:[]};}
}
global.BAAM29Server={getServerPath};
})(window);
