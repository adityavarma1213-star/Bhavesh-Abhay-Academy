/* BAA M31 — server persistence bridge for the existing Student OS language control.
 * Local preference remains the immediate UI source; authenticated server state is
 * used when available and failed sync never blocks the student's language choice.
 * Server versions are retained so stale cross-device writes are rejected.
 */
(function(global){
  'use strict';
  const SUPPORTED=new Set(['en','hi','mr','gu','bn','ta','te','kn']);
  const PATH='/api/m31-language-preference';
  let serverUpdatedAt=null;
  function learnerId(){
    try{
      const raw=localStorage.getItem('baa_auth_session_v1') || localStorage.getItem('baa_auth_user_v1');
      const parsed=raw?JSON.parse(raw):null;
      return String(parsed?.learnerId || parsed?.userId || parsed?.user?.id || '').trim();
    }catch(_){ return ''; }
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
    try{ data=await res.json(); }catch(_){ return null; }
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
