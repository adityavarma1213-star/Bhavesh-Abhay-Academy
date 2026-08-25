/* BAA M46 — vendor-neutral School ERP Integration client. */
(function(global){
  'use strict';
  async function request(action, payload){
    const response=await fetch('/api/m46-erp.js',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...(payload||{})})});
    const data=await response.json().catch(()=>({ok:false,error:{code:'INVALID_RESPONSE',message:'Invalid server response.'}}));
    if(!response.ok) throw Object.assign(new Error(data?.error?.message||'ERP request failed'),{code:data?.error?.code,status:response.status,data});
    return data;
  }
  async function list(){const r=await fetch('/api/m46-erp.js'); const d=await r.json(); if(!r.ok) throw new Error(d?.error?.message||'Unable to load ERP connections.'); return d;}
  function mount(root){
    if(!root) return;
    root.innerHTML='<section class="baa-erp-card"><h2>School ERP Integration</h2><p class="baa-erp-status">Provider-neutral ERP boundary. Live vendor synchronization requires configured credentials and an approved adapter.</p><form data-erp-form><input name="provider" required maxlength="64" placeholder="ERP provider identifier"><input name="baseUrl" required type="url" placeholder="https://erp.example.com"><input name="credentialRef" maxlength="240" placeholder="Credential reference (not secret)"><button type="submit">Save connection</button></form><button type="button" data-erp-sync hidden>Request student sync</button></section>';
    const form=root.querySelector('[data-erp-form]'); const sync=root.querySelector('[data-erp-sync]');
    form.addEventListener('submit',async e=>{e.preventDefault(); const b=Object.fromEntries(new FormData(form)); const status=root.querySelector('.baa-erp-status'); try{const d=await request('configure',b); status.textContent=`Connection ${d.id} saved as ${d.status}.`; sync.hidden=false; sync.dataset.connectionId=d.id;}catch(err){status.textContent=err.message;}});
    sync.addEventListener('click',async()=>{const status=root.querySelector('.baa-erp-status'); try{const d=await request('sync',{connectionId:sync.dataset.connectionId,entityType:'students'}); status.textContent=d.error?.message||`Sync status: ${d.status}`;}catch(err){status.textContent=err.message;}});
  }
  global.BAASchoolERP={request,list,mount};
  if(typeof document!=='undefined') document.querySelectorAll('[data-baa-erp]').forEach(mount);
})(window);
