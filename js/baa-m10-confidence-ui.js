/* BAA M10 — server-backed confidence meter UI bridge. */
(function(global){
  'use strict';
  let bound=false;
  let learnerId=null;

  function escape(value){
    const d=document.createElement('div');
    d.textContent=String(value==null?'':value);
    return d.innerHTML;
  }

  function getLearnerId(){return global.BAA_LEARNER_ID||learnerId||null;}

  function render(output,payload){
    if(!output)return;
    if(!payload||payload.status==='unavailable'){
      output.innerHTML='<div class="ai-mode-error">The confidence meter is unavailable right now. No confidence level has been invented.</div>';
      return;
    }
    if(payload.status==='insufficient_evidence'){
      output.innerHTML=`<div class="pf-empty"><span class="pe-icon">🌱</span><p>${escape(payload.message||'BAA needs more evidence before showing a confidence level.')}</p></div><div class="concept-why">Confidence: insufficient evidence.</div>`;
      return;
    }
    const band=String(payload.band||payload.confidence||'low').toLowerCase();
    const score=Number.isFinite(Number(payload.confidencePercentage))?Number(payload.confidencePercentage):null;
    const width=score==null?0:Math.max(0,Math.min(100,score));
    const label=band==='high'?'High confidence':band==='medium'?'Building confidence':'Low confidence';
    output.innerHTML=`
      <div class="confidence-meter-head"><strong>${escape(label)}</strong><span class="confidence-meter-band">${escape(band)}</span></div>
      <div class="confidence-meter-track" role="progressbar" aria-label="Evidence confidence" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${width}"><span class="confidence-meter-fill" style="width:${width}%"></span></div>
      <div class="confidence-meter-copy">${escape(payload.message||'This signal reflects the strength and consistency of stored academic evidence.')}</div>
      <div class="confidence-meter-meta">Evidence points: ${escape(payload.evidenceCount||0)} · Low-confidence concepts: ${escape(payload.lowConfidenceCount||payload.low_confidence_count||0)}</div>`;
  }

  async function load(){
    const output=document.getElementById('m10ConfidenceOutput');
    if(!output)return {status:'unavailable',error:'UI_NOT_READY'};
    const id=getLearnerId();
    if(!id){output.innerHTML='<div class="concept-why">Sign in as a learner to load your evidence-based confidence signal.</div>';return {status:'unavailable',error:'LEARNER_SESSION_NOT_READY'};}
    output.innerHTML='<div class="concept-why">Reading authenticated learning evidence…</div>';
    const payload=await global.BAAM10Confidence.load(id);
    render(output,payload);
    return payload;
  }

  function mount(){
    if(bound)return true;
    const home=document.querySelector('#screen-home .home-inner')||document.querySelector('.home-inner');
    if(!home)return false;
    const section=document.createElement('section');
    section.className='baa-card';
    section.setAttribute('aria-labelledby','m10ConfidenceTitle');
    section.innerHTML=`
      <div class="baa-card-head"><h2 id="m10ConfidenceTitle">🧭 Evidence Confidence Meter</h2><span>M10 · server evidence</span></div>
      <p class="concept-why">A conservative academic confidence signal based on stored learning evidence. BAA shows insufficient evidence instead of guessing.</p>
      <div id="m10ConfidenceOutput" aria-live="polite"><div class="concept-why">Waiting for learner session…</div></div>
      <button id="m10ConfidenceRefresh" class="task-btn" type="button">Refresh confidence</button>`;
    home.appendChild(section);
    document.getElementById('m10ConfidenceRefresh')?.addEventListener('click',load);
    bound=true;
    if(getLearnerId())load();
    return true;
  }

  function setLearner(id){learnerId=id||null;if(learnerId&&bound)load();}
  global.BAAM10ConfidenceUI={mount,load,setLearner};

  function start(){
    mount();
    if(global.BAA_LEARNER_ID)setLearner(global.BAA_LEARNER_ID);
    let tries=0;
    const timer=setInterval(()=>{
      tries+=1;
      if(global.BAA_LEARNER_ID){setLearner(global.BAA_LEARNER_ID);clearInterval(timer);}
      else if(tries>=30)clearInterval(timer);
    },1000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})(window);
