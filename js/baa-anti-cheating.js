/* BAA M42 — AI Safety & Anti-Cheating System.
   Provides transparent assessment-session integrity signals. It does not spy
   on devices, record screens, or claim to prove cheating from weak signals. */
(function(global){
'use strict';
const MAX_SIGNALS = 1000;
function startSession(){return {ok:true,error:null,startedAt:new Date().toISOString(),signals:{visibilityChanges:0,focusLosses:0}};}
function validSession(session){return !!(session&&typeof session==='object'&&session.signals&&typeof session.signals==='object');}
function recordVisibility(session,hidden){if(!validSession(session))return {ok:false,error:'INVALID_SESSION'};if(typeof hidden!=='boolean')return {ok:false,error:'INVALID_VISIBILITY_SIGNAL'};if(hidden)session.signals.visibilityChanges=Math.min(MAX_SIGNALS,(Number(session.signals.visibilityChanges)||0)+1);return {ok:true,error:null,session};}
function recordFocusLoss(session,lost){if(!validSession(session))return {ok:false,error:'INVALID_SESSION'};if(typeof lost!=='boolean')return {ok:false,error:'INVALID_FOCUS_SIGNAL'};if(lost)session.signals.focusLosses=Math.min(MAX_SIGNALS,(Number(session.signals.focusLosses)||0)+1);return {ok:true,error:null,session};}
function risk(session){if(!validSession(session))return {ok:false,error:'INVALID_SESSION'};const v=Math.min(MAX_SIGNALS,Math.max(0,Number(session.signals.visibilityChanges)||0));const f=Math.min(MAX_SIGNALS,Math.max(0,Number(session.signals.focusLosses)||0));const total=v+f;const level=total>=5?'review':'normal';const reasons=[];if(v)reasons.push(`Assessment tab visibility changed ${v} time(s).`);if(f)reasons.push(`Assessment focus was lost ${f} time(s).`);return {ok:true,error:null,level,reason:reasons.join(' ')||'No visibility or focus-loss signal recorded.',signals:{visibilityChanges:v,focusLosses:f},limitation:'These are integrity signals, not proof of misconduct.'};}
global.BAAAntiCheating={startSession,recordVisibility,recordFocusLoss,risk};
})(window);
