/* BAA M35 — Community & Collaboration.
   Safe local study groups/posts with basic moderation. No anonymous public
   network is created by this module; production deployment needs server
   moderation, reporting, age controls and identity/access enforcement. */
(function(global){
'use strict';
const KEY='baa_community_v1';
const BLOCKED=['self-harm','suicide','sexual exploitation','buy drugs'];
function load(){try{const x=JSON.parse(localStorage.getItem(KEY)||'null');return x&&Array.isArray(x.posts)?x:{groups:[],posts:[]};}catch(_){return {groups:[],posts:[]};}}
function moderate(text){if(typeof text!=='string'||!text.trim())return {ok:false,error:'INVALID_POST'};const low=text.toLowerCase();if(BLOCKED.some(x=>low.includes(x)))return {ok:false,error:'POST_BLOCKED_BY_SAFETY_FILTER'};return {ok:true,error:null};}
function createPost(text,groupId){const m=moderate(text);if(!m.ok)return m;const s=load();s.posts.push({id:'post_'+Date.now(),text:text.trim(),groupId:String(groupId||'general'),createdAt:new Date().toISOString(),status:'visible'});try{localStorage.setItem(KEY,JSON.stringify(s));return {ok:true,error:null};}catch(_){return {ok:false,error:'COMMUNITY_STORAGE_FAILED'};}}
function listPosts(groupId){const s=load();return {ok:true,error:null,posts:s.posts.filter(p=>!groupId||p.groupId===groupId)};}
global.BAACommunity={createPost,listPosts,moderate};
})(window);
