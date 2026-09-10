/* BAA M44 — Internship & Job Preparation Hub.
   Provides deterministic profile/portfolio helpers. It does not fabricate
   employment outcomes, vacancies, recruiter interest, or resume facts. */
(function(global){
'use strict';
function profile(input){if(!input||typeof input!=='object')return {ok:false,error:'INVALID_CAREER_PROFILE'};const skills=Array.isArray(input.skills)?input.skills.filter(x=>typeof x==='string').map(x=>x.trim()).filter(Boolean):[];return {ok:true,error:null,profile:{goal:String(input.goal||'').trim(),skills:[...new Set(skills)],projects:Array.isArray(input.projects)?input.projects:[]}};}
function gap(profile,targetSkills){if(!profile||!Array.isArray(targetSkills))return {ok:false,error:'INVALID_SKILL_GAP_INPUT'};const have=new Set((profile.skills||[]).map(String));return {ok:true,error:null,missing:[...new Set(targetSkills.filter(x=>typeof x==='string').filter(x=>!have.has(x)))]};}
global.BAACareerPrep={profile,gap};
})(window);
