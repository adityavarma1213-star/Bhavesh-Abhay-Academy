/* BAA M21–M23 server evidence bridge. The server owns evidence-derived decisions
   and M21 receives questions from the canonical server question bank. */
(function(global){
  'use strict';
  const API='/api/m21-23-evidence';
  const clean=v=>String(v==null?'':v);
  async function load(learnerId){
    if(!learnerId) throw new Error('LEARNER_ID_REQUIRED');
    const r=await fetch(`${API}?learnerId=${encodeURIComponent(learnerId)}`,{credentials:'include',cache:'no-store',headers:{Accept:'application/json'}});
    const data=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(data?.error?.code||`HTTP_${r.status}`);
    return data;
  }
  function learnerId(){return clean(global.BAA_LEARNER_ID || document.body?.dataset?.learnerId);}
  function clear(node){while(node&&node.firstChild)node.removeChild(node.firstChild);}
  function renderList(node,items,empty,kind){
    if(!node)return; clear(node);
    if(!items?.length){const p=document.createElement('p');p.className='baa-ui-empty';p.textContent=empty;node.appendChild(p);return;}
    const list=document.createElement('div');list.className='baa-ui-results-list';
    items.forEach(x=>{const card=document.createElement('article');card.className='baa-ui-result-item';const title=document.createElement('strong');title.textContent=`${x.subject||'Subject'} — ${x.concept||'Concept'}`;const meta=document.createElement('div');meta.className='baa-ui-meta';meta.textContent=`${x.correctCount}/${x.evidenceCount} correct · ${Math.round((x.accuracy||0)*100)}% · ${x.status||kind}`;const reason=document.createElement('p');reason.textContent=x.reason||'';card.append(title,meta,reason);list.appendChild(card);});
    node.appendChild(list);
  }
  function renderPractice(node,questions){
    if(!node)return; clear(node);
    if(!questions?.length){const p=document.createElement('p');p.className='baa-ui-empty';p.textContent='No server-backed practice questions are available for the current evidence.';node.appendChild(p);return;}
    const note=document.createElement('p');note.className='baa-ui-meta';note.textContent='Practice is prioritized from authenticated server evidence and uses questions from the canonical BAA question bank.';node.appendChild(note);
    const list=document.createElement('div');list.className='baa-ui-results-list';
    questions.forEach(q=>{const card=document.createElement('article');card.className='baa-ui-result-item';const title=document.createElement('strong');title.textContent=q.title||q.text||q.id||'Practice question';const meta=document.createElement('div');meta.className='baa-ui-meta';meta.textContent=`${q.subject||'Subject not specified'} · ${q.concept||'Concept not specified'} · ${q.difficulty||'difficulty not specified'}`;card.append(title,meta);list.appendChild(card);});
    node.appendChild(list);
  }
  function install(){
    const learner=learnerId(); if(!learner)return;
    const practice=document.getElementById('m21PracticeBtn'), weak=document.getElementById('m22WeaknessBtn'), strong=document.getElementById('m23StrengthBtn');
    if(!practice&&!weak&&!strong)return;
    if(practice&&!practice.dataset.m21Server){
      practice.dataset.m21Server='1';
      practice.addEventListener('click',async function(e){e.stopImmediatePropagation();const out=document.getElementById('m21PracticeResult');try{const data=await load(learner);const limit=Math.max(1,Math.min(20,Number(document.getElementById('m21PracticeLimit')?.value)||5));renderPractice(out,(data.practiceQuestions||[]).slice(0,limit));}catch(_){renderPractice(out,[]);}},true);
    }
    if(weak&&!weak.dataset.m22Server){
      weak.dataset.m22Server='1';
      weak.addEventListener('click',async function(e){e.stopImmediatePropagation();try{const data=await load(learner);renderList(document.getElementById('m22Result'),data.weaknesses,'Not enough server evidence yet. Complete assessments so BAA can identify repeated evidence patterns.','needs_revision');}catch(_){renderList(document.getElementById('m22Result'),[],'Live evidence is unavailable right now.','needs_revision');}},true);
    }
    if(strong&&!strong.dataset.m23Server){
      strong.dataset.m23Server='1';
      strong.addEventListener('click',async function(e){e.stopImmediatePropagation();try{const data=await load(learner);renderList(document.getElementById('m23Result'),data.strengths,'Not enough server evidence yet. Complete assessments so BAA can identify evidence-backed strengths.','strong');}catch(_){renderList(document.getElementById('m23Result'),[],'Live evidence is unavailable right now.','strong');}},true);
    }
  }
  global.BAAM21M23Server={load,install};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})(window);
