/* ============================================================
   js/baa-career.js
   BAA OS — Module 20: AI Career & Future Planning Center.
   Evidence-linked exploratory guidance. It never predicts a job,
   salary, admission, or personal future as a certainty.
   ============================================================ */
(function(global){
  'use strict';
  const TRACKS={
    'Space & Aerospace':{description:'Build mathematics, physics, problem-solving, and engineering foundations.',skills:['algebra','geometry','physics','problem-solving','coding']},
    'Software Development':{description:'Build mathematics, logical reasoning, programming, and project skills.',skills:['algebra','coding','logic','problem-solving','computer-science']},
    'STEM Research':{description:'Build quantitative reasoning, scientific thinking, experimentation, and communication.',skills:['mathematics','science','research','problem-solving','communication']},
    'Data & AI':{description:'Build mathematics, statistics, programming, and analytical reasoning.',skills:['algebra','statistics','coding','logic','data-analysis']}
  };
  const normalize=x=>String(x||'').trim().toLowerCase().replace(/[_\s]+/g,'-');
  const humanize=x=>String(x||'').replace(/-/g,' ');
  const uniq=x=>[...new Set(x.filter(Boolean))];
  function getTrack(name){return TRACKS[name]||TRACKS['Space & Aerospace'];}
  function getAcademicMemory(){const assessment=global.BAAAssessment;if(assessment&&typeof assessment.getAcademicProfile==='function'){try{return assessment.getAcademicProfile()||{strengths:[],weaknesses:[]};}catch{}}return {strengths:[],weaknesses:[]};}
  function evidenceForSkill(skill,memory){const target=normalize(skill);const rows=[...(memory.strengths||[]),...(memory.weaknesses||[])].filter(Boolean);return rows.filter(row=>{const concept=normalize(row.concept);return concept===target||concept.includes(target)||target.includes(concept)||concept.split('-')[0]===target.split('-')[0];});}
  function evidenceId(row){return String(row&&(row.id||row.attemptId||row.concept)||'').trim()||null;}
  function evidenceLabel(row){if(row&&row.title)return String(row.title).slice(0,120);if(row&&row.concept)return humanize(row.concept);return 'Academic evidence';}
  function getConfidence(status,count){if(status==='not_yet_tracked')return {level:'insufficient',score:null,label:'Insufficient evidence'};if(count>=3)return {level:'high',score:Math.min(0.95,0.7+count*0.05),label:'Strong evidence base'};if(count===2)return {level:'moderate',score:0.65,label:'Moderate evidence base'};return {level:'early',score:0.4,label:'Early evidence only'};}
  function getPlan(name){
    const track=getTrack(name),memory=getAcademicMemory();
    const aligned=track.skills.map(skill=>{
      const evidence=evidenceForSkill(skill,memory),strengthEvidence=evidence.filter(x=>(memory.strengths||[]).includes(x)),weaknessEvidence=evidence.filter(x=>(memory.weaknesses||[]).includes(x));
      const status=strengthEvidence.length?'strength_evidence':weaknessEvidence.length?'support_needed':'not_yet_tracked',confidence=getConfidence(status,evidence.length);
      return {skill,status,evidenceCount:evidence.length,evidenceIds:uniq(evidence.map(evidenceId)).slice(0,8),evidenceSources:uniq(evidence.map(evidenceLabel)).slice(0,5),confidence,
        explanation:status==='strength_evidence'?`Academic evidence currently supports ${humanize(skill)} as a relative strength.`:status==='support_needed'?`Academic evidence shows ${humanize(skill)} needs additional practice or review.`:`BAA does not yet have enough tagged academic evidence to assess ${humanize(skill)}.`,
        decisionBasis:status==='not_yet_tracked'?'No conclusion is drawn because tagged evidence is missing.':`This signal is based on ${evidence.length} tagged academic evidence item${evidence.length===1?'':'s'}.`};
    });
    const gaps=aligned.filter(x=>x.status!=='strength_evidence'),strengths=aligned.filter(x=>x.status==='strength_evidence'),tracked=aligned.filter(x=>x.status!=='not_yet_tracked');
    const positiveSignals=strengths.length,coverage=aligned.length?tracked.length/aligned.length:0;
    const fitLabel=coverage===0?'Not enough evidence':positiveSignals===aligned.length?'Strong current alignment':positiveSignals>=Math.ceil(aligned.length*0.6)?'Promising current alignment':'Mixed alignment — explore further';
    return {track:name,description:track.description,skills:aligned,strengths,gaps,fitSummary:{label:fitLabel,coverage,positiveSignals,trackedSkills:tracked.length,totalSkills:aligned.length},evidenceSummary:{trackedSkills:tracked.length,strengthSkills:strengths.length,supportNeededSkills:aligned.filter(x=>x.status==='support_needed').length,untrackedSkills:aligned.filter(x=>x.status==='not_yet_tracked').length},methodology:'Track skills are compared only with tagged academic evidence already available to BAA. Missing evidence is reported as not-yet-tracked; it is never treated as proof of weakness. Confidence reflects evidence quantity, not future-outcome probability.',limitations:['Career alignment is exploratory guidance, not a prediction or guarantee.','No job, salary, admission, or future outcome is inferred from the evidence.','Recommendations should be reviewed with a parent, teacher, or qualified career professional for consequential decisions.'],disclaimer:'Career alignment is exploratory guidance, not a prediction or guarantee.'};
  }
  function explainPlan(name){
    const plan=getPlan(name);
    return {
      track:plan.track,
      headline:plan.fitSummary.label,
      explanation:`${plan.fitSummary.label}. ${plan.fitSummary.trackedSkills} of ${plan.fitSummary.totalSkills} track skills have tagged academic evidence, including ${plan.fitSummary.positiveSignals} current strength signal${plan.fitSummary.positiveSignals===1?'':'s'}.`,
      evidence:plan.skills.map(skill=>({skill:skill.skill,status:skill.status,confidence:skill.confidence,evidenceIds:skill.evidenceIds,evidenceSources:skill.evidenceSources,explanation:skill.explanation,decisionBasis:skill.decisionBasis})),
      nextSteps:plan.gaps.map(skill=>skill.status==='support_needed'?`Practice or review ${humanize(skill.skill)} and collect new evidence.`:`Collect tagged academic evidence for ${humanize(skill.skill)} before drawing a conclusion.`),
      limitations:plan.limitations,
      disclaimer:plan.disclaimer
    };
  }
  global.BAACareer={tracks:Object.keys(TRACKS),getPlan,explainPlan,_getTrack:getTrack,_evidenceForSkill:evidenceForSkill};
})(window);
