/* BAA M36 — server-backed Insights Dashboard surface. */
(function (global) {
  'use strict';
  const PANEL_ID='baa-m36-insights-server';
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function id(){return String(global.BAA_LEARNER_ID||document.body?.dataset?.learnerId||'').trim();}
  function mount(){
    if(document.getElementById(PANEL_ID))return document.getElementById(PANEL_ID);
    if(!document.body||!/student-os\.html$/i.test(location.pathname))return null;
    const p=document.createElement('section');p.id=PANEL_ID;p.setAttribute('aria-labelledby',PANEL_ID+'-title');p.style.cssText='margin:24px 0;padding:18px;border:1px solid rgba(127,127,127,.28);border-radius:16px;background:rgba(127,127,127,.06);';
    p.innerHTML='<div style="display:flex;align-items:center;justify-content:space-between;gap:12px"><div><h2 id="'+PANEL_ID+'-title" style="margin:0">AI Learning Insights</h2><p style="margin:6px 0;opacity:.78">Server-derived learning metrics from your recorded evidence.</p></div><button type="button" data-m36-refresh>Refresh</button></div><div data-m36-state style="margin-top:14px" aria-live="polite">Loading insights…</div>';
    (document.querySelector('main')||document.querySelector('[role="main"]')||document.body).appendChild(p);p.querySelector('[data-m36-refresh]').addEventListener('click',()=>load(p));return p;
  }
  function render(p,b){const s=p.querySelector('[data-m36-state]');if(!b?.ok){s.textContent='Insights are unavailable right now. No local preview is being presented as server data.';return;}const m=b.metrics||{};s.innerHTML='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px">'+[['Assessments',m.completedAssessments],['Questions',m.answeredQuestions],['Accuracy',m.accuracyPercent==null?'—':m.accuracyPercent+'%'],['Needs review',m.weakConceptCount],['XP',m.xp==null?'—':m.xp]].map(x=>'<div style="padding:12px;border-radius:12px;background:rgba(127,127,127,.08)"><strong>'+esc(x[0])+'</strong><div style="font-size:1.25rem;margin-top:4px">'+esc(x[1])+'</div></div>').join('')+'</div><small style="display:block;margin-top:10px;opacity:.68">Evidence quality: '+esc(b.evidenceQuality||'unknown')+'. Insights are learning-support signals, not psychological or future-outcome predictions.</small>';}
  async function load(p){p.querySelector('[data-m36-state]').textContent='Loading insights…';if(!global.BAAInsights||!id()){render(p,{ok:false});return;}try{render(p,await global.BAAInsights.load(id()));}catch(e){render(p,{ok:false});}}
  function start(){const p=mount();if(p)load(p);}global.BAAM36InsightsServerUI={mount,load,render};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);
