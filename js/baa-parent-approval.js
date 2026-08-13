/* ============================================================
   js/baa-parent-approval.js
   BAA OS — Module 15: Parent Approval Mode.
   Local/private testing governance layer. Defaults preserve existing
   behavior until a parent explicitly changes a policy.
   ============================================================ */
(function(global){
  'use strict';
  const STORAGE_KEY='baa_parent_approval_v1';
  const SCHEMA_VERSION=1;
  const DEFAULT_POLICY={
    schemaVersion:SCHEMA_VERSION,
    aiTutorEnabled:true,
    aiMentorEnabled:true,
    plannerEnabled:true,
    maxDailyStudyMinutes:180,
    requireHumanReviewForLowConfidence:true,
    updatedAt:null
  };
  function load(){
    try{
      const raw=localStorage.getItem(STORAGE_KEY);
      if(!raw)return {...DEFAULT_POLICY};
      const parsed=JSON.parse(raw);
      if(!parsed||parsed.schemaVersion!==SCHEMA_VERSION)return {...DEFAULT_POLICY};
      return {...DEFAULT_POLICY,...parsed};
    }catch{return {...DEFAULT_POLICY};}
  }
  function save(policy){
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(policy));return true;}catch{return false;}
  }
  function getPolicy(){return load();}
  function updatePolicy(patch={}){
    const current=load();
    if(typeof patch.aiTutorEnabled==='boolean')current.aiTutorEnabled=patch.aiTutorEnabled;
    if(typeof patch.aiMentorEnabled==='boolean')current.aiMentorEnabled=patch.aiMentorEnabled;
    if(typeof patch.plannerEnabled==='boolean')current.plannerEnabled=patch.plannerEnabled;
    if(Number.isFinite(Number(patch.maxDailyStudyMinutes)))
      current.maxDailyStudyMinutes=Math.max(15,Math.min(180,Math.round(Number(patch.maxDailyStudyMinutes))));
    if(typeof patch.requireHumanReviewForLowConfidence==='boolean')
      current.requireHumanReviewForLowConfidence=patch.requireHumanReviewForLowConfidence;
    current.updatedAt=new Date().toISOString();
    return save(current)?current:null;
  }
  function canUse(feature){
    const p=load();
    if(feature==='ai_tutor')return p.aiTutorEnabled;
    if(feature==='ai_mentor')return p.aiMentorEnabled;
    if(feature==='planner')return p.plannerEnabled;
    return true;
  }
  function getDailyMinutesLimit(){return load().maxDailyStudyMinutes;}
  global.BAAParentApproval={getPolicy,updatePolicy,canUse,getDailyMinutesLimit,_load:load};
})(window);
