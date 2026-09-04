import { json, id, writeAudit } from './_lib/security.js';
import { requireAuth, hasRole, requireLearnerAccess } from './_lib/auth.js';
import { sql } from './_lib/db.js';

export const config={runtime:'nodejs'};

const VERIFICATION=['unverified','pending','verified','rejected','suspended'];
const SAFEGUARDING=['not_configured','pending','verified','expired'];
const REQUEST_STATUS=['requested','accepted','declined','cancelled','completed'];
const REQUEST_TRANSITIONS={requested:new Set(['accepted','declined','cancelled']),accepted:new Set(['completed','cancelled']),declined:new Set([]),cancelled:new Set([]),completed:new Set([])};
const MAX_MENTOR_ID_CHARS=160;
const MAX_LEARNER_ID_CHARS=160;
const MAX_DISPLAY_NAME_CHARS=160;
const MAX_BIO_CHARS=4000;
const MAX_CURRENCY_CHARS=8;
const MAX_NOTES_CHARS=4000;
const MAX_SUBJECT_CHARS=120;
const MAX_SUBJECTS=50;

function noStore(res){res.setHeader('Cache-Control','private, no-store, max-age=0');}
function clampLimit(value){
  if(value===undefined||value===null||value==='') return 100;
  const n=Number(value);
  if(!Number.isFinite(n)||!Number.isInteger(n)||n<1){const e=new Error('limit must be a positive integer.');e.status=400;e.code='INVALID_LIMIT';throw e;}
  return Math.min(n,100);
}
function requireBounded(value,max,name,{required=false}={}){
  if(typeof value!=='string'){
    if(required){const e=new Error(`${name} is required.`);e.status=400;e.code='REQUIRED_VALUE';throw e;}
    return '';
  }
  const raw=value.trim();
  if(required&&!raw){const e=new Error(`${name} is required.`);e.status=400;e.code='REQUIRED_VALUE';throw e;}
  if(raw.length>max){const e=new Error(`${name} exceeds the maximum length of ${max} characters.`);e.status=400;e.code='VALUE_TOO_LONG';throw e;}
  return raw;
}
function readCursor(query){
  const displayName=requireBounded(query?.cursorDisplayName,160,'cursorDisplayName');
  const idValue=requireBounded(query?.cursorId,160,'cursorId');
  if(!displayName&&!idValue) return null;
  if(!displayName||!idValue){const e=new Error('cursorDisplayName and cursorId are both required.');e.status=400;e.code='INVALID_CURSOR';throw e;}
  return {displayName,id:idValue};
}
function readSubjects(value){
  if(!Array.isArray(value)) return [];
  if(value.length>MAX_SUBJECTS){const e=new Error(`subjects must contain at most ${MAX_SUBJECTS} items.`);e.status=400;e.code='TOO_MANY_SUBJECTS';throw e;}
  return value.map((item)=>requireBounded(item,MAX_SUBJECT_CHARS,'subject',{required:true}));
}
function readOptionalNumber(value,name){
  if(value===undefined||value===null||value==='') return null;
  const n=Number(value);
  if(!Number.isFinite(n)||n<0){const e=new Error(`${name} must be a non-negative number.`);e.status=400;e.code='INVALID_NUMBER';throw e;}
  return n;
}

async function enforceParentMentorPolicy(session, learnerId){
  if(!learnerId || hasRole(session,'admin')) return;
  const r=await sql`SELECT mentor_enabled FROM parent_ai_policies WHERE learner_id=${learnerId} LIMIT 1`;
  if(r.rows[0] && r.rows[0].mentor_enabled === false){
    const e=new Error('Mentor access is disabled by the active parent approval policy.');
    e.status=403; e.code='AI_MENTOR_DISABLED_BY_PARENT_POLICY'; throw e;
  }
}

