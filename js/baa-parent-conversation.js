/* BAA M57 — Parent Learning Conversation Assistant.
   Produces neutral conversation prompts from supplied learning facts.
   It does not diagnose a child or prescribe mental-health treatment. */
(function(global){
'use strict';
function prompts(facts){if(!facts||typeof facts!=='object')return {ok:false,error:'INVALID_PARENT_FACTS'};const topic=String(facts.topic||'the recent study work').trim();const state=String(facts.state||'learning').trim();return {ok:true,error:null,prompts:[
`Ask what felt easiest about ${topic}.`,`Ask what part of ${topic} felt difficult without assigning blame.`,
`Ask whether the current ${state} feels manageable.`,`Agree on one small next step together.`
],limitation:'Conversation prompts are supportive guidance, not diagnosis or clinical advice.'};}
global.BAAParentConversation={prompts};
})(window);
