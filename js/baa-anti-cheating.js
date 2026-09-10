/* BAA M42 — AI Safety & Anti-Cheating System.
   Provides transparent assessment-session integrity signals. It does not spy
   on devices, record screens, or claim to prove cheating from weak signals. */
(function(global){
'use strict';
function startSession(){return {ok:true,error:null,startedAt:new Date().toISOString(),signals:{visibilityChanges:0,focusLosses:0}};}
function recordVisibility(session,hidden){if(!session||typeof session!=='object')return {ok:false,error:'INVALID_SESSION'};if(typeof hidden!=='boolean')return {ok:false,error:'INVALID_VISIBILITY_SIGNAL'};if(hidden)session.signals.visibilityChanges+=1;return {ok:true,error:null,session};}
function risk(session){if(!session||!session.signals)return {ok:false,error:'INVALID_SESSION'};const v=Number(session.signals.visibilityChanges)||0;return {ok:true,error:null,level:v>=5?'review':'normal',reason:v?`Assessment tab visibility changed ${v} time(s).`:'No visibility-change signal recorded.',limitation:'This is an integrity signal, not proof of misconduct.'};}

// ------------------------------------------------------------
// Real wiring — was previously a pure-function module never called
// from any page (see audit notes). Batches events locally and sends
// them to /api/v1/assessment-integrity on submit / every 10 events /
// every 20s, whichever comes first, rather than one request per event.
// Server independently re-derives the flag threshold; this client-side
// session object is for the student's own transparency only (it never
// decides the flag itself — the server does, from its own count).
// ------------------------------------------------------------
let activeSession=null, activeAttemptId=null, activeLearnerId=null, pendingEvents=[], flushTimer=null;
function pushEvent(type){
  if(!activeSession)return;
  if(type==='visibility_hidden')recordVisibility(activeSession,true);
  pendingEvents.push({type,at:new Date().toISOString()});
  if(pendingEvents.length>=10)flush();
}
function flush(){
  if(!pendingEvents.length||!activeAttemptId||!activeLearnerId||typeof fetch==='undefined')return;
  const events=pendingEvents; pendingEvents=[];
  fetch('/api/v1/assessment-integrity',{
    method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({learnerId:activeLearnerId,attemptId:activeAttemptId,events})
  }).catch((e)=>{
    if(global.BAAOfflineSync)global.BAAOfflineSync.enqueue('/api/v1/assessment-integrity',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({learnerId:activeLearnerId,attemptId:activeAttemptId,events})});
    console.warn('[BAA Module 42] Integrity event batch queued offline',e);
  });
}
function attachToAttempt(attemptId,learnerId){
  if(typeof document==='undefined')return {ok:false,error:'NO_DOCUMENT'};
  detach();
  activeSession=startSession(); activeAttemptId=attemptId; activeLearnerId=learnerId; pendingEvents=[];
  document.addEventListener('visibilitychange',onVisibilityChange);
  global.addEventListener('blur',onWindowBlur);
  flushTimer=global.setInterval(flush,20000);
  return {ok:true,error:null};
}
function onVisibilityChange(){ if(document.hidden) pushEvent('visibility_hidden'); }
function onWindowBlur(){ pushEvent('window_blur'); }
function detach(){
  if(typeof document!=='undefined')document.removeEventListener('visibilitychange',onVisibilityChange);
  if(typeof global.removeEventListener==='function')global.removeEventListener('blur',onWindowBlur);
  if(flushTimer){global.clearInterval(flushTimer);flushTimer=null;}
  flush();
  const summary=activeSession?risk(activeSession):null;
  activeSession=null; activeAttemptId=null; activeLearnerId=null;
  return summary;
}

global.BAAAntiCheating={startSession,recordVisibility,risk,attachToAttempt,detach};
})(window);
