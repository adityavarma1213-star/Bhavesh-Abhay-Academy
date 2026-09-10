/* BAA M53 — Learning Outcome Measurement.
   Measures change only when comparable pre/post observations are supplied.
   It never fabricates retention or learning velocity from activity alone. */
(function(global){
'use strict';
function compare(pre,post){if(!Number.isFinite(Number(pre))||!Number.isFinite(Number(post)))return {ok:false,error:'INVALID_OUTCOME_SCORES'};const p=Number(pre),q=Number(post);return {ok:true,error:null,absoluteChange:Number((q-p).toFixed(2)),relativeChange:p?Number(((q-p)/Math.abs(p)*100).toFixed(2)):null,interpretation:q>p?'improved':q<p?'declined':'unchanged'};}
function retention(initial,followup){if(!Number.isFinite(Number(initial))||!Number.isFinite(Number(followup)))return {ok:false,error:'INVALID_RETENTION_SCORES'};return compare(initial,followup);}
global.BAAOutcomes={compare,retention};
})(window);
