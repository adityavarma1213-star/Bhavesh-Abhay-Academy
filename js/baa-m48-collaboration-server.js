/* BAA M48 server bridge. Keeps the deterministic local collaboration API intact,
   while exposing the authenticated server moderation/report path for production UI. */
(function(global){
'use strict';
async function request(body){
  const r=await fetch('/api/m48-collaboration',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},credentials:'include',cache:'no-store',body:JSON.stringify(body)}).catch(()=>null);
  if(!r)return {ok:false,error:'COLLABORATION_SERVER_UNAVAILABLE'};
  const p=await r.json().catch(()=>({}));
  return r.ok&&p.ok?p:{ok:false,error:p?.error?.code||'COLLABORATION_SERVER_ERROR'};
}
async function listServerPosts(){
  const r=await fetch('/api/m48-collaboration',{credentials:'include',cache:'no-store',headers:{Accept:'application/json'}}).catch(()=>null);
  if(!r)return {ok:false,error:'COLLABORATION_SERVER_UNAVAILABLE',posts:[]};
  const p=await r.json().catch(()=>({}));
  return r.ok&&p.ok?{ok:true,error:null,posts:Array.isArray(p.posts)?p.posts:[]}:{ok:false,error:p?.error?.code||'COLLABORATION_SERVER_ERROR',posts:[]};
}
async function createServerPost({title,body,subject='',visibility='global',classId=''}){return request({action:'post',title,body,subject,visibility,classId});}
async function commentServerPost(postId,body){return request({action:'comment',postId,body});}
async function reportServerPost(postId,reason){return request({action:'report',postId,reason});}
async function moderateServerPost(postId,moderationState){
  const r=await fetch('/api/m48-collaboration',{method:'PATCH',headers:{'Content-Type':'application/json',Accept:'application/json'},credentials:'include',cache:'no-store',body:JSON.stringify({action:'moderate',postId,moderationState})}).catch(()=>null);
  if(!r)return {ok:false,error:'COLLABORATION_SERVER_UNAVAILABLE'};
  const p=await r.json().catch(()=>({})); return r.ok&&p.ok?p:{ok:false,error:p?.error?.code||'COLLABORATION_MODERATION_FAILED'};
}
global.BAAM48Server={listPosts:listServerPosts,createPost:createServerPost,commentPost:commentServerPost,reportPost:reportServerPost,moderatePost:moderateServerPost};
})(window);