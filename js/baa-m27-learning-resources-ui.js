/* M27 UI bridge: make server-backed learning resources visible in Student OS. */
(function(global){
'use strict';
const FORMATS=['visual','video','interactive','practice'];
function escapeText(value){return String(value??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));}
function ensurePanel(){
  let panel=document.getElementById('baa-m27-resource-panel');
  if(panel)return panel;
  panel=document.createElement('section');
  panel.id='baa-m27-resource-panel';
  panel.setAttribute('aria-labelledby','baa-m27-resource-title');
  panel.style.cssText='margin:24px 0;padding:22px;border:1px solid rgba(253,249,240,.12);border-radius:22px;background:linear-gradient(145deg,rgba(124,92,252,.14),rgba(76,217,232,.06));';
  panel.innerHTML='<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap"><div><div style="font-size:.7rem;letter-spacing:.16em;text-transform:uppercase;color:#4CD9E8">AI Learning Resources</div><h2 id="baa-m27-resource-title" style="font-family:var(--display,serif);font-size:1.35rem;margin-top:5px">Find a useful way to learn this next</h2></div><button id="baa-m27-refresh" type="button" style="border:1px solid rgba(253,249,240,.16);background:rgba(253,249,240,.06);color:inherit;border-radius:999px;padding:9px 14px;font-weight:700">Refresh</button></div><div style="display:flex;gap:8px;flex-wrap:wrap;margin:16px 0" id="baa-m27-format-controls"></div><div id="baa-m27-resource-status" role="status" aria-live="polite" style="color:rgba(253,249,240,.65);font-size:.85rem;margin-bottom:12px">Loading server-backed recommendations…</div><div id="baa-m27-resource-list"></div><p style="color:rgba(253,249,240,.5);font-size:.72rem;line-height:1.5;margin-top:14px">External destinations are search suggestions, not BAA-validated resources. BAA does not infer a psychological learning style.</p>';
  const anchor=document.querySelector('#screen-home .home-inner')||document.querySelector('#screen-home');
  if(anchor)anchor.appendChild(panel); else document.body.appendChild(panel);
  const controls=panel.querySelector('#baa-m27-format-controls');
  FORMATS.forEach(format=>{const b=document.createElement('button');b.type='button';b.dataset.format=format;b.textContent=format[0].toUpperCase()+format.slice(1);b.style.cssText='border:1px solid rgba(253,249,240,.14);background:rgba(253,249,240,.05);color:inherit;border-radius:999px;padding:8px 12px;font-size:.8rem';b.addEventListener('click',()=>load(format));controls.appendChild(b);});
  panel.querySelector('#baa-m27-refresh').addEventListener('click',()=>load(activeFormat));
  return panel;
}
let activeFormat='';
async function load(format){
  activeFormat=format||'';
  const panel=ensurePanel(),status=panel.querySelector('#baa-m27-resource-status'),list=panel.querySelector('#baa-m27-resource-list');
  status.textContent='Loading server-backed recommendations…'; list.innerHTML='';
  if(!global.BAAM27Server){status.textContent='Learning resources are temporarily unavailable.';return;}
  const result=await global.BAAM27Server.getServerRecommendations(activeFormat,8);
  if(!result.ok){status.textContent=result.error==='LEARNER_ID_REQUIRED'?'Sign in as a student to use personalized resources.':'Learning resources are temporarily unavailable.';return;}
  if(!result.recommendations.length){status.textContent='Not enough server evidence yet. Keep learning and this panel will become more useful.';return;}
  status.textContent=`${result.recommendations.length} evidence-backed suggestion${result.recommendations.length===1?'':'s'}${activeFormat?' for '+activeFormat:''}.`;
  list.innerHTML=result.recommendations.map(item=>{
    const title=escapeText(item.title||item.concept||'Learning resource');
    const concept=escapeText(item.concept||'');
    const reason=escapeText(item.reason||'');
    const url=typeof item.url==='string'&&/^https:\/\//i.test(item.url)?item.url:'#';
    return `<article style="padding:14px 0;border-top:1px solid rgba(253,249,240,.08)"><div style="font-weight:800">${title}</div><div style="font-size:.76rem;color:rgba(253,249,240,.55);margin-top:4px">${concept}${reason?' · '+reason:''}</div>${url!=='#'?`<a href="${url}" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin-top:8px;color:#4CD9E8;font-size:.8rem;font-weight:700">Explore external search →</a>`:''}</article>`;
  }).join('');
}
function init(){
  if(!document.getElementById('screen-home'))return;
  ensurePanel();
  if(document.readyState==='loading')setTimeout(()=>load(''),0);else load('');
}
global.BAAM27LearningResourcesUI={init,load};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(window);
