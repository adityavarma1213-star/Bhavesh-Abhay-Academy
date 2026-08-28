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
    'Space & Aerospace':{description:'Build mathematics, physics, problem-solving, and engineering foundations.',skills:['algebra','geometry','physics','problem-solving','coding']},
    'Software Development':{description:'Build mathematics, logical reasoning, programming, and project skills.',skills:['algebra','coding','logic','problem-solving','computer-science']},
    'STEM Research':{description:'Build quantitative reasoning, scientific thinking, experimentation, and communication.',skills:['mathematics','science','research','problem-solving','communication']},
    'Data & AI':{description:'Build mathematics, statistics, programming, and analytical reasoning.',skills:['algebra','statistics','coding','logic','data-analysis']}
  };
  function getTrack(name){return TRACKS[name]||TRACKS['Space & Aerospace'];}
  function getPlan(name){
    const track=getTrack(name);
    const memory=global.BAAAssessment&&typeof global.BAAAssessment.getAcademicProfile==='function'
      ? global.BAAAssessment.getAcademicProfile():{strengths:[],weaknesses:[]};
    const known=[...(memory.strengths||[]),...(memory.weaknesses||[])].map(x=>String(x.concept||'').toLowerCase());
    const aligned=track.skills.map(skill=>({
      skill,
      evidence:known.filter(c=>c.includes(skill.replace(/ /g,'-'))||c.includes(skill.split('-')[0])).length,
      status:known.some(c=>c.includes(skill.split('-')[0]))?'evidence_present':'not_yet_tracked'
    }));
    const gaps=aligned.filter(x=>x.status==='not_yet_tracked');
    return {track:name,description:track.description,skills:aligned,gaps,disclaimer:'Career alignment is exploratory guidance, not a prediction or guarantee.'};
  }
  function explainPlan(name){
    const plan=getPlan(name);
    const supported=plan.skills.filter(x=>x.status==='evidence_present');
    const gaps=plan.gaps;
    return {
      track:plan.track,
      why:thisReason(plan,supported,gaps),
      evidence:supported.map(x=>({skill:x.skill,evidenceCount:x.evidence})),
      gaps:gaps.map(x=>x.skill),
      nextActions:gaps.slice(0,3).map(x=>'Build evidence in '+x.skill+' through practice or coursework.'),
      limitations:'This explanation summarizes recorded academic evidence only. It does not infer aptitude, personality, income, admission, employment, or future outcomes.'
    };
  }
  function thisReason(plan,supported,gaps){
    if(!supported.length)return 'This track is a student-selected exploration target; BAA does not yet have recorded evidence for the track skills.';
    const names=supported.slice(0,3).map(x=>x.skill).join(', ');
    const gapText=gaps.length?` The current evidence also shows ${gaps.length} track skill${gaps.length===1?'':'s'} not yet tracked.`:'';
    return `The selected ${plan.track} track aligns with recorded evidence for ${names}.${gapText}`;
  }
  global.BAACareer={tracks:Object.keys(TRACKS),getPlan,explainPlan};
})(window);
