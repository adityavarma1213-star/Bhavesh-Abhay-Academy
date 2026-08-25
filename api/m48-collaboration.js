import { json, id, writeAudit } from './_lib/security.js';
import { requireAuth, hasRole } from './_lib/auth.js';
import { sql } from './_lib/db.js';
export const config={runtime:'nodejs'};
const clean=(v,n=4000)=>String(v??'').trim().slice(0,n);
const isStaff=s=>hasRole(s,'teacher')||hasRole(s,'admin');
async function canReadPost(s,postId){
  const r=await sql`SELECT p.id,p.author_user_id,p.visibility,p.class_id FROM collaboration_posts p WHERE p.id=${postId} LIMIT 1`;
  if(!r.rows.length)return null;
  const p=r.rows[0];
  if(isStaff(s)||p.author_user_id===s.user_id||p.visibility==='global')return p;
  if(p.visibility==='class'&&p.class_id){
    const m=await sql`SELECT 1 FROM class_members cm JOIN learners l ON l.id=cm.learner_id WHERE cm.class_id=${p.class_id} AND cm.status='active' AND l.user_id=${s.user_id} LIMIT 1`;
    if(m.rows.length)return p;
  }
  return null;
}
export default async function handler(req,res){
 try{
  const s=await requireAuth(req); if(!hasRole(s,'student')&&!hasRole(s,'teacher')&&!hasRole(s,'admin')) return json(res,403,{error:{code:'FORBIDDEN',message:'Authenticated learner or educator role required.'}});
  if(req.method==='GET'){
   const postId=clean(req.query?.postId,120);
   if(postId){const allowed=await canReadPost(s,postId); if(!allowed)return json(res,404,{error:{code:'POST_NOT_FOUND',message:'Post not found or not visible to this account.'}}); const p=await sql`SELECT p.id,p.title,p.body,p.subject,p.visibility,p.class_id AS "classId",p.created_at AS "createdAt",u.display_name AS "authorName" FROM collaboration_posts p JOIN users u ON u.id=p.author_user_id WHERE p.id=${postId} LIMIT 1`; const c=await sql`SELECT c.id,c.body,c.created_at AS "createdAt",u.display_name AS "authorName" FROM collaboration_comments c JOIN users u ON u.id=c.author_user_id WHERE c.post_id=${postId} ORDER BY c.created_at ASC`; return json(res,200,{ok:true,post:p.rows[0],comments:c.rows});}
   const r=isStaff(s)
    ? await sql`SELECT p.id,p.title,p.body,p.subject,p.visibility,p.class_id AS "classId",p.created_at AS "createdAt",u.display_name AS "authorName",COUNT(c.id)::int AS "commentCount" FROM collaboration_posts p JOIN users u ON u.id=p.author_user_id LEFT JOIN collaboration_comments c ON c.post_id=p.id WHERE p.visibility='global' OR p.visibility='class' OR p.author_user_id=${s.user_id} GROUP BY p.id,u.display_name ORDER BY p.created_at DESC LIMIT 50`
    : await sql`SELECT p.id,p.title,p.body,p.subject,p.visibility,p.class_id AS "classId",p.created_at AS "createdAt",u.display_name AS "authorName",COUNT(c.id)::int AS "commentCount" FROM collaboration_posts p JOIN users u ON u.id=p.author_user_id LEFT JOIN collaboration_comments c ON c.post_id=p.id WHERE p.visibility='global' OR p.author_user_id=${s.user_id} OR (p.visibility='class' AND EXISTS (SELECT 1 FROM class_members cm JOIN learners l ON l.id=cm.learner_id WHERE cm.class_id=p.class_id AND cm.status='active' AND l.user_id=${s.user_id})) GROUP BY p.id,u.display_name ORDER BY p.created_at DESC LIMIT 50`;
   return json(res,200,{ok:true,posts:r.rows});
  }
  if(req.method!=='POST')return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET or POST required.'}},{Allow:'GET, POST'});
  const b=req.body||{}, action=clean(b.action,40);
  if(action==='post'){
   const title=clean(b.title,180),body=clean(b.body),subject=clean(b.subject,120),visibility=['global','class','private'].includes(b.visibility)?b.visibility:'global',classId=clean(b.classId,120);
   if(!title||!body)return json(res,400,{error:{code:'INVALID_POST',message:'title and body are required.'}});
   if(visibility==='class'){
    if(!classId)return json(res,400,{error:{code:'CLASS_REQUIRED',message:'classId is required for class-visible posts.'}});
    if(!isStaff(s)){const member=await sql`SELECT 1 FROM classes c JOIN class_members cm ON cm.class_id=c.id JOIN learners l ON l.id=cm.learner_id WHERE c.id=${classId} AND cm.status='active' AND l.user_id=${s.user_id} LIMIT 1`; if(!member.rows.length)return json(res,403,{error:{code:'CLASS_ACCESS_DENIED',message:'You are not an active member of this class.'}});}
   }
   if(visibility!=='class'&&classId)return json(res,400,{error:{code:'INVALID_CLASS_SCOPE',message:'classId is only valid for class-visible posts.'}});
   const postId=id('collab'); await sql`INSERT INTO collaboration_posts(id,author_user_id,title,body,subject,visibility,class_id) VALUES(${postId},${s.user_id},${title},${body},${subject||null},${visibility},${visibility==='class'?classId:null})`; await writeAudit({actorUserId:s.user_id,action:'collaboration.post.create',entityType:'collaboration_post',entityId:postId}); return json(res,201,{ok:true,id:postId});
  }
  if(action==='comment'){
   const postId=clean(b.postId,120),body=clean(b.body,4000); if(!postId||!body)return json(res,400,{error:{code:'INVALID_COMMENT',message:'postId and body are required.'}}); const exists=await canReadPost(s,postId); if(!exists)return json(res,404,{error:{code:'POST_NOT_FOUND',message:'Post not found or not visible to this account.'}}); const commentId=id('comment'); await sql`INSERT INTO collaboration_comments(id,post_id,author_user_id,body) VALUES(${commentId},${postId},${s.user_id},${body})`; await writeAudit({actorUserId:s.user_id,action:'collaboration.comment.create',entityType:'collaboration_comment',entityId:commentId}); return json(res,201,{ok:true,id:commentId});
  }
  return json(res,400,{error:{code:'INVALID_ACTION',message:'Supported actions: post, comment.'}});
 }catch(e){return json(res,e.status||500,{error:{code:e.code||'COLLABORATION_FAILED',message:e.status?e.message:'Unable to process collaboration request.'}})}
}
