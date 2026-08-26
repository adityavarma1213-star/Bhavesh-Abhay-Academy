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

  async function loadServer(id){
    const learnerId=String(id||global.BAA_LEARNER_ID||'').trim();
    if(!learnerId)return {ok:false,error:{code:'LEARNER_REQUIRED',message:'A learner context is required.'}};
    try{
      const response=await fetch(`/api/m15-parent-policy?learnerId=${encodeURIComponent(learnerId)}`,{credentials:'include',headers:{Accept:'application/json'}});
      const data=await response.json().catch(()=>null);
      if(!response.ok)return {ok:false,error:data?.error||{code:'POLICY_LOAD_FAILED',message:'Parent policy could not be loaded.'}};
      return {ok:true,learnerId,policy:data.policy};
    }catch{return {ok:false,error:{code:'NETWORK_ERROR',message:'Parent policy could not reach the server.'}};}
  }

  async function saveServer(policy,id){
    const learnerId=String(id||global.BAA_LEARNER_ID||'').trim();
    if(!learnerId)return {ok:false,error:{code:'LEARNER_REQUIRED',message:'A learner context is required.'}};
    try{
      const response=await fetch('/api/m15-parent-policy',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({learnerId,...(policy||{})})});
      const data=await response.json().catch(()=>null);
      if(!response.ok)return {ok:false,error:data?.error||{code:'POLICY_SAVE_FAILED',message:'Parent policy could not be saved.'}};
      return {ok:true,learnerId,policy:data.policy};
    }catch{return {ok:false,error:{code:'NETWORK_ERROR',message:'Parent policy could not reach the server.'}};}
  }

  function renderServerPolicyPanel(){
    if(!document.body || document.getElementById('baa-m15-policy-panel'))return;
    const host=document.getElementById('serverLearnerView')||document.getElementById('content');
    if(!host)return;
    const panel=document.createElement('section');
    panel.id='baa-m15-policy-panel';
    panel.className='card';
    panel.setAttribute('aria-labelledby','baa-m15-policy-title');
    panel.innerHTML=`<h2 id="baa-m15-policy-title" class="section-h" style="margin-top:0">🛡️ Parent approval controls</h2>
      <p style="color:var(--dim);font-size:.8rem;line-height:1.55;margin-bottom:14px">These controls are stored against this learner on the BAA server. They apply to Tutor, Mentor and Planner access; they do not diagnose or replace parent/teacher judgment.</p>
      <div class="baa-gap-grid">
        <label class="baa-ui-inline-field">AI Tutor <select id="m15-tutor"><option value="true">Allowed</option><option value="false">Not allowed</option></select></label>
        <label class="baa-ui-inline-field">AI Mentor <select id="m15-mentor"><option value="true">Allowed</option><option value="false">Not allowed</option></select></label>
        <label class="baa-ui-inline-field">Planner <select id="m15-planner"><option value="true">Allowed</option><option value="false">Not allowed</option></select></label>
        <label class="baa-ui-inline-field">Daily planner minutes <input id="m15-minutes" type="number" min="0" max="480" step="5"></label>
      </div>
      <div style="display:flex;gap:10px;align-items:center;margin-top:12px;flex-wrap:wrap"><button id="m15-save" class="baa-mini">Save approval policy</button><span id="m15-status" class="bypass-status" aria-live="polite">Loading server policy…</span></div>`;
    host.insertBefore(panel,host.firstChild);
    const status=panel.querySelector('#m15-status');
    const setValue=(p)=>{
      panel.querySelector('#m15-tutor').value=String(p?.tutor_enabled!==false);
      panel.querySelector('#m15-mentor').value=String(p?.mentor_enabled!==false);
      panel.querySelector('#m15-planner').value=String(p?.planner_enabled!==false);
      panel.querySelector('#m15-minutes').value=String(Number.isFinite(Number(p?.planner_daily_minutes))?Number(p.planner_daily_minutes):180);
    };
    panel.querySelector('#m15-save').addEventListener('click',async()=>{
      status.textContent='Saving…';
      const result=await saveServer({tutor_enabled:panel.querySelector('#m15-tutor').value==='true',mentor_enabled:panel.querySelector('#m15-mentor').value==='true',planner_enabled:panel.querySelector('#m15-planner').value==='true',planner_daily_minutes:Number(panel.querySelector('#m15-minutes').value)});
      if(result.ok){status.textContent='Saved to the BAA server.';localStorage.removeItem(STORAGE_KEY);}
      else status.textContent=result.error?.message||'Could not save server policy.';
    });
    loadServer().then(result=>{
      if(result.ok){setValue(result.policy);status.textContent='Loaded from the BAA server.';}
      else status.textContent=result.error?.message||'Server policy unavailable; local defaults remain unchanged.';
    });
  }

  global.BAAParentApproval={getPolicy,updatePolicy,canUse,getDailyMinutesLimit,loadServer,saveServer,_load:load};
  if(typeof document!=='undefined'){
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',renderServerPolicyPanel,{once:true});
    else setTimeout(renderServerPolicyPanel,0);
  }
})(window);
