/* BAA M48 server bridge. Server-backed collaboration projects and posts are the production source of truth. */
(function(global){
'use strict';
const MAX_RESPONSE_BYTES=1024*1024;
const MAX_REQUEST_BYTES=64*1024;
function encodeRequestBody(body){
  const encoded=JSON.stringify(body);
  const bytes=typeof TextEncoder==='function'?new TextEncoder().encode(encoded).byteLength:(typeof Buffer!=='undefined'?Buffer.byteLength(encoded,'utf8'):encoded.length);
  if(bytes>MAX_REQUEST_BYTES){
    const error=new Error('COLLABORATION_REQUEST_TOO_LARGE');
    error.code='COLLABORATION_REQUEST_TOO_LARGE';
    throw error;
  }
  return encoded;
}
async function readJsonResponse(r,fallback){
  if(r.body&&typeof r.body.getReader==='function'){
    const reader=r.body.getReader();const chunks=[];let total=0;
    try{while(true){const part=await reader.read();if(part.done)break;total+=part.value?.byteLength||0;if(total>MAX_RESPONSE_BYTES){await reader.cancel();return fallback;}chunks.push(part.value);}}
    catch(_){try{await reader.cancel();}catch(_e){}return fallback;}
    const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    try{return JSON.parse(new TextDecoder().decode(bytes));}catch(_){return fallback;}
  }
  const length=Number(r.headers?.get?.('content-length')||0);if(Number.isFinite(length)&&length>MAX_RESPONSE_BYTES)return fallback;
  try{const text=await r.text();if(new TextEncoder().encode(text).byteLength>MAX_RESPONSE_BYTES)return fallback;return JSON.parse(text);}catch(_){return fallback;}
}
async function request(body,method='POST'){
  let encoded;
  if(method!=='GET'){
    try{encoded=encodeRequestBody(body);}catch(error){return {ok:false,error:error?.code||'COLLABORATION_REQUEST_TOO_LARGE'};}
  }
  const r=await fetch('/api/m48-collaboration',{method,headers:{'Content-Type':'application/json',Accept:'application/json'},credentials:'include',cache:'no-store',body:method==='GET'?undefined:encoded}).catch(()=>null);
  if(!r)return {ok:false,error:'COLLABORATION_SERVER_UNAVAILABLE'};
  const p=await readJsonResponse(r,{});
  return r.ok&&p.ok?p:{ok:false,error:p?.error?.code||'COLLABORATION_SERVER_ERROR',message:p?.error?.message||''};
}
async function get(query=''){
  const r=await fetch(`/api/m48-collaboration${query}`,{credentials:'include',cache:'no-store',headers:{Accept:'application/json'}}).catch(()=>null);
  if(!r)return {ok:false,error:'COLLABORATION_SERVER_UNAVAILABLE',posts:[],projects:[]};
  const p=await readJsonResponse(r,{});
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
