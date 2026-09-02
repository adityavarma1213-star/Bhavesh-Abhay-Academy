/* BAA M26 — server-backed Teacher Notes surface. Draft only; teacher remains accountable. */
(function(global){
  'use strict';
  const MAX_RESPONSE_BYTES=1024*1024;
  function esc(v){const d=document.createElement('div');d.textContent=String(v??'');return d.innerHTML;}
  function getLearnerId(){return String(global.BAA_LEARNER_ID||document.body?.dataset?.learnerId||'').trim();}
  async function readJsonResponse(response,errorCode){
    const declared=Number(response?.headers?.get?.('content-length')||0);
    if(Number.isFinite(declared)&&declared>MAX_RESPONSE_BYTES){try{response.body?.cancel?.();}catch(_){}return {ok:false,error:errorCode+'_TOO_LARGE'};}
    if(!response?.body||typeof response.body.getReader!=='function'){
      try{const text=await response.text();if(new TextEncoder().encode(text).byteLength>MAX_RESPONSE_BYTES)return {ok:false,error:errorCode+'_TOO_LARGE'};return {ok:true,data:JSON.parse(text)};}catch(_){return {ok:false,error:errorCode+'_INVALID_RESPONSE'};}
    }
    const reader=response.body.getReader();const chunks=[];let total=0;
    try{while(true){const part=await reader.read();if(part.done)break;total+=part.value?.byteLength||0;if(total>MAX_RESPONSE_BYTES){try{await reader.cancel();}catch(_e){}return {ok:false,error:errorCode+'_TOO_LARGE'};}chunks.push(part.value);}}catch(_){try{await reader.cancel();}catch(_e){}return {ok:false,error:errorCode+'_INVALID_RESPONSE'};}
    const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    try{return {ok:true,data:JSON.parse(new TextDecoder().decode(bytes))};}catch(_){return {ok:false,error:errorCode+'_INVALID_RESPONSE'};}
  }
  async function request(url,options,errorCode){
    const r=await fetch(url,options);const parsed=await readJsonResponse(r,errorCode);
    if(!parsed.ok)throw Object.assign(new Error(errorCode==='M26_LOAD_RESPONSE'?'Teacher note draft could not be loaded.':'AI teacher note could not be generated.'),{code:parsed.error,status:r.status});
    return {response:r,data:parsed.data};
  }
  async function load(learnerId){
    const id=String(learnerId||getLearnerId()).trim();
    if(!id) throw new Error('Select an authorized learner to generate a teacher note draft.');
    const {response:r,data:d}=await request(`/api/m26-notes?learnerId=${encodeURIComponent(id)}`,{credentials:'include',headers:{Accept:'application/json'},cache:'no-store'},'M26_LOAD_RESPONSE');
    if(!r.ok) throw new Error(d?.error?.message||'Teacher note draft could not be loaded.');
    return d;
  }
  async function generateAi(learnerId){
    const id=String(learnerId||getLearnerId()).trim();
    if(!id) throw new Error('Select an authorized learner to generate a teacher note draft.');
    const {response:r,data:d}=await request('/api/m26-ai-notes',{method:'POST',credentials:'include',cache:'no-store',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({learnerId:id})},'M26_AI_RESPONSE');
    if(!r.ok) throw new Error(d?.error?.message||'AI teacher note could not be generated.');
    return d;
  }
  function mount(root,opts){
    if(!root||document.getElementById('baa-m26-notes-panel'))return;
    const panel=document.createElement('section');panel.id='baa-m26-notes-panel';panel.className='card';
    panel.innerHTML='<h2 class="section-h" style="margin-top:0">📝 Evidence-backed Teacher Note</h2><p data-m26-status style="color:var(--dim);line-height:1.5">Generate a factual draft from the learner’s persisted academic evidence.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" data-m26-generate>Generate evidence draft</button><button type="button" data-m26-ai>Generate AI draft</button></div><div data-m26-draft style="margin-top:12px"></div><small data-m26-limit style="display:block;margin-top:12px;color:var(--dim)">Teacher review is required before saving or sharing. AI output is grounded only in recorded academic evidence and is not a diagnosis.</small>';
    root.insertBefore(panel,root.firstChild);
    const status=panel.querySelector('[data-m26-status]'),draft=panel.querySelector('[data-m26-draft]'),button=panel.querySelector('[data-m26-generate]'),aiButton=panel.querySelector('[data-m26-ai]');
    const render=d=>{status.textContent=`${d.generated?'AI draft':'Evidence draft'} · Evidence reviewed: ${Number(d.evidenceCount||0)} item(s)${d.assessmentCount!=null?` · ${Number(d.assessmentCount)} recent assessment(s)`:''}.`;draft.innerHTML=`<div style="padding:14px;border:1px solid rgba(255,255,255,.12);border-radius:12px;line-height:1.6;white-space:normal">${esc(d.draft||'No draft available.')}</div>`;};
    const run=async(fn,label)=>{button.disabled=true;aiButton.disabled=true;status.textContent=label;draft.textContent='';try{render(await fn());}catch(e){status.textContent=e.message;draft.textContent='';}finally{button.disabled=false;aiButton.disabled=false;}};
    button.addEventListener('click',()=>run(()=>load(opts?.learnerId),'Loading server-backed evidence…'));
    aiButton.addEventListener('click',()=>run(()=>generateAi(opts?.learnerId),'Generating grounded AI note…'));
    if(opts?.autoLoad!==false)run(()=>load(opts?.learnerId),'Loading server-backed evidence…');
  }
  global.BAAM26Notes={load,generateAi,mount};
  function boot(){
    if(!location.pathname.endsWith('teacher-os.html')&&!location.pathname.endsWith('teacher-portal.html'))return;
    const root=document.getElementById('serverLearnerView')||document.getElementById('content')||document.body;
    mount(root,{});
  }
  if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);}
})(window);
