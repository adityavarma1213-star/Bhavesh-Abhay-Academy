/* BAA M13 — server prediction UI bridge.
 * Surfaces the bounded, authenticated server prediction inside Student OS.
 * Predictions are academic-only signals; insufficient evidence is shown
 * honestly rather than converted into a fabricated forecast.
 */
(function(global){
  'use strict';

  let bound=false;
  let learnerId=null;
  let moduleReady=false;

  function escape(value){
    const d=document.createElement('div');
    d.textContent=String(value==null?'':value);
    return d.innerHTML;
  }

  function getLearnerId(){
    return global.BAA_LEARNER_ID||learnerId||null;
  }

  function loadPredictionModule(){
    if(global.BAAPrediction){moduleReady=true;return Promise.resolve(true);}
    if(document.querySelector('script[data-baa-m13-prediction]')){
      return new Promise(resolve=>{
        let tries=0;
        const timer=setInterval(()=>{
          tries+=1;
          if(global.BAAPrediction){clearInterval(timer);moduleReady=true;resolve(true);}
          else if(tries>=30){clearInterval(timer);resolve(false);}
        },100);
      });
    }
    return new Promise(resolve=>{
      const script=document.createElement('script');
      script.src='js/baa-prediction.js';
      script.async=false;
      script.dataset.baaM13Prediction='1';
      script.onload=()=>{moduleReady=!!global.BAAPrediction;resolve(moduleReady);};
      script.onerror=()=>resolve(false);
      document.head.appendChild(script);
    });
  }

  async function loadPrediction(){
    const output=document.getElementById('m13PredictionOutput');
    if(!output)return {ok:false,code:'UI_NOT_READY'};
    const id=getLearnerId();
    if(!id){
      output.innerHTML='<div class="concept-why">Sign in as a learner to load your evidence-based academic signal.</div>';
      return {ok:false,code:'LEARNER_SESSION_NOT_READY'};
    }
    if(!moduleReady && !(await loadPredictionModule())){
      output.innerHTML='<div class="ai-mode-error">Prediction service is unavailable right now.</div>';
      return {ok:false,code:'PREDICTION_MODULE_UNAVAILABLE'};
    }
    output.innerHTML='<div class="concept-why">Reading your authenticated learning evidence…</div>';
    const payload=await global.BAAPrediction.getServerPredictionSummary(id);
    if(!payload||payload.status==='unavailable'){
      output.innerHTML='<div class="ai-mode-error">The academic signal could not be loaded. No forecast has been invented.</div>';
      return payload||{status:'unavailable'};
    }
    if(payload.status==='insufficient_evidence'){
      output.innerHTML=`<div class="pf-empty"><span class="pe-icon">🌱</span><p>${escape(payload.message||'BAA needs more evidence before making an academic forecast.')}</p></div><div class="concept-why">Confidence: ${escape(payload.confidence||'insufficient_evidence')}</div>`;
      return payload;
    }
    const trajectory=payload.gradeTrajectory||{};
    const evidence=payload.evidence||{};
    const direction=trajectory.direction||'stable';
    const directionIcon=direction==='improving'?'↗':direction==='declining'?'↘':'→';
    output.innerHTML=`
      <div class="concept-row">
        <div><b>${escape(directionIcon)} Readiness signal: ${escape(payload.readiness)}%</b> · ${escape(direction)}</div>
        <div class="concept-why">Current observed score: ${escape(trajectory.currentPercentage)}% · recent average: ${escape(trajectory.previousAverage)}% · confidence: ${escape(payload.confidence||'not available')}</div>
        <div class="concept-why">${escape(payload.milestone||'No milestone interpretation is available.')}</div>
        <div class="concept-why">Evidence: ${escape(evidence.assessments||0)} assessments · ${escape(evidence.trackedConcepts||0)} tracked concepts · ${escape(evidence.mastered||0)} mastered</div>
      </div>
      <div class="concept-why" style="margin-top:10px">Academic-only signal from authenticated server evidence. It is not a diagnosis, guarantee, or prediction of future life outcomes.</div>`;
    return payload;
  }

  function mount(){
    if(bound)return true;
    const home=document.querySelector('#screen-home .home-inner')||document.querySelector('.home-inner');
    if(!home)return false;
    const section=document.createElement('section');
    section.className='baa-card';
    section.setAttribute('aria-labelledby','m13PredictionTitle');
    section.innerHTML=`
      <div class="baa-card-head"><h2 id="m13PredictionTitle">🔭 Academic Readiness Signal</h2><span>M13 · evidence-based</span></div>
      <p class="concept-why">A bounded academic signal based on your stored assessment, memory and learning-evidence history. BAA will say when there is not enough evidence.</p>
      <div id="m13PredictionOutput" aria-live="polite"><div class="concept-why">Waiting for learner session…</div></div>
      <button id="m13PredictionRefresh" class="task-btn" type="button">Refresh academic signal</button>`;
    home.appendChild(section);
    const refresh=document.getElementById('m13PredictionRefresh');
    if(refresh)refresh.addEventListener('click',loadPrediction);
    bound=true;
    if(getLearnerId())loadPrediction();
    return true;
  }

  function setLearner(id){
    learnerId=id||null;
    if(learnerId&&bound)loadPrediction();
  }

  global.BAAM13PredictionIntegration={mount,loadPrediction,setLearner};

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

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);
  else start();
})(window);
