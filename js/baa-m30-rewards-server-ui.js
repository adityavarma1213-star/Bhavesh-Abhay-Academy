/* BAA M30 — server-authoritative Achievement & Rewards surface.
 * The existing rewards engine remains available for local/private testing,
 * but this panel never presents browser-local numbers as production truth.
 */
(function(global){
  'use strict';
  function esc(v){
    const d=document.createElement('div'); d.textContent=String(v==null?'':v); return d.innerHTML;
  }
  function learnerId(){ return String(global.BAA_LEARNER_ID||'').trim(); }
  async function load(){
    const id=learnerId();
    if(!id || !global.fetch) return {ok:false,reason:'NO_AUTHENTICATED_LEARNER'};
    const r=await fetch('/api/v1/rewards?learnerId='+encodeURIComponent(id),{credentials:'include',cache:'no-store'});
    if(!r.ok) return {ok:false,reason:'SERVER_'+r.status};
    const p=await r.json();
    const rewards=p && p.rewards ? p.rewards : {};
    return {ok:true,rewards};
  }
  function render(result){
    let mount=document.getElementById('baa-m30-server-rewards');
    if(!mount){
      mount=document.createElement('section');
      mount.id='baa-m30-server-rewards';
      mount.setAttribute('aria-live','polite');
      mount.style.cssText='max-width:980px;margin:20px auto;padding:0 5vw;';
      document.body.appendChild(mount);
    }
    if(!result.ok){
      mount.innerHTML='<div style="border:1px solid rgba(253,249,240,.1);border-radius:16px;padding:16px;color:rgba(253,249,240,.62);font-size:.82rem;">Achievement & Rewards is waiting for an authenticated learner record. Browser-local preview data is not presented here as server data.</div>';
      return;
    }
    const r=result.rewards||{};
    const badges=Array.isArray(r.earnedBadgeIds)?r.earnedBadgeIds:[];
    const xp=Number(r.xp||0), completed=Number(r.completedAttempts||0), correct=Number(r.correctAnswers||0), mastered=Number(r.masteredConcepts||0);
    mount.innerHTML=`<div style="border:1px solid rgba(245,185,66,.22);background:rgba(245,185,66,.045);border-radius:18px;padding:20px;">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;">
        <div><div style="font-size:.68rem;letter-spacing:.12em;text-transform:uppercase;color:#F5B942;">M30 · Server-backed</div><h2 style="font-family:Fraunces,serif;font-weight:500;font-size:1.25rem;margin:4px 0;">Achievement & Rewards</h2><div style="font-size:.72rem;color:rgba(253,249,240,.45);">Derived from the authenticated learner reward record.</div></div>
        <button id="baa-m30-refresh" type="button" style="border:1px solid rgba(245,185,66,.35);background:transparent;color:#F5B942;border-radius:999px;padding:7px 12px;cursor:pointer;">Refresh</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;margin-top:14px;">
        <div style="padding:10px;border-radius:12px;background:rgba(253,249,240,.04);"><b style="font-size:1.2rem;">${xp}</b><span style="display:block;font-size:.68rem;color:rgba(253,249,240,.5);">XP</span></div>
        <div style="padding:10px;border-radius:12px;background:rgba(253,249,240,.04);"><b style="font-size:1.2rem;">${completed}</b><span style="display:block;font-size:.68rem;color:rgba(253,249,240,.5);">Completed</span></div>
        <div style="padding:10px;border-radius:12px;background:rgba(253,249,240,.04);"><b style="font-size:1.2rem;">${correct}</b><span style="display:block;font-size:.68rem;color:rgba(253,249,240,.5);">Correct</span></div>
        <div style="padding:10px;border-radius:12px;background:rgba(253,249,240,.04);"><b style="font-size:1.2rem;">${mastered}</b><span style="display:block;font-size:.68rem;color:rgba(253,249,240,.5);">Mastered</span></div>
      </div>
      <div style="margin-top:14px;font-size:.8rem;"><b>Earned badges</b><div style="margin-top:7px;color:rgba(253,249,240,.7);">${badges.length?badges.map(esc).join(' · '):'No server-recorded badges yet.'}</div></div>
    </div>`;
    const btn=document.getElementById('baa-m30-refresh');
    if(btn) btn.addEventListener('click',async()=>{btn.disabled=true;btn.textContent='Loading…';try{render(await load());}finally{}});
  }
  async function init(){
    if(!String(global.location.pathname||'').endsWith('/student-os.html')) return;
    render(await load());
  }
  global.BAAM30RewardsServerUI={load,render,init};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})(window);
