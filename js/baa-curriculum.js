/* BAA M40 — Curriculum & Board Intelligence.
   Uses an explicit, versioned local curriculum map. It never claims that a
   topic is officially aligned unless that mapping is stored in the map. */
(function(global){
'use strict';
const KEY='baa_curriculum_v1',SCHEMA_VERSION=1;
const BOARDS=[
 {id:'CBSE',label:'CBSE'},{id:'ICSE',label:'ICSE'},{id:'MAH_STATE',label:'Maharashtra State Board'},{id:'CUSTOM',label:'Custom curriculum'}
];
function load(){try{const x=JSON.parse(localStorage.getItem(KEY)||'null');return x&&x.schemaVersion===1?x:{schemaVersion:1,board:null,className:null,subject:null,mappings:[]};}catch(_){return {schemaVersion:1,board:null,className:null,subject:null,mappings:[]};}}
function setProfile(board,className,subject){if(!BOARDS.some(b=>b.id===board)||typeof className!=='string'||!className.trim()||typeof subject!=='string'||!subject.trim())return {ok:false,error:'INVALID_CURRICULUM_PROFILE'};const s=load();s.board=board;s.className=className.trim();s.subject=subject.trim();try{localStorage.setItem(KEY,JSON.stringify(s));return {ok:true,error:null,profile:{board,className:s.className,subject:s.subject}};}catch(_){return {ok:false,error:'CURRICULUM_STORAGE_FAILED'};}}
function addMapping(topic,concept){if(typeof topic!=='string'||!topic.trim()||typeof concept!=='string'||!concept.trim())return {ok:false,error:'INVALID_CURRICULUM_MAPPING'};const s=load();s.mappings.push({topic:topic.trim(),concept:concept.trim(),createdAt:new Date().toISOString()});try{localStorage.setItem(KEY,JSON.stringify(s));return {ok:true,error:null};}catch(_){return {ok:false,error:'CURRICULUM_STORAGE_FAILED'};}}
function get(){return {ok:true,error:null,boards:BOARDS,state:load()};}
global.BAACurriculum={get,setProfile,addMapping};
})(window);
