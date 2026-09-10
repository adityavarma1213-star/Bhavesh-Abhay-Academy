/* BAA M58 — Teacher Diagnostic Snap & Differentiated Assignment.
   Converts supplied structured classroom evidence into grouped instructional
   suggestions. It does not infer a diagnosis from images or sparse evidence. */
(function(global){
'use strict';
function group(records){if(!Array.isArray(records))return {ok:false,error:'INVALID_CLASSROOM_RECORDS'};const groups={reteach:[],practice:[],extend:[]};records.forEach(r=>{if(!r||typeof r.studentId!=='string')return;const state=String(r.state||'insufficient_evidence');if(['struggling','needs_revision'].includes(state))groups.reteach.push(r.studentId);else if(state==='learning')groups.practice.push(r.studentId);else if(['mastered','strong'].includes(state))groups.extend.push(r.studentId);});return {ok:true,error:null,groups};}
function assignment(groupName,topic){if(!['reteach','practice','extend'].includes(groupName)||typeof topic!=='string'||!topic.trim())return {ok:false,error:'INVALID_ASSIGNMENT'};const task=groupName==='reteach'?'guided examples and one supported retry':groupName==='practice'?'retrieval practice with feedback':'extension problem with explanation';return {ok:true,error:null,group:groupName,topic:topic.trim(),task};}
global.BAATeacherDiagnostic={group,assignment};
})(window);
