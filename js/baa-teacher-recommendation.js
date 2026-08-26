/* ============================================================
   js/baa-teacher-recommendation.js
   BAA OS — Module 16: Teacher Recommendation System.
   Generates differentiated academic assignment recommendations from
   real Learning Intelligence / Assessment evidence. No student ranking
   or invented performance data.
   ============================================================ */
(function(global){
  'use strict';
  function getLearningSummary(){
    return typeof global.BAAIntelligence!=='undefined' ? global.BAAIntelligence.getLearningSummary() : null;
  }
  function findAssessment(concept){
    if(!Array.isArray(global.BAAAssessmentCatalog)||typeof global.BAAGetQuestion!=='function')return null;
    return global.BAAAssessmentCatalog.find(a=>a.questionIds.some(id=>{
      const q=global.BAAGetQuestion(id);return q&&q.concept===concept;
    }))||null;
  }
  function getRecommendations(){
    const summary=getLearningSummary();
    if(!summary) return [];
    const out=[];
    const weak=[...(summary.struggling||[]),...(summary.needsRevision||[])];
    weak.slice(0,10).forEach(c=>{
      const assessment=findAssessment(c.concept);
      out.push({
        id:`teacher_rec:${c.concept}`,
        concept:c.concept,
        subject:c.subject,
        studentState:c.state,
        priority:c.state==='struggling'?'high':'medium',
        assignmentType:c.state==='struggling'?'targeted_remediation':'targeted_practice',
        reason:c.why,
        suggestedAssessmentId:assessment?assessment.id:null,
        humanAction:'Teacher reviews and decides whether to assign.'
      });
    });
    return out;
  }
  function getSummary(){
    const recommendations=getRecommendations();
    return {recommendations,count:recommendations.length,source:'real_learning_evidence'};
  }

  async function loadServerRecommendations(learnerId){
    const id=String(learnerId||global.BAA_LEARNER_ID||'').trim();
    if(!id)return {ok:false,error:{code:'LEARNER_REQUIRED',message:'A learner context is required.'}};
    try{
      const response=await fetch(`/api/m16-teacher-recommendations?learnerId=${encodeURIComponent(id)}`,{credentials:'include',headers:{Accept:'application/json'}});
      const data=await response.json().catch(()=>null);
      if(!response.ok)return {ok:false,error:data?.error||{code:'RECOMMENDATIONS_LOAD_FAILED',message:'Server recommendations could not be loaded.'}};
      return {ok:true,recommendations:Array.isArray(data?.recommendations)?data.recommendations:[],source:data?.source||'server_learning_evidence',limitation:data?.limitation||''};
    }catch{return {ok:false,error:{code:'NETWORK_ERROR',message:'Server recommendations could not reach the teacher view.'}};}
  }

  function esc(s){const d=document.createElement('div');d.textContent=String(s??'');return d.innerHTML;}
  function renderServerPanel(result){
    if(!document.body||document.getElementById('baa-m16-server-panel'))return;
    const host=document.getElementById('serverLearnerView')||document.getElementById('content');
    if(!host)return;
    const panel=document.createElement('section');
    panel.id='baa-m16-server-panel';
    panel.className='card';
    const recs=result.ok?result.recommendations:[];
    panel.innerHTML=`<h2 class="section-h" style="margin-top:0">🧭 Server evidence recommendations</h2>`+
      `<p style="color:var(--dim);font-size:.78rem;line-height:1.5;margin-bottom:12px">These suggestions use authenticated server-side learning evidence. They are not diagnoses and never assign work automatically.</p>`+
      (result.ok?(recs.length?recs.map(r=>`<div class="attempt-row"><span><b>${esc(String(r.assignmentType||'targeted practice').replace(/_/g,' '))}</b> · ${esc(r.concept)}<br><small>${esc(r.reason)}</small></span><span class="a-pct">${esc(r.priority)}</span></div>`).join(''):`<div class="empty-note" style="padding:18px">No server evidence currently supports a recommendation.</div>`):`<div class="empty-note" style="padding:18px">${esc(result.error?.message||'Server recommendations unavailable.')}</div>`)+
      `<div class="empty-note" style="padding:12px">Teacher reviews and decides whether to assign.</div>`;
    host.insertBefore(panel,host.firstChild);
  }

  global.BAATeacherRecommendation={getRecommendations,getSummary,loadServerRecommendations,renderServerPanel};
  if(typeof document!=='undefined'){
    const boot=()=>setTimeout(()=>loadServerRecommendations().then(renderServerPanel),0);
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
    else boot();
  }
})(window);
