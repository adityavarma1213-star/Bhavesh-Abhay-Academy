/* BAA M14 — canonical teacher learner snapshot bridge.
   Keeps teacher-facing learner analytics grounded in authenticated server data.
   Legacy teacher tools remain available; this panel is the canonical learner-data summary. */
(function(global){
  'use strict';
  function boot(){
    const path=String(global.location.pathname||'');
    if(!path.endsWith('/teacher-os.html')) return;
    const root=document.querySelector('main')||document.body;
    if(!root || document.getElementById('baaTeacherServerDashboard')) return;
    const panel=document.createElement('section');
    panel.id='baaTeacherServerDashboard';
    panel.className='card';
    panel.setAttribute('aria-live','polite');
    panel.innerHTML='<h2>☁️ Canonical server-backed learner data</h2><p class="hint">Loading authenticated teacher learner data…</p>';
    root.insertBefore(panel,root.firstChild||null);
    function esc(v){const d=document.createElement('div');d.textContent=String(v??'');return d.innerHTML;}
    function render(snapshot,learner){
      const a=snapshot?.assessments||{}, l=snapshot?.learning||{}, p=snapshot?.planner||{}, h=snapshot?.homework||{}, r=snapshot?.rewards||{};
      const pct=Number(a.max_score)>0?Math.round(Number(a.score)*100/Number(a.max_score)):null;
      const concepts=(snapshot?.concepts||[]).slice(0,8).map(c=>`<li><b>${esc(c.concept||'Unknown')}</b> — ${esc(c.status||'insufficient_evidence')} (${c.correct_count||0}/${c.evidence_count||0})</li>`).join('');
      panel.innerHTML=`<h2>☁️ Canonical server-backed learner data</h2>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:8px">
          <label class="hint" for="m14-teacher-learner">Learner</label>
          <select id="m14-teacher-learner" style="background:rgba(253,249,240,.04);color:inherit;border:1px solid rgba(253,249,240,.14);border-radius:9px;padding:7px 10px">
            ${(global.__BAA_M14_LEARNERS||[]).map(item=>`<option value="${esc(item.id)}" ${item.id===learner?.id?'selected':''}>${esc(item.display_name||item.id)} · ${esc(item.relationship||'learner')}</option>`).join('')}
          </select>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;margin-top:10px">
          <div><b>${a.completed||0}</b><small> Assessments</small></div><div><b>${l.evidence_count||0}</b><small> Evidence</small></div><div><b>${l.needs_attention||0}</b><small> Needs attention</small></div><div><b>${p.pending||0}</b><small> Pending tasks</small></div><div><b>${h.submissions||0}</b><small> Homework</small></div><div><b>${r.xp||0}</b><small> XP</small></div><div><b>${pct==null?'—':pct+'%'}</b><small> Recorded score</small></div>
        </div>
        <ul style="margin:12px 0 0 18px">${concepts||'<li>No server-backed concept evidence yet.</li>'}</ul>
        <p class="hint" style="margin-top:10px">These figures are from the authenticated PostgreSQL learner record. No browser-local analytics are substituted for this summary.</p>`;
      const select=panel.querySelector('#m14-teacher-learner');
      if(select) select.addEventListener('change',()=>load(select.value));
    }
    async function load(learnerId){
      if(!global.BAAServerLearnerView){ panel.innerHTML='<h2>☁️ Canonical server-backed learner data</h2><p class="hint">Server learner-view module is unavailable; no local analytics are promoted as server data.</p>'; return; }
      panel.innerHTML='<h2>☁️ Canonical server-backed learner data</h2><p class="hint">Loading authenticated learner data…</p>';
      try{
        const snapshot=await global.BAAServerLearnerView.getOverview(learnerId);
        const learner=(global.__BAA_M14_LEARNERS||[]).find(item=>item.id===learnerId)||{id:learnerId};
        render(snapshot,learner);
      }catch(_){
        panel.innerHTML='<h2>☁️ Canonical server-backed learner data</h2><p class="hint">Server learner data could not be loaded. No browser-local learner data is presented as server data.</p>';
      }
    }
    async function start(){
      if(!global.BAAServerLearnerView){ load(''); return; }
      try{
        const learners=await global.BAAServerLearnerView.getLearners();
        global.__BAA_M14_LEARNERS=learners;
        if(!learners.length){ panel.innerHTML='<h2>☁️ Canonical server-backed learner data</h2><p class="hint">No learner is connected to this teacher account yet. No browser-local learner data is shown here.</p>'; return; }
        await load(learners[0].id);
      }catch(_){
        panel.innerHTML='<h2>☁️ Canonical server-backed learner data</h2><p class="hint">Server learner data could not be loaded. No browser-local learner data is presented as server data.</p>';
      }
    }
    start();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
})(window);
