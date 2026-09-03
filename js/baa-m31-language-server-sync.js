/* BAA M31 — server persistence bridge for the existing Student OS language control.
 * Local preference remains the immediate UI source; authenticated server state is
 * used when available and failed sync never blocks the student's language choice.
 * Server versions are retained so stale cross-device writes are rejected.
 */
(function(global){
  'use strict';
  const SUPPORTED=new Set(['en','hi','mr','gu','bn','ta','te','kn']);
  const PATH='/api/m31-language-preference';
  const MAX_RESPONSE_BYTES=1024*1024;
  let serverUpdatedAt=null;
  function learnerId(){
    try{
      const raw=localStorage.getItem('baa_auth_session_v1') || localStorage.getItem('baa_auth_user_v1');
      const parsed=raw?JSON.parse(raw):null;
      return String(parsed?.learnerId || parsed?.userId || parsed?.user?.id || '').trim();
    }catch(_){ return ''; }
  }
  async function readJsonBounded(response){
    const declared=Number(response?.headers?.get?.('content-length'));
    if(Number.isFinite(declared)&&declared>MAX_RESPONSE_BYTES){
      try{response.body?.cancel?.();}catch(_){ }
      throw new Error('M31_RESPONSE_TOO_LARGE');
    }
    if(!response?.body||typeof response.body.getReader!=='function'){
      try{
        const text=await response.text();
        const bytes=new TextEncoder().encode(text);
        if(bytes.byteLength>MAX_RESPONSE_BYTES) throw new Error('M31_RESPONSE_TOO_LARGE');
        try{return JSON.parse(text);}catch(_){throw new Error('M31_INVALID_RESPONSE');}
      }catch(error){
        if(error?.message==='M31_RESPONSE_TOO_LARGE'||error?.message==='M31_INVALID_RESPONSE') throw error;
        throw new Error('M31_INVALID_RESPONSE');
      }
    }
    const reader=response.body.getReader();
    const chunks=[];let total=0;
    try{
      for(;;){
        const part=await reader.read();
        if(part.done)break;
        const value=part.value;
        total+=value?.byteLength||0;
        if(total>MAX_RESPONSE_BYTES){
          try{await reader.cancel('response too large');}catch(_){ }
          throw new Error('M31_RESPONSE_TOO_LARGE');
        }
        chunks.push(value);
      }
    }finally{try{reader.releaseLock();}catch(_){ }}
    let size=0;for(const chunk of chunks)size+=chunk.byteLength;
    const bytes=new Uint8Array(size);let offset=0;
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    try{return JSON.parse(new TextDecoder().decode(bytes));}catch(_){throw new Error('M31_INVALID_RESPONSE');}
  }
  async function request(method,id,code,expectedUpdatedAt){
    if(!id) return null;
    const options={method,credentials:'include',cache:'no-store',headers:{Accept:'application/json'}};
    if(method==='PUT'){
      options.headers['Content-Type']='application/json';
      const payload={code};
      if(expectedUpdatedAt) payload.expectedUpdatedAt=expectedUpdatedAt;
      options.body=JSON.stringify(payload);
    }
    const res=await fetch(PATH+'?learnerId='+encodeURIComponent(id),options);
    let data=null;
    try{data=await readJsonBounded(res);}catch(_){return null;}
    if(data?.updatedAt) serverUpdatedAt=data.updatedAt;
    if(res.status===409 && data?.current?.updatedAt) serverUpdatedAt=data.current.updatedAt;
    if(!res.ok) return null;
    return data;
  }
  async function hydrate(){
    const id=learnerId();
    if(!id) return null;
    const data=await request('GET',id);
    const code=data?.preference?.code;
    if(SUPPORTED.has(code) && typeof global.saveResponseLanguage==='function'){
      global.saveResponseLanguage(code);
      const select=document.getElementById('responseLanguage');
      if(select) select.value=code;
    }
    return data;
  }
  async function sync(code){
    if(!SUPPORTED.has(code)) return null;
    const expected=serverUpdatedAt;
    return request('PUT',learnerId(),code,expected);
  }
  function install(){
    const original=global.saveResponseLanguage;
    if(typeof original!=='function' || original.__baaM31Wrapped) return;
    function wrapped(code){
      const safe=original.call(global,code);
      sync(safe).catch(function(){});
      return safe;
    }
    wrapped.__baaM31Wrapped=true;
    global.saveResponseLanguage=wrapped;
    hydrate().catch(function(){});
  }
  global.BAAM31LanguageServer={hydrate, sync};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install); else install();
})(window);
