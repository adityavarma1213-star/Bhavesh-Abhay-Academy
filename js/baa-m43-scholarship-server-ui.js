/* BAA M43 — authenticated server-backed Scholarship Finder surface. */
(function(global){
  'use strict';
  function esc(v){const d=document.createElement('div');d.textContent=String(v==null?'':v);return d.innerHTML;}
  function learnerPresent(){return !!String(global.BAA_LEARNER_ID||'').trim();}
  async function search(criteria){
    const q=new URLSearchParams();
    for(const key of ['country','level','field']) if(criteria&&criteria[key]) q.set(key,String(criteria[key]));
    const response=await fetch('/api/m43-scholarships'+(q.toString()?'?'+q:''),{credentials:'include',cache:'no-store',headers:{Accept:'application/json'}}).catch(()=>null);
    if(!response) return {ok:false,code:'SCHOLARSHIP_SERVER_UNAVAILABLE',results:[]};
    const body=await response.json().catch(()=>({}));
    if(!response.ok||!body.ok) return {ok:false,code:body?.error?.code||'SCHOLARSHIP_SERVER_ERROR',results:[]};
    return {ok:true,results:Array.isArray(body.results)?body.results:[]};
  }
  function mount(){
    if(!String(global.location.pathname||'').endsWith('/student-os.html')||document.getElementById('baa-m43-server-scholarships')) return;
    const mount=document.createElement('section');mount.id='baa-m43-server-scholarships';mount.setAttribute('aria-live','polite');mount.style.cssText='max-width:980px;margin:20px auto;padding:0 5vw;';
    mount.innerHTML='<div style="border:1px solid rgba(76,217,232,.22);background:rgba(76,217,232,.045);border-radius:18px;padding:20px"><div style="font-size:.68rem;letter-spacing:.12em;text-transform:uppercase;color:#4CD9E8">M43 · Server-backed</div><h2 style="font-family:Fraunces,serif;font-weight:500;font-size:1.25rem;margin:4px 0">Scholarship Finder</h2><p style="font-size:.78rem;color:rgba(253,249,240,.55)">Only published records from the authenticated BAA scholarship service are shown. BAA does not invent scholarship listings.</p><form id="baa-m43-form" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-top:12px"><input name="country" aria-label="Country" placeholder="Country"><input name="level" aria-label="Level" placeholder="Level / grade"><input name="field" aria-label="Field" placeholder="Field of study"><button type="submit">Find scholarships</button></form><div id="baa-m43-results" style="margin-top:12px"></div></div>';
    document.body.appendChild(mount);
    const form=document.getElementById('baa-m43-form'),out=document.getElementById('baa-m43-results');
    if(!learnerPresent()){out.textContent='Sign in with an authenticated learner account to search published scholarships.';return;}
    form.addEventListener('submit',async function(event){event.preventDefault();out.textContent='Loading published scholarships…';const result=await search(Object.fromEntries(new FormData(form)));if(!result.ok){out.textContent='Scholarship service is unavailable right now. No local preview data is being substituted.';return;}out.innerHTML=result.results.length?result.results.map(x=>'<article style="padding:10px 0;border-bottom:1px solid rgba(253,249,240,.07)"><strong>'+esc(x.title)+'</strong><div style="font-size:.76rem;color:rgba(253,249,240,.62)">'+esc(x.provider)+(x.amountText?' · '+esc(x.amountText):'')+(x.deadline?' · deadline '+esc(x.deadline):'')+'</div>'+(x.sourceUrl?'<a target="_blank" rel="noopener noreferrer" href="'+esc(x.sourceUrl)+'">Official source →</a>':'')+'</article>').join(''):'<p style="font-size:.78rem;color:rgba(253,249,240,.55)">No currently published scholarships match these filters.</p>';});
  }
  global.BAAM43ScholarshipServerUI={search,mount};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',mount,{once:true}); else mount();
})(window);
