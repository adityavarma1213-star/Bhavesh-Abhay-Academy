/* BAA M38 — Explainable AI Framework.
   Converts recorded evidence into human-readable reason records. It does not
   reverse-engineer proprietary model internals or invent causal explanations. */
(function(global){
'use strict';
const MIN_EVIDENCE=3;
const ALLOWED_STATES=new Set(['insufficient_evidence','learning','developing','steady','strong','mastered','needs_revision','struggling']);
const ALLOWED_SOURCES=new Set(['assessment','learning_evidence','learning_memory','teacher_observation','goal_progress','career_evidence','system_summary']);
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
  if(evidence&&correct&&correct.value>evidence.value)return {ok:false,error:'INVALID_CORRECT_COUNT'};
  const reasons=[];
  const evidenceValue=evidence?evidence.value:0;
  const evidenceSufficient=evidenceValue>=MIN_EVIDENCE;
  if(evidence)reasons.push(`Evidence count: ${evidence.value}.`);
  if(correct)reasons.push(`Correct evidence: ${correct.value}.`);
  const state=cleanText(metric.state,120);
  const source=cleanText(metric.source,160);
  if(state&&!ALLOWED_STATES.has(state))return {ok:false,error:'INVALID_EXPLANATION_STATE'};
  if(source&&!ALLOWED_SOURCES.has(source))return {ok:false,error:'INVALID_EXPLANATION_SOURCE'};
  if(!evidenceSufficient){
    reasons.push(`Evidence gate: insufficient evidence for a concept-level characterization; at least ${MIN_EVIDENCE} evidence items are required.`);
  }else if(state){
    reasons.push(`Current evidence state: ${state}.`);
  }
  if(source)reasons.push(`Source: ${source}.`);
  return {
    ok:true,
    error:null,
    reasonType:'evidence_summary',
    evidenceGate:{minimum:MIN_EVIDENCE,count:evidenceValue,sufficient:evidenceSufficient},
    reasons,
    limitation:'This explains the stored evidence used by BAA; it is not a claim about hidden model weights or proprietary internal reasoning.'
  };
}
global.BAAExplainability={explain,MIN_EVIDENCE};
})(window);
