/* BAA M52 — Mistake Archeology & Confusion Map. */
(function(global){
'use strict';
const TYPES=['concept_gap','calculation','reading','procedure','careless','unknown'];
function classify(e){if(!e||typeof e!=='object')return {ok:false,error:'INVALID_MISTAKE_EVIDENCE'};const type=TYPES.includes(e.reasonType)?e.reasonType:'unknown';return {ok:true,error:null,concept:String(e.concept||'').trim(),reasonType:type,source:String(e.source||'').trim(),confidence:type==='unknown'?'low':'medium'};}
function map(evidence){if(!Array.isArray(evidence))return {ok:false,error:'INVALID_MISTAKE_LIST'};const out={};evidence.filter(e=>e&&e.correctness==='incorrect').forEach(e=>{const c=classify(e);const key=c.concept||'Unspecified concept';out[key]??=[];out[key].push(c);});return {ok:true,error:null,map:out,limitation:'Root-cause labels require evidence or educator confirmation; they are not diagnoses.'};}
async function load(learnerId,filters){
  const p=new URLSearchParams({learnerId:String(learnerId||'')});
  if(filters?.subject)p.set('subject',filters.subject); if(filters?.chapter)p.set('chapter',filters.chapter);
  const r=await fetch(`/api/m52-mistakes.js?${p}`); const d=await r.json().catch(()=>({error:{message:'Invalid server response.'}}));
  if(!r.ok) throw Object.assign(new Error(d?.error?.message||'Unable to load mistake analytics.'),{code:d?.error?.code,status:r.status});
  return d;
}
function mount(root,learnerId){
  if(!root)return;
  root.innerHTML='<section class="baa-mistakes-card"><h2>Mistake Archeology</h2><p data-m52-status>Loading recorded evidence…</p><div data-m52-groups></div></section>';
  const status=root.querySelector('[data-m52-status]'), groups=root.querySelector('[data-m52-groups]');
  load(learnerId).then(data=>{
    status.textContent=`${data.evidenceCount} recorded mistake evidence point(s).`;
    groups.innerHTML=data.groups.length?data.groups.map(g=>`<article class="baa-mistake-group"><strong>${escapeHtml(g.subject||'Unknown')} · ${escapeHtml(g.chapter||'Unspecified')}</strong><div>${escapeHtml(g.reasonType)} — ${g.count} evidence point(s), ${g.questions} question(s)</div><small>${g.confidence==='review_required'?'Human review required.':'Evidence-based classification.'}</small></article>`).join(''):'<p>No recorded incorrect-answer evidence yet.</p>';
  }).catch(err=>{status.textContent=err.message;});
}
function escapeHtml(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
global.BAAMistakes={classify,map,load,mount,types:()=>TYPES.slice()};
if(typeof document!=='undefined')document.querySelectorAll('[data-baa-mistakes]').forEach(el=>mount(el,el.dataset.learnerId||global.BAA_SESSION?.learnerId));
})(window);
