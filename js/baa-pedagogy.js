/* BAA M51 — Learning Science & Pedagogy Framework.
   Encodes explicit teaching policies used by later modules. It does not
   claim that these policies are a substitute for qualified educators. */
(function(global){
'use strict';
const POLICY={productiveStruggle:true,showWorkedExampleAfterAttempt:true,spacedReview:true,masteryRequiresEvidence:true,avoidShameLanguage:true};
const ACTIONS={
 guided_reteach:{reason:'The learner is struggling or needs revision, so the next step should provide supported re-teaching before another independent attempt.',focus:'re-teach the concept, model one example, then invite a fresh attempt.'},
 retrieval_practice:{reason:'The learner is still learning, so retrieval practice strengthens recall without assuming mastery.',focus:'ask a short retrieval question and use the result as new evidence.'},
 extension:{reason:'The learner has evidence of mastery or strength, so extension can deepen transfer without unnecessary repetition.',focus:'apply the concept in a new context or increase complexity.'},
 evidence_building:{reason:'The current state is not specific enough to justify a stronger instructional claim.',focus:'collect a small piece of tagged evidence before adapting instruction.'}
};
function getPolicy(){return {...POLICY};}
function chooseAction(state){const s=String(state||'').toLowerCase();if(['struggling','needs_revision'].includes(s))return 'guided_reteach';if(s==='learning')return 'retrieval_practice';if(['mastered','strong'].includes(s))return 'extension';return 'evidence_building';}
function plan(state,options){
 const action=chooseAction(state), o=options&&typeof options==='object'?options:{};
 const evidenceCount=Number.isFinite(o.evidenceCount)&&o.evidenceCount>=0?Math.floor(o.evidenceCount):0;
 const concept=String(o.concept||'').trim().slice(0,160)||null;
 const rationale=ACTIONS[action];
 return {
   state:String(state||'').trim().toLowerCase()||'unknown',
   concept,
   action,
   reason:rationale.reason,
   focus:rationale.focus,
   evidenceCount,
   evidenceSufficient:action==='extension'?evidenceCount>0:evidenceCount>=1,
   policy:getPolicy(),
   safety:['No shame-based language.','Mastery is not inferred from a single unsupported signal.','Instructional guidance does not replace teacher judgment.']
 };
}
global.BAAPedagogy={getPolicy,chooseAction,plan};
})(window);
