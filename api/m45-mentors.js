import { json, id, writeAudit } from './_lib/security.js';
import { requireAuth, hasRole } from './_lib/auth.js';
import { sql } from './_lib/db.js';

export const config={runtime:'nodejs'};

const VERIFICATION=['unverified','pending','verified','rejected','suspended'];
const SAFEGUARDING=['not_configured','pending','verified','expired'];
const REQUEST_STATUS=['requested','accepted','declined','cancelled','completed'];

export default async function handler(req,res){
  try{
    const s=await requireAuth(req);
    if(req.method==='GET'){
      const subject=req.query?.subject?String(req.query.subject).slice(0,120):null;
      const r=await sql`SELECT id,display_name AS "displayName",bio,subjects,verification_status AS "verificationStatus",safeguarding_status AS "safeguardingStatus",hourly_rate_minor AS "hourlyRateMinor",currency,availability FROM mentor_profiles WHERE verification_status='verified' AND safeguarding_status='verified' AND (${subject}::text IS NULL OR subjects ? ${subject}) ORDER BY display_name ASC LIMIT 100`;
      return json(res,200,{ok:true,results:r.rows});
    }
    if(req.method==='POST'){
      const b=req.body||{};
      if(hasRole(s,'student')||hasRole(s,'parent')){
        const mentorId=String(b.mentorId||''); const learnerId=String(b.learnerId||'');
        if(!mentorId||!learnerId) return json(res,400,{error:{code:'INVALID_MENTOR_REQUEST',message:'mentorId and learnerId are required.'}});
        const access=await sql`SELECT 1 FROM learners l WHERE l.id=${learnerId} AND l.user_id=${s.user_id} AND l.deactivated_at IS NULL UNION SELECT 1 FROM parent_learner p WHERE p.learner_id=${learnerId} AND p.parent_user_id=${s.user_id} AND p.status='active' LIMIT 1`;
        if(!access.rows.length&&!hasRole(s,'admin')) return json(res,403,{error:{code:'LEARNER_FORBIDDEN',message:'You are not authorized to request mentoring for this learner.'}});
        const mentor=await sql`SELECT id FROM mentor_profiles WHERE id=${mentorId} AND verification_status='verified' AND safeguarding_status='verified' LIMIT 1`;
        if(!mentor.rows.length) return json(res,409,{error:{code:'MENTOR_UNAVAILABLE',message:'Mentor is not currently verified and safeguarded.'}});
        const existing=await sql`SELECT id FROM mentor_requests WHERE mentor_id=${mentorId} AND learner_id=${learnerId} AND status IN ('requested','accepted') LIMIT 1`;
        if(existing.rows.length) return json(res,409,{error:{code:'MENTOR_REQUEST_EXISTS',message:'An active mentoring request already exists for this mentor and learner.',requestId:existing.rows[0].id}});
        const requestedStart=b.requestedStart?new Date(b.requestedStart):null;
        if(requestedStart && Number.isNaN(requestedStart.getTime())) return json(res,400,{error:{code:'INVALID_REQUESTED_START',message:'requestedStart must be a valid date-time.'}});
        const requestId=id('mreq');
        await sql`INSERT INTO mentor_requests(id,mentor_id,learner_id,status,requested_start,notes) VALUES(${requestId},${mentorId},${learnerId},'requested',${requestedStart?requestedStart.toISOString():null},${String(b.notes||'').slice(0,4000)})`;
        await writeAudit({actorUserId:s.user_id,action:'mentor.request.create',entityType:'mentor_request',entityId:requestId,metadata:{mentorId,learnerId}});
        return json(res,201,{ok:true,id:requestId,status:'requested'});
      }
      if(!hasRole(s,'admin')) return json(res,403,{error:{code:'FORBIDDEN',message:'Student/parent request or administrator management required.'}});
      const p=b.profile||{};
      if(!String(p.displayName||'').trim()) return json(res,400,{error:{code:'INVALID_MENTOR',message:'displayName is required.'}});
      const subjects=Array.isArray(p.subjects)?p.subjects.map(x=>String(x).trim()).filter(Boolean).slice(0,50):[];
      const mentorId=String(p.id||id('mentor'));
      await sql`INSERT INTO mentor_profiles(id,user_id,display_name,bio,subjects,verification_status,safeguarding_status,hourly_rate_minor,currency,availability) VALUES(${mentorId},${p.userId||null},${String(p.displayName).trim().slice(0,160)},${String(p.bio||'').slice(0,4000)},${JSON.stringify(subjects)}::jsonb,'unverified','not_configured',${p.hourlyRateMinor==null?null:Number(p.hourlyRateMinor)},${String(p.currency||'INR').slice(0,8)},${JSON.stringify(p.availability||{})}::jsonb) ON CONFLICT(id) DO UPDATE SET display_name=EXCLUDED.display_name,bio=EXCLUDED.bio,subjects=EXCLUDED.subjects,hourly_rate_minor=EXCLUDED.hourly_rate_minor,currency=EXCLUDED.currency,availability=EXCLUDED.availability,updated_at=NOW()`;
      await writeAudit({actorUserId:s.user_id,action:'mentor.profile.upsert',entityType:'mentor_profile',entityId:mentorId,metadata:{subjectsCount:subjects.length}});
      return json(res,201,{ok:true,id:mentorId,status:'unverified'});
    }
    if(req.method==='PATCH'){
      if(!hasRole(s,'admin')) return json(res,403,{error:{code:'FORBIDDEN',message:'Administrator role required.'}});
      const mentorId=String(req.query?.id||'');
      const verification=String(req.body?.verificationStatus||'');
      const safeguarding=String(req.body?.safeguardingStatus||'');
      if(!mentorId||!VERIFICATION.includes(verification)||!SAFEGUARDING.includes(safeguarding)) return json(res,400,{error:{code:'INVALID_VERIFICATION_STATE',message:'Valid mentor id, verificationStatus and safeguardingStatus are required.'}});
      if(verification==='verified'&&safeguarding!=='verified') return json(res,409,{error:{code:'SAFEGUARDING_REQUIRED',message:'A mentor cannot be verified for marketplace use until safeguarding is verified.'}});
      const updated=await sql`UPDATE mentor_profiles SET verification_status=${verification},safeguarding_status=${safeguarding},updated_at=NOW() WHERE id=${mentorId} RETURNING id`;
      if(!updated.rows.length) return json(res,404,{error:{code:'MENTOR_NOT_FOUND',message:'Mentor profile not found.'}});
      await writeAudit({actorUserId:s.user_id,action:'mentor.profile.status',entityType:'mentor_profile',entityId:mentorId,metadata:{verificationStatus:verification,safeguardingStatus:safeguarding}});
      return json(res,200,{ok:true,id:mentorId,verificationStatus:verification,safeguardingStatus:safeguarding});
    }
    if(req.method==='PUT'&&req.query?.action==='request-status'){
      if(!hasRole(s,'admin')&&!hasRole(s,'teacher')) return json(res,403,{error:{code:'FORBIDDEN',message:'Administrator or teacher role required.'}});
      const requestId=String(req.query?.id||''); const status=String(req.body?.status||'');
      if(!requestId||!REQUEST_STATUS.includes(status)) return json(res,400,{error:{code:'INVALID_REQUEST_STATUS',message:'Valid request id and status are required.'}});
      const updated=await sql`UPDATE mentor_requests SET status=${status},updated_at=NOW() WHERE id=${requestId} RETURNING id,mentor_id AS "mentorId",learner_id AS "learnerId",status`;
      if(!updated.rows.length) return json(res,404,{error:{code:'MENTOR_REQUEST_NOT_FOUND',message:'Mentoring request not found.'}});
      await writeAudit({actorUserId:s.user_id,action:'mentor.request.status',entityType:'mentor_request',entityId:requestId,metadata:{status}});
      return json(res,200,{ok:true,request:updated.rows[0]});
    }
    return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET, POST, PATCH or request-status PUT required.'}},{Allow:'GET, POST, PATCH, PUT'});
  }catch(e){return json(res,e.status||500,{error:{code:e.code||'MENTOR_FAILED',message:e.status?e.message:'Unable to process mentor request.'}});}
}
