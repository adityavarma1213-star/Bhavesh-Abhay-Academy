// BAA M06 — authenticated Mastery Gate client boundary.
(function(){
  'use strict';
  const API='/api/m06-mastery-gate';
  const clean=v=>String(v??'').trim();
  async function request(method, scope, body){
    const q=new URLSearchParams({learnerId:clean(scope.learnerId),subject:clean(scope.subject),chapter:clean(scope.chapter)});
    const options={method,credentials:'include',cache:'no-store',headers:{Accept:'application/json'}};
    if(body){options.headers['Content-Type']='application/json';options.body=JSON.stringify({...body,learnerId:clean(scope.learnerId),subject:clean(scope.subject),chapter:clean(scope.chapter)});}
    const r=await fetch(`${API}?${q}`,options);
    const data=await r.json().catch(()=>({error:{code:'INVALID_RESPONSE',message:'The mastery gate returned an invalid response.'}}));
    if(!r.ok) throw Object.assign(new Error(data?.error?.message||'Mastery gate request failed.'),{code:data?.error?.code||'MASTERY_GATE_FAILED',status:r.status});
    return data;
  }
  window.BAAMasteryGate={
    get(scope){return request('GET',scope);},
    bypass(scope,password,reason){return request('POST',scope,{action:'bypass',password,reason});},
    canProceed(gate){return !!gate && (gate.status!=='locked' || !!gate.bypass);}
  };
})();
