/* BAA M52 — Mistake Archeology & Confusion Map.
   Traces only recorded wrong-answer evidence using explicit reason labels.
   It never infers a hidden psychological cause from a single mistake. */
(function(global){
'use strict';
const TYPES=['concept_gap','calculation','reading','procedure','careless','unknown'];
function classify(e){if(!e||typeof e!=='object')return {ok:false,error:'INVALID_MISTAKE_EVIDENCE'};const type=TYPES.includes(e.reasonType)?e.reasonType:'unknown';return {ok:true,error:null,concept:String(e.concept||'').trim(),reasonType:type,source:String(e.source||'').trim(),confidence:type==='unknown'?'low':'medium'};}
function map(evidence){if(!Array.isArray(evidence))return {ok:false,error:'INVALID_MISTAKE_LIST'};const out={};evidence.filter(e=>e&&e.correctness==='incorrect').forEach(e=>{const c=classify(e);const key=c.concept||'Unspecified concept';out[key]??=[];out[key].push(c);});return {ok:true,error:null,map:out,limitation:'Root-cause labels require evidence or educator confirmation; they are not diagnoses.'};}
global.BAAMistakes={classify,map,types:()=>TYPES.slice()};
})(window);
