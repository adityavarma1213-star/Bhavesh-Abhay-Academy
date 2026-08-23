/* ============================================================
   js/baa-guardian.js
   BAA OS — Module 12: AI Guardian.

   Scope: academic early-support signals only. This module does NOT
   diagnose mental health, personality, family conditions, or intent.
   It reads academic evidence/planner/review data and returns
   bounded, explainable support alerts.
   ============================================================ */
(function(global){
  'use strict';

  const STORAGE_KEY='baa_guardian_v1';
  const SCHEMA_VERSION=1;

  function emptyStore(){
    return {meta:{schemaVersion:SCHEMA_VERSION,storageType:'LOCAL_BROWSER_STORAGE_TESTING_ONLY',createdAt:new Date().toISOString()},acknowledged:{},lastEvaluatedAt:null};
  }
  function load(){
    try{
      const raw=localStorage.getItem(STORAGE_KEY);
      if(!raw) return emptyStore();
      const parsed=JSON.parse(raw);
      return parsed && parsed.meta?.schemaVersion===SCHEMA_VERSION ? parsed : emptyStore();
    }catch{return emptyStore();}
  }
  function save(store){
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(store));return true;}catch{return false;}
  }

  function assessmentCore(){return typeof global.BAAAssessment!=='undefined' ? global.BAAAssessment : null;}
  function plannerCore(){return typeof global.BAAPlanner!=='undefined' ? global.BAAPlanner : null;}

  function getAcademicAlerts(){
    const core=assessmentCore(); const alerts=[];
    if(!core) return alerts;
    const store=typeof core._load==='function' ? core._load() : null;
    if(!store) return alerts;

    const grouped={};
    (store.evidence||[]).forEach(row=>{
      if(!row||!row.concept) return;
      (grouped[row.concept] ||= []).push(row);
    });
    Object.entries(grouped).forEach(([concept,rows])=>{
      const recent=rows.slice(-3); if(recent.length<3) return;
      const scored=recent.filter(r=>r.correctness==='correct'||r.correctness==='incorrect');
      if(scored.length<3) return;
      const correct=scored.filter(r=>r.correctness==='correct').length;
      if(correct<=1) alerts.push({id:`low_performance:${concept}`,severity:'high',type:'repeated_low_performance',concept,subject:recent[recent.length-1].subject||null,title:`Extra support may help with ${concept.replace(/-/g,' ')}`,reason:`Recent evidence shows ${correct}/${scored.length} correct across the latest evidence points.`,action:{kind:'practice',concept},requiresHumanReview:false});
    });

    const pending=(store.teacherReviews||[]).filter(r=>r.teacherStatus==='pending');
    if(pending.length) alerts.push({id:'pending_human_review',severity:'medium',type:'pending_review',concept:null,subject:null,title:'Some AI-evaluated work is awaiting human review',reason:`${pending.length} evaluation${pending.length===1?'':'s'} are flagged for teacher review.`,action:{kind:'teacher_review',href:'teacher-review.html'},requiresHumanReview:true});

    const planner=plannerCore();
    if(planner && typeof planner.getDailyPlan==='function'){
      const plan=planner.getDailyPlan(); const missed=(plan.tasks||[]).filter(t=>t.status==='missed');
      if(missed.length>=2) alerts.push({id:'missed_planner_tasks',severity:'medium',type:'missed_planner_tasks',concept:null,subject:null,title:'Your plan has several unfinished tasks',reason:`${missed.length} planned task${missed.length===1?'':'s'} were missed and need rebalancing.`,action:{kind:'planner',href:'#planner'},requiresHumanReview:false});
    }
    return alerts.sort((a,b)=>({high:0,medium:1,low:2}[a.severity]||9)-({high:0,medium:1,low:2}[b.severity]||9));
  }

  function getSummary(){
    const alerts=getAcademicAlerts(), store=load(), active=alerts.filter(a=>!store.acknowledged[a.id]);
    return {alerts:active,alertCount:active.length,highestSeverity:active[0]?.severity||'none',evaluatedAt:new Date().toISOString(),scope:'academic_support_only'};
  }

  function acknowledgeAlert(id){
    if(!id) return false;
    const store=load(); store.acknowledged[String(id)]=new Date().toISOString(); store.lastEvaluatedAt=new Date().toISOString();
    return save(store);
  }

  function resetAcknowledgements(){const store=load();store.acknowledged={};return save(store);}

  // Production path: acknowledgement state is also persisted server-side for authenticated learners.
  // Local storage remains only as an offline/test fallback and never acts as the authorization boundary.
  async function syncServer(learnerId){
    if(!learnerId) return {ok:false,error:'LEARNER_ID_REQUIRED'};
    const response=await fetch(`/api/m12-guardian?learnerId=${encodeURIComponent(learnerId)}`,{credentials:'include'});
    if(!response.ok) return {ok:false,error:'GUARDIAN_SERVER_UNAVAILABLE',status:response.status};
    const data=await response.json();
    const store=load(); store.acknowledged={};
    (data.acknowledgements||[]).forEach(x=>{if(x?.alertId) store.acknowledged[String(x.alertId)]=x.acknowledgedAt||new Date().toISOString();});
    store.lastEvaluatedAt=new Date().toISOString();
    save(store);
    return {ok:true,acknowledgements:data.acknowledgements||[]};
  }

  async function acknowledgeAlertServer(learnerId, alertId){
    if(!learnerId||!alertId) return {ok:false,error:'LEARNER_AND_ALERT_REQUIRED'};
    acknowledgeAlert(alertId);
    const response=await fetch(`/api/m12-guardian?learnerId=${encodeURIComponent(learnerId)}`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({alertId:String(alertId)})});
    if(!response.ok) return {ok:false,error:'GUARDIAN_SERVER_WRITE_FAILED',status:response.status};
    return {ok:true,alertId:String(alertId)};
  }

  async function resetAcknowledgementsServer(learnerId){
    if(!learnerId) return {ok:false,error:'LEARNER_ID_REQUIRED'};
    resetAcknowledgements();
    const response=await fetch(`/api/m12-guardian?learnerId=${encodeURIComponent(learnerId)}`,{method:'DELETE',credentials:'include',headers:{'Content-Type':'application/json'},body:'{}'});
    if(!response.ok) return {ok:false,error:'GUARDIAN_SERVER_DELETE_FAILED',status:response.status};
    return {ok:true};
  }

  global.BAAGuardian={getAcademicAlerts,getSummary,acknowledgeAlert,resetAcknowledgements,syncServer,acknowledgeAlertServer,resetAcknowledgementsServer,_load:load};
})(window);
