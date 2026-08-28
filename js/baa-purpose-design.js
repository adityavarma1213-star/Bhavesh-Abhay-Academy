/* BAA M60 — Emotion + Purpose Design System.
   Encodes humane UI rules: no shame copy, no manipulative urgency, clear exits,
   progress as encouragement, and student agency. It does not infer emotions. */
(function(global){
'use strict';
const RULES={avoidShameLanguage:true,avoidDarkPatterns:true,clearDismissActions:true,studentChoiceVisible:true,progressAsInformation:true,noEmotionInference:true};
const BANNED_PHRASES=['you failed','lazy','you are behind','shame','act now or lose','last chance'];
function getRules(){return {...RULES};}
function safeCopy(text){
  if(typeof text!=='string')return {ok:false,error:'INVALID_UI_COPY'};
  const low=text.toLowerCase();
  const matched=BANNED_PHRASES.find(x=>low.includes(x))||null;
  return {ok:true,error:null,safe:!matched,reason:matched?'Copy may shame or pressure the student.':'No configured harmful phrase detected.',matchedPhrase:matched};
}
function auditSurface(surface){
  if(!surface||typeof surface!=='object')return {ok:false,error:'INVALID_UI_SURFACE'};
  const issues=[];
  if(surface.dismissible!==true)issues.push('MISSING_CLEAR_DISMISS');
  if(surface.studentChoiceVisible!==true)issues.push('MISSING_STUDENT_CHOICE');
  if(surface.emotionInference===true)issues.push('EMOTION_INFERENCE_NOT_ALLOWED');
  if(surface.urgentLanguage===true)issues.push('MANIPULATIVE_URGENCY_NOT_ALLOWED');
  if(typeof surface.copy==='string'&&!safeCopy(surface.copy).safe)issues.push('UNSAFE_COPY');
  return {ok:true,safe:issues.length===0,issues,rules:getRules()};
}
global.BAAPurposeDesign={getRules,safeCopy,auditSurface};
})(window);
