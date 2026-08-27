/* BAA M47 — institution/class analytics client. */
(function(global){
  'use strict';
  async function load(classId){
    const url=`/api/m47-institution.js?classId=${encodeURIComponent(classId)}`;
    const response=await fetch(url,{credentials:'include',cache:'no-store',headers:{Accept:'application/json'}});
    const data=await response.json().catch(()=>({ok:false,error:{message:'Invalid analytics response.'}}));
    if(!response.ok) throw Object.assign(new Error(data?.error?.message||'Unable to load analytics'),{status:response.status,code:data?.error?.code});
    return data;
  }
  function render(root,data){
    const s=data.summary||{};
    root.innerHTML=`<section class="baa-institution-analytics"><h2>${escapeHtml(data.class?.name||'Institution Analytics')}</h2><div class="baa-analytics-summary"><strong>${s.students??0}</strong><span>Students</span><strong>${s.attempts??0}</strong><span>Attempts</span><strong>${s.averagePercentage??'—'}%</strong><span>Average</span></div><table><thead><tr><th>Subject</th><th>Chapter</th><th>Accuracy</th><th>Evidence</th><th>Learners</th></tr></thead><tbody>${(data.topics||[]).map(t=>`<tr><td>${escapeHtml(t.subject||'—')}</td><td>${escapeHtml(t.chapter||'—')}</td><td>${t.accuracy==null?'—':`${t.accuracy}%`}</td><td>${t.evidenceCount}</td><td>${t.learners}</td></tr>`).join('')}</tbody></table></section>`;
  }
  function escapeHtml(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  async function mount(root){
    const classId=root?.dataset?.classId;
    if(!root||!classId) return;
    root.textContent='Loading institution analytics…';
    try{render(root,await load(classId));}catch(e){root.textContent=e.message;}
  }
  global.BAAInstitutionAnalytics={load,render,mount};
  if(typeof document!=='undefined') document.querySelectorAll('[data-baa-institution-analytics]').forEach(mount);
})(window);
