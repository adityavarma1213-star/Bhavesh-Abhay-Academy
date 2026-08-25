/* BAA M12 — server-backed Guardian UI bridge. */
(function(global){
  'use strict';

  function escapeHtml(value){
    return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }

  function learnerId(){ return String(global.BAA_LEARNER_ID || '').trim(); }

  function mount(){
    const root=document.querySelector('#world-guardian .world-inner');
    if(!root || root.querySelector('[data-baa-m12-server-ui]')) return false;
    const card=document.createElement('section');
    card.setAttribute('data-baa-m12-server-ui','1');
    card.style.cssText='margin:24px auto 0;max-width:760px;padding:20px;border:1px solid rgba(253,249,240,.14);border-radius:18px;background:rgba(253,249,240,.05);';
    card.innerHTML=`<div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap"><div><strong>🛡️ Evidence-backed support signals</strong><div data-m12-meta style="font-size:.72rem;color:rgba(253,249,240,.6);margin-top:5px">Loading server evidence…</div></div><button type="button" data-m12-refresh style="border:1px solid rgba(253,249,240,.18);border-radius:999px;background:transparent;color:inherit;padding:8px 12px;cursor:pointer">Refresh</button></div><div data-m12-output style="margin-top:14px"></div><div style="font-size:.68rem;color:rgba(253,249,240,.5);margin-top:12px;line-height:1.5">Academic support only. This does not diagnose mental health, personality, family conditions, or intent.</div>`;
    root.appendChild(card);
    card.querySelector('[data-m12-refresh]').addEventListener('click',load);
    load();
    return true;
  }

  async function load(){
    const card=document.querySelector('[data-baa-m12-server-ui]');
    if(!card || !global.BAAGuardian?.getServerSummary) return;
    const output=card.querySelector('[data-m12-output]');
    const meta=card.querySelector('[data-m12-meta]');
    output.textContent='Loading…';
    const result=await global.BAAGuardian.getServerSummary(learnerId());
    if(result.status!=='ready'){
      meta.textContent='Server evidence is unavailable right now.';
      output.innerHTML='<div style="color:rgba(253,249,240,.62);font-size:.82rem">No server-backed Guardian result is available. Local/test signals are not promoted to the production view.</div>';
      return;
    }
    meta.textContent=`${result.alertCount || 0} active signal${result.alertCount===1?'':'s'} · evaluated ${new Date(result.evaluatedAt || Date.now()).toLocaleString()}`;
    if(!result.alerts?.length){
      output.innerHTML='<div style="padding:12px;border-radius:12px;background:rgba(52,211,153,.08);color:rgba(253,249,240,.82);font-size:.84rem">No current academic support signal was detected from the available server evidence.</div>';
      return;
    }
    output.innerHTML=result.alerts.map(alert=>`<article data-m12-alert="${escapeHtml(alert.id)}" style="padding:14px;margin-top:10px;border-radius:14px;background:rgba(253,249,240,.05);border:1px solid rgba(253,249,240,.1)"><div style="font-weight:700">${escapeHtml(alert.title)}</div><div style="font-size:.78rem;color:rgba(253,249,240,.68);margin-top:5px;line-height:1.45">${escapeHtml(alert.reason)}</div><div style="display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap"><span style="font-size:.65rem;text-transform:uppercase;letter-spacing:.08em;opacity:.65">${escapeHtml(alert.severity || 'medium')}</span><button type="button" data-m12-ack="${escapeHtml(alert.id)}" style="border:1px solid rgba(253,249,240,.16);border-radius:999px;background:transparent;color:inherit;padding:6px 10px;cursor:pointer">Acknowledge</button></div></article>`).join('');
    output.querySelectorAll('[data-m12-ack]').forEach(button=>button.addEventListener('click',async()=>{
      const id=button.getAttribute('data-m12-ack');
      button.disabled=true;
      const result=await global.BAAGuardian.acknowledgeAlertServer(learnerId(),id);
      if(result.ok) load(); else button.disabled=false;
    }));
  }

  function start(){
    if(mount()) return;
    const observer=new MutationObserver(()=>{ if(mount()) observer.disconnect(); });
    observer.observe(document.documentElement,{childList:true,subtree:true});
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start); else start();
  global.BAAM12GuardianUI={mount,load};
})(window);