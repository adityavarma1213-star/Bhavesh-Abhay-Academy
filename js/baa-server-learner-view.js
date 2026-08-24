/* BAA server-backed learner view helper.
   Used by Parent/Teacher OS to show data from the authenticated PostgreSQL
   learner record. It never invents data and never falls back to another
   learner when authorization fails. */
(function(global){
'use strict';
function esc(v){const d=document.createElement('div');d.textContent=String(v??'');return d.innerHTML;}
function setLegacyVisibility(visible){
  // Parent/Teacher pages historically contain a browser-local analytics
  // section below #serverLearnerView. Keep it hidden until the authenticated
  // server snapshot has actually loaded so local preview data can never be
  // mistaken for the production learner record.
  const legacy=document.getElementById('content');
  if(legacy) legacy.hidden=!visible;
}
async function getSession(){
  const r=await fetch('/api/auth/me',{credentials:'include',cache:'no-store'});
  if(!r.ok) throw new Error(`AUTH_${r.status}`);
  return r.json();
}
function expectedRole(){
  const path=String(global.location.pathname||'');
  if(path.endsWith('/teacher-os.html')||path.endsWith('/teacher-portal.html')) return 'teacher';
  if(path.endsWith('/parent-os.html')) return 'parent';
  return null;
}
async function enforceRole(){
  const expected=expectedRole();
  if(!expected) return null;
  const session=await getSession();
  const roles=Array.isArray(session?.user?.roles)?session.user.roles:[session?.user?.roles||session?.user?.role].filter(Boolean);
  if(!roles.includes(expected)){
    const target=roles.includes('teacher')?'teacher-portal.html':roles.includes('parent')?'parent-os.html':'account.html';
    throw Object.assign(new Error(`ROLE_${expected.toUpperCase()}_REQUIRED`),{redirect:target});
  }
  return session;
}
async function getLearners(){
  const r=await fetch('/api/v1/my-learners',{credentials:'include'});
  if(!r.ok) throw new Error(`AUTH_${r.status}`);
  const p=await r.json();
  return Array.isArray(p.learners)?p.learners:[];
}
async function getOverview(learnerId){
  const r=await fetch(`/api/v1/learner-overview?learnerId=${encodeURIComponent(learnerId)}`,{credentials:'include'});
  if(!r.ok) throw new Error(`OVERVIEW_${r.status}`);
  const p=await r.json();
  if(!p.ok||!p.snapshot) throw new Error('OVERVIEW_INVALID');
  return p.snapshot;
}
async function init({mountId='serverLearnerView',onLearnerChange}={}){
  const mount=document.getElementById(mountId); if(!mount) return null;
  setLegacyVisibility(false);
  mount.innerHTML='<div class="card"><div class="empty-note">Checking authenticated learner data…</div></div>';
  try{
    await enforceRole();
    const learners=await getLearners();
    if(!learners.length){
      mount.innerHTML='<div class="card"><div class="empty-note">No learner is connected to this account yet. This view will remain empty rather than showing browser-local data as if it were server data.</div></div>';
      return {learners};
    }
    const selector=learners.length>1
      ? `<label style="display:block;font-size:.75rem;color:var(--dim);margin-bottom:8px;">Learner <select id="serverLearnerSelect" style="margin-left:8px;background:rgba(253,249,240,.06);color:inherit;border:1px solid rgba(253,249,240,.15);border-radius:8px;padding:6px 9px;">${learners.map(l=>`<option value="${esc(l.id)}">${esc(l.display_name)} · ${esc(l.relationship)}</option>`).join('')}</select></label>`
      : `<div style="font-size:.75rem;color:var(--dim);margin-bottom:8px;">Connected learner: <b>${esc(learners[0].display_name)}</b> · ${esc(learners[0].relationship)}</div>`;
    mount.innerHTML=`<div class="card"><h2 class="section-h" style="margin-top:0;">☁️ Server-backed learner data</h2>${selector}<div id="serverLearnerSnapshot"><div class="empty-note">Loading…</div></div><p style="font-size:.68rem;color:var(--faint);margin-top:10px;">These figures come from the authenticated learner record in PostgreSQL. Browser-local analytics elsewhere on this page are not silently presented as server data.</p></div>`;
    const select=document.getElementById('serverLearnerSelect');
    const render=async(id)=>{
      const target=document.getElementById('serverLearnerSnapshot');
      target.innerHTML='<div class="empty-note" style="padding:20px;">Loading server data…</div>';
      try{
        const s=await getOverview(id);
        const a=s.assessments||{},l=s.learning||{},p=s.planner||{},h=s.homework||{},r=s.rewards||{};
        const pct=Number(a.max_score)>0?Math.round((Number(a.score)/Number(a.max_score))*100):null;
        const conceptRows=(s.concepts||[]).map(c=>`<div style="display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid rgba(253,249,240,.06)"><span><b>${esc(c.concept||'Unknown')}</b><small style="display:block;color:var(--faint)">${esc(c.subject||'')} · ${esc(c.topic||'')}</small></span><span>${esc(c.status||'insufficient_evidence')} · ${c.correct_count||0}/${c.evidence_count||0}</span></div>`).join('');
        const attemptRows=(s.recentAttempts||[]).slice(0,5).map(a=>`<div style="display:flex;justify-content:space-between;gap:10px;padding:7px 0"><span>${esc(a.title||a.assessment_id||'Assessment')}<small style="display:block;color:var(--faint)">${esc(a.subject||'')} · ${esc(a.chapter||'')}</small></span><b>${a.score==null?'—':a.max_score?Math.round(Number(a.score)*100/Number(a.max_score))+'%':'—'}</b></div>`).join('');
        target.innerHTML=`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;">
          <div class="pstat"><b>${a.completed||0}</b><span>Assessments</span></div>
          <div class="pstat"><b>${l.evidence_count||0}</b><span>Evidence</span></div>
          <div class="pstat"><b>${l.strong||0}</b><span>Strong concepts</span></div>
          <div class="pstat"><b>${l.needs_attention||0}</b><span>Needs attention</span></div>
          <div class="pstat"><b>${p.pending||0}</b><span>Pending tasks</span></div>
          <div class="pstat"><b>${h.submissions||0}</b><span>Homework</span></div>
          <div class="pstat"><b>${r.xp||0}</b><span>Recorded XP</span></div>
          <div class="pstat"><b>${pct===null?'—':pct+'%'}</b><span>Recorded score</span></div>
        </div><div style="margin-top:14px"><b>Server-backed concept states</b>${conceptRows||'<div class="empty-note">No server-backed concept evidence yet.</div>'}</div><div style="margin-top:14px"><b>Recent server-backed assessments</b>${attemptRows||'<div class="empty-note">No server-backed assessment attempts yet.</div>'}</div>`;
        setLegacyVisibility(true);
        if(typeof onLearnerChange==='function') onLearnerChange(id,s);
        return s;
      }catch(e){
        setLegacyVisibility(false);
        target.innerHTML='<div class="empty-note" style="padding:20px;">Server data could not be loaded. The page will not substitute another learner or fabricate a result.</div>';
        return null;
      }
    };
    if(select) select.addEventListener('change',()=>render(select.value));
    const first=learners[0];
    const snapshot=await render(first.id);
    return {learners,snapshot};
  }catch(e){
    setLegacyVisibility(false);
    if(e.redirect){
      mount.innerHTML=`<div class="card"><div class="empty-note">This area requires the correct BAA account role. Redirecting to ${esc(e.redirect)}…</div></div>`;
      setTimeout(()=>{global.location.href=e.redirect;},350);
      return null;
    }
    mount.innerHTML='<div class="card"><div class="empty-note">This page is not connected to an authenticated BAA account. Sign in first; no browser-local data is presented as server-backed data.</div></div>';
    return null;
  }
}
global.BAAServerLearnerView={getLearners,getOverview,init};
})(window);