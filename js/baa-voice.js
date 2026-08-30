/* BAA M32 — Voice Learning Assistant.
   Reuses the existing browser STT/TTS implementation and exposes a small,
   typed capability API. It does not claim voice support when the browser
   lacks the required Web Speech API. */
(function(global){
'use strict';

// Keep voice locales aligned with the bounded M31 Tutor language catalogue.
// These are browser locale tags, not a claim that every browser exposes a
// voice for every language. Unsupported device voices are reported by the
// Web Speech API rather than silently falling back to an unrelated locale.
const LOCALES=Object.freeze({
  en:'en-IN', hi:'hi-IN', mr:'mr-IN', gu:'gu-IN', bn:'bn-IN',
  ta:'ta-IN', te:'te-IN', kn:'kn-IN'
});
const DEFAULT_LANGUAGE='en';

function normalizeLanguage(language){
  const code=String(language||DEFAULT_LANGUAGE).trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(LOCALES,code)?code:null;
}
function localeFor(language){
  const code=normalizeLanguage(language);
  return code?LOCALES[code]:null;
}
function capabilities(){
  return {
    ok:true,
    speechRecognition:!!(global.SpeechRecognition||global.webkitSpeechRecognition),
    speechSynthesis:!!global.speechSynthesis,
    browserSupport:!!(global.SpeechRecognition||global.webkitSpeechRecognition||global.speechSynthesis),
    supportedLanguages:Object.keys(LOCALES),
    locales:{...LOCALES},
    defaultLanguage:DEFAULT_LANGUAGE
  };
}
function createRecognition(onResult,onError,language){
  const C=global.SpeechRecognition||global.webkitSpeechRecognition;
  if(!C)return {ok:false,error:'SPEECH_RECOGNITION_UNSUPPORTED',recognition:null};
  const code=normalizeLanguage(language);
  if(!code)return {ok:false,error:'UNSUPPORTED_VOICE_LANGUAGE',recognition:null};
  const r=new C();
  r.interimResults=false;
  r.continuous=false;
  r.lang=LOCALES[code];
  if(typeof onResult==='function')r.onresult=onResult;
  if(typeof onError==='function')r.onerror=onError;
  return {ok:true,error:null,language:code,locale:LOCALES[code],recognition:r};
}
function speak(text,language){
  if(!global.speechSynthesis)return {ok:false,error:'SPEECH_SYNTHESIS_UNSUPPORTED'};
  if(typeof text!=='string'||!text.trim())return {ok:false,error:'EMPTY_SPEECH_TEXT'};
  const code=normalizeLanguage(language);
  if(!code)return {ok:false,error:'UNSUPPORTED_VOICE_LANGUAGE'};
  const locale=LOCALES[code];
  const u=new SpeechSynthesisUtterance(text);
  u.lang=locale;
  global.speechSynthesis.cancel();
  global.speechSynthesis.speak(u);
  return {ok:true,error:null,language:code,locale};
}
global.BAAVoice={capabilities,createRecognition,speak,normalizeLanguage,localeFor};
})(window);
