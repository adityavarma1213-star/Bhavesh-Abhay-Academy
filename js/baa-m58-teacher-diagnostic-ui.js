/* BAA M58 — server-backed Teacher Diagnostic UI.
 * Consumes only the authenticated M58 diagnostic endpoint. It does not diagnose
 * psychological traits; it groups learners for evidence-based instruction.
 */
(function(global){
  'use strict';
  function escapeHtml(v){return String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));}
  async function load(classId){
    const id=String(classId||'').trim();
    if(!id) throw new Error('Select a class before loading Teacher Diagnostic.');
    const response=await fetch(`/api/m58-teacher-diagnostic.js?classId=${encodeURIComponent(id)}`,{credentials:'include',cache:'no-store',headers:{Accept:'application/json'}});
    const data=await response.json().catch(()=>({ok:false,error:{message:'Invalid diagnostic response.'}}));
    if(!response.ok) throw Object.assign(new Error(data?.error?.message||'Unable to load Teacher Diagnostic.'),{status:response.status,code:data?.error?.code});
    return data;
  }
  function render(root,data){
    const groups=data.groups||{};
    const students=Array.isArray(data.students)?data.students:[];
    root.innerHTML=`<section class="baa-m58-diagnostic-card" aria-labelledby="baa-m58-title">
      <h2 id="baa-m58-title">Teacher Diagnostic &amp; Differentiation</h2>
      <p data-m58-status>Evidence-based instructional grouping for ${escapeHtml(data.class?.name||'this class')}.</p>
      <div class="baa-m58-groups">
        <div><strong>${groups.reteach?.length||0}</strong><span>Reteach</span></div>
        <div><strong>${groups.practice?.length||0}</strong><span>Practice</span></div>
        <div><strong>${groups.extend?.length||0}</strong><span>Extend</span></div>
        <div><strong>${groups.insufficientEvidence?.length||0}</strong><span>Insufficient evidence</span></div>
      </div>
      <div class="baa-m58-table-wrap"><table><thead><tr><th scope="col">Learner</th><th scope="col">Evidence state</th><th scope="col">Attempts</th><th scope="col">Average</th></tr></thead><tbody>${students.map(s=>`<tr><td>${escapeHtml(s.studentId)}</td><td>${escapeHtml(s.state)}</td><td>${Number(s.attempts)||0}</td><td>${s.averagePercentage==null?'—':`${Number(s.averagePercentage).toFixed(1)}%`}</td></tr>`).join('')||'<tr><td colspan="4">No active learners or evidence available.</td></tr>'}</tbody></table></div>
      <p class="baa-m58-limitation">${escapeHtml(data.limitation||'Grouping is evidence-based instructional support, not a psychological diagnosis.')}</p>
    </section>`;
  }
  async function mount(root,classId){
    if(!root) return null;
    root.setAttribute('aria-busy','true');root.textContent='Loading Teacher Diagnostic…';
    try{const data=await load(classId||root.dataset.classId);render(root,data);return data;}
    catch(error){root.innerHTML=`<section class="baa-m58-diagnostic-card"><h2>Teacher Diagnostic &amp; Differentiation</h2><p role="status">${escapeHtml(error.message)}</p></section>`;return null;}
    finally{root.removeAttribute('aria-busy');}
  }
  function autoMount(){
    if(!document||!document.body)return;
    const source=document.querySelector('[data-baa-institution-analytics][data-class-id]');
    if(!source||!source.dataset.classId)return;
    if(document.querySelector('[data-baa-m58-diagnostic]'))return;
    const root=document.createElement('div');root.dataset.baaM58Diagnostic='1';root.dataset.classId=source.dataset.classId;
    source.insertAdjacentElement('afterend',root);mount(root,source.dataset.classId);
  }
  global.BAAM58TeacherDiagnostic={load,render,mount,autoMount};
  if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',autoMount);else autoMount();}
})(window);
