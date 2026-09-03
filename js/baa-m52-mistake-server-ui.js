/* BAA M52 — server-backed Mistake Archeology UI.
 * Uses authenticated learning_evidence only. It never diagnoses causes or
 * substitutes browser-local analytics when the server result is unavailable.
 */
(function(global){
  'use strict';
  let bound=false;
  const MAX_RESPONSE_BYTES=1024*1024;
  function esc(v){const d=document.createElement('div');d.textContent=String(v??'');return d.innerHTML;}
  function learnerId(){return global.BAA_LEARNER_ID||null;}
  async function readJsonBounded(response){
    const declared=Number(response?.headers?.get?.('content-length'));
    if(Number.isFinite(declared)&&declared>MAX_RESPONSE_BYTES){try{response.body?.cancel?.();}catch(_){}return {ok:false,error:'MISTAKES_RESPONSE_TOO_LARGE'};}
    if(!response?.body||typeof response.body.getReader!=='function'){
      try{
        const text=await response.text();
        const size=typeof TextEncoder!=='undefined'?new TextEncoder().encode(text).byteLength:typeof Buffer!=='undefined'?Buffer.byteLength(text,'utf8'):text.length;
        if(size>MAX_RESPONSE_BYTES)return {ok:false,error:'MISTAKES_RESPONSE_TOO_LARGE'};
        return {ok:true,data:JSON.parse(text)};
      }catch(error){
        if(error?.message==='MISTAKES_RESPONSE_TOO_LARGE')return {ok:false,error:'MISTAKES_RESPONSE_TOO_LARGE'};
        return {ok:false,error:'MISTAKES_INVALID_RESPONSE'};
      }
    }
    const reader=response.body.getReader(),chunks=[];let total=0;
    try{while(true){const part=await reader.read();if(part.done)break;total+=part.value?.byteLength||0;if(total>MAX_RESPONSE_BYTES){try{await reader.cancel();}catch(_){}return {ok:false,error:'MISTAKES_RESPONSE_TOO_LARGE'};}chunks.push(part.value);}}
    catch(_){try{await reader.cancel();}catch(_){}return {ok:false,error:'MISTAKES_INVALID_RESPONSE'};}
    try{const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return {ok:true,data:JSON.parse(new TextDecoder().decode(bytes))};}
    catch(_){return {ok:false,error:'MISTAKES_INVALID_RESPONSE'};}
  }
  async function load(){
    const output=document.getElementById('m52MistakeOutput');if(!output)return {ok:false,code:'UI_NOT_READY'};
    const id=learnerId();if(!id){output.innerHTML='<div class="concept-why">Sign in as a learner to load server-backed mistake evidence.</div>';return {ok:false,code:'LEARNER_SESSION_NOT_READY'};}
    output.innerHTML='<div class="concept-why">Reading recorded learning evidence…</div>';
    try{const response=await fetch(`/api/m52-mistakes?learnerId=${encodeURIComponent(id)}&limit=200`,{credentials:'include',cache:'no-store',headers:{Accept:'application/json'}});const parsed=await readJsonBounded(response);if(!parsed.ok)throw new Error(parsed.error==='MISTAKES_RESPONSE_TOO_LARGE'?'Mistake evidence response is too large.':'Mistake evidence response is invalid.');const payload=parsed.data;if(!response.ok||!payload.ok)throw new Error(payload?.error?.message||'Mistake evidence unavailable.');const common=Array.isArray(payload.commonMistakes)?payload.commonMistakes.slice(0,8):[];const groups=Array.isArray(payload.groups)?payload.groups.slice(0,8):[];if(!common.length&&!groups.length){output.innerHTML='<div class="pf-empty"><span class="pe-icon">🌱</span><p>No recorded mistake pattern is strong enough to surface yet.</p></div>';return payload;}const commonHtml=common.map(item=>`<div class="concept-row"><div><b>${esc(item.concept)}</b><div class="concept-why">${esc(item.subject||'')} · ${esc(item.chapter||'')}</div></div><div class="concept-why">${esc(item.count)} evidence · ${esc((item.reasonTypes||[]).join(', '))}</div></div>`).join('');const groupHtml=groups.map(item=>`<div class="concept-row"><div><b>${esc(item.reasonType)}</b><div class="concept-why">${esc(item.subject||'')} · ${esc(item.chapter||'')}</div></div><div class="concept-why">${esc(item.count)} evidence · ${esc(item.confidence)}</div></div>`).join('');output.innerHTML=`<div class="concept-why">Recorded incorrect/partially-correct/uncertain evidence: ${esc(payload.evidenceCount||0)}</div><h3 style="margin:12px 0 6px">Common concepts</h3>${commonHtml||'<div class="concept-why">No common concepts yet.</div>'}<h3 style="margin:14px 0 6px">Mistake groups</h3>${groupHtml||'<div class="concept-why">No grouped pattern yet.</div>'}<div class="concept-why" style="margin-top:10px">Server evidence only. This does not diagnose psychological causes.</div>`;return payload;
    }catch(error){output.innerHTML=`<div class="ai-mode-error">${esc(error.message||'Server mistake evidence is unavailable right now. No local substitute is shown.')}</div>`;return {ok:false,code:'SERVER_MISTAKES_FAILED'};}
  }
  function mount(){if(bound)return true;const home=document.querySelector('#screen-home .home-inner')||document.querySelector('.home-inner');if(!home)return false;const section=document.createElement('section');section.className='baa-card';section.setAttribute('aria-labelledby','m52MistakeTitle');section.innerHTML=`<div class="baa-card-head"><h2 id="m52MistakeTitle">🧩 Mistake Archeology</h2><span>M52 · server evidence</span></div><p class="concept-why">Recorded mistake patterns from authenticated learning evidence. BAA groups what was recorded; it does not diagnose why a learner made a mistake.</p><div id="m52MistakeOutput" aria-live="polite"><div class="concept-why">Waiting for learner session…</div></div><button id="m52MistakeRefresh" class="task-btn" type="button">Refresh mistake evidence</button>`;home.appendChild(section);document.getElementById('m52MistakeRefresh')?.addEventListener('click',load);bound=true;if(learnerId())load();return true;}
  function start(){mount();let tries=0;const timer=setInterval(()=>{tries+=1;if(learnerId()){load();clearInterval(timer);}else if(tries>=30)clearInterval(timer);},1000);}
  global.BAAM52MistakeServerUI={mount,load};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})(window);
