/* BAA M44 — Internship & Job Preparation Hub.
   Server profile persistence is evidence-backed; it never fabricates vacancies,
   recruiter interest, employment outcomes, salary, or resume facts. */
(function(global){
'use strict';
function clean(value,max){return String(value==null?'':value).trim().slice(0,max||240);}
function uniqueStrings(values){return [...new Set((Array.isArray(values)?values:[]).filter(x=>typeof x==='string').map(x=>clean(x,120)).filter(Boolean))];}
function profile(input){
 if(!input||typeof input!=='object')return {ok:false,error:'INVALID_CAREER_PROFILE'};
 const skills=uniqueStrings(input.skills),projects=Array.isArray(input.projects)?input.projects.filter(x=>x&&typeof x==='object').map(project=>({
  title:clean(project.title,160),description:clean(project.description,500),skills:uniqueStrings(project.skills),evidenceIds:uniqueStrings(project.evidenceIds)
 })):[];
 return {ok:true,error:null,profile:{goal:clean(input.goal,240),skills,projects}};
}
function gap(candidate,targetSkills){
 if(!candidate||!Array.isArray(targetSkills))return {ok:false,error:'INVALID_SKILL_GAP_INPUT'};
 const have=new Set((candidate.skills||[]).map(String).map(x=>x.toLowerCase()));
 return {ok:true,error:null,missing:uniqueStrings(targetSkills).filter(x=>!have.has(x.toLowerCase()))};
}
function readiness(candidate,targetSkills){
 const checked=profile(candidate);if(!checked.ok)return checked;
 const target=uniqueStrings(targetSkills),missing=gap(checked.profile,target).missing;
 const projectCount=checked.profile.projects.length,skillCount=checked.profile.skills.length;
 const evidenceCount=checked.profile.projects.reduce((sum,p)=>sum+p.evidenceIds.length,0);
 const coverage=target.length?Math.max(0,(target.length-missing.length)/target.length):0;
 return {ok:true,error:null,summary:{skillCount,projectCount,evidenceCount,targetSkillCount:target.length,missingSkills:missing,skillCoverage:coverage,readinessLabel:target.length===0?'Profile baseline only':coverage===1&&projectCount>0?'Prepared to review':coverage>=0.6?'Needs targeted preparation':'Needs foundational preparation'},limitations:['Readiness is a preparation signal, not a hiring or admission prediction.','Only user-provided skills, projects and evidence IDs are counted.','Vacancies, recruiter interest, salary and employment outcomes are never inferred.']};
}
function portfolioSummary(candidate){
 const checked=profile(candidate);if(!checked.ok)return checked;
 const skills=checked.profile.skills,projects=checked.profile.projects;
 return {ok:true,error:null,summary:{goal:checked.profile.goal,skills,projectCount:projects.length,projectsWithEvidence:projects.filter(p=>p.evidenceIds.length>0).length,projectTitles:projects.map(p=>p.title).filter(Boolean)}};
}
async function api(path,options){const response=await fetch(path,{credentials:'include',headers:{'Content-Type':'application/json',...(options&&options.headers||{})},...(options||{})});const body=await response.json().catch(()=>({}));if(!response.ok)throw Object.assign(new Error(body?.error?.message||'Career preparation request failed.'),{status:response.status,code:body?.error?.code});return body;}
async function load(learnerId){const id=clean(learnerId,120);if(!id)throw new Error('learnerId is required.');return api('/api/m44-career-prep?learnerId='+encodeURIComponent(id));}
async function save(learnerId,input){const id=clean(learnerId,120),checked=profile(input);if(!id)throw new Error('learnerId is required.');if(!checked.ok)throw new Error(checked.error);return api('/api/m44-career-prep?learnerId='+encodeURIComponent(id),{method:'PUT',body:JSON.stringify(checked.profile)});}
global.BAACareerPrep={profile,gap,readiness,portfolioSummary,load,save};
})(window);
