/* BAA Module 24 — AI Revision Engine. Evidence-based spaced-review schedule, not a claim of validated medical/scientific timing. */
(function(global){
'use strict';
const INTERVALS=[1,3,7,14,30];
function getRevisionPlan(){
 const a=global.BAAAssessment;if(!a)return [];
 const memory=Object.values(a.getLearningMemory());
 const now=Date.now();
 return memory.map(m=>{
   const last=Date.parse(m.lastUpdated||'');
   const days=Number.isFinite(last)?Math.max(0,Math.floor((now-last)/86400000)):0;
   const idx=m.status==='needs_revision'||m.status==='struggling'?0:m.status==='learning'?1:Math.min(4,Math.floor(m.evidenceCount/3));
   const interval=INTERVALS[idx];
   return {concept:m.concept,subject:m.subject,status:m.status,evidenceCount:m.evidenceCount,reviewIntervalDays:interval,due:days>=interval,reason:`Review interval selected from current evidence state "${m.status}".`};
 });
}
async function loadServerPlan(learnerId){
 const id=String(learnerId||global.BAA_LEARNER_ID||'').trim();
 if(!id)return {ok:false,error:{code:'LEARNER_REQUIRED',message:'A learner context is required.'}};
 try{
  const response=await fetch(`/api/m24-revision?learnerId=${encodeURIComponent(id)}`,{credentials:'include',cache:'no-store',headers:{Accept:'application/json'}});
  const data=await response.json().catch(()=>null);
  if(!response.ok)return {ok:false,error:data?.error||{code:'REVISION_LOAD_FAILED',message:'Revision schedule could not be loaded.'}};
  return {ok:true,plan:Array.isArray(data?.plan)?data.plan:[],source:data?.source||'server_learning_evidence',limitation:data?.limitation||''};
 }catch{return {ok:false,error:{code:'NETWORK_ERROR',message:'Revision schedule could not reach the server.'}};}
}
function esc(s){const d=document.createElement('div');d.textContent=String(s??'');return d.innerHTML;}
function renderServerPlan(result){
 if(!document.body||document.getElementById('baa-m24-server-panel'))return;
 const host=document.getElementById('serverLearnerView')||document.getElementById('content');
 if(!host)return;
 const panel=document.createElement('section');panel.id='baa-m24-server-panel';panel.className='card';
 const due=(result.ok?result.plan:[]).filter(x=>x.due).slice(0,8);
 panel.innerHTML=`<h2 class="section-h" style="margin-top:0">🔁 Evidence-based revision</h2><p style="color:var(--dim);font-size:.78rem;line-height:1.5;margin-bottom:12px">This schedule is derived from persisted learning evidence. It is a product heuristic, not a medical or scientifically validated timing claim.</p>`+
 (result.ok?(due.length?due.map(x=>`<div class="attempt-row"><span><b>${esc(x.concept)}</b><br><small>${esc(x.reason)}</small></span><span class="a-pct">Review now</span></div>`).join(''):`<div class="empty-note" style="padding:18px">No server-backed revision is due right now.</div>`):`<div class="empty-note" style="padding:18px">${esc(result.error?.message||'Server revision schedule unavailable.')}</div>`);
 host.insertBefore(panel,host.firstChild);
}
global.BAARevision={getRevisionPlan,loadServerPlan,renderServerPlan};
if(typeof document!=='undefined'){
 const boot=()=>setTimeout(()=>loadServerPlan().then(renderServerPlan),0);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
}
})(window);
