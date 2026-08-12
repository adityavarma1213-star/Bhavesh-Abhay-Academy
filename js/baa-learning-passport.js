/* ============================================================
   js/baa-learning-passport.js
   BAA OS — Module 19: AI Learning Passport.
   Builds a portable, evidence-backed academic competency record from
   real assessment evidence. "Verified" means evidence-backed inside
   this local testing system; it is not an external credential.
   ============================================================ */
(function(global){
  'use strict';
  const SCHEMA_VERSION=1;
  function build(){
    const a=global.BAAAssessment;
    if(!a)return {schemaVersion:SCHEMA_VERSION,status:'unavailable'};
    const store=a._load();
    const memory=Object.values(store.learningMemory||{});
    const competencies=memory
      .filter(m=>m.status==='mastered'||m.status==='strong')
      .map(m=>({
        concept:m.concept,subject:m.subject,topic:m.topic,
        status:m.status,evidenceCount:m.evidenceCount,correctCount:m.correctCount,
        verifiedByEvidence:true,lastUpdated:m.lastUpdated
      }));
    const attempts=(store.attempts||[]).filter(x=>x.status!=='in_progress');
    return {
      schemaVersion:SCHEMA_VERSION,
      student:a.getStudentName(),
      issuedAt:new Date().toISOString(),
      status:'local_testing_record',
      competencies,
      assessments:attempts.slice(0,20).map(x=>({
        id:x.id,title:x.assessmentTitle,score:x.score,maxScore:x.maxScore,
        status:x.status,completedAt:x.endTime
      })),
      evidenceCount:(store.evidence||[]).length
    };
  }
  function exportJson(){
    return JSON.stringify(build(),null,2);
  }
  global.BAALearningPassport={build,exportJson};
})(window);
