/* BAA M45 — Mentor Marketplace.
   Defines a local vetted-profile shape and deterministic filtering. Real
   identity verification, payments, scheduling and safeguarding are external
   production dependencies and are not faked here. */
(function(global){
'use strict';
function validate(m){if(!m||typeof m!=='object'||typeof m.name!=='string'||!m.name.trim())return {ok:false,error:'INVALID_MENTOR'};if(!Array.isArray(m.subjects))return {ok:false,error:'INVALID_MENTOR_SUBJECTS'};return {ok:true,error:null,mentor:{name:m.name.trim(),subjects:m.subjects.filter(x=>typeof x==='string'),verified:!!m.verified}};}
function search(mentors,subject){if(!Array.isArray(mentors))return {ok:false,error:'INVALID_MENTOR_LIST',results:[]};return {ok:true,error:null,results:mentors.filter(m=>m&&(!subject||Array.isArray(m.subjects)&&m.subjects.includes(subject))) };}
global.BAAMentors={validate,search};
})(window);
