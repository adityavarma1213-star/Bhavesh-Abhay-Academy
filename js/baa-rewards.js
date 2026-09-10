/* ============================================================
   BAA Module 30 — Achievement & Rewards Center
   Evidence-backed gamification from real assessment activity.
   XP/badge rules are transparent BAA product rules, not academic
   scores. No reward is granted from fabricated or client-supplied
   numbers; the module derives rewards from stored attempts/evidence.
   ============================================================ */
(function(global){
'use strict';

const STORAGE_KEY='baa_rewards_v1';
const SCHEMA_VERSION=1;

let syncLearnerId=null; let syncInFlight=false;
const BADGES=[
  {id:'first_attempt',name:'First Step',icon:'🌱',description:'Complete your first assessment.',check:s=>s.completedAttempts>=1},
  {id:'five_attempts',name:'Getting Consistent',icon:'🔥',description:'Complete 5 assessments.',check:s=>s.completedAttempts>=5},
  {id:'fifty_answers',name:'Practice Builder',icon:'🧩',description:'Answer 50 assessed questions.',check:s=>s.answeredQuestions>=50},
  {id:'hundred_correct',name:'Accuracy Builder',icon:'🎯',description:'Reach 100 correct assessed answers.',check:s=>s.correctAnswers>=100},
  {id:'first_mastery',name:'Concept Mastery',icon:'🏆',description:'Reach evidence-backed mastery in a concept.',check:s=>s.masteredConcepts>=1},
  {id:'five_masteries',name:'Mastery Momentum',icon:'⭐',description:'Reach evidence-backed mastery in 5 concepts.',check:s=>s.masteredConcepts>=5}
];

function readAssessment(){
  const a=global.BAAAssessment;
  if(!a||typeof a._load!=='function')
    return {ok:false,error:'ASSESSMENT_NOT_READY',store:null};
  try{return {ok:true,error:null,store:a._load()};}
  catch(_){return {ok:false,error:'ASSESSMENT_READ_FAILED',store:null};}
}

function summarize(){
  const r=readAssessment();
  if(!r.ok)return r;
  const store=r.store||{};
  const attempts=Array.isArray(store.attempts)?store.attempts:[];
  const evidence=Array.isArray(store.evidence)?store.evidence:[];
  const completed=attempts.filter(a=>a&&a.status==='submitted'&&a.evaluationStatus!=='partial').length;
  const answered=evidence.length;
  const correct=evidence.filter(e=>e.correctness==='correct').length;
  const memory=store.learningMemory&&typeof store.learningMemory==='object'?Object.values(store.learningMemory):[];
  const mastered=memory.filter(m=>m.status==='mastered'||m.status==='strong').length;

  // Transparent XP: activity-based, not a replacement for academic scores.
  const xp=completed*10 + correct*5 + mastered*25;

  return {ok:true,error:null,completedAttempts:completed,answeredQuestions:answered,
    correctAnswers:correct,masteredConcepts:mastered,xp};
}

function loadEarned(){
  try{
    const raw=localStorage.getItem(STORAGE_KEY);
    const parsed=raw?JSON.parse(raw):null;
    if(parsed&&parsed.schemaVersion===SCHEMA_VERSION&&Array.isArray(parsed.earnedBadgeIds))return parsed;
  }catch(_){}
  return {schemaVersion:SCHEMA_VERSION,earnedBadgeIds:[],lastSyncedAt:null};
}

async function pushServer(state){ if(!syncLearnerId||typeof fetch!=='function')return; try{await fetch(`/api/v1/rewards?learnerId=${encodeURIComponent(syncLearnerId)}`,{method:'PUT',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({earnedBadgeIds:state.earnedBadgeIds,xp:state.xp,completedAttempts:state.completedAttempts,answeredQuestions:state.answeredQuestions,correctAnswers:state.correctAnswers,masteredConcepts:state.masteredConcepts})});}catch(e){console.warn('[BAA Rewards] server sync failed; local rewards retained',e);} }
function setSyncTarget(id){syncLearnerId=id||null;}
async function hydrateFromServer(id){if(!id||typeof fetch!=='function')return false;try{const r=await fetch(`/api/v1/rewards?learnerId=${encodeURIComponent(id)}`,{credentials:'include'});if(!r.ok)throw new Error(String(r.status));const p=await r.json();const prior=loadEarned();const server=Array.isArray(p.rewards?.earnedBadgeIds)?p.rewards.earnedBadgeIds:[];
const serverStats={xp:Number(p.rewards?.xp||0),completedAttempts:Number(p.rewards?.completedAttempts||0),answeredQuestions:Number(p.rewards?.answeredQuestions||0),correctAnswers:Number(p.rewards?.correctAnswers||0),masteredConcepts:Number(p.rewards?.masteredConcepts||0)};const merged=[...new Set([...prior.earnedBadgeIds,...server])];localStorage.setItem(STORAGE_KEY,JSON.stringify({...prior,earnedBadgeIds:merged,lastSyncedAt:new Date().toISOString(),serverStats}));setSyncTarget(id);return true;}catch(e){console.warn('[BAA Rewards] hydrate failed; continuing locally',e);return false;}}
function sync(){
  const s=summarize();
  if(!s.ok)return s;
  const prior=loadEarned();
  const earned=BADGES.filter(b=>b.check(s));
  const ids=earned.map(b=>b.id);
  const newlyEarned=ids.filter(id=>!prior.earnedBadgeIds.includes(id));
  const next={schemaVersion:SCHEMA_VERSION,earnedBadgeIds:ids,lastSyncedAt:new Date().toISOString(),xp:s.xp,completedAttempts:s.completedAttempts,answeredQuestions:s.answeredQuestions,correctAnswers:s.correctAnswers,masteredConcepts:s.masteredConcepts,events:newlyEarned.map(id=>({id:'reward_'+id,eventType:'badge_earned',sourceId:id,xp:0,metadata:{badgeId:id}}))};
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(next));}
  catch(_){return {...s,error:'REWARD_STORAGE_FAILED',earnedBadges:earned,newlyEarned};}
  pushServer(next);
  return {...s,error:null,earnedBadges:earned,newlyEarned};
}

function getState(){
  const s=sync();
  if(!s.ok)return s;
  return {...s,allBadges:BADGES.map(b=>({...b,earned:s.earnedBadgeIds?.includes(b.id)||s.earnedBadges?.some(x=>x.id===b.id)}))};
}

function getMilestones(){
  const s=summarize();
  if(!s.ok)return s;
  const targets=[
    {id:'xp_50',label:'50 XP',target:50,current:s.xp},
    {id:'xp_100',label:'100 XP',target:100,current:s.xp},
    {id:'xp_250',label:'250 XP',target:250,current:s.xp},
    {id:'mastery_1',label:'1 mastered concept',target:1,current:s.masteredConcepts},
    {id:'mastery_5',label:'5 mastered concepts',target:5,current:s.masteredConcepts}
  ];
  return {ok:true,error:null,milestones:targets.map(m=>({...m,completed:m.current>=m.target}))};
}

global.BAARewards={getState,getMilestones,sync,setSyncTarget,hydrateFromServer};
})(window);
