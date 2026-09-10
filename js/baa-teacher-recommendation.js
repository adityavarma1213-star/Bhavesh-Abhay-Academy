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
  global.BAATeacherRecommendation={getRecommendations,getSummary};
})(window);
