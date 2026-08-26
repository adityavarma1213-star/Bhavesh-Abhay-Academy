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
    function render(snapshot){
      const a=snapshot?.assessments||{}, l=snapshot?.learning||{}, p=snapshot?.planner||{}, h=snapshot?.homework||{}, r=snapshot?.rewards||{};
      const pct=Number(a.max_score)>0?Math.round(Number(a.score)*100/Number(a.max_score)):null;
      const concepts=(snapshot?.concepts||[]).slice(0,8).map(c=>`<li><b>${esc(c.concept||'Unknown')}</b> — ${esc(c.status||'insufficient_evidence')} (${c.correct_count||0}/${c.evidence_count||0})</li>`).join('');
      panel.innerHTML=`<h2>☁️ Canonical server-backed learner data</h2><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;margin-top:10px"><div><b>${a.completed||0}</b><small> Assessments</small></div><div><b>${l.evidence_count||0}</b><small> Evidence</small></div><div><b>${l.needs_attention||0}</b><small> Needs attention</small></div><div><b>${p.pending||0}</b><small> Pending tasks</small></div><div><b>${h.submissions||0}</b><small> Homework</small></div><div><b>${r.xp||0}</b><small> XP</small></div><div><b>${pct==null?'—':pct+'%'}</b><small> Recorded score</small></div></div><ul style="margin:12px 0 0 18px">${concepts||'<li>No server-backed concept evidence yet.</li>'}</ul><p class="hint" style="margin-top:10px">These figures are from the authenticated PostgreSQL learner record. No browser-local analytics are substituted for this summary.</p>`;
    }
    function esc(v){const d=document.createElement('div');d.textContent=String(v??'');return d.innerHTML;}
    function start(){
      if(!global.BAAServerLearnerView){ panel.innerHTML='<h2>☁️ Canonical server-backed learner data</h2><p class="hint">Server learner-view module is unavailable; no local analytics are promoted as server data.</p>'; return; }
      global.BAAServerLearnerView.init({mountId:'baaTeacherServerLearnerMount'}).then(result=>{
        if(result?.snapshot) render(result.snapshot);
        else if(result?.learners?.length===0) panel.innerHTML='<h2>☁️ Canonical server-backed learner data</h2><p class="hint">No learner is connected to this teacher account yet. No browser-local learner data is shown here.</p>';
      }).catch(()=>{panel.innerHTML='<h2>☁️ Canonical server-backed learner data</h2><p class="hint">Server learner data could not be loaded. No browser-local learner data is presented as server data.</p>';});
    }
    const mount=document.createElement('div');
    mount.id='baaTeacherServerLearnerMount';
    mount.style.display='none';
    document.body.appendChild(mount);
    if(global.BAAServerLearnerView) start(); else setTimeout(start,50);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
})(window);
