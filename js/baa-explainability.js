/* BAA M38 — Explainable AI Framework.
   Converts recorded evidence into human-readable reason records. It does not
   reverse-engineer proprietary model internals or invent causal explanations. */
(function(global){
'use strict';
function explain(metric){
 if(!metric||typeof metric!=='object')return {ok:false,error:'INVALID_EXPLANATION_INPUT'};
 const reasons=[];
 if(metric.evidenceCount!=null)reasons.push(`Evidence count: ${Number(metric.evidenceCount)||0}.`);
 if(metric.correctCount!=null)reasons.push(`Correct evidence: ${Number(metric.correctCount)||0}.`);
 if(metric.state)reasons.push(`Current evidence state: ${String(metric.state)}.`);
 if(metric.source)reasons.push(`Source: ${String(metric.source)}.`);
 return {ok:true,error:null,reasonType:'evidence_summary',reasons,limitation:'This explains the stored evidence used by BAA; it is not a claim about hidden model weights or proprietary internal reasoning.'};
}
global.BAAExplainability={explain};
})(window);
