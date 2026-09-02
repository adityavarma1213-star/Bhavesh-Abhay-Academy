/* ============================================================
   BAA OS — Module 19: AI Learning Passport.
   Builds a portable, evidence-backed academic competency record from
   real server assessment evidence. "Verified" means evidence-backed
   inside BAA; it is not an external credential.
   ============================================================ */
(function(global){
  'use strict';
  const SCHEMA_VERSION=2;
  const MIN_EVIDENCE=3;
  const MAX_RESPONSE_BYTES=1024*1024;
  let serverRecord=null;
  async function readJson(response){
    const declared=Number(response?.headers?.get?.('content-length'));
    if(Number.isFinite(declared)&&declared>MAX_RESPONSE_BYTES){try{response.body?.cancel?.();}catch(_){}throw Object.assign(new Error('Learning passport response is too large.'),{code:'PASSPORT_RESPONSE_TOO_LARGE'});}
    if(!response?.body||typeof response.body.getReader!=='function'){
      try{return await response.json();}catch(_){throw Object.assign(new Error('Learning passport returned an invalid response.'),{code:'PASSPORT_INVALID_RESPONSE'});}
    }
    const reader=response.body.getReader(),chunks=[],decoder=new TextDecoder();
    let total=0;
    try{
      while(true){
        const part=await reader.read();
        if(part.done)break;
        total+=part.value?.byteLength||0;
        if(total>MAX_RESPONSE_BYTES){try{await reader.cancel();}catch(_){}throw Object.assign(new Error('Learning passport response is too large.'),{code:'PASSPORT_RESPONSE_TOO_LARGE'});}
        chunks.push(part.value);
      }
    }finally{try{reader.releaseLock();}catch(_) {}}
    let text='';
    for(const chunk of chunks)text+=decoder.decode(chunk,{stream:true});
    text+=decoder.decode();
    try{return JSON.parse(text);}catch(_){throw Object.assign(new Error('Learning passport returned an invalid response.'),{code:'PASSPORT_INVALID_RESPONSE'});}
  }
  function build(){
    // Once authenticated server evidence has loaded, it is the canonical
    // passport source. Do not silently fall back to a stale browser snapshot
    // while a server record is available.
    if(serverRecord)return serverRecord;
    const a=global.BAAAssessment;
    if(!a)return {schemaVersion:SCHEMA_VERSION,status:'unavailable'};
    const store=a._load(),memory=Object.values(store.learningMemory||{});
    const competencies=memory.filter(m=>m.evidenceCount>=MIN_EVIDENCE&&(m.status==='mastered'||m.status==='strong')).map(m=>({concept:m.concept,subject:m.subject,topic:m.topic,status:m.status,evidenceCount:m.evidenceCount,correctCount:m.correctCount,verifiedByEvidence:true,lastUpdated:m.lastUpdated}));
    const attempts=(store.attempts||[]).filter(x=>x.status!=='in_progress');
    return {schemaVersion:SCHEMA_VERSION,student:a.getStudentName(),issuedAt:new Date().toISOString(),status:'local_testing_record',evidenceGate:{minimumEvidencePerConcept:MIN_EVIDENCE,sparseConceptsAreNotCharacterized:true},competencies,assessments:attempts.slice(0,20).map(x=>({id:x.id,title:x.assessmentTitle,score:x.score,maxScore:x.maxScore,status:x.status,completedAt:x.endTime})),evidenceCount:(store.evidence||[]).length};
  }
  async function load(learnerId){
    const id=String(learnerId||global.BAA_LEARNER_ID||'').trim();
    if(!id)throw new Error('learnerId is required.');
    const response=await fetch('/api/m19-passport?learnerId='+encodeURIComponent(id),{credentials:'include',cache:'no-store',headers:{Accept:'application/json'}});
    const body=await readJson(response);
    if(!response.ok)throw Object.assign(new Error(body?.error?.message||'Unable to load learning passport.'),{status:response.status,code:body?.error?.code});
    if(body?.schemaVersion!==SCHEMA_VERSION)throw new Error('Unsupported learning passport schema.');
    serverRecord=body;
    global.dispatchEvent(new CustomEvent('baa:m19-passport-loaded',{detail:body}));
    return body;
  }
  async function autoLoad(){
    const id=String(global.BAA_LEARNER_ID||'').trim();
    if(!id)return;
    try{await load(id);}catch(error){
      global.dispatchEvent(new CustomEvent('baa:m19-passport-unavailable',{detail:{message:error.message}}));
    }
  }
  function exportJson(record){return JSON.stringify(record||build(),null,2);}
  global.BAALearningPassport={build,load,autoLoad,exportJson,getServerRecord:function(){return serverRecord;}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',autoLoad);else autoLoad();
})(window);