export default async function handler(req,res){
  noStore(res);
  try{
    const s=await requireAuth(req);
    if(req.method==='GET'){
      const subject=req.query?.subject?requireBounded(req.query.subject,MAX_SUBJECT_CHARS,'subject'):null;
      const limit=clampLimit(req.query?.limit);
      const cursor=readCursor(req.query);
      const r=cursor
        ? await sql`SELECT id,display_name AS "displayName",bio,subjects,verification_status AS "verificationStatus",safeguarding_status AS "safeguardingStatus",hourly_rate_minor AS "hourlyRateMinor",currency,availability FROM mentor_profiles WHERE verification_status='verified' AND safeguarding_status='verified' AND (${subject}::text IS NULL OR subjects ? ${subject}) AND (display_name,id) > (${cursor.displayName},${cursor.id}) ORDER BY display_name ASC,id ASC LIMIT ${limit+1}`
        : await sql`SELECT id,display_name AS "displayName",bio,subjects,verification_status AS "verificationStatus",safeguarding_status AS "safeguardingStatus",hourly_rate_minor AS "hourlyRateMinor",currency,availability FROM mentor_profiles WHERE verification_status='verified' AND safeguarding_status='verified' AND (${subject}::text IS NULL OR subjects ? ${subject}) ORDER BY display_name ASC,id ASC LIMIT ${limit+1}`;
      const rows=r.rows||[]; const hasMore=rows.length>limit; const results=hasMore?rows.slice(0,limit):rows; const last=results[results.length-1];
      const nextCursor=hasMore&&last?{cursorDisplayName:last.displayName,cursorId:last.id}:null;
      return json(res,200,{ok:true,results,nextCursor});
    }
    if(req.method==='POST'){
      const b=req.body||{};
      if(hasRole(s,'student')||hasRole(s,'parent')){
        const mentorId=requireBounded(b.mentorId,MAX_MENTOR_ID_CHARS,'mentorId',{required:true});
        const learnerId=requireBounded(b.learnerId,MAX_LEARNER_ID_CHARS,'learnerId',{required:true});
        const access=await sql`SELECT 1 FROM learners l WHERE l.id=${learnerId} AND l.user_id=${s.user_id} AND l.deactivated_at IS NULL UNION SELECT 1 FROM parent_learner p WHERE p.learner_id=${learnerId} AND p.parent_user_id=${s.user_id} AND p.status='active' LIMIT 1`;
        if(!access.rows.length&&!hasRole(s,'admin')) return json(res,403,{error:{code:'LEARNER_FORBIDDEN',message:'You are not authorized to request mentoring for this learner.'}});
        await enforceParentMentorPolicy(s,learnerId);
        const mentor=await sql`SELECT id FROM mentor_profiles WHERE id=${mentorId} AND verification_status='verified' AND safeguarding_status='verified' LIMIT 1`;
        if(!mentor.rows.length) return json(res,409,{error:{code:'MENTOR_UNAVAILABLE',message:'Mentor is not currently verified and safeguarded.'}});
        const existing=await sql`SELECT id FROM mentor_requests WHERE mentor_id=${mentorId} AND learner_id=${learnerId} AND status IN ('requested','accepted') LIMIT 1`;
        if(existing.rows.length) return json(res,409,{error:{code:'MENTOR_REQUEST_EXISTS',message:'An active mentoring request already exists for this mentor and learner.',requestId:existing.rows[0].id}});
        const requestedStart=b.requestedStart?new Date(b.requestedStart):null;
        if(requestedStart && Number.isNaN(requestedStart.getTime())) return json(res,400,{error:{code:'INVALID_REQUESTED_START',message:'requestedStart must be a valid date-time.'}});
        const notes=requireBounded(b.notes,MAX_NOTES_CHARS,'notes');
        const requestId=id('mreq');
        await sql`INSERT INTO mentor_requests(id,mentor_id,learner_id,status,requested_start,notes) VALUES(${requestId},${mentorId},${learnerId},'requested',${requestedStart?requestedStart.toISOString():null},${notes})`;
        await writeAudit({actorUserId:s.user_id,action:'mentor.request.create',entityType:'mentor_request',entityId:requestId,metadata:{mentorId,learnerId}});
        return json(res,201,{ok:true,id:requestId,status:'requested'});
      }
      if(!hasRole(s,'admin')) return json(res,403,{error:{code:'FORBIDDEN',message:'Student/parent request or administrator management required.'}});
      const p=b.profile||{};
      const displayName=requireBounded(p.displayName,MAX_DISPLAY_NAME_CHARS,'displayName',{required:true});
      const bio=requireBounded(p.bio,MAX_BIO_CHARS,'bio');
      const subjects=readSubjects(p.subjects);
      const mentorId=p.id==null||p.id===''?id('mentor'):requireBounded(p.id,MAX_MENTOR_ID_CHARS,'mentorId',{required:true});
      const currency=requireBounded(p.currency==null?'INR':p.currency,MAX_CURRENCY_CHARS,'currency',{required:true});
      const hourlyRateMinor=readOptionalNumber(p.hourlyRateMinor,'hourlyRateMinor');
      const userId=p.userId==null||p.userId===''?null:requireBounded(p.userId,MAX_MENTOR_ID_CHARS,'userId');
      const availability=p.availability==null?{}:p.availability;
      if(typeof availability!=='object'||Array.isArray(availability)){const e=new Error('availability must be an object.');e.status=400;e.code='INVALID_AVAILABILITY';throw e;}
      await sql`INSERT INTO mentor_profiles(id,user_id,display_name,bio,subjects,verification_status,safeguarding_status,hourly_rate_minor,currency,availability) VALUES(${mentorId},${userId},${displayName},${bio},${JSON.stringify(subjects)}::jsonb,'unverified','not_configured',${hourlyRateMinor},${currency},${JSON.stringify(availability)}::jsonb) ON CONFLICT(id) DO UPDATE SET display_name=EXCLUDED.display_name,bio=EXCLUDED.bio,subjects=EXCLUDED.subjects,hourly_rate_minor=EXCLUDED.hourly_rate_minor,currency=EXCLUDED.currency,availability=EXCLUDED.availability,updated_at=NOW()`;
      await writeAudit({actorUserId:s.user_id,action:'mentor.profile.upsert',entityType:'mentor_profile',entityId:mentorId,metadata:{subjectsCount:subjects.length}});
      return json(res,201,{ok:true,id:mentorId,status:'unverified'});
    }
    if(req.method==='PATCH'){
      if(!hasRole(s,'admin')) return json(res,403,{error:{code:'FORBIDDEN',message:'Administrator role required.'}});
      const mentorId=requireBounded(req.query?.id,MAX_MENTOR_ID_CHARS,'mentorId',{required:true});
      const verification=String(req.body?.verificationStatus||'');
      const safeguarding=String(req.body?.safeguardingStatus||'');
      if(!VERIFICATION.includes(verification)||!SAFEGUARDING.includes(safeguarding)) return json(res,400,{error:{code:'INVALID_VERIFICATION_STATE',message:'Valid mentor id, verificationStatus and safeguardingStatus are required.'}});
      if(verification==='verified'&&safeguarding!=='verified') return json(res,409,{error:{code:'SAFEGUARDING_REQUIRED',message:'A mentor cannot be verified for marketplace use until safeguarding is verified.'}});
      const updated=await sql`UPDATE mentor_profiles SET verification_status=${verification},safeguarding_status=${safeguarding},updated_at=NOW() WHERE id=${mentorId} RETURNING id`;
      if(!updated.rows.length) return json(res,404,{error:{code:'MENTOR_NOT_FOUND',message:'Mentor profile not found.'}});
      await writeAudit({actorUserId:s.user_id,action:'mentor.profile.status',entityType:'mentor_profile',entityId:mentorId,metadata:{verificationStatus:verification,safeguardingStatus:safeguarding}});
      return json(res,200,{ok:true,id:mentorId,verificationStatus:verification,safeguardingStatus:safeguarding});
    }
    if(req.method==='PUT'&&req.query?.action==='request-status'){
      if(!hasRole(s,'admin')&&!hasRole(s,'teacher')) return json(res,403,{error:{code:'FORBIDDEN',message:'Administrator or teacher role required.'}});
      const requestId=requireBounded(req.query?.id,MAX_MENTOR_ID_CHARS,'requestId',{required:true}); const status=String(req.body?.status||'');
      if(!REQUEST_STATUS.includes(status)) return json(res,400,{error:{code:'INVALID_REQUEST_STATUS',message:'Valid request id and status are required.'}});
      const request=await sql`SELECT id,mentor_id,learner_id,status FROM mentor_requests WHERE id=${requestId} LIMIT 1`;
      if(!request.rows.length) return json(res,404,{error:{code:'MENTOR_REQUEST_NOT_FOUND',message:'Mentoring request not found.'}});
      const currentStatus=request.rows[0].status;
      if(currentStatus!==status&&!REQUEST_TRANSITIONS[currentStatus]?.has(status)) return json(res,409,{error:{code:'INVALID_REQUEST_TRANSITION',message:`Mentoring request cannot transition from ${currentStatus} to ${status}.`}});
      if(hasRole(s,'teacher')) await requireLearnerAccess(s,request.rows[0].learner_id);
      const updated=await sql`UPDATE mentor_requests SET status=${status},updated_at=NOW() WHERE id=${requestId} RETURNING id,mentor_id AS "mentorId",learner_id AS "learnerId",status`;
      await writeAudit({actorUserId:s.user_id,action:'mentor.request.status',entityType:'mentor_request',entityId:requestId,metadata:{fromStatus:currentStatus,status,learnerId:request.rows[0].learner_id}});
      return json(res,200,{ok:true,request:updated.rows[0]});
    }
    return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET, POST, PATCH or request-status PUT required.'}},{Allow:'GET, POST, PATCH, PUT'});
  }catch(e){return json(res,e.status||500,{error:{code:e.code||'MENTOR_FAILED',message:e.status?e.message:'Unable to process mentor request.'}});}
}
