/* BAA M47 — Institution Analytics Portal.
   Computes aggregate metrics from supplied institutional records. It does not
   manufacture school performance statistics when data is absent. */
(function(global){
'use strict';
function summarize(records){if(!Array.isArray(records))return {ok:false,error:'INVALID_INSTITUTION_DATA'};const students=records.length;const present=records.filter(r=>r&&r.attendance==='present').length;const completed=records.filter(r=>r&&r.assignmentCompleted===true).length;return {ok:true,error:null,metrics:{students,presenceRate:students?Number((present/students*100).toFixed(1)):null,assignmentCompletionRate:students?Number((completed/students*100).toFixed(1)):null},evidenceQuality:students?'measured':'insufficient_evidence'};}
global.BAAInstitution={summarize};
})(window);
