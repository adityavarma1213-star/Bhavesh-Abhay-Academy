/* ============================================================
   js/baa-guardian.js
   BAA OS — Module 12: AI Guardian.

   Scope: academic early-support signals only. This module does NOT
   diagnose mental health, personality, family conditions, or intent.
   It reads existing academic evidence/planner/review data and returns
   bounded, explainable support alerts.
   ============================================================ */
(function(global){
  'use strict';

  const STORAGE_KEY='baa_guardian_v1';
  const SCHEMA_VERSION=1;

  function emptyStore(){
    return {
      meta:{schemaVersion:SCHEMA_VERSION,storageType:'LOCAL_BROWSER_STORAGE_TESTING_ONLY',createdAt:new Date().toISOString()},
      acknowledged:{},
      lastEvaluatedAt:null
    };
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

  function assessmentCore(){
    return typeof global.BAAAssessment!=='undefined' ? global.BAAAssessment : null;
  }
  function plannerCore(){
    return typeof global.BAAPlanner!=='undefined' ? global.BAAPlanner : null;
  }

  function getAcademicAlerts(){
    const core=assessmentCore();
    const alerts=[];
    if(!core) return alerts;

    const store=typeof core._load==='function' ? core._load() : null;
    if(!store) return alerts;

    // Signal 1: repeated low recent correctness in a concept.
    const grouped={};
    (store.evidence||[]).forEach(row=>{
      if(!row||!row.concept) return;
      (grouped[row.concept] ||= []).push(row);
    });
    Object.entries(grouped).forEach(([concept,rows])=>{
      const recent=rows.slice(-3);
      if(recent.length<3) return;
      const scored=recent.filter(r=>r.correctness==='correct'||r.correctness==='incorrect');
      if(scored.length<3) return;
      const correct=scored.filter(r=>r.correctness==='correct').length;
      if(correct<=1){
        alerts.push({
          id:`low_performance:${concept}`,
          severity:'high',
          type:'repeated_low_performance',
          concept,
          subject:recent[recent.length-1].subject||null,
          title:`Extra support may help with ${concept.replace(/-/g,' ')}`,
          reason:`Recent evidence shows ${correct}/${scored.length} correct across the latest evidence points.`,
          action:{kind:'practice',concept},
          requiresHumanReview:false
        });
      }
    });

    // Signal 2: unresolved human review.
    const pending=(store.teacherReviews||[]).filter(r=>r.teacherStatus==='pending');
    if(pending.length){
      alerts.push({
        id:'pending_human_review',
        severity:'medium',
        type:'pending_review',
        concept:null,
        subject:null,
        title:'Some AI-evaluated work is awaiting human review',
        reason:`${pending.length} evaluation${pending.length===1?'':'s'} are flagged for teacher review.`,
        action:{kind:'teacher_review',href:'teacher-review.html'},
        requiresHumanReview:true
      });
    }

    // Signal 3: missed planner work, if planner is available.
    const planner=plannerCore();
    if(planner && typeof planner.getDailyPlan==='function'){
      const plan=planner.getDailyPlan();
      const missed=(plan.tasks||[]).filter(t=>t.status==='missed');
      if(missed.length>=2){
        alerts.push({
          id:'missed_planner_tasks',
          severity:'medium',
          type:'missed_planner_tasks',
          concept:null,
          subject:null,
          title:'Your plan has several unfinished tasks',
          reason:`${missed.length} planned task${missed.length===1?'':'s'} were missed and need rebalancing.`,
          action:{kind:'planner',href:'#planner'},
          requiresHumanReview:false
        });
      }
    }

    return alerts.sort((a,b)=>{
      const rank={high:0,medium:1,low:2};
      return rank[a.severity]-rank[b.severity];
    });
  }

  function getSummary(){
    const alerts=getAcademicAlerts();
    const store=load();
    const active=alerts.filter(a=>!store.acknowledged[a.id]);
    return {
      alerts:active,
      alertCount:active.length,
      highestSeverity:active[0]?.severity||'none',
      evaluatedAt:new Date().toISOString(),
      scope:'academic_support_only'
    };
  }

  function acknowledgeAlert(id){
    if(!id) return false;
    const store=load();
    store.acknowledged[String(id)]=new Date().toISOString();
    store.lastEvaluatedAt=new Date().toISOString();
    return save(store);
  }

  function resetAcknowledgements(){
    const store=load();
    store.acknowledged={};
    return save(store);
  }

  global.BAAGuardian={
    getAcademicAlerts,
    getSummary,
    acknowledgeAlert,
    resetAcknowledgements,
    _load:load
  };
})(window);
