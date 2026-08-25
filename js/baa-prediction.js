/* ============================================================
   js/baa-prediction.js
   BAA OS — Module 13: AI Prediction Engine.
   Academic forecasts only. Predictions are bounded estimates from
   real stored evidence; insufficient evidence returns "not enough
   evidence" rather than a fabricated forecast.
   ============================================================ */
(function(global){
  'use strict';
  function core(){return global.BAAAssessment;}
  function intelligence(){return global.BAAIntelligence;}

  function getPredictionSummary(){
    const a=core();
    if(!a) return {status:'unavailable'};
    const store=typeof a._load==='function'?a._load():null;
    if(!store) return {status:'unavailable'};

    const attempts=(store.attempts||[]).filter(x=>x.status!=='in_progress'&&typeof x.score==='number'&&x.maxScore>0);
    const concepts=Object.values(store.learningMemory||{});
    const eligible=concepts.filter(c=>c.status==='mastered'||c.status==='learning'||c.status==='needs_revision');
    const confidence=intelligence&&typeof intelligence().getConfidenceSummary==='function'
      ? intelligence().getConfidenceSummary() : {band:'insufficient_evidence'};

    if(attempts.length<2 || eligible.length<2 || confidence.band==='insufficient_evidence'){
      return {
        status:'insufficient_evidence',
        message:'BAA needs more completed assessments and concept evidence before making an academic forecast.',
        readiness:null,
        gradeTrajectory:null,
        milestone:null,
        confidence:confidence.band||'insufficient_evidence'
      };
    }

    const recent=attempts.slice(0,5);
    const percentages=recent.map(x=>x.score/x.maxScore*100);
    const current=percentages[0];
    const previous=percentages.slice(1);
    const previousAvg=previous.length?previous.reduce((s,x)=>s+x,0)/previous.length:current;
    const delta=current-previousAvg;
    const mastered=eligible.filter(c=>c.status==='mastered').length;
    const needs=eligible.filter(c=>c.status==='needs_revision').length;
    const masteryRate=mastered/eligible.length;
    let readiness=Math.round(Math.max(0,Math.min(100,(masteryRate*70)+(current*0.3))));
    if(delta>3) readiness=Math.min(100,readiness+5);
    if(delta<-3) readiness=Math.max(0,readiness-5);

    let trajectory='stable';
    if(delta>3) trajectory='improving';
    else if(delta<-3) trajectory='declining';

    const milestone=readiness>=80
      ? 'Current evidence is consistent with strong readiness for the next milestone.'
      : readiness>=60
        ? 'Current evidence suggests you are building toward the next milestone; targeted revision could improve readiness.'
        : 'Current evidence suggests more targeted practice is needed before the next milestone.';

    return {
      status:'forecast',
      readiness,
      gradeTrajectory:{currentPercentage:Math.round(current*10)/10,previousAverage:Math.round(previousAvg*10)/10,direction:trajectory},
      milestone,
      confidence:confidence.band,
      evidence:{assessments:attempts.length,trackedConcepts:eligible.length,mastered,needsRevision:needs}
    };
  }

  async function getServerPredictionSummary(learnerId){
    if(!learnerId) return {status:'unavailable',error:'LEARNER_ID_REQUIRED'};
    try{
      const response=await fetch(`/api/m13-prediction?learnerId=${encodeURIComponent(learnerId)}`,{credentials:'include'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok) return {status:'unavailable',error:data?.error?.code||'PREDICTION_SERVER_UNAVAILABLE',httpStatus:response.status};
      return data;
    }catch{return {status:'unavailable',error:'PREDICTION_SERVER_UNAVAILABLE'};}
  }

  global.BAAPrediction={getPredictionSummary,getServerPredictionSummary};
})(window);