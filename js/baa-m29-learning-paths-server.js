/* M29 authenticated server bridge. */
(function(global){
'use strict';
async function getServerPath(subject,limit){
 const id=String(global.BAA_LEARNER_ID||document.body?.dataset?.learnerId||'').trim();
 if(!id)return {ok:false,error:'LEARNER_ID_REQUIRED',nodes:[]};
 const p=new URLSearchParams({learnerId:id});
 if(subject)p.set('subject',subject);
 if(limit)p.set('limit',String(limit));
 const r=await fetch('/api/m29-learning-paths?'+p.toString(),{credentials:'include',cache:'no-store',headers:{Accept:'application/json'}});
 let body={};try{body=await r.json();}catch(_){}
 if(!r.ok)return {ok:false,error:body?.error?.code||'LEARNING_PATH_FAILED',nodes:[]};
 return body;
}
global.BAAM29Server={getServerPath};
})(window);
