/* BAA M46 — vendor-neutral School ERP Integration client. */
(function(global){
  'use strict';
  const MAX_RESPONSE_BYTES=1024*1024;
  async function readJsonBounded(response){
    const declared=Number(response?.headers?.get?.('content-length'));
    if(Number.isFinite(declared)&&declared>MAX_RESPONSE_BYTES){try{response.body?.cancel?.();}catch(_){}return {ok:false,error:{code:'ERP_RESPONSE_TOO_LARGE',message:'ERP response is too large.'}};}
    if(!response?.body||typeof response.body.getReader!=='function'){
      try{
        const text=await response.text();
        const bytes=typeof TextEncoder!=='undefined'?new TextEncoder().encode(text):null;
        const size=bytes?bytes.byteLength:typeof Buffer!=='undefined'?Buffer.byteLength(text,'utf8'):text.length;
        if(size>MAX_RESPONSE_BYTES)return {ok:false,error:{code:'ERP_RESPONSE_TOO_LARGE',message:'ERP response is too large.'}};
        return {ok:true,data:JSON.parse(text)};
      }catch(error){
        if(error?.message==='ERP response is too large.')return {ok:false,error:{code:'ERP_RESPONSE_TOO_LARGE',message:error.message}};
        return {ok:false,error:{code:'ERP_INVALID_RESPONSE',message:'ERP returned an invalid response.'}};
      }
    }
    const reader=response.body.getReader(),chunks=[];let total=0;
    try{while(true){const part=await reader.read();if(part.done)break;total+=part.value?.byteLength||0;if(total>MAX_RESPONSE_BYTES){try{await reader.cancel();}catch(_){}return {ok:false,error:{code:'ERP_RESPONSE_TOO_LARGE',message:'ERP response is too large.'}};}chunks.push(part.value);}}
    catch(_){try{await reader.cancel();}catch(_){}return {ok:false,error:{code:'ERP_INVALID_RESPONSE',message:'ERP returned an unreadable response.'}};}
    try{const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return {ok:true,data:JSON.parse(new TextDecoder().decode(bytes))};}
    catch(_){return {ok:false,error:{code:'ERP_INVALID_RESPONSE',message:'ERP returned an invalid response.'}};}
  }
  async function request(action, payload){
    const response=await fetch('/api/m46-erp.js',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({action,...(payload||{})})});
    const parsed=await readJsonBounded(response);
    if(!parsed.ok) throw Object.assign(new Error(parsed.error.message),{code:parsed.error.code,status:response.status});
    const data=parsed.data;
    if(!response.ok) throw Object.assign(new Error(data?.error?.message||'ERP request failed'),{code:data?.error?.code,status:response.status,data});
    return data;
  }
  async function list(){
    const response=await fetch('/api/m46-erp.js',{credentials:'include',cache:'no-store',headers:{Accept:'application/json'}});
    const parsed=await readJsonBounded(response);
    if(!parsed.ok) throw new Error(parsed.error.message);
    const d=parsed.data;
    if(!response.ok) throw new Error(d?.error?.message||'Unable to load ERP connections.');
    return d;
  }
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
