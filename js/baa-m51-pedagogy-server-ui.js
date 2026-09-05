/* BAA M51 — server-backed Learning Science Guidance surface. */
(function(global){
  'use strict';
  const MAX_RESPONSE_BYTES=1024*1024;
  const MAX_LEARNER_ID_CHARS=100;
  function escapeHtml(value){return String(value ?? '').replace(/[&<>"']/g,function(ch){return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]);});}
  function getLearnerId(){try{return String(global.BAA_LEARNER_ID||global.BAAAuth?.currentLearnerId?.()||'').trim();}catch(_){return '';}}
  async function readJson(response){
    const declared=Number(response?.headers?.get?.('content-length')||0);
    if(Number.isFinite(declared)&&declared>MAX_RESPONSE_BYTES){try{await response.body?.cancel?.();}catch(_){}throw new Error('PEDAGOGY_RESPONSE_TOO_LARGE');}
    if(!response?.body||typeof response.body.getReader!=='function'){
      const text=await response.text();
      if(new TextEncoder().encode(text).byteLength>MAX_RESPONSE_BYTES)throw new Error('PEDAGOGY_RESPONSE_TOO_LARGE');
      return JSON.parse(text);
    }
    const reader=response.body.getReader();const decoder=new TextDecoder();let bytes=0,text='';
    try{
      while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value?.byteLength||0;if(bytes>MAX_RESPONSE_BYTES){try{await reader.cancel();}catch(_){}throw new Error('PEDAGOGY_RESPONSE_TOO_LARGE');}text+=decoder.decode(chunk.value,{stream:true});}
      text+=decoder.decode();return JSON.parse(text);
    }finally{try{reader.releaseLock();}catch(_) {}}
  }
  async function load(filters){
    const learnerId=getLearnerId();
    if(!learnerId)return{ok:false,unauthenticated:true,concepts:[]};
    if(learnerId.length>MAX_LEARNER_ID_CHARS)return{ok:false,code:'LEARNER_ID_TOO_LONG',concepts:[]};
    const params=new URLSearchParams({learnerId});
    if(filters?.subject)params.set('subject',String(filters.subject).trim().slice(0,120));
    if(filters?.chapter)params.set('chapter',String(filters.chapter).trim().slice(0,160));
    let response;
    try{response=await fetch('/api/m51-pedagogy.js?'+params.toString(),{credentials:'include',headers:{Accept:'application/json'},cache:'no-store'});}catch(_){throw new Error('PEDAGOGY_SERVER_UNAVAILABLE');}
    let data;
    try{data=await readJson(response);}catch(error){throw new Error(error?.message||'PEDAGOGY_INVALID_RESPONSE');}
    if(!response.ok)throw new Error(data?.error?.message||'Unable to load Learning Science Guidance.');
    return data;
  }
  function mount(root,data){if(!root)return;root.innerHTML='<section class="card" data-m51-server-surface><h2 class="section-h">Learning Science Guidance <span class="pill-sm conf-medium">Server evidence</span></h2><p class="sub">Instructional guidance is derived from recorded learning evidence. It is not a diagnosis and does not replace teacher judgment.</p><div data-m51-list></div></section>';const list=root.querySelector('[data-m51-list]');if(!data?.ok&&data?.unauthenticated){list.innerHTML='<div class="empty-note">Sign in to load learner-specific pedagogy guidance.</div>';return;}if(data?.code==='LEARNER_ID_TOO_LONG'){list.innerHTML='<div class="empty-note">The current learner context is invalid. Please sign in again.</div>';return;}const concepts=Array.isArray(data?.concepts)?data.concepts:[];if(!concepts.length){list.innerHTML='<div class="empty-note">Not enough tagged evidence yet. Collect evidence before adapting instruction.</div>';return;}list.innerHTML=concepts.map(function(item){const label=(item.subject||'Unknown')+(item.chapter?' — '+item.chapter:'');return '<article class="concept-row"><div><h5>'+escapeHtml(label)+'</h5><p>'+escapeHtml(item.reason||'')+'</p><p><strong>Next:</strong> '+escapeHtml(item.action||'evidence_building')+'</p></div><div><span class="pill-sm">'+escapeHtml(item.state||'unknown')+'</span><p>'+escapeHtml(String(item.accuracy??0))+'% accuracy · '+escapeHtml(String(item.total??0))+' evidence</p></div></article>';}).join('');if(data?.conceptsTruncated){const note=document.createElement('p');note.className='empty-note';note.textContent='Showing the most recent supported concepts; additional grouped evidence exists.';list.appendChild(note);}}
  async function refresh(root,filters){if(!root)return null;try{const data=await load(filters);mount(root,data);return data;}catch(error){mount(root,{ok:false,concepts:[]});const note=root.querySelector('[data-m51-list]');if(note)note.innerHTML='<div class="empty-note">Learning Science Guidance is temporarily unavailable. No local data was substituted.</div>';return null;}}
  global.BAAM51ServerUI={load,mount,refresh};
  function boot(){if(!location.pathname.endsWith('/teacher-os.html')&&!location.pathname.endsWith('teacher-os.html'))return;let root=document.getElementById('m51ServerPedagogy');if(!root){const host=document.getElementById('serverLearnerView')||document.getElementById('content');if(!host)return;root=document.createElement('div');root.id='m51ServerPedagogy';host.parentNode.insertBefore(root,host.nextSibling);}if(root.dataset.m51Mounted==='1')return;root.dataset.m51Mounted='1';refresh(root);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})(window);