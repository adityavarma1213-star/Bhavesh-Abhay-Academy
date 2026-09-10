/* BAA Cross-cutting Learning Progression Gate.
   Real red/green findings, chapter sequencing, parent-authorized bypass, and
   transparent academic forecast hydration. Server data is authoritative for
   authenticated learners; anonymous testing remains local-only and never
   claims a server gate. */
(function(global){
'use strict';
const esc=(v)=>{const d=document.createElement('div');d.textContent=String(v??'');return d.innerHTML;};
let learnerId=null;
function setLearnerId(id){learnerId=id||null;}
async function getGate(subject,chapter){
  if(!learnerId) return {ok:false,localOnly:true,gate:{subject,chapter,status:'open',redCount:0,greenCount:0,totalFindings:0},canEnter:true};
  const r=await fetch(`/api/v1/progression-gate?learnerId=${encodeURIComponent(learnerId)}&subject=${encodeURIComponent(subject)}&chapter=${encodeURIComponent(chapter)}`,{credentials:'include'});
  const p=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(p?.error?.message||'Could not load progression gate.');
  return p;
}
async function canEnter(subject,chapter){
  try{return await getGate(subject,chapter);}catch(e){return {ok:false,error:e.message,canEnter:false};}
}
function findingsMarkup(gate){
  if(!gate?.totalFindings) return '<div class="gate-empty">No findings yet. Complete an assessment to create evidence-backed red/green findings.</div>';
  return `<div class="gate-findings">${(gate.findings||[]).map(f=>`<div class="gate-finding ${f.status==='green'?'green':'red'}"><span>${f.status==='green'?'🟢':'🔴'}</span><div><b>${esc(f.text)}</b><small>${esc(f.type)} · ${f.status==='green'?'cleared':'must be cleared'}</small></div></div>`).join('')}</div>`;
}
async function renderStudentGate({mountId='progressionGatePanel',subject,chapter}={}){
 const mount=document.getElementById(mountId); if(!mount||!subject||!chapter)return null;
 mount.innerHTML='<div class="gate-card"><div class="gate-empty">Checking chapter mastery gate…</div></div>';
 try{
  const p=await getGate(subject,chapter); const g=p.gate;
  const locked=!p.canEnter;
  mount.innerHTML=`<div class="gate-card ${locked?'gate-locked':g.status==='cleared'?'gate-cleared':''}">
   <div class="gate-head"><div><div class="gate-kicker">LEARNING PROGRESSION</div><h3>${locked?'🔴 Chapter locked':'🧭 '+esc(chapter)}</h3></div><span class="gate-badge ${locked?'red':g.status==='cleared'?'green':'open'}">${locked?'LOCKED':g.status==='cleared'?'ALL GREEN':'OPEN'}</span></div>
   <p class="gate-copy">${locked?`You have ${g.redCount} unresolved finding${g.redCount===1?'':'s'}. Clear every red finding before BAA opens the next chapter.`:g.status==='cleared'?'All recorded findings are green. The next chapter can be opened.':'No unresolved finding is blocking this chapter.'}</p>
   ${findingsMarkup(g)}
   ${g.bypassActive?`<div class="gate-bypass-note">🛡️ Parent-authorized bypass is active for this chapter. The next completed assessment will re-check the findings.</div>`:''}
  </div>`;
  return p;
 }catch(e){mount.innerHTML='<div class="gate-card"><div class="gate-empty">Progression gate could not be checked. BAA will not pretend the chapter is cleared.</div></div>';return null;}
}
async function renderForecast({mountId='academicForecastPanel'}={}){
 const mount=document.getElementById(mountId);if(!mount||!learnerId)return null;
 try{
  const r=await fetch(`/api/v1/academic-forecast?learnerId=${encodeURIComponent(learnerId)}`,{credentials:'include'}); const p=await r.json(); if(!r.ok)throw new Error(p?.error?.message||'Forecast unavailable');
  const overall=p.overallPercentage==null?'—':`${p.overallPercentage}%`;
  mount.innerHTML=`<div class="forecast-card"><div class="forecast-head"><div><div class="gate-kicker">ACADEMIC FORECAST</div><h3>🔮 Exam readiness</h3></div><b>${overall}</b></div>${p.exams?.length?p.exams.map(e=>{const f=e.forecast;const cls=f.warningLevel==='urgent'?'urgent':f.warningLevel?.includes('caution')?'caution':'good';return `<div class="forecast-row"><div><b>${esc(e.title)}</b><small>${esc(e.subject||'')} ${e.chapter?'· '+esc(e.chapter):''} · ${e.daysUntil} day${e.daysUntil===1?'':'s'} away</small></div><span class="forecast-pill ${cls}">${f.status==='forecast'?`${f.predictedPercentage}% (${f.range.low}–${f.range.high}%)`:'Need more evidence'}</span></div>${f.warningLevel&&f.warningLevel!=='monitor'?`<div class="forecast-warning ${cls}">⚠️ ${f.warningLevel==='urgent'?'Priority revision is recommended now.':'Exam is approaching and current evidence is below the preferred readiness band.'}</div>`:''}`}).join(''):'<div class="gate-empty">Add an upcoming assessment linked to a BAA assessment to receive an evidence-based forecast.</div>'}</div>`;
  return p;
 }catch(e){mount.innerHTML='<div class="forecast-card"><div class="gate-empty">Forecast is unavailable until authenticated assessment data is available.</div></div>';return null;}
}
global.BAAProgressionGate={setLearnerId,getGate,canEnter,renderStudentGate,renderForecast,findingsMarkup};
})(window);
