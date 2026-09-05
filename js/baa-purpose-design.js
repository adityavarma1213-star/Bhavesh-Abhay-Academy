/* BAA M60 — Emotion + Purpose Design System.
   Encodes humane UI rules: no shame copy, no manipulative urgency, clear exits,
   progress as encouragement, and student agency. It does not infer emotions. */
(function(global){
'use strict';
const RULES={avoidShameLanguage:true,avoidDarkPatterns:true,clearDismissActions:true,studentChoiceVisible:true,progressAsInformation:true,noEmotionInference:true};
const BANNED_PHRASES=['you failed','lazy','you are behind','shame','act now or lose','last chance'];
const MAX_COPY_LENGTH=5000;
function getRules(){return {...RULES};}
function normalizeCopy(text){return text.normalize('NFKC').toLowerCase().replace(/[\u0000-\u001f\u007f]/g,' ').replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();}
function safeCopy(text){
  if(typeof text!=='string')return {ok:false,error:'INVALID_UI_COPY'};
  if(text.length>MAX_COPY_LENGTH)return {ok:false,error:'UI_COPY_TOO_LONG',safe:false,matchedPhrase:null};
  const low=normalizeCopy(text);
  const matched=BANNED_PHRASES.find(x=>low.includes(normalizeCopy(x)))||null;
  return {ok:true,error:null,safe:!matched,reason:matched?'Copy may shame or pressure the student.':'No configured harmful phrase detected.',matchedPhrase:matched};
}
function auditSurface(surface){
  if(!surface||typeof surface!=='object')return {ok:false,error:'INVALID_UI_SURFACE'};
  const issues=[];
  if(surface.dismissible!==true)issues.push('MISSING_CLEAR_DISMISS');
  if(surface.studentChoiceVisible!==true)issues.push('MISSING_STUDENT_CHOICE');
  if(surface.emotionInference===true)issues.push('EMOTION_INFERENCE_NOT_ALLOWED');
  if(surface.urgentLanguage===true)issues.push('MANIPULATIVE_URGENCY_NOT_ALLOWED');
  if(typeof surface.copy==='string'){
    const copyCheck=safeCopy(surface.copy);
    if(copyCheck.ok!==true)issues.push(copyCheck.error);
    else if(!copyCheck.safe)issues.push('UNSAFE_COPY');
  }
  return {ok:true,safe:issues.length===0,issues,rules:getRules()};
}
global.BAAPurposeDesign={getRules,safeCopy,auditSurface};
})(window);
