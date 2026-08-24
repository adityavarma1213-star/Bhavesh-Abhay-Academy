/* BAA M48 — Global Student Collaboration.
   Local collaboration objects with explicit safety, age and lifecycle states.
   Production still requires authenticated accounts, moderation and server persistence. */
(function(global){
'use strict';
const STATUSES=['draft','open','paused','completed','archived'];
const MAX_PARTICIPANTS=100;
const STORE='baa:m48:projects:v1';
function clean(v,max=240){return String(v==null?'':v).trim().slice(0,max);}
function load(){try{return JSON.parse(global.localStorage.getItem(STORE)||'[]');}catch(_){return [];}}
function save(projects){try{global.localStorage.setItem(STORE,JSON.stringify(projects));return true;}catch(_){return false;}}
function validateProject(p){
 if(!p||typeof p!=='object'||typeof p.title!=='string'||!p.title.trim())return {ok:false,error:'INVALID_COLLAB_PROJECT'};
 if(typeof p.region!=='string'||!p.region.trim())return {ok:false,error:'INVALID_COLLAB_REGION'};
 const ageMin=Number.isInteger(p.minimumAge)&&p.minimumAge>=0?Math.min(p.minimumAge,21):13;
 return {ok:true,error:null,project:{id:clean(p.id||('collab-'+Date.now()),120),title:clean(p.title,160),region:clean(p.region,80),description:clean(p.description,1000),minimumAge:ageMin,moderationRequired:true,status:STATUSES.includes(p.status)?p.status:'draft',participants:Array.isArray(p.participants)?p.participants.slice(0,MAX_PARTICIPANTS):[],createdAt:p.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()}};
}
function join(project,participant){
 if(!project||!participant||typeof participant.id!=='string'||!participant.id.trim())return {ok:false,error:'INVALID_COLLAB_PARTICIPANT'};
 if(project.status!=='open')return {ok:false,error:'PROJECT_NOT_OPEN'};
 if(project.participants.length>=MAX_PARTICIPANTS)return {ok:false,error:'PARTICIPANT_LIMIT'};
 if(participant.age!=null&&(!Number.isInteger(participant.age)||participant.age<project.minimumAge))return {ok:false,error:'AGE_REQUIREMENT'};
 if(project.participants.some(x=>x.id===participant.id))return {ok:false,error:'ALREADY_JOINED'};
 project.participants.push({id:clean(participant.id,120),displayName:clean(participant.displayName||'Student',60),joinedAt:new Date().toISOString(),moderationState:'pending'});
 project.updatedAt=new Date().toISOString();
 return {ok:true,error:null,project};
}
function transition(project,next){
 if(!project||!STATUSES.includes(project.status)||!STATUSES.includes(next))return {ok:false,error:'INVALID_STATUS'};
 const allowed={draft:['open','archived'],open:['paused','completed','archived'],paused:['open','archived'],completed:['archived'],archived:[]};
 if(!allowed[project.status].includes(next))return {ok:false,error:'INVALID_TRANSITION'};
 project.status=next;project.updatedAt=new Date().toISOString();return {ok:true,error:null,project};
}
function moderate(project,participantId,state){
 const allowed=['pending','approved','blocked'];
 if(!project||!allowed.includes(state))return {ok:false,error:'INVALID_MODERATION_STATE'};
 const p=project.participants.find(x=>x.id===participantId);if(!p)return {ok:false,error:'PARTICIPANT_NOT_FOUND'};
 p.moderationState=state;p.updatedAt=new Date().toISOString();project.updatedAt=new Date().toISOString();return {ok:true,error:null,project};
}
function persist(project){const checked=validateProject(project);if(!checked.ok)return checked;const all=load();const i=all.findIndex(x=>x.id===checked.project.id);if(i>=0)all[i]=checked.project;else all.push(checked.project);return save(all)?{ok:true,error:null,project:checked.project}:{ok:false,error:'PERSISTENCE_UNAVAILABLE'};}
function list(){return {ok:true,error:null,projects:load()};}
function filter(options){const o=options&&typeof options==='object'?options:{};const q=clean(o.query,120).toLowerCase();const region=clean(o.region,80).toLowerCase();const status=clean(o.status,40);const minAge=Number.isInteger(o.minimumAge)?o.minimumAge:null;return list().projects.filter(p=>(!q||`${p.title} ${p.description}`.toLowerCase().includes(q))&&(!region||p.region.toLowerCase()===region)&&(!status||p.status===status)&& (minAge==null||p.minimumAge<=minAge));}
function exportProject(project){const checked=validateProject(project);if(!checked.ok)return checked;return {ok:true,error:null,data:JSON.stringify(checked.project)};}
global.BAAGlobalCollab={validateProject,join,transition,moderate,persist,list,filter,exportProject,statuses:STATUSES};
})(window);