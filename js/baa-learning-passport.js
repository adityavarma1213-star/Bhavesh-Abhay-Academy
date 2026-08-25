/* ============================================================
   BAA OS — Module 19: AI Learning Passport.
   Builds a portable, evidence-backed academic competency record from
   real server assessment evidence. "Verified" means evidence-backed
   inside BAA; it is not an external credential.
   ============================================================ */
(function(global){
  'use strict';
  const SCHEMA_VERSION=2;
  function build(){
    const a=global.BAAAssessment;
    if(!a)return {schemaVersion:SCHEMA_VERSION,status:'unavailable'};
    const store=a._load(),memory=Object.values(store.learningMemory||{});
    const competencies=memory.filter(m=>m.status==='mastered'||m.status==='strong').map(m=>({concept:m.concept,subject:m.subject,topic:m.topic,status:m.status,evidenceCount:m.evidenceCount,correctCount:m.correctCount,verifiedByEvidence:true,lastUpdated:m.lastUpdated}));
    const attempts=(store.attempts||[]).filter(x=>x.status!=='in_progress');
    return {schemaVersion:1,student:a.getStudentName(),issuedAt:new Date().toISOString(),status:'local_testing_record',competencies,assessments:attempts.slice(0,20).map(x=>({id:x.id,title:x.assessmentTitle,score:x.score,maxScore:x.maxScore,status:x.status,completedAt:x.endTime})),evidenceCount:(store.evidence||[]).length};
  }
  async function load(learnerId){
    const id=String(learnerId||'').trim();
    if(!id)throw new Error('learnerId is required.');
    const response=await fetch('/api/m19-passport?learnerId='+encodeURIComponent(id),{credentials:'include'});
    const body=await response.json().catch(()=>({}));
    if(!response.ok)throw Object.assign(new Error(body?.error?.message||'Unable to load learning passport.'),{status:response.status,code:body?.error?.code});
    return body;
  }
  function exportJson(record){return JSON.stringify(record||build(),null,2);}
  global.BAALearningPassport={build,load,exportJson};
})(window);
