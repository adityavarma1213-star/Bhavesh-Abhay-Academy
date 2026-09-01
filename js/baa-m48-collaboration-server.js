/* BAA M48 server bridge. Server-backed collaboration projects and posts are the production source of truth. */
(function(global){
'use strict';
async function request(body,method='POST'){
  const r=await fetch('/api/m48-collaboration',{method,headers:{'Content-Type':'application/json',Accept:'application/json'},credentials:'include',cache:'no-store',body:method==='GET'?undefined:JSON.stringify(body)}).catch(()=>null);
  if(!r)return {ok:false,error:'COLLABORATION_SERVER_UNAVAILABLE'};
  const p=await r.json().catch(()=>({}));
  return r.ok&&p.ok?p:{ok:false,error:p?.error?.code||'COLLABORATION_SERVER_ERROR',message:p?.error?.message||''};
}
async function get(query=''){
  const r=await fetch(`/api/m48-collaboration${query}`,{credentials:'include',cache:'no-store',headers:{Accept:'application/json'}}).catch(()=>null);
  if(!r)return {ok:false,error:'COLLABORATION_SERVER_UNAVAILABLE',posts:[],projects:[]};
  const p=await r.json().catch(()=>({}));
  return r.ok&&p.ok?p:{ok:false,error:p?.error?.code||'COLLABORATION_SERVER_ERROR',posts:[],projects:[]};
}
async function listServerPosts(){return get();}
async function getServerProject(projectId){return get(`?projectId=${encodeURIComponent(String(projectId||''))}`);}
async function listServerProjects(){return get();}
async function createServerProject({title,region,description='',minimumAge=13}){return request({action:'project_create',title,region,description,minimumAge});}
async function joinServerProject(projectId,displayName='Student'){return request({action:'project_join',projectId,displayName});}
async function transitionServerProject(projectId,status){return request({action:'project_transition',projectId,status});}
async function moderateServerProject(projectId,moderationState){return request({action:'project_moderate',projectId,moderationState});}
async function createServerPost({title,body,subject='',visibility='global',classId=''}){return request({action:'post',title,body,subject,visibility,classId});}
async function commentServerPost(postId,body){return request({action:'comment',postId,body});}
async function reportServerPost(postId,reason){return request({action:'report',postId,reason});}
async function moderateServerPost(postId,moderationState){return request({action:'moderate',postId,moderationState},'PATCH');}
global.BAAM48Server={listPosts:listServerPosts,getProject:getServerProject,listProjects:listServerProjects,createProject:createServerProject,joinProject:joinServerProject,transitionProject:transitionServerProject,moderateProject:moderateServerProject,createPost:createServerPost,commentPost:commentServerPost,reportPost:reportServerPost,moderatePost:moderateServerPost};
})(window);