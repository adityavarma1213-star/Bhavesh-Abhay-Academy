/* BAA M57 — Parent Learning Conversation Assistant.
   Produces neutral conversation prompts from server-backed learning facts.
   It does not diagnose a child or prescribe mental-health treatment. */
(function(global){
'use strict';
const MAX_SERVER_RESPONSE_BYTES=1024*1024;
async function readServerJson(response){
  const length=Number(response?.headers?.get?.('content-length')||0);
  if(Number.isFinite(length)&&length>MAX_SERVER_RESPONSE_BYTES)throw new Error('PARENT_CONVERSATION_RESPONSE_TOO_LARGE');
  if(!response?.body?.getReader){
    const text=await response.text();
    if(new TextEncoder().encode(text).byteLength>MAX_SERVER_RESPONSE_BYTES)throw new Error('PARENT_CONVERSATION_RESPONSE_TOO_LARGE');
    return JSON.parse(text);
  }
  const reader=response.body.getReader(); const decoder=new TextDecoder(); let bytes=0; let text='';
  try{
    while(true){
      const chunk=await reader.read(); if(chunk.done)break;
      bytes+=chunk.value.byteLength;
      if(bytes>MAX_SERVER_RESPONSE_BYTES){try{await reader.cancel();}catch(_){} throw new Error('PARENT_CONVERSATION_RESPONSE_TOO_LARGE');}
      text+=decoder.decode(chunk.value,{stream:true});
    }
    text+=decoder.decode(); return JSON.parse(text);
  }finally{try{reader.releaseLock();}catch(_) {}}
}
function prompts(facts){if(!facts||typeof facts!=='object')return {ok:false,error:'INVALID_PARENT_FACTS'};const topic=String(facts.topic||'the recent study work').trim();const state=String(facts.state||'learning').trim();return {ok:true,error:null,prompts:[
`Ask what felt easiest about ${topic}.`,`Ask what part of ${topic} felt difficult without assigning blame.`,
`Ask whether the current ${state} feels manageable.`,`Agree on one small next step together.`
],limitation:'Conversation prompts are supportive guidance, not diagnosis or clinical advice.'};}
const AUTH={credentials:'include',headers:{'Accept':'application/json','Content-Type':'application/json'}};
async function generate(facts){
  const source=facts&&typeof facts==='object'?facts:{};
  const body={learnerId:String(source.learnerId||'').trim()};
  const response=await fetch('/api/m57-parent-conversation.js',{method:'POST',headers:AUTH.headers,credentials:AUTH.credentials,cache:'no-store',body:JSON.stringify(body)});
  let data;
  try{data=await readServerJson(response);}catch(error){throw Object.assign(new Error(error?.message==='PARENT_CONVERSATION_RESPONSE_TOO_LARGE'?'Parent conversation response is too large.':'Invalid server response.'),{code:error?.message,status:response.status});}
  if(!response.ok)throw Object.assign(new Error(data?.error?.message||'Unable to generate parent conversation prompts.'),{code:data?.error?.code,status:response.status,data});
  return data;
}
async function list(learnerId){
  const response=await fetch(`/api/m57-parent-conversation.js?learnerId=${encodeURIComponent(learnerId||'')}`,{method:'GET',credentials:AUTH.credentials,cache:'no-store',headers:{Accept:'application/json'}});
  let data;
  try{data=await readServerJson(response);}catch(error){throw Object.assign(new Error(error?.message==='PARENT_CONVERSATION_RESPONSE_TOO_LARGE'?'Parent conversation response is too large.':'Invalid server response.'),{code:error?.message,status:response.status});}
  if(!response.ok)throw new Error(data?.error?.message||'Unable to load parent conversations.');
  return data;
}
function mount(root){
  if(!root)return;
  root.innerHTML='<section class="baa-parent-conversation-card"><h2>Parent Learning Conversation</h2><p data-parent-conversation-status>Supportive, non-diagnostic conversation prompts.</p><button type="button" data-parent-conversation-generate>Generate prompts</button><ul data-parent-conversation-list></ul></section>';
  const status=root.querySelector('[data-parent-conversation-status]');const listEl=root.querySelector('[data-parent-conversation-list]');
  root.querySelector('[data-parent-conversation-generate]').addEventListener('click',async()=>{try{const data=await generate({learnerId:root.dataset.learnerId||''});listEl.innerHTML=(Array.isArray(data.prompts)?data.prompts:[]).map(x=>`<li>${String(x).replace(/[&<>\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[m]))}</li>`).join('');status.textContent=data.limitation||'Supportive, non-diagnostic conversation prompts.';}catch(e){status.textContent=e.message;}});
}
global.BAAParentConversation={prompts,generate,list,mount};
if(typeof document!=='undefined')document.querySelectorAll('[data-baa-parent-conversation]').forEach(mount);
})(window);
