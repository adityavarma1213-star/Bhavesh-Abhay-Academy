/* M29 UI: server-backed evidence learning path inside Student OS. */
(function(global){
'use strict';
function init(){
 const host=document.querySelector('#screen-home .home-inner')||document.querySelector('#screen-home');
 if(!host||document.getElementById('baa-m29-path-panel'))return;
 const panel=document.createElement('section');panel.id='baa-m29-path-panel';panel.style.cssText='margin:24px 0;padding:22px;border:1px solid rgba(253,249,240,.12);border-radius:22px;background:rgba(76,217,232,.05)';
 panel.innerHTML='<div style="display:flex;justify-content:space-between;gap:12px;align-items:center"><div><div style="font-size:.7rem;letter-spacing:.16em;text-transform:uppercase;color:#4CD9E8">AI Learning Path</div><h2 style="font-family:var(--display,serif);font-size:1.35rem;margin-top:5px">Your next evidence-based learning nodes</h2></div><button id="baa-m29-refresh" type="button" style="border:1px solid rgba(253,249,240,.16);background:rgba(253,249,240,.06);color:inherit;border-radius:999px;padding:9px 14px;font-weight:700">Refresh</button></div><div id="baa-m29-status" role="status" aria-live="polite" style="margin:14px 0;color:rgba(253,249,240,.65);font-size:.85rem">Loading…</div><ol id="baa-m29-nodes" style="display:grid;gap:10px;padding-left:22px"></ol><p style="color:rgba(253,249,240,.5);font-size:.72rem;line-height:1.5;margin-top:14px">Order is based on current learning evidence. BAA does not claim a hidden prerequisite graph or canonical syllabus ordering.</p>';
 host.appendChild(panel);panel.querySelector('#baa-m29-refresh').addEventListener('click',load);load();
}
async function load(){
 const panel=document.getElementById('baa-m29-path-panel');if(!panel)return;const status=panel.querySelector('#baa-m29-status'),nodes=panel.querySelector('#baa-m29-nodes');status.textContent='Loading server-backed learning path…';nodes.innerHTML='';
 if(!global.BAAM29Server){status.textContent='Learning path is temporarily unavailable.';return;}
 const result=await global.BAAM29Server.getServerPath(null,12);
 if(!result.ok){status.textContent=result.error==='LEARNER_ID_REQUIRED'?'Sign in as a student to build a personalized path.':'Learning path is temporarily unavailable.';return;}
 if(!result.nodes.length){status.textContent='Not enough learning evidence yet. Complete some learning activity first.';return;}
 status.textContent=`${result.nodes.length} evidence-based learning node${result.nodes.length===1?'':'s'}.`;
 nodes.innerHTML=result.nodes.map(n=>`<li style="padding:12px 14px;border:1px solid rgba(253,249,240,.08);border-radius:14px;list-style-position:outside"><strong>${String(n.concept||'Concept')}</strong><div style="font-size:.76rem;color:rgba(253,249,240,.58);margin-top:4px">${String(n.subject||'')} · ${String(n.state||'insufficient_evidence')} · ${Number(n.evidenceCount)||0} evidence point${Number(n.evidenceCount)===1?'':'s'} · ${String(n.action||'Build evidence')}</div>${n.current?'<div style="font-size:.7rem;color:#F5B942;margin-top:5px;font-weight:800">CURRENT NODE</div>':''}</li>`).join('');
}
global.BAAM29LearningPathsUI={init,load};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(window);
