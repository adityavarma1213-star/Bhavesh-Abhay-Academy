/* ============================================================
   js/baa-career.js
   BAA OS — Module 20: AI Career & Future Planning Center.
   Uses student-selected career tracks plus academic evidence to
   show aligned strengths, skill gaps, and transparent evidence.
   It does not predict a job, salary, admission, or personal future
   as a certainty.
   ============================================================ */
(function(global){
  'use strict';

  const TRACKS={
    'Space & Aerospace':{
      description:'Build mathematics, physics, problem-solving, and engineering foundations.',
      skills:['algebra','geometry','physics','problem-solving','coding']
    },
    'Software Development':{
      description:'Build mathematics, logical reasoning, programming, and project skills.',
      skills:['algebra','coding','logic','problem-solving','computer-science']
    },
    'STEM Research':{
      description:'Build quantitative reasoning, scientific thinking, experimentation, and communication.',
      skills:['mathematics','science','research','problem-solving','communication']
    },
    'Data & AI':{
      description:'Build mathematics, statistics, programming, and analytical reasoning.',
      skills:['algebra','statistics','coding','logic','data-analysis']
    }
  };

  const normalize=x=>String(x||'').trim().toLowerCase().replace(/[_\s]+/g,'-');
  const humanize=x=>String(x||'').replace(/-/g,' ');

  function getTrack(name){return TRACKS[name]||TRACKS['Space & Aerospace'];}

  function getAcademicMemory(){
    const assessment=global.BAAAssessment;
    if(assessment&&typeof assessment.getAcademicProfile==='function'){
      try{return assessment.getAcademicProfile()||{strengths:[],weaknesses:[]};}catch{}
    }
    return {strengths:[],weaknesses:[]};
  }

  function evidenceForSkill(skill, memory){
    const target=normalize(skill);
    const rows=[...(memory.strengths||[]),...(memory.weaknesses||[])].filter(Boolean);
    return rows.filter(row=>{
      const concept=normalize(row.concept);
      return concept===target || concept.includes(target) || target.includes(concept) || concept.split('-')[0]===target.split('-')[0];
    });
  }

  function getPlan(name){
    const track=getTrack(name);
    const memory=getAcademicMemory();
    const aligned=track.skills.map(skill=>{
      const evidence=evidenceForSkill(skill,memory);
      const strengthEvidence=evidence.filter(x=>(memory.strengths||[]).includes(x));
      const weaknessEvidence=evidence.filter(x=>(memory.weaknesses||[]).includes(x));
      const status=strengthEvidence.length?'strength_evidence':weaknessEvidence.length?'support_needed':'not_yet_tracked';
      return {
        skill,
        status,
        evidenceCount:evidence.length,
        evidenceIds:evidence.map(x=>x.id||x.attemptId||x.concept).filter(Boolean).slice(0,8),
        explanation:status==='strength_evidence'
          ? `Academic evidence currently supports ${humanize(skill)} as a relative strength.`
          : status==='support_needed'
            ? `Academic evidence shows ${humanize(skill)} needs additional practice or review.`
            : `BAA does not yet have enough tagged academic evidence to assess ${humanize(skill)}.`
      };
    });
    const gaps=aligned.filter(x=>x.status!=='strength_evidence');
    const strengths=aligned.filter(x=>x.status==='strength_evidence');
    return {
      track:name,
      description:track.description,
      skills:aligned,
      strengths,
      gaps,
      evidenceSummary:{
        trackedSkills:aligned.filter(x=>x.status!=='not_yet_tracked').length,
        strengthSkills:strengths.length,
        supportNeededSkills:aligned.filter(x=>x.status==='support_needed').length,
        untrackedSkills:aligned.filter(x=>x.status==='not_yet_tracked').length
      },
      methodology:'Track skills are compared only with tagged academic evidence already available to BAA. Missing evidence is reported as not-yet-tracked; it is never treated as proof of weakness.',
      limitations:[
        'Career alignment is exploratory guidance, not a prediction or guarantee.',
        'No job, salary, admission, or future outcome is inferred from the evidence.',
        'Recommendations should be reviewed with a parent, teacher, or qualified career professional for consequential decisions.'
      ],
      disclaimer:'Career alignment is exploratory guidance, not a prediction or guarantee.'
    };
  }

  global.BAACareer={
    tracks:Object.keys(TRACKS),
    getPlan,
    _getTrack:getTrack,
    _evidenceForSkill:evidenceForSkill
  };
})(window);
