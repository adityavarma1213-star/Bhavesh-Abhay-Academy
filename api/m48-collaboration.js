import { json, id, writeAudit } from './_lib/security.js';
import { requireAuth, hasRole } from './_lib/auth.js';
import { sql } from './_lib/db.js';
export const config={runtime:'nodejs'};
const clean=(v,n=4000)=>String(v??'').trim().slice(0,n);
export default async function handler(req,res){
 try{
  const s=await requireAuth(req); if(!hasRole(s,'student')&&!hasRole(s,'teacher')&&!hasRole(s,'admin')) return json(res,403,{error:{code:'FORBIDDEN',message:'Authenticated learner or educator role required.'}});
  if(req.method==='GET'){
   const postId=clean(req.query?.postId,120);
   if(postId){const p=await sql`SELECT p.id,p.title,p.body,p.subject,p.visibility,p.created_at AS "createdAt",u.display_name AS "authorName" FROM collaboration_posts p JOIN users u ON u.id=p.author_user_id WHERE p.id=${postId} LIMIT 1`; if(!p.rows.length)return json(res,404,{error:{code:'POST_NOT_FOUND',message:'Post not found.'}}); const c=await sql`SELECT c.id,c.body,c.created_at AS "createdAt",u.display_name AS "authorName" FROM collaboration_comments c JOIN users u ON u.id=c.author_user_id WHERE c.post_id=${postId} ORDER BY c.created_at ASC`; return json(res,200,{ok:true,post:p.rows[0],comments:c.rows});}
   const r=await sql`SELECT p.id,p.title,p.body,p.subject,p.visibility,p.created_at AS "createdAt",u.display_name AS "authorName",COUNT(c.id)::int AS "commentCount" FROM collaboration_posts p JOIN users u ON u.id=p.author_user_id LEFT JOIN collaboration_comments c ON c.post_id=p.id WHERE p.visibility='global' OR p.author_user_id=${s.user_id} GROUP BY p.id,u.display_name ORDER BY p.created_at DESC LIMIT 50`; return json(res,200,{ok:true,posts:r.rows});
  }
  if(req.method!=='POST')return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET or POST required.'}},{Allow:'GET, POST'});
  const b=req.body||{}, action=clean(b.action,40);
  if(action==='post'){const title=clean(b.title,180),body=clean(b.body),subject=clean(b.subject,120),visibility=['global','class','private'].includes(b.visibility)?b.visibility:'global'; if(!title||!body)return json(res,400,{error:{code:'INVALID_POST',message:'title and body are required.'}}); const postId=id('collab'); await sql`INSERT INTO collaboration_posts(id,author_user_id,title,body,subject,visibility) VALUES(${postId},${s.user_id},${title},${body},${subject||null},${visibility})`; await writeAudit({actorUserId:s.user_id,action:'collaboration.post.create',entityType:'collaboration_post',entityId:postId}); return json(res,201,{ok:true,id:postId});}
  if(action==='comment'){const postId=clean(b.postId,120),body=clean(b.body,4000); if(!postId||!body)return json(res,400,{error:{code:'INVALID_COMMENT',message:'postId and body are required.'}}); const exists=await sql`SELECT id FROM collaboration_posts WHERE id=${postId} AND (visibility='global' OR author_user_id=${s.user_id}) LIMIT 1`; if(!exists.rows.length)return json(res,404,{error:{code:'POST_NOT_FOUND',message:'Post not found.'}}); const commentId=id('comment'); await sql`INSERT INTO collaboration_comments(id,post_id,author_user_id,body) VALUES(${commentId},${postId},${s.user_id},${body})`; return json(res,201,{ok:true,id:commentId});}
  return json(res,400,{error:{code:'INVALID_ACTION',message:'Supported actions: post, comment.'}});
 }catch(e){return json(res,e.status||500,{error:{code:e.code||'COLLABORATION_FAILED',message:e.status?e.message:'Unable to process collaboration request.'}})}
}
