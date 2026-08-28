/* BAA M35 — Community & Collaboration.
   Safe local study groups/posts with server safety/reporting gates. No anonymous
   public network is created by this module; persistent production community
   storage, age controls and identity/access policy remain separate concerns. */
(function(global){
'use strict';
const KEY='baa_community_v1';
const BLOCKED=['self-harm','suicide','sexual exploitation','buy drugs'];
function load(){try{const x=JSON.parse(localStorage.getItem(KEY)||'null');return x&&Array.isArray(x.posts)?x:{groups:[],posts:[]};}catch(_){return {groups:[],posts:[]};}}
function moderate(text){if(typeof text!=='string'||!text.trim())return {ok:false,error:'INVALID_POST'};const low=text.toLowerCase();if(BLOCKED.some(x=>low.includes(x)))return {ok:false,error:'POST_BLOCKED_BY_SAFETY_FILTER'};return {ok:true,error:null};}
function createPost(text,groupId){const m=moderate(text);if(!m.ok)return m;const s=load();s.posts.push({id:'post_'+Date.now(),text:text.trim(),groupId:String(groupId||'general'),createdAt:new Date().toISOString(),status:'visible'});try{localStorage.setItem(KEY,JSON.stringify(s));return {ok:true,error:null};}catch(_){return {ok:false,error:'COMMUNITY_STORAGE_FAILED'};}}
async function createPostSecure(text,groupId){
 const local=moderate(text); if(!local.ok)return local;
 try{
  const response=await fetch('/api/m35-community-moderate',{method:'POST',credentials:'include',cache:'no-store',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({text:String(text)})});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)return {ok:false,error:payload?.error?.code||'SERVER_MODERATION_REJECTED'};
  return createPost(text,groupId);
 }catch(_){return {ok:false,error:'SERVER_MODERATION_UNAVAILABLE'};}
}
async function reportPost(postId,reason){
 const id=String(postId||'').trim(); const s=load(); const post=s.posts.find(item=>item.id===id);
 if(!post||!post.text)return {ok:false,error:'POST_NOT_FOUND'};
 const allowed=['safety','harassment','spam','other']; const why=String(reason||'').trim().toLowerCase();
 if(!allowed.includes(why))return {ok:false,error:'INVALID_REPORT_REASON'};
 try{
  const response=await fetch('/api/m35-community-report',{method:'POST',credentials:'include',cache:'no-store',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({postId:id,reportedText:post.text,reason:why})});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)return {ok:false,error:payload?.error?.code||'COMMUNITY_REPORT_FAILED'};
  return {ok:true,error:null,report:payload.report||null};
 }catch(_){return {ok:false,error:'COMMUNITY_REPORT_UNAVAILABLE'};}
}
function listPosts(groupId){const s=load();return {ok:true,error:null,posts:s.posts.filter(p=>!groupId||p.groupId===groupId)};}
global.BAACommunity={createPost,createPostSecure,reportPost,listPosts,moderate};
})(window);
