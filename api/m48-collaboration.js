import { json, id, writeAudit } from './_lib/security.js';
import { requireAuth, hasRole } from './_lib/auth.js';
import { sql } from './_lib/db.js';
export const config={runtime:'nodejs'};
const clean=(v,n=4000)=>String(v??'').trim().slice(0,n);
const isStaff=s=>hasRole(s,'teacher')||hasRole(s,'admin');
const isAdmin=s=>hasRole(s,'admin');
const isStudent=s=>hasRole(s,'student');
const BLOCKED=['self-harm','suicide','sexual exploitation','buy drugs','child sexual abuse'];
const PROJECT_STATUSES=['draft','open','paused','completed','archived'];
const PROJECT_TRANSITIONS={draft:['open','archived'],open:['paused','completed','archived'],paused:['open','archived'],completed:['archived'],archived:[]};
function safetyCheck(text){const low=String(text||'').toLowerCase();return BLOCKED.some(term=>low.includes(term));}
function projectModerationFor(session){return isStaff(session)?'approved':'pending';}
async function canReadPost(s,postId){
 const r=await sql`SELECT p.id,p.author_user_id,p.visibility,p.class_id,p.moderation_state AS "moderationState" FROM collaboration_posts p WHERE p.id=${postId} LIMIT 1`;
 if(!r.rows.length)return null; const p=r.rows[0];
 if(p.moderationState==='blocked'&&!isStaff(s)&&p.author_user_id!==s.user_id)return null;
 if(isAdmin(s)||p.author_user_id===s.user_id||(p.visibility==='global'&&p.moderationState==='approved'))return p;
 if(isStaff(s)&&p.visibility==='class'&&p.class_id){const owned=await sql`SELECT 1 FROM classes c WHERE c.id=${p.class_id} AND c.teacher_user_id=${s.user_id} AND c.status='active' LIMIT 1`;if(owned.rows.length)return p;}
 if(p.visibility==='class'&&p.class_id&&p.moderationState==='approved'){const m=await sql`SELECT 1 FROM class_members cm JOIN learners l ON l.id=cm.learner_id WHERE cm.class_id=${p.class_id} AND cm.status='active' AND l.user_id=${s.user_id} LIMIT 1`;if(m.rows.length)return p;}
 return null;
}
async function canReadProject(s,projectId){
 const r=await sql`SELECT id,owner_user_id,title,region,description,minimum_age AS "minimumAge",moderation_required AS "moderationRequired",moderation_state AS "moderationState",status,created_at AS "createdAt",updated_at AS "updatedAt" FROM collaboration_projects WHERE id=${projectId} LIMIT 1`;
 if(!r.rows.length)return null; const p=r.rows[0];
 if(isAdmin(s)||p.owner_user_id===s.user_id)return p;
 if(p.status==='archived'||p.moderationState!=='approved')return null;
 return p;
}
async function projectPayload(s,projectId){
 const p=await canReadProject(s,projectId); if(!p)return null;
 const participants=await sql`SELECT user_id AS "userId",display_name AS "displayName",moderation_state AS "moderationState",joined_at AS "joinedAt",updated_at AS "updatedAt" FROM collaboration_project_participants WHERE project_id=${projectId} AND (moderation_state='approved' OR user_id=${s.user_id} OR ${isStaff(s)}) ORDER BY joined_at ASC LIMIT 100`;
 return {...p,participants:participants.rows};
}
async function requireProjectOwnerOrStaff(s,projectId){
 const r=await sql`SELECT owner_user_id AS "ownerUserId" FROM collaboration_projects WHERE id=${projectId} LIMIT 1`; if(!r.rows.length){const e=new Error('Project not found.');e.status=404;e.code='PROJECT_NOT_FOUND';throw e;}
 if(!isStaff(s)&&r.rows[0].ownerUserId!==s.user_id){const e=new Error('Project ownership is required.');e.status=403;e.code='PROJECT_FORBIDDEN';throw e;}
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store, max-age=0');
 try{
  const s=await requireAuth(req); if(!isStudent(s)&&!isStaff(s))return json(res,403,{error:{code:'FORBIDDEN',message:'Authenticated student or educator role required.'}});
  if(req.method==='GET'){
   const projectId=clean(req.query?.projectId,120);
   if(projectId){const p=await projectPayload(s,projectId);if(!p)return json(res,404,{error:{code:'PROJECT_NOT_FOUND',message:'Project not found or not visible to this account.'}});return json(res,200,{ok:true,project:p});}
   const r=await sql`SELECT p.id,p.owner_user_id AS "ownerUserId",p.title,p.region,p.description,p.minimum_age AS "minimumAge",p.moderation_required AS "moderationRequired",p.moderation_state AS "moderationState",p.status,p.created_at AS "createdAt",p.updated_at AS "updatedAt",COUNT(pp.user_id)::int AS "participantCount" FROM collaboration_projects p LEFT JOIN collaboration_project_participants pp ON pp.project_id=p.id AND pp.moderation_state='approved' WHERE (p.owner_user_id=${s.user_id}) OR (p.moderation_state='approved' AND p.status IN ('open','paused','completed')) GROUP BY p.id ORDER BY p.updated_at DESC,p.id DESC LIMIT 50`;
   return json(res,200,{ok:true,projects:r.rows});
  }
  if(req.method!=='POST'&&req.method!=='PATCH')return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET, POST or PATCH required.'}},{Allow:'GET, POST, PATCH'});
  const b=req.body||{},action=clean(b.action,40);
  if(req.method==='POST'&&action==='project_create'){
   if(!isStudent(s))return json(res,403,{error:{code:'FORBIDDEN',message:'Student role required to create collaboration projects.'}});
   const title=clean(b.title,160),region=clean(b.region,80),description=clean(b.description,1000); const minimumAge=Number.isInteger(b.minimumAge)?b.minimumAge:13;
   if(!title||!region)return json(res,400,{error:{code:'INVALID_COLLAB_PROJECT',message:'title and region are required.'}});
   if(minimumAge<13||minimumAge>21)return json(res,400,{error:{code:'INVALID_MINIMUM_AGE',message:'minimumAge must be between 13 and 21.'}});
   if(safetyCheck(`${title}\n${description}`))return json(res,422,{error:{code:'PROJECT_BLOCKED_BY_SAFETY_FILTER',message:'This project contains content that cannot be published through the collaboration system.'}});
   const projectId=id('project'),state=projectModerationFor(s);
   await sql`INSERT INTO collaboration_projects(id,owner_user_id,title,region,description,minimum_age,moderation_required,moderation_state,status) VALUES(${projectId},${s.user_id},${title},${region},${description},${minimumAge},TRUE,${state},'draft')`;
   await writeAudit({actorUserId:s.user_id,action:'collaboration.project.create',entityType:'collaboration_project',entityId:projectId,metadata:{moderationState:state}});
   return json(res,201,{ok:true,project:await projectPayload(s,projectId)});
  }
  if(req.method==='POST'&&action==='project_join'){
   if(!isStudent(s))return json(res,403,{error:{code:'FORBIDDEN',message:'Student role required to join collaboration projects.'}});
   const projectId=clean(b.projectId,120),displayName=clean(b.displayName,60)||'Student'; if(!projectId)return json(res,400,{error:{code:'INVALID_PROJECT_ID',message:'projectId is required.'}});
   const p=await canReadProject(s,projectId); if(!p)return json(res,404,{error:{code:'PROJECT_NOT_FOUND',message:'Project not found or not visible to this account.'}});
   if(p.status!=='open')return json(res,409,{error:{code:'PROJECT_NOT_OPEN',message:'The project is not open for joining.'}});
   if(p.minimumAge>13)return json(res,409,{error:{code:'AGE_VERIFICATION_REQUIRED',message:'This project requires age verification that is not available through this server boundary.'}});
   const count=await sql`SELECT COUNT(*)::int AS count FROM collaboration_project_participants WHERE project_id=${projectId}`; if(Number(count.rows[0]?.count||0)>=100)return json(res,409,{error:{code:'PARTICIPANT_LIMIT',message:'The project has reached its participant limit.'}});
   const existing=await sql`SELECT user_id AS "userId",moderation_state AS "moderationState" FROM collaboration_project_participants WHERE project_id=${projectId} AND user_id=${s.user_id} LIMIT 1`; if(existing.rows.length)return json(res,409,{error:{code:'ALREADY_JOINED',message:'You are already associated with this project.'},moderationState:existing.rows[0].moderationState});
   await sql`INSERT INTO collaboration_project_participants(project_id,user_id,display_name,moderation_state) VALUES(${projectId},${s.user_id},${displayName},'pending')`;
   await writeAudit({actorUserId:s.user_id,action:'collaboration.project.join',entityType:'collaboration_project',entityId:projectId});
   return json(res,201,{ok:true,project:await projectPayload(s,projectId)});
  }
  if(req.method==='POST'&&action==='project_transition'){
   const projectId=clean(b.projectId,120),next=clean(b.status,40); if(!projectId||!PROJECT_STATUSES.includes(next))return json(res,400,{error:{code:'INVALID_PROJECT_STATUS',message:'projectId and a valid status are required.'}}); await requireProjectOwnerOrStaff(s,projectId);
   const current=await sql`SELECT status,moderation_state AS "moderationState" FROM collaboration_projects WHERE id=${projectId} LIMIT 1`; const from=current.rows[0].status;
   if(!PROJECT_TRANSITIONS[from]?.includes(next))return json(res,409,{error:{code:'INVALID_PROJECT_TRANSITION',message:`Cannot transition project from ${from} to ${next}.`}});
   await sql`UPDATE collaboration_projects SET status=${next},updated_at=NOW() WHERE id=${projectId}`;
   await writeAudit({actorUserId:s.user_id,action:'collaboration.project.transition',entityType:'collaboration_project',entityId:projectId,metadata:{from,to:next}});
   return json(res,200,{ok:true,project:await projectPayload(s,projectId)});
  }
  if(req.method==='POST'&&action==='project_moderate'){
   if(!isStaff(s))return json(res,403,{error:{code:'FORBIDDEN',message:'Teacher or administrator role required.'}}); const projectId=clean(b.projectId,120),state=clean(b.moderationState,40); if(!projectId||!['pending','approved','blocked'].includes(state))return json(res,400,{error:{code:'INVALID_MODERATION_STATE',message:'projectId and a valid moderationState are required.'}});
   if(!isAdmin(s)){const owner=await sql`SELECT owner_user_id AS "ownerUserId" FROM collaboration_projects WHERE id=${projectId} LIMIT 1`;if(!owner.rows.length)return json(res,404,{error:{code:'PROJECT_NOT_FOUND',message:'Project not found.'}});if(owner.rows[0].ownerUserId!==s.user_id)return json(res,403,{error:{code:'FORBIDDEN',message:'Teacher ownership of the project is required.'}});}
   const r=await sql`UPDATE collaboration_projects SET moderation_state=${state},updated_at=NOW() WHERE id=${projectId} RETURNING id,moderation_state AS "moderationState"`;if(!r.rows.length)return json(res,404,{error:{code:'PROJECT_NOT_FOUND',message:'Project not found.'}});
   await writeAudit({actorUserId:s.user_id,action:'collaboration.project.moderate',entityType:'collaboration_project',entityId:projectId,metadata:{moderationState:state}}); return json(res,200,{ok:true,project:await projectPayload(s,projectId)});
  }
  if(req.method==='PATCH'&&action==='moderate'){
   if(!isStaff(s))return json(res,403,{error:{code:'FORBIDDEN',message:'Teacher or administrator role required.'}}); const postId=clean(b.postId,120),state=clean(b.moderationState,40); if(!postId||!['pending','approved','blocked'].includes(state))return json(res,400,{error:{code:'INVALID_MODERATION_STATE',message:'postId and a valid moderationState are required.'}}); if(!isAdmin(s)){const target=await sql`SELECT class_id AS "classId",author_user_id AS "authorUserId" FROM collaboration_posts WHERE id=${postId} LIMIT 1`;if(!target.rows.length)return json(res,404,{error:{code:'POST_NOT_FOUND',message:'Post not found.'}});const p=target.rows[0];if(p.classId){const owned=await sql`SELECT 1 FROM classes c WHERE c.id=${p.classId} AND c.teacher_user_id=${s.user_id} AND c.status='active' LIMIT 1`;if(!owned.rows.length)return json(res,403,{error:{code:'FORBIDDEN',message:'Teacher ownership of the class is required.'}});}else if(p.authorUserId!==s.user_id)return json(res,403,{error:{code:'FORBIDDEN',message:'Teacher ownership of the post is required.'}});}
   const r=await sql`UPDATE collaboration_posts SET moderation_state=${state},updated_at=NOW() WHERE id=${postId} RETURNING id,moderation_state AS "moderationState"`;if(!r.rows.length)return json(res,404,{error:{code:'POST_NOT_FOUND',message:'Post not found.'}});await writeAudit({actorUserId:s.user_id,action:'collaboration.post.moderate',entityType:'collaboration_post',entityId:postId,metadata:{moderationState:state}});return json(res,200,{ok:true,post:r.rows[0]});
  }
  if(req.method==='POST'&&action==='post'){
   const title=clean(b.title,180),body=clean(b.body),subject=clean(b.subject,120),visibility=['global','class','private'].includes(b.visibility)?b.visibility:'global',classId=clean(b.classId,120); if(!title||!body)return json(res,400,{error:{code:'INVALID_POST',message:'title and body are required.'}}); if(safetyCheck(`${title}\n${body}`))return json(res,422,{error:{code:'POST_BLOCKED_BY_SAFETY_FILTER',message:'This post contains content that cannot be published through the collaboration system.'}});
   if(visibility==='class'){if(!classId)return json(res,400,{error:{code:'CLASS_REQUIRED',message:'classId is required for class-visible posts.'}});if(!isStaff(s)){const member=await sql`SELECT 1 FROM classes c JOIN class_members cm ON cm.class_id=c.id JOIN learners l ON l.id=cm.learner_id WHERE c.id=${classId} AND cm.status='active' AND l.user_id=${s.user_id} LIMIT 1`;if(!member.rows.length)return json(res,403,{error:{code:'CLASS_ACCESS_DENIED',message:'You are not an active member of this class.'}});}else if(!isAdmin(s)){const owned=await sql`SELECT 1 FROM classes c WHERE c.id=${classId} AND c.teacher_user_id=${s.user_id} AND c.status='active' LIMIT 1`;if(!owned.rows.length)return json(res,403,{error:{code:'CLASS_ACCESS_DENIED',message:'Teacher access to this class is required.'}});}}
   if(visibility!=='class'&&classId)return json(res,400,{error:{code:'INVALID_CLASS_SCOPE',message:'classId is only valid for class-visible posts.'}}); const postId=id('collab'),state=moderationStateFor(s); await sql`INSERT INTO collaboration_posts(id,author_user_id,title,body,subject,visibility,class_id,moderation_state) VALUES(${postId},${s.user_id},${title},${body},${subject||null},${visibility},${visibility==='class'?classId:null},${state})`;await writeAudit({actorUserId:s.user_id,action:'collaboration.post.create',entityType:'collaboration_post',entityId:postId,metadata:{moderationState:state}});return json(res,201,{ok:true,id:postId,moderationState:state});
  }
  if(req.method==='POST'&&action==='comment'){
   const postId=clean(b.postId,120),body=clean(b.body,4000);if(!postId||!body)return json(res,400,{error:{code:'INVALID_COMMENT',message:'postId and body are required.'}});if(safetyCheck(body))return json(res,422,{error:{code:'COMMENT_BLOCKED_BY_SAFETY_FILTER',message:'This comment contains content that cannot be published.'}});const exists=await canReadPost(s,postId);if(!exists)return json(res,404,{error:{code:'POST_NOT_FOUND',message:'Post not found or not visible to this account.'}});if(exists.moderationState!=='approved'&&!isStaff(s))return json(res,409,{error:{code:'POST_PENDING_MODERATION',message:'Comments are disabled until this post is approved.'}});const commentId=id('comment');await sql`INSERT INTO collaboration_comments(id,post_id,author_user_id,body) VALUES(${commentId},${postId},${s.user_id},${body})`;await writeAudit({actorUserId:s.user_id,action:'collaboration.comment.create',entityType:'collaboration_comment',entityId:commentId});return json(res,201,{ok:true,id:commentId});
  }
  if(req.method==='POST'&&action==='report'){
   const postId=clean(b.postId,120),reason=clean(b.reason,500);if(!postId||!reason)return json(res,400,{error:{code:'INVALID_REPORT',message:'postId and reason are required.'}});const visible=await canReadPost(s,postId);if(!visible)return json(res,404,{error:{code:'POST_NOT_FOUND',message:'Post not found or not visible to this account.'}});const duplicate=await sql`SELECT id FROM collaboration_reports WHERE post_id=${postId} AND reporter_user_id=${s.user_id} AND status='open' LIMIT 1`;if(duplicate.rows.length)return json(res,409,{error:{code:'REPORT_ALREADY_OPEN',message:'You already have an open report for this post.'},reportId:duplicate.rows[0].id,status:'open'});const reportId=id('report');await sql`INSERT INTO collaboration_reports(id,post_id,reporter_user_id,reason,status) VALUES(${reportId},${postId},${s.user_id},${reason},'open')`;await writeAudit({actorUserId:s.user_id,action:'collaboration.post.report',entityType:'collaboration_post',entityId:postId,metadata:{reportId}});return json(res,201,{ok:true,id:reportId,status:'open'});
  }
  return json(res,400,{error:{code:'INVALID_ACTION',message:'Supported actions: post, comment, report, moderate, project_create, project_join, project_transition, project_moderate.'}});
 }catch(e){return json(res,e.status||500,{error:{code:e.code||'COLLABORATION_FAILED',message:e.status?e.message:'Unable to process collaboration request.'}})}
}
