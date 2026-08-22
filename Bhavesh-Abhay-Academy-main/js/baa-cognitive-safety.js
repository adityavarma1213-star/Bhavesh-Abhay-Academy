/* BAA M54 — Psychological Safety & Cognitive Recovery.
   Provides non-diagnostic workload/recovery prompts. It must never diagnose
   mental-health conditions or claim clinical treatment. */
(function(global){
'use strict';
function check(input){if(!input||typeof input!=='object')return {ok:false,error:'INVALID_WELLBEING_INPUT'};const minutes=Number(input.studyMinutes),breaks=Number(input.breakMinutes),pressure=Number(input.selfRatedPressure);if([minutes,breaks,pressure].some(x=>!Number.isFinite(x)))return {ok:false,error:'INVALID_WELLBEING_VALUES'};const overloaded=minutes>=180&&breaks<15;const highPressure=pressure>=4;return {ok:true,error:null,recommendation:overloaded?'Take a recovery break before continuing.':highPressure?'Consider reducing task difficulty or discussing the workload with a trusted adult.':'Continue with a sustainable study pace.',signals:{overloaded,highPressure},limitation:'This is a learning-safety prompt, not a medical or psychological diagnosis.'};}
global.BAACognitiveSafety={check};
})(window);
