/* BAA M58 — server-backed Teacher Diagnostic UI.
 * Consumes only the authenticated M58 diagnostic endpoint. It does not diagnose
 * psychological traits; it groups learners for evidence-based instruction.
 */
(function(global){
  'use strict';
  const MAX_RESPONSE_BYTES=1024*1024;
  function escapeHtml(v){return String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));}
  async function readJsonResponse(response){
    const declared=Number(response?.headers?.get?.('content-length'));
    if(Number.isFinite(declared)&&declared>MAX_RESPONSE_BYTES){try{response.body?.cancel?.();}catch(_){}throw Object.assign(new Error('Teacher Diagnostic response is too large.'),{code:'M58_RESPONSE_TOO_LARGE'});}
    if(!response?.body||typeof response.body.getReader!=='function'){
      try{return await response.json();}catch(_){throw Object.assign(new Error('Invalid diagnostic response.'),{code:'M58_INVALID_RESPONSE'});}
    }
    const reader=response.body.getReader();const chunks=[];let total=0;
    try{
      while(true){
        const part=await reader.read();
        if(part.done)break;
        const chunk=part.value instanceof Uint8Array?part.value:new Uint8Array(part.value||[]);
        total+=chunk.byteLength;
        if(total>MAX_RESPONSE_BYTES){try{await reader.cancel();}catch(_){}throw Object.assign(new Error('Teacher Diagnostic response is too large.'),{code:'M58_RESPONSE_TOO_LARGE'});}
        chunks.push(chunk);
      }
    }catch(error){try{await reader.cancel();}catch(_){}if(error?.code==='M58_RESPONSE_TOO_LARGE')throw error;throw Object.assign(new Error('Invalid diagnostic response.'),{code:'M58_INVALID_RESPONSE'});}
    try{
      const bytes=new Uint8Array(total);let offset=0;
      for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
      return JSON.parse(new TextDecoder().decode(bytes));
    }catch(_){throw Object.assign(new Error('Invalid diagnostic response.'),{code:'M58_INVALID_RESPONSE'});}
  }
  async function load(classId){
    const id=String(classId||'').trim();
    if(!id) throw new Error('Select a class before loading Teacher Diagnostic.');
    const response=await fetch(`/api/m58-teacher-diagnostic.js?classId=${encodeURIComponent(id)}`,{credentials:'include',cache:'no-store',headers:{Accept:'application/json'}});
    const data=await readJsonResponse(response);
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
