/* BAA M51 — server-backed Learning Science Guidance surface. */
(function(global){
  'use strict';
  function escapeHtml(value){
    return String(value ?? '').replace(/[&<>"']/g,function(ch){return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]);});
  }
  function getLearnerId(){
    try { return String(global.BAA_LEARNER_ID || global.BAAAuth?.currentLearnerId?.() || '').trim(); } catch (_) { return ''; }
  }
  async function load(filters){
    const learnerId=getLearnerId();
    if(!learnerId) return {ok:false,unauthenticated:true,concepts:[]};
    const params=new URLSearchParams({learnerId});
    if(filters?.subject) params.set('subject',String(filters.subject).slice(0,120));
    if(filters?.chapter) params.set('chapter',String(filters.chapter).slice(0,160));
    const response=await fetch('/api/m51-pedagogy.js?'+params.toString(),{credentials:'include',headers:{Accept:'application/json'}});
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data?.error?.message||'Unable to load Learning Science Guidance.');
    return data;
  }
  function mount(root,data){
    if(!root) return;
    root.innerHTML='<section class="card" data-m51-server-surface><h2 class="section-h">Learning Science Guidance <span class="pill-sm conf-medium">Server evidence</span></h2><p class="sub">Instructional guidance is derived from recorded learning evidence. It is not a diagnosis and does not replace teacher judgment.</p><div data-m51-list></div></section>';
    const list=root.querySelector('[data-m51-list]');
    if(!data?.ok && data?.unauthenticated){ list.innerHTML='<div class="empty-note">Sign in to load learner-specific pedagogy guidance.</div>'; return; }
    const concepts=Array.isArray(data?.concepts)?data.concepts:[];
    if(!concepts.length){ list.innerHTML='<div class="empty-note">Not enough tagged evidence yet. Collect evidence before adapting instruction.</div>'; return; }
    list.innerHTML=concepts.map(function(item){
      const label=(item.subject||'Unknown')+(item.chapter?' — '+item.chapter:'');
      return '<article class="concept-row"><div><h5>'+escapeHtml(label)+'</h5><p>'+escapeHtml(item.reason||'')+'</p><p><strong>Next:</strong> '+escapeHtml(item.action||'evidence_building')+'</p></div><div><span class="pill-sm conf-'+escapeHtml(item.state==='unknown'?'low':item.state)+'">'+escapeHtml(item.state||'unknown')+'</span><p>'+escapeHtml(String(item.accuracy??0))+'% accuracy · '+escapeHtml(String(item.total??0))+' evidence</p></div></article>';
    }).join('');
  }
  async function refresh(root,filters){
    if(!root) return null;
    try { const data=await load(filters); mount(root,data); return data; }
    catch(error){ mount(root,{ok:false,concepts:[]}); const note=root.querySelector('[data-m51-list]'); if(note) note.innerHTML='<div class="empty-note">Learning Science Guidance is temporarily unavailable. No local data was substituted.</div>'; return null; }
  }
  global.BAAM51ServerUI={load,mount,refresh};
  function boot(){
    if(!location.pathname.endsWith('/teacher-os.html') && !location.pathname.endsWith('teacher-os.html')) return;
    const root=document.getElementById('m51ServerPedagogy');
    if(!root || root.dataset.m51Mounted==='1') return;
    root.dataset.m51Mounted='1';
    refresh(root);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})(window);
