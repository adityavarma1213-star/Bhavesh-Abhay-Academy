/* BAA M47 — institution/class analytics client. */
(function(global){
  'use strict';
  const MAX_RESPONSE_BYTES=1024*1024;
  async function readJsonResponse(response){
    const declared=Number(response?.headers?.get?.('content-length')||0);
    if(Number.isFinite(declared)&&declared>MAX_RESPONSE_BYTES)throw new Error('INSTITUTION_RESPONSE_TOO_LARGE');
    if(!response?.body?.getReader){
      const text=await response.text();
      if(new TextEncoder().encode(text).byteLength>MAX_RESPONSE_BYTES)throw new Error('INSTITUTION_RESPONSE_TOO_LARGE');
      return JSON.parse(text);
    }
    const reader=response.body.getReader();
    const decoder=new TextDecoder();
    let bytes=0;
    let text='';
    try{
      while(true){
        const chunk=await reader.read();
        if(chunk.done)break;
        bytes+=chunk.value?.byteLength||0;
        if(bytes>MAX_RESPONSE_BYTES){try{await reader.cancel();}catch(_){}throw new Error('INSTITUTION_RESPONSE_TOO_LARGE');}
        text+=decoder.decode(chunk.value,{stream:true});
      }
      text+=decoder.decode();
      return JSON.parse(text);
    }finally{try{reader.releaseLock();}catch(_) {}}
  }
  async function load(classId){
    const url=`/api/m47-institution.js?classId=${encodeURIComponent(classId)}`;
    const response=await fetch(url,{credentials:'include',cache:'no-store',headers:{Accept:'application/json'}});
    let data={};
    try{data=await readJsonResponse(response);}catch(error){
      if(error?.message==='INSTITUTION_RESPONSE_TOO_LARGE')throw Object.assign(new Error('Institution analytics response is too large.'),{status:502,code:'INSTITUTION_RESPONSE_TOO_LARGE'});
      data={ok:false,error:{message:'Invalid analytics response.',code:'INSTITUTION_INVALID_RESPONSE'}};
    }
    if(!response.ok) throw Object.assign(new Error(data?.error?.message||'Unable to load analytics'),{status:response.status,code:data?.error?.code});
    return data;
  }
  function render(root,data){
    const s=data.summary||{}, gate=data.evidenceGate||{};
    const conceptRows=(data.conceptInsights||[]).map(t=>`<tr><td>${escapeHtml(t.subject||'—')}</td><td>${escapeHtml(t.concept||'—')}</td><td>${t.accuracy==null?'—':`${t.accuracy}%`}</td><td>${t.evidenceCount}</td><td>${t.learners}</td><td>${escapeHtml(t.status||'developing')}</td></tr>`).join('');
    root.innerHTML=`<section class="baa-institution-analytics"><h2>${escapeHtml(data.class?.name||'Institution Analytics')}</h2><div class="baa-analytics-summary"><strong>${s.students??0}</strong><span>Students</span><strong>${s.attempts??0}</strong><span>Attempts</span><strong>${s.averagePercentage??'—'}%</strong><span>Average</span></div><p class="baa-analytics-note">Concept insights require ${Number(gate.minEvidence||3)} evidence points; sparse concepts are not characterized.</p><table><thead><tr><th>Subject</th><th>Chapter</th><th>Accuracy</th><th>Evidence</th><th>Learners</th></tr></thead><tbody>${(data.topics||[]).map(t=>`<tr><td>${escapeHtml(t.subject||'—')}</td><td>${escapeHtml(t.chapter||'—')}</td><td>${t.accuracy==null?'—':`${t.accuracy}%`}</td><td>${t.evidenceCount}</td><td>${t.learners}</td></tr>`).join('')}</tbody></table><h3>Evidence-backed concept insights</h3><table><thead><tr><th>Subject</th><th>Concept</th><th>Accuracy</th><th>Evidence</th><th>Learners</th><th>State</th></tr></thead><tbody>${conceptRows||'<tr><td colspan="6">No concept has enough evidence yet.</td></tr>'}</tbody></table></section>`;
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
