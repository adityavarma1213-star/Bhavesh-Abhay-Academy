/* BAA M60 — Emotion + Purpose Design System.
   Encodes humane UI rules: no shame copy, no manipulative urgency, clear exits,
   progress as encouragement, and student agency. It does not infer emotions. */
(function(global){
'use strict';
const RULES={avoidShameLanguage:true,avoidDarkPatterns:true,clearDismissActions:true,studentChoiceVisible:true,progressAsInformation:true,noEmotionInference:true};
function getRules(){return {...RULES};}
function safeCopy(text){if(typeof text!=='string')return {ok:false,error:'INVALID_UI_COPY'};const banned=['you failed','lazy','you are behind','shame'];const low=text.toLowerCase();return {ok:true,error:null,safe:!banned.some(x=>low.includes(x)),reason:banned.some(x=>low.includes(x))?'Copy may shame or pressure the student.':'No configured harmful phrase detected.'};}
global.BAAPurposeDesign={getRules,safeCopy};
})(window);
