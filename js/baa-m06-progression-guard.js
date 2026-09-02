/* BAA M06 — progression guard. Server gate is authoritative; this layer only
 * blocks assessment/progression navigation when the server reports an active lock. */
(function(global){
  'use strict';
  const API='/api/m06-mastery-gate.js';
  const MAX_RESPONSE_BYTES=1024*1024;
  const q=(url)=>new URL(url,location.href).searchParams;
  function scope(url){const u=new URL(url,location.href), p=u.searchParams; return {
    url:u, learnerId:(p.get('learnerId')||'').trim(), subject:(p.get('subject')||'').trim(), chapter:(p.get('chapter')||'').trim()
  };}
  async function readJsonResponse(r){
    const declared=Number(r?.headers?.get?.('content-length')||0);
    if(Number.isFinite(declared)&&declared>MAX_RESPONSE_BYTES){try{await r.body?.cancel?.();}catch(_){}throw new Error('M06_RESPONSE_TOO_LARGE');}
    if(!r?.body||typeof r.body.getReader!=='function'){
      try{const text=await r.text();if(new TextEncoder().encode(text).byteLength>MAX_RESPONSE_BYTES)throw new Error('M06_RESPONSE_TOO_LARGE');return JSON.parse(text);}
      catch(e){if(e?.message==='M06_RESPONSE_TOO_LARGE')throw e;throw new Error('M06_INVALID_RESPONSE');}
    }
    const reader=r.body.getReader(),decoder=new TextDecoder();let bytes=0,text='';
    try{while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value?.byteLength||0;if(bytes>MAX_RESPONSE_BYTES){try{await reader.cancel();}catch(_){}throw new Error('M06_RESPONSE_TOO_LARGE');}text+=decoder.decode(chunk.value,{stream:true});}text+=decoder.decode();return JSON.parse(text);}
    catch(e){if(e?.message==='M06_RESPONSE_TOO_LARGE')throw e;throw new Error('M06_INVALID_RESPONSE');}
    finally{try{reader.releaseLock();}catch(_) {}}
  }
  async function getGate(s){
    if(!s.learnerId||!s.subject||!s.chapter) return null;
    const r=await fetch(`${API}?learnerId=${encodeURIComponent(s.learnerId)}&subject=${encodeURIComponent(s.subject)}&chapter=${encodeURIComponent(s.chapter)}`,{credentials:'include',cache:'no-store',headers:{Accept:'application/json'}});
    if(!r.ok) return null;
    const data=await readJsonResponse(r); return data && data.gate ? data.gate : null;
  }
  function showLock(gate,s){
    if(!gate || !['locked'].includes(gate.status) || document.getElementById('baa-m06-lock')) return false;
    const overlay=document.createElement('div'); overlay.id='baa-m06-lock';
    overlay.setAttribute('role','alertdialog'); overlay.setAttribute('aria-modal','true');
    overlay.style.cssText='position:fixed;inset:0;z-index:100000;background:rgba(11,15,46,.96);color:#fff;display:flex;align-items:center;justify-content:center;padding:24px;font-family:Inter,system-ui,sans-serif;';
    const card=document.createElement('div'); card.style.cssText='max-width:620px;width:100%;padding:28px;border:1px solid rgba(255,255,255,.16);border-radius:20px;background:#141B4D;box-shadow:0 20px 80px rgba(0,0,0,.35);';
    const red=(gate.redCount||0); card.innerHTML=`<div style="font-size:.72rem;letter-spacing:.16em;text-transform:uppercase;color:#F5B942;font-weight:700">MASTERY GATE</div><h1 style="margin:8px 0 12px;font-size:1.6rem">This progression is currently locked</h1><p style="color:rgba(255,255,255,.72);line-height:1.6">BAA found ${red} unresolved learning finding${red===1?'':'s'} for <strong>${escapeHtml(s.subject)}</strong> · <strong>${escapeHtml(s.chapter)}</strong>. Clear the finding in a later assessment, or use the authenticated parent bypass when permitted.</p><div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:20px"><a href="student-os.html" style="display:inline-block;padding:11px 18px;border-radius:999px;background:#F5B942;color:#0B0F2E;font-weight:700;text-decoration:none">Return to Student OS</a></div>`;
    overlay.appendChild(card); document.body.appendChild(overlay); return true;
  }
  function escapeHtml(v){return String(v).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));}
  async function enforceCurrent(){
    if(!/\/assessment\.html$/i.test(location.pathname)) return;
    const s=scope(location.href); if(!s.learnerId||!s.subject||!s.chapter) return;
    try{const gate=await getGate(s); if(gate) showLock(gate,s);}catch(e){console.warn('[BAA M06] progression check unavailable',e);}
  }
  async function intercept(event){
    const a=event.target.closest && event.target.closest('a[href]'); if(!a) return;
    const s=scope(a.href); if(!/\/assessment\.html$/i.test(s.url.pathname)||!s.learnerId||!s.subject||!s.chapter) return;
    event.preventDefault();
    try{const gate=await getGate(s); if(gate && gate.status==='locked'){showLock(gate,s);return;} location.href=s.url.href;}
    catch(e){location.href=s.url.href;}
  }
  global.BAAMasteryGateProgression={getGate,enforceCurrent};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',enforceCurrent); else enforceCurrent();
  document.addEventListener('click',intercept,true);
})(window);
