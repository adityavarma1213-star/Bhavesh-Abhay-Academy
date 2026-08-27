/* BAA M26 — server-backed Teacher Notes surface. Draft only; teacher remains accountable. */
(function(global){
  'use strict';
  function esc(v){const d=document.createElement('div');d.textContent=String(v??'');return d.innerHTML;}
  function getLearnerId(){return String(global.BAA_LEARNER_ID||document.body?.dataset?.learnerId||'').trim();}
  async function load(learnerId){
    const id=String(learnerId||getLearnerId()).trim();
    if(!id) throw new Error('Select an authorized learner to generate a teacher note draft.');
    const r=await fetch(`/api/m26-notes?learnerId=${encodeURIComponent(id)}`,{credentials:'include',headers:{Accept:'application/json'},cache:'no-store'});
    const d=await r.json().catch(()=>null);
    if(!r.ok) throw new Error(d?.error?.message||'Teacher note draft could not be loaded.');
    return d;
  }
  function mount(root,opts){
    if(!root||document.getElementById('baa-m26-notes-panel'))return;
    const panel=document.createElement('section');panel.id='baa-m26-notes-panel';panel.className='card';
    panel.innerHTML='<h2 class="section-h" style="margin-top:0">📝 Evidence-backed Teacher Note</h2><p data-m26-status style="color:var(--dim);line-height:1.5">Generate a factual draft from the learner’s persisted academic evidence.</p><button type="button" data-m26-generate>Generate draft</button><div data-m26-draft style="margin-top:12px"></div><small data-m26-limit style="display:block;margin-top:12px;color:var(--dim)">Teacher review is required before saving or sharing. This is an academic evidence summary, not a diagnosis.</small>';
    root.insertBefore(panel,root.firstChild);
    const status=panel.querySelector('[data-m26-status]'),draft=panel.querySelector('[data-m26-draft]'),button=panel.querySelector('[data-m26-generate]');
    const render=d=>{status.textContent=`Evidence reviewed: ${Number(d.evidenceCount||0)} item(s)${d.assessmentCount!=null?` · ${Number(d.assessmentCount)} recent assessment(s)`:''}.`;draft.innerHTML=`<div style="padding:14px;border:1px solid rgba(255,255,255,.12);border-radius:12px;line-height:1.6;white-space:normal">${esc(d.draft||'No draft available.')}</div>`;};
    const refresh=async()=>{button.disabled=true;status.textContent='Loading server-backed evidence…';draft.textContent='';try{render(await load(opts?.learnerId));}catch(e){status.textContent=e.message;draft.textContent='';}finally{button.disabled=false;}};
    button.addEventListener('click',refresh);if(opts?.autoLoad!==false)refresh();
  }
  global.BAAM26Notes={load,mount};
  function boot(){
    if(!location.pathname.endsWith('teacher-os.html')&&!location.pathname.endsWith('teacher-portal.html'))return;
    const root=document.getElementById('serverLearnerView')||document.getElementById('content')||document.body;
    mount(root,{});
  }
  if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);}
})(window);
