/* BAA M32 — Voice Learning Assistant.
   Reuses the existing browser STT/TTS implementation and exposes a small,
   typed capability API. It does not claim voice support when the browser
   lacks the required Web Speech API. */
(function(global){
'use strict';
function capabilities(){
  return {
    ok:true,
    speechRecognition: !!(global.SpeechRecognition||global.webkitSpeechRecognition),
    speechSynthesis: !!global.speechSynthesis,
    browserSupport: !!(global.SpeechRecognition||global.webkitSpeechRecognition||global.webkitSpeechRecognition||global.speechSynthesis)
  };
}
function createRecognition(onResult,onError){
  const C=global.SpeechRecognition||global.webkitSpeechRecognition;
  if(!C)return {ok:false,error:'SPEECH_RECOGNITION_UNSUPPORTED',recognition:null};
  const r=new C(); r.interimResults=false; r.continuous=false; r.lang='en-IN';
  if(typeof onResult==='function')r.onresult=onResult;
  if(typeof onError==='function')r.onerror=onError;
  return {ok:true,error:null,recognition:r};
}
function speak(text,lang){
  if(!global.speechSynthesis)return {ok:false,error:'SPEECH_SYNTHESIS_UNSUPPORTED'};
  if(typeof text!=='string'||!text.trim())return {ok:false,error:'EMPTY_SPEECH_TEXT'};
  const u=new SpeechSynthesisUtterance(text); u.lang=lang||'en-IN';
  global.speechSynthesis.cancel(); global.speechSynthesis.speak(u);
  return {ok:true,error:null};
}
global.BAAVoice={capabilities,createRecognition,speak};
})(window);
