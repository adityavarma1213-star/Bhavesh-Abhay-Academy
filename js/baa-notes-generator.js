/* ============================================================
   js/baa-notes-generator.js
   BAA OS — Module 26: AI Notes Generator.
   Creates a reviewable teacher-note draft from existing evidence only.
   It does NOT call an AI model, invent facts, auto-save, or replace
   teacher judgment. Saving remains an explicit teacher action.
   ============================================================ */
(function(global){
  'use strict';

  function buildDraft(){
    const assessment=global.BAAAssessment;
    const intelligence=global.BAAIntelligence;
    if(!assessment||!intelligence){
      return {ok:false,error:'NOT_READY',draft:'',evidenceCount:0};
    }

    const name=typeof assessment.getStudentName==='function'
      ? String(assessment.getStudentName()||'Student').trim().slice(0,120)
      : 'Student';
    const profile=typeof assessment.getAcademicProfile==='function'
      ? assessment.getAcademicProfile()
      : {strengths:[],weaknesses:[]};
    const summary=typeof intelligence.getLearningSummary==='function'
      ? intelligence.getLearningSummary()
      : null;

    const strengths=Array.isArray(profile.strengths)?profile.strengths.slice(0,3):[];
    const weaknesses=Array.isArray(profile.weaknesses)?profile.weaknesses.slice(0,3):[];
    const attempts=typeof assessment.getAttemptHistory==='function'
      ? assessment.getAttemptHistory().filter(a=>a&&a.status!=='in_progress').slice(0,3):[];

    const evidenceCount=typeof assessment._load==='function'
      ? Number((assessment._load().evidence||[]).length):0;

    if(!evidenceCount && !strengths.length && !weaknesses.length && !attempts.length){
      return {
        ok:true,error:'INSUFFICIENT_EVIDENCE',
        draft:`Teacher note draft for ${name}: There is not enough recorded academic evidence yet to create a factual progress note.`,
        evidenceCount:0
      };
    }

    const lines=[`Teacher note — ${name}`];

    if(summary&&summary.hasAnyEvidence){
      lines.push('Academic evidence is available in the BAA learning record.');
    }

    if(strengths.length){
      lines.push(`Strengths supported by evidence: ${strengths.map(x=>String(x.concept||'').replace(/-/g,' ')).filter(Boolean).join(', ')}.`);
    } else {
      lines.push('No evidence-backed strength is included in this draft.');
    }

    if(weaknesses.length){
      lines.push(`Areas needing attention: ${weaknesses.map(x=>String(x.concept||'').replace(/-/g,' ')).filter(Boolean).join(', ')}.`);
    } else {
      lines.push('No evidence-backed weakness is included in this draft.');
    }

    if(attempts.length){
      const recent=attempts[0];
      const title=String(recent.assessmentTitle||'recent assessment').slice(0,120);
      if(typeof recent.score==='number'&&typeof recent.maxScore==='number'&&recent.maxScore>0){
        lines.push(`Most recent completed assessment: ${title} — ${recent.score}/${recent.maxScore}.`);
      }else{
        lines.push(`Most recent completed assessment: ${title}.`);
      }
    }

    lines.push('Teacher review required before saving or sharing.');
    return {ok:true,error:null,draft:lines.join(' '),evidenceCount};
  }

  global.BAANotesGenerator={buildDraft};
})(window);
