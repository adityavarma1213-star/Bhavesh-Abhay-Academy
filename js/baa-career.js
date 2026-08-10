/* ============================================================
   js/baa-career.js
   BAA OS — Module 20: AI Career & Future Planning Center.
   Uses student-selected career tracks plus real academic evidence to
   show aligned strengths and skill gaps. It does not predict a job,
   salary, admission, or personal future as a certainty.
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
  function getTrack(name){return TRACKS[name]||TRACKS['Space & Aerospace'];}
  function getPlan(name){
    const track=getTrack(name);
    const memory=global.BAAAssessment&&typeof global.BAAAssessment.getAcademicProfile==='function'
      ? global.BAAAssessment.getAcademicProfile():{strengths:[],weaknesses:[]};
    const known=[...memory.strengths,...memory.weaknesses].map(x=>x.concept.toLowerCase());
    const aligned=track.skills.map(skill=>({
      skill,
      evidence:known.filter(c=>c.includes(skill.replace(/ /g,'-'))||c.includes(skill.split('-')[0])).length,
      status:known.some(c=>c.includes(skill.split('-')[0]))?'evidence_present':'not_yet_tracked'
    }));
    const gaps=aligned.filter(x=>x.status==='not_yet_tracked');
    return {
      track:name,description:track.description,skills:aligned,gaps,
      disclaimer:'Career alignment is exploratory guidance, not a prediction or guarantee.'
    };
  }
  global.BAACareer={tracks:Object.keys(TRACKS),getPlan};
})(window);
