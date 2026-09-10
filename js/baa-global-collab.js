/* BAA M48 — Global Student Collaboration.
   Local collaboration objects with explicit safety states. Production needs
   authenticated accounts, moderation, age controls and server persistence. */
(function(global){
'use strict';
function validateProject(p){if(!p||typeof p!=='object'||typeof p.title!=='string'||!p.title.trim())return {ok:false,error:'INVALID_COLLAB_PROJECT'};if(typeof p.region!=='string'||!p.region.trim())return {ok:false,error:'INVALID_COLLAB_REGION'};return {ok:true,error:null,project:{title:p.title.trim(),region:p.region.trim(),status:'draft',participants:[]}};}
function join(project,participant){if(!project||!participant||typeof participant.id!=='string')return {ok:false,error:'INVALID_COLLAB_PARTICIPANT'};if(project.participants.some(x=>x.id===participant.id))return {ok:false,error:'ALREADY_JOINED'};project.participants.push({id:participant.id,displayName:String(participant.displayName||'Student').slice(0,60)});return {ok:true,error:null,project};}
global.BAAGlobalCollab={validateProject,join};
})(window);
