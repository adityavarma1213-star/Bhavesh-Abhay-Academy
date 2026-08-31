/* BAA M35 — Community & Collaboration.
   Safe authenticated community posts with server moderation/reporting gates.
   Server persistence is preferred; local storage remains only for legacy
   single-device/private testing compatibility. */
(function(global){
'use strict';
const KEY='baa_community_v1';
const BLOCKED=['self-harm','suicide','sexual exploitation','buy drugs'];
function load(){try{const x=JSON.parse(localStorage.getItem(KEY)||'null');return x&&Array.isArray(x.posts)?x:{groups:[],posts:[]};}catch(_){return {groups:[],posts:[]};}}
function moderate(text){if(typeof text!=='string'||!text.trim())return {ok:false,error:'INVALID_POST'};const low=text.toLowerCase();if(BLOCKED.some(x=>low.includes(x)))return {ok:false,error:'POST_BLOCKED_BY_SAFETY_FILTER'};return {ok:true,error:null};}
function createLocalId(){
 if(global.crypto&&typeof global.crypto.randomUUID==='function')return 'post_'+global.crypto.randomUUID();
 if(global.crypto&&typeof global.crypto.getRandomValues==='function'){
  const bytes=new Uint8Array(16);global.crypto.getRandomValues(bytes);
  return 'post_'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
 }
 return 'post_'+Date.now()+'_'+Math.random().toString(36).slice(2,10);
}
function createPost(text,groupId){const m=moderate(text);if(!m.ok)return m;const s=load();s.posts.push({id:createLocalId(),text:text.trim(),groupId:String(groupId||'general'),createdAt:new Date().toISOString(),status:'visible'});try{localStorage.setItem(KEY,JSON.stringify(s));return {ok:true,error:null};}catch(_){return {ok:false,error:'COMMUNITY_STORAGE_FAILED'};}}
async function createPostSecure(text,groupId){
 const local=moderate(text); if(!local.ok)return local;
 try{
  const response=await fetch('/api/m35-community-posts',{method:'POST',credentials:'include',cache:'no-store',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({text:String(text),groupId:String(groupId||'general')})});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)return {ok:false,error:payload?.error?.code||'SERVER_POST_REJECTED'};
  return {ok:true,error:null,post:payload.post||null};
 }catch(_){return {ok:false,error:'SERVER_POST_UNAVAILABLE'};}
}
async function listPostsSecure(groupId){
 try{
  const group=String(groupId||'general');
  const response=await fetch(`/api/m35-community-posts?groupId=${encodeURIComponent(group)}`,{credentials:'include',cache:'no-store',headers:{Accept:'application/json'}});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)return {ok:false,error:payload?.error?.code||'SERVER_POST_LIST_FAILED',posts:[]};
  return {ok:true,error:null,posts:Array.isArray(payload.posts)?payload.posts:[]};
 }catch(_){return {ok:false,error:'SERVER_POST_LIST_UNAVAILABLE',posts:[]};}
}
async function reportPost(postId,reason,reportedText){
 const id=String(postId||'').trim();
 const allowed=['safety','harassment','spam','other']; const why=String(reason||'').trim().toLowerCase();
 if(!id)return {ok:false,error:'POST_NOT_FOUND'};
 if(!allowed.includes(why))return {ok:false,error:'INVALID_REPORT_REASON'};
 try{
  const response=await fetch('/api/m35-community-report',{method:'POST',credentials:'include',cache:'no-store',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({postId:id,reportedText:typeof reportedText==='string'?reportedText:'',reason:why})});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)return {ok:false,error:payload?.error?.code||'COMMUNITY_REPORT_FAILED'};
  return {ok:true,error:null,report:payload.report||null};
 }catch(_){return {ok:false,error:'COMMUNITY_REPORT_UNAVAILABLE'};}
}
function listPosts(groupId){const s=load();return {ok:true,error:null,posts:s.posts.filter(p=>!groupId||p.groupId===groupId)};}
global.BAACommunity={createPost,createPostSecure,listPostsSecure,reportPost,listPosts,moderate};
})(window);
