/* BAA M57 — Parent Learning Conversation Assistant.
   Produces neutral conversation prompts from server-backed learning facts.
   It does not diagnose a child or prescribe mental-health treatment. */
(function(global){
'use strict';
function prompts(facts){if(!facts||typeof facts!=='object')return {ok:false,error:'INVALID_PARENT_FACTS'};const topic=String(facts.topic||'the recent study work').trim();const state=String(facts.state||'learning').trim();return {ok:true,error:null,prompts:[
`Ask what felt easiest about ${topic}.`,`Ask what part of ${topic} felt difficult without assigning blame.`,
`Ask whether the current ${state} feels manageable.`,`Agree on one small next step together.`
],limitation:'Conversation prompts are supportive guidance, not diagnosis or clinical advice.'};}
const AUTH={credentials:'include',headers:{'Accept':'application/json','Content-Type':'application/json'}};
async function generate(facts){
  const body=facts&&typeof facts==='object'?facts:{};
  const response=await fetch('/api/m57-parent-conversation.js',{method:'POST',headers:AUTH.headers,credentials:AUTH.credentials,body:JSON.stringify(body)});
  const data=await response.json().catch(()=>({ok:false,error:{code:'INVALID_RESPONSE',message:'Invalid server response.'}}));
  if(!response.ok)throw Object.assign(new Error(data?.error?.message||'Unable to generate parent conversation prompts.'),{code:data?.error?.code,status:response.status,data});
  return data;
}
async function list(learnerId){
  const response=await fetch(`/api/m57-parent-conversation.js?learnerId=${encodeURIComponent(learnerId||'')}`,{method:'GET',credentials:AUTH.credentials,headers:{Accept:'application/json'}});
  const data=await response.json();
  if(!response.ok)throw new Error(data?.error?.message||'Unable to load parent conversations.');
  return data;
}
function mount(root){
  if(!root)return;
  root.innerHTML='<section class="baa-parent-conversation-card"><h2>Parent Learning Conversation</h2><p data-parent-conversation-status>Supportive, non-diagnostic conversation prompts.</p><button type="button" data-parent-conversation-generate>Generate prompts</button><ul data-parent-conversation-list></ul></section>';
  const status=root.querySelector('[data-parent-conversation-status]');const listEl=root.querySelector('[data-parent-conversation-list]');
  root.querySelector('[data-parent-conversation-generate]').addEventListener('click',async()=>{try{const data=await generate({learnerId:root.dataset.learnerId||'',topic:root.dataset.topic||'the recent study work',state:root.dataset.state||'learning'});listEl.innerHTML=data.prompts.map(x=>`<li>${String(x).replace(/[&<>\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[m]))}</li>`).join('');status.textContent=data.limitation;}catch(e){status.textContent=e.message;}});
}
global.BAAParentConversation={prompts,generate,list,mount};
if(typeof document!=='undefined')document.querySelectorAll('[data-baa-parent-conversation]').forEach(mount);
})(window);
