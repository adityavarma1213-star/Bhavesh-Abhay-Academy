/* BAA M51 — Learning Science & Pedagogy Framework.
   Encodes explicit teaching policies used by later modules. It does not
   claim that these policies are a substitute for qualified educators. */
(function(global){
'use strict';
const POLICY={productiveStruggle:true,showWorkedExampleAfterAttempt:true,spacedReview:true,masteryRequiresEvidence:true,avoidShameLanguage:true};
function getPolicy(){return {...POLICY};}
function chooseAction(state){const s=String(state||'').toLowerCase();if(['struggling','needs_revision'].includes(s))return 'guided_reteach';if(s==='learning')return 'retrieval_practice';if(['mastered','strong'].includes(s))return 'extension';return 'evidence_building';}
global.BAAPedagogy={getPolicy,chooseAction};
})(window);
