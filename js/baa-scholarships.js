/* BAA M43 — AI Scholarship Finder.
   Stores user eligibility criteria and ranks only supplied scholarship records.
   It never invents a scholarship, deadline, amount, or eligibility fact. */
(function(global){
'use strict';
function filter(records,criteria){if(!Array.isArray(records))return {ok:false,error:'INVALID_SCHOLARSHIP_DATA',results:[]};criteria=criteria&&typeof criteria==='object'?criteria:{};const results=records.filter(r=>r&&(!criteria.country||r.country===criteria.country)&&(!criteria.level||r.level===criteria.level)&&(!criteria.field||Array.isArray(r.fields)&&r.fields.includes(criteria.field)));return {ok:true,error:null,results};}
function rank(records){if(!Array.isArray(records))return {ok:false,error:'INVALID_SCHOLARSHIP_DATA',results:[]};return {ok:true,error:null,results:records.slice().sort((a,b)=>Number(b.matchScore||0)-Number(a.matchScore||0))};}
global.BAAScholarships={filter,rank};
})(window);
