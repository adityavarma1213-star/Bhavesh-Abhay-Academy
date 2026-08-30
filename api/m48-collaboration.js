import { json, id, writeAudit } from './_lib/security.js';
import { requireAuth, hasRole } from './_lib/auth.js';
import { sql } from './_lib/db.js';
export const config={runtime:'nodejs'};
const clean=(v,n=4000)=>String(v??'').trim().slice(0,n);
const isStaff=s=>hasRole(s,'teacher')||hasRole(s,'admin');
const isAdmin=s=>hasRole(s,'admin');
const BLOCKED=['self-harm','suicide','sexual exploitation','buy drugs','child sexual abuse'];
function moderationStateFor(session){return isStaff(session)?'approved':'pending';}
function safetyCheck(text){const low=String(text||'').toLowerCase();return BLOCKED.some(term=>low.includes(term));}
async function canReadPost(s,postId){
  const r=await sql`SELECT p.id,p.author_user_id,p.visibility,p.class_id,p.moderation_state AS "moderationState" FROM collaboration_posts p WHERE p.id=${postId} LIMIT 1`;
  if(!r.rows.length)return null;
  const p=r.rows[0];
  if(p.moderationState==='blocked'&&!isStaff(s)&&p.author_user_id!==s.user_id)return null;
  if(isAdmin(s)||p.author_user_id===s.user_id||(p.visibility==='global'&&p.moderationState==='approved'))return p;
  if(isStaff(s)&&p.visibility==='class'&&p.class_id){
    const owned=await sql`SELECT 1 FROM classes c WHERE c.id=${p.class_id} AND c.teacher_user_id=${s.user_id} AND c.status='active' LIMIT 1`;
    if(owned.rows.length)return p;
  }
  if(p.visibility==='class'&&p.class_id&&p.moderationState==='approved'){
    const m=await sql`SELECT 1 FROM class_members cm JOIN learners l ON l.id=cm.learner_id WHERE cm.class_id=${p.class_id} AND cm.status='active' AND l.user_id=${s.user_id} LIMIT 1`;
    if(m.rows.length)return p;
  }
  return null;
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store, max-age=0');
 try{
  const s=await requireAuth(req); if(!hasRole(s,'student')&&!hasRole(s,'teacher')&&!hasRole(s,'admin')) return json(res,403,{error:{code:'FORBIDDEN',message:'Authenticated learner or educator role required.'}});
  if(req.method==='GET'){
   const postId=clean(req.query?.postId,120);
   if(postId){const allowed=await canReadPost(s,postId); if(!allowed)return json(res,404,{error:{code:'POST_NOT_FOUND',message:'Post not found or not visible to this account.'}}); const p=await sql`SELECT p.id,p.title,p.body,p.subject,p.visibility,p.class_id AS "classId",p.moderation_state AS "moderationState",p.created_at AS "createdAt",u.display_name AS "authorName" FROM collaboration_posts p JOIN users u ON u.id=p.author_user_id WHERE p.id=${postId} LIMIT 1`; const c=await sql`SELECT c.id,c.body,c.created_at AS "createdAt",u.display_name AS "authorName" FROM collaboration_comments c JOIN users u ON u.id=c.author_user_id WHERE c.post_id=${postId} ORDER BY c.created_at ASC`; return json(res,200,{ok:true,post:p.rows[0],comments:c.rows});}
   const r=isAdmin(s)
    ? await sql`SELECT p.id,p.title,p.body,p.subject,p.visibility,p.class_id AS "classId",p.moderation_state AS "moderationState",p.created_at AS "createdAt",u.display_name AS "authorName",COUNT(c.id)::int AS "commentCount" FROM collaboration_posts p JOIN users u ON u.id=p.author_user_id LEFT JOIN collaboration_comments c ON c.post_id=p.id WHERE p.author_user_id=${s.user_id} OR p.moderation_state='pending' OR p.visibility='global' OR p.visibility='class' GROUP BY p.id,u.display_name ORDER BY p.created_at DESC LIMIT 50`
    : await sql`SELECT p.id,p.title,p.body,p.subject,p.visibility,p.class_id AS "classId",p.moderation_state AS "moderationState",p.created_at AS "createdAt",u.display_name AS "authorName",COUNT(c.id)::int AS "commentCount" FROM collaboration_posts p JOIN users u ON u.id=p.author_user_id LEFT JOIN collaboration_comments c ON c.post_id=p.id WHERE (p.author_user_id=${s.user_id}) OR (p.moderation_state='approved' AND (p.visibility='global' OR (p.visibility='class' AND EXISTS (SELECT 1 FROM class_members cm JOIN learners l ON l.id=cm.learner_id WHERE cm.class_id=p.class_id AND cm.status='active' AND l.user_id=${s.user_id})))) OR (p.visibility='class' AND p.class_id IN (SELECT c.id FROM classes c WHERE c.teacher_user_id=${s.user_id} AND c.status='active')) GROUP BY p.id,u.display_name ORDER BY p.created_at DESC LIMIT 50`;
   return json(res,200,{ok:true,posts:r.rows});
  }
  if(req.method!=='POST'&&req.method!=='PATCH')return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET, POST or PATCH required.'}},{Allow:'GET, POST, PATCH'});
  const b=req.body||{}, action=clean(b.action,40);
  if(req.method==='POST'&&action==='post'){
   const title=clean(b.title,180),body=clean(b.body),subject=clean(b.subject,120),visibility=['global','class','private'].includes(b.visibility)?b.visibility:'global',classId=clean(b.classId,120);
   if(!title||!body)return json(res,400,{error:{code:'INVALID_POST',message:'title and body are required.'}});
   if(safetyCheck(`${title}\n${body}`)) return json(res,422,{error:{code:'POST_BLOCKED_BY_SAFETY_FILTER',message:'This post contains content that cannot be published through the collaboration system.'}});
   if(visibility==='class'){
    if(!classId)return json(res,400,{error:{code:'CLASS_REQUIRED',message:'classId is required for class-visible posts.'}});
    if(!isStaff(s)){const member=await sql`SELECT 1 FROM classes c JOIN class_members cm ON cm.class_id=c.id JOIN learners l ON l.id=cm.learner_id WHERE c.id=${classId} AND cm.status='active' AND l.user_id=${s.user_id} LIMIT 1`; if(!member.rows.length)return json(res,403,{error:{code:'CLASS_ACCESS_DENIED',message:'You are not an active member of this class.'}});}
    else if(!isAdmin(s)){const owned=await sql`SELECT 1 FROM classes c WHERE c.id=${classId} AND c.teacher_user_id=${s.user_id} AND c.status='active' LIMIT 1`; if(!owned.rows.length)return json(res,403,{error:{code:'CLASS_ACCESS_DENIED',message:'Teacher access to this class is required.'}});}
   }
   if(visibility!=='class'&&classId)return json(res,400,{error:{code:'INVALID_CLASS_SCOPE',message:'classId is only valid for class-visible posts.'}});
   const postId=id('collab'),state=moderationStateFor(s); await sql`INSERT INTO collaboration_posts(id,author_user_id,title,body,subject,visibility,class_id,moderation_state) VALUES(${postId},${s.user_id},${title},${body},${subject||null},${visibility},${visibility==='class'?classId:null},${state})`; await writeAudit({actorUserId:s.user_id,action:'collaboration.post.create',entityType:'collaboration_post',entityId:postId,metadata:{moderationState:state}}); return json(res,201,{ok:true,id:postId,moderationState:state});
  }
  if(req.method==='POST'&&action==='comment'){
   const postId=clean(b.postId,120),body=clean(b.body,4000); if(!postId||!body)return json(res,400,{error:{code:'INVALID_COMMENT',message:'postId and body are required.'}}); if(safetyCheck(body))return json(res,422,{error:{code:'COMMENT_BLOCKED_BY_SAFETY_FILTER',message:'This comment contains content that cannot be published.'}}); const exists=await canReadPost(s,postId); if(!exists)return json(res,404,{error:{code:'POST_NOT_FOUND',message:'Post not found or not visible to this account.'}}); if(exists.moderationState!=='approved'&&!isStaff(s))return json(res,409,{error:{code:'POST_PENDING_MODERATION',message:'Comments are disabled until this post is approved.'}}); const commentId=id('comment'); await sql`INSERT INTO collaboration_comments(id,post_id,author_user_id,body) VALUES(${commentId},${postId},${s.user_id},${body})`; await writeAudit({actorUserId:s.user_id,action:'collaboration.comment.create',entityType:'collaboration_comment',entityId:commentId}); return json(res,201,{ok:true,id:commentId});
  }
  if(req.method==='POST'&&action==='report'){
   const postId=clean(b.postId,120),reason=clean(b.reason,500); if(!postId||!reason)return json(res,400,{error:{code:'INVALID_REPORT',message:'postId and reason are required.'}}); const visible=await canReadPost(s,postId); if(!visible)return json(res,404,{error:{code:'POST_NOT_FOUND',message:'Post not found or not visible to this account.'}}); const duplicate=await sql`SELECT id FROM collaboration_reports WHERE post_id=${postId} AND reporter_user_id=${s.user_id} AND status='open' LIMIT 1`; if(duplicate.rows.length)return json(res,409,{error:{code:'REPORT_ALREADY_OPEN',message:'You already have an open report for this post.'},reportId:duplicate.rows[0].id,status:'open'}); const reportId=id('report'); await sql`INSERT INTO collaboration_reports(id,post_id,reporter_user_id,reason,status) VALUES(${reportId},${postId},${s.user_id},${reason},'open')`; await writeAudit({actorUserId:s.user_id,action:'collaboration.post.report',entityType:'collaboration_post',entityId:postId,metadata:{reportId}}); return json(res,201,{ok:true,id:reportId,status:'open'});
  }
  if(req.method==='PATCH'&&action==='moderate'){
   if(!isStaff(s))return json(res,403,{error:{code:'FORBIDDEN',message:'Teacher or administrator role required.'}}); const postId=clean(b.postId,120),state=clean(b.moderationState,40); if(!postId||!['pending','approved','blocked'].includes(state))return json(res,400,{error:{code:'INVALID_MODERATION_STATE',message:'postId and a valid moderationState are required.'}}); if(!isAdmin(s)){const target=await sql`SELECT class_id AS "classId",author_user_id AS "authorUserId" FROM collaboration_posts WHERE id=${postId} LIMIT 1`; if(!target.rows.length)return json(res,404,{error:{code:'POST_NOT_FOUND',message:'Post not found.'}}); const p=target.rows[0]; if(p.classId){const owned=await sql`SELECT 1 FROM classes c WHERE c.id=${p.classId} AND c.teacher_user_id=${s.user_id} AND c.status='active' LIMIT 1`; if(!owned.rows.length)return json(res,403,{error:{code:'FORBIDDEN',message:'Teacher ownership of the class is required.'}});} else if(p.authorUserId!==s.user_id)return json(res,403,{error:{code:'FORBIDDEN',message:'Teacher ownership of the post is required.'}}); } const r=await sql`UPDATE collaboration_posts SET moderation_state=${state},updated_at=NOW() WHERE id=${postId} RETURNING id,moderation_state AS "moderationState"`; if(!r.rows.length)return json(res,404,{error:{code:'POST_NOT_FOUND',message:'Post not found.'}}); await writeAudit({actorUserId:s.user_id,action:'collaboration.post.moderate',entityType:'collaboration_post',entityId:postId,metadata:{moderationState:state}}); return json(res,200,{ok:true,post:r.rows[0]});
  }
  return json(res,400,{error:{code:'INVALID_ACTION',message:'Supported actions: post, comment, report, moderate.'}});
 }catch(e){return json(res,e.status||500,{error:{code:e.code||'COLLABORATION_FAILED',message:e.status?e.message:'Unable to process collaboration request.'}})}
}
