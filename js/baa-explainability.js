/* BAA M38 — Explainable AI Framework.
   Converts recorded evidence into human-readable reason records. It does not
   reverse-engineer proprietary model internals or invent causal explanations. */
(function(global){
'use strict';
function cleanText(value,max){
  if(value==null)return null;
  const text=String(value).trim();
  if(!text)return null;
  return text.slice(0,max||160);
}
function nonNegativeCount(value){
  if(value==null||value==='')return null;
  const n=Number(value);
  if(!Number.isFinite(n)||n<0)return {valid:false};
  return {valid:true,value:Math.floor(n)};
}
function explain(metric){
  if(!metric||typeof metric!=='object')return {ok:false,error:'INVALID_EXPLANATION_INPUT'};
  const evidence=nonNegativeCount(metric.evidenceCount);
  const correct=nonNegativeCount(metric.correctCount);
  if(evidence&&!evidence.valid)return {ok:false,error:'INVALID_EVIDENCE_COUNT'};
  if(correct&&!correct.valid)return {ok:false,error:'INVALID_CORRECT_COUNT'};
  const reasons=[];
  if(evidence)reasons.push(`Evidence count: ${evidence.value}.`);
  if(correct)reasons.push(`Correct evidence: ${correct.value}.`);
  const state=cleanText(metric.state,120);
  const source=cleanText(metric.source,160);
  if(state)reasons.push(`Current evidence state: ${state}.`);
  if(source)reasons.push(`Source: ${source}.`);
  return {ok:true,error:null,reasonType:'evidence_summary',reasons,limitation:'This explains the stored evidence used by BAA; it is not a claim about hidden model weights or proprietary internal reasoning.'};
}
global.BAAExplainability={explain};
})(window);
