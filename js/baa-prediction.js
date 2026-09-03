/* ============================================================
   js/baa-prediction.js
   BAA OS — Module 13: AI Prediction Engine.
   Academic forecasts only. Predictions are bounded estimates from
   real stored evidence; insufficient evidence returns "not enough
   evidence" rather than a fabricated forecast.
   ============================================================ */
(function(global){
  'use strict';
  const MAX_RESPONSE_BYTES=1024*1024;
  async function readJson(response){
    const declared=Number(response?.headers?.get?.('content-length'));
    if(Number.isFinite(declared)&&declared>MAX_RESPONSE_BYTES){try{response.body?.cancel?.();}catch(_){}throw new Error('PREDICTION_RESPONSE_TOO_LARGE');}
    if(!response?.body||typeof response.body.getReader!=='function'){
      try{
        const text=await response.text();
        const bytes=typeof TextEncoder!=='undefined'?new TextEncoder().encode(text):null;
        const size=bytes?bytes.byteLength:typeof Buffer!=='undefined'?Buffer.byteLength(text,'utf8'):text.length;
        if(size>MAX_RESPONSE_BYTES)throw new Error('PREDICTION_RESPONSE_TOO_LARGE');
        return JSON.parse(text);
      }catch(error){throw new Error(error?.message==='PREDICTION_RESPONSE_TOO_LARGE'?'PREDICTION_RESPONSE_TOO_LARGE':'PREDICTION_INVALID_RESPONSE');}
    }
    const reader=response.body.getReader(),chunks=[],decoder=new TextDecoder();let total=0;
    try{while(true){const part=await reader.read();if(part.done)break;total+=part.value?.byteLength||0;if(total>MAX_RESPONSE_BYTES){try{await reader.cancel();}catch(_){}throw new Error('PREDICTION_RESPONSE_TOO_LARGE');}chunks.push(part.value);}}finally{try{reader.releaseLock();}catch(_) {}}
    let text='';for(const chunk of chunks)text+=decoder.decode(chunk,{stream:true});text+=decoder.decode();
    try{return JSON.parse(text);}catch(_){throw new Error('PREDICTION_INVALID_RESPONSE');}
  }
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
    const confidence=intelligence&&typeof intelligence().getConfidenceSummary==='function'?intelligence().getConfidenceSummary():{band:'insufficient_evidence'};
    if(attempts.length<2||eligible.length<2||confidence.band==='insufficient_evidence')return {status:'insufficient_evidence',message:'BAA needs more completed assessments and concept evidence before making an academic forecast.',readiness:null,gradeTrajectory:null,milestone:null,confidence:confidence.band||'insufficient_evidence'};
    const recent=attempts.slice(0,5),percentages=recent.map(x=>x.score/x.maxScore*100),current=percentages[0],previous=percentages.slice(1),previousAvg=previous.length?previous.reduce((s,x)=>s+x,0)/previous.length:current,delta=current-previousAvg,mastered=eligible.filter(c=>c.status==='mastered').length,needs=eligible.filter(c=>c.status==='needs_revision').length,masteryRate=mastered/eligible.length;
    let readiness=Math.round(Math.max(0,Math.min(100,(masteryRate*70)+(current*0.3))));if(delta>3)readiness=Math.min(100,readiness+5);if(delta<-3)readiness=Math.max(0,readiness-5);
    let trajectory='stable';if(delta>3)trajectory='improving';else if(delta<-3)trajectory='declining';
    const milestone=readiness>=80?'Current evidence is consistent with strong readiness for the next milestone.':readiness>=60?'Current evidence suggests you are building toward the next milestone; targeted revision could improve readiness.':'Current evidence suggests more targeted practice is needed before the next milestone.';
    return {status:'forecast',readiness,gradeTrajectory:{currentPercentage:Math.round(current*10)/10,previousAverage:Math.round(previousAvg*10)/10,direction:trajectory},milestone,confidence:confidence.band,evidence:{assessments:attempts.length,trackedConcepts:eligible.length,mastered,needsRevision:needs}};
  }

  async function getServerPredictionSummary(learnerId, options){
    if(!learnerId) return {status:'unavailable',error:'LEARNER_ID_REQUIRED'};
    try{
      const includeUpcoming=options?.includeUpcoming===true;
      const query=`learnerId=${encodeURIComponent(learnerId)}${includeUpcoming?'&includeUpcoming=true':''}`;
      const response=await fetch(`/api/m13-prediction?${query}`,{credentials:'include',cache:'no-store',headers:{Accept:'application/json'}});
      const data=await readJson(response);
      if(!response.ok)return {status:'unavailable',error:data?.error?.code||'PREDICTION_SERVER_UNAVAILABLE',httpStatus:response.status};
      return data;
    }catch(error){return {status:'unavailable',error:error?.message==='PREDICTION_RESPONSE_TOO_LARGE'?'PREDICTION_RESPONSE_TOO_LARGE':error?.message==='PREDICTION_INVALID_RESPONSE'?'PREDICTION_INVALID_RESPONSE':'PREDICTION_SERVER_UNAVAILABLE'};}
  }

  global.BAAPrediction={getPredictionSummary,getServerPredictionSummary};
})(window);