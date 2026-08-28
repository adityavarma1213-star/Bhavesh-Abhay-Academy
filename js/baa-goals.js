/* BAA Module 25 — AI Goal Tracker. Reuses the real Planner goal store and adds evidence-linked progress. */
(function(global){
'use strict';
let serverSnapshot=null;
function getGoals(){
 const planner=global.BAAPlanner;if(!planner)return [];
 const goals=planner.getGoals();
 const summary=global.BAAIntelligence&&global.BAAIntelligence.getLearningSummary?global.BAAIntelligence.getLearningSummary():null;
 return goals.map(g=>({...g,relatedConcepts:summary?[...summary.struggling,...summary.needsRevision,...summary.learning].filter(c=>g.text.toLowerCase().includes(c.conceptLabel.split(' ')[0].toLowerCase())).map(c=>c.concept):[]}));
}
function escapeText(value){return String(value??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));}
function ensurePanel(){
 let panel=document.getElementById('baa-m25-goal-panel');
 if(panel)return panel;
 panel=document.createElement('section');
 panel.id='baa-m25-goal-panel';
 panel.setAttribute('aria-labelledby','baa-m25-goal-title');
 panel.style.cssText='margin:24px 0;padding:22px;border:1px solid rgba(253,249,240,.12);border-radius:22px;background:linear-gradient(145deg,rgba(76,217,232,.10),rgba(124,92,252,.10));';
 panel.innerHTML='<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap"><div><div style="font-size:.7rem;letter-spacing:.16em;text-transform:uppercase;color:#4CD9E8">AI Goal Tracker</div><h2 id="baa-m25-goal-title" style="font-family:var(--display,serif);font-size:1.35rem;margin-top:5px">Goals linked to real learning evidence</h2></div><button id="baa-m25-refresh" type="button" style="border:1px solid rgba(253,249,240,.16);background:rgba(253,249,240,.06);color:inherit;border-radius:999px;padding:9px 14px;font-weight:700">Refresh</button></div><div id="baa-m25-goal-status" role="status" aria-live="polite" style="color:rgba(253,249,240,.65);font-size:.85rem;margin:12px 0">Loading server-backed goal progress…</div><div id="baa-m25-goal-list"></div><p style="color:rgba(253,249,240,.5);font-size:.72rem;line-height:1.5;margin-top:14px">Progress is an academic evidence heuristic. It does not measure motivation or predict outcomes.</p>';
 const anchor=document.querySelector('#screen-home .home-inner')||document.querySelector('#screen-home');
 if(anchor)anchor.appendChild(panel); else document.body.appendChild(panel);
 panel.querySelector('#baa-m25-refresh').addEventListener('click',()=>loadServerGoals(global.BAA_LEARNER_ID));
 return panel;
}
function renderServerGoals(payload){
 const panel=ensurePanel();
 const status=panel.querySelector('#baa-m25-goal-status');
 const list=panel.querySelector('#baa-m25-goal-list');
 if(!payload||!payload.ok){status.textContent='Goal progress is temporarily unavailable; your existing planner goals remain available.';list.innerHTML='';return;}
 if(!payload.goals?.length){status.textContent='No goals have been added yet. Add a goal in Planner to begin evidence-linked tracking.';list.innerHTML='';return;}
 status.textContent=`${payload.goals.length} goal${payload.goals.length===1?'':'s'} checked against ${payload.evidencePoints||0} server evidence point${payload.evidencePoints===1?'':'s'}.`;
 list.innerHTML=payload.goals.map(goal=>{
   const accuracy=goal.accuracy==null?'No evidence yet':`${goal.accuracy}% observed accuracy`;
   const statusLabel=String(goal.status||'no_evidence').replace(/_/g,' ');
   const concepts=(goal.matchedConcepts||[]).slice(0,3).map(c=>escapeText(c.concept)).join(', ');
   return `<article style="padding:14px 0;border-top:1px solid rgba(253,249,240,.08)"><div style="font-weight:800">${escapeText(goal.text)}</div><div style="font-size:.78rem;color:rgba(253,249,240,.62);margin-top:5px">${accuracy} · ${escapeText(statusLabel)}${concepts?' · matched: '+concepts:''}</div><div style="font-size:.76rem;color:rgba(253,249,240,.5);margin-top:5px">${escapeText(goal.nextAction||'Keep building evidence through learning activities.')}</div></article>`;
 }).join('');
}
async function loadServerGoals(learnerId){
 const id=String(learnerId||global.BAA_LEARNER_ID||'').trim();
 if(!id) return {ok:false,error:{code:'LEARNER_ID_REQUIRED'}};
 const response=await fetch(`/api/m25-goal-tracker?learnerId=${encodeURIComponent(id)}`,{credentials:'include',cache:'no-store',headers:{Accept:'application/json'}});
 const payload=await response.json().catch(()=>({}));
 if(!response.ok) throw new Error(payload?.error?.message||'Unable to load server goal progress.');
 serverSnapshot=payload;
 renderServerGoals(payload);
 try{global.dispatchEvent(new CustomEvent('baa:goals-server-updated',{detail:payload}));}catch(_){ }
 return payload;
}
function getServerGoals(){return serverSnapshot?.goals||[];}
function autoLoad(){
 if(!global.BAA_LEARNER_ID)return;
 ensurePanel();
 loadServerGoals(global.BAA_LEARNER_ID).catch(()=>renderServerGoals(null));
}
global.BAAGoals={getGoals,loadServerGoals,getServerGoals};
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',autoLoad,{once:true});
else autoLoad();
})(window);
