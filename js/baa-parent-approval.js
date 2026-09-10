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
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(policy));pushSync(policy);return true;}catch{return false;}
  }

  // ------------------------------------------------------------
  // Server sync — was previously localStorage-only (see audit notes).
  // A parent typically sets this policy from their own device; without
  // server sync it never reached the student's device. localStorage
  // remains the synchronous, offline-first source of truth that
  // canUse()/getDailyMinutesLimit() read from directly.
  // ------------------------------------------------------------
  let syncLearnerId=null;
  const STATE_KEY='parent_approval_v1';
  function setSyncTarget(learnerId){syncLearnerId=learnerId||null;}
  function pushSync(policy){
    if(!syncLearnerId||typeof fetch==='undefined')return;
    const url=`/api/v1/client-state?learnerId=${encodeURIComponent(syncLearnerId)}&stateKey=${STATE_KEY}`;
    const opts={method:'PUT',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(policy)};
    fetch(url,opts).catch((e)=>{
      if(global.BAAOfflineSync)global.BAAOfflineSync.enqueue(url,opts);
      console.warn('[BAA Module 15] Parent Approval sync queued offline',e);
    });
  }
  async function hydrateFromServer(learnerId){
    if(!learnerId||typeof fetch==='undefined')return false;
    try{
      const res=await fetch(`/api/v1/client-state?learnerId=${encodeURIComponent(learnerId)}&stateKey=${STATE_KEY}`,{credentials:'include'});
      if(!res.ok)throw new Error(`server returned ${res.status}`);
      const {state}=await res.json();
      if(state&&state.schemaVersion===SCHEMA_VERSION){
        localStorage.setItem(STORAGE_KEY,JSON.stringify({...DEFAULT_POLICY,...state}));
      }
      setSyncTarget(learnerId);
      return true;
    }catch(e){
      console.warn('[BAA Module 15] Could not hydrate Parent Approval from server — continuing with local data only.',e);
      return false;
    }
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
  global.BAAParentApproval={getPolicy,updatePolicy,canUse,getDailyMinutesLimit,_load:load,setSyncTarget,hydrateFromServer};
})(window);
