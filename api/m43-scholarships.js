import { json, id, writeAudit } from './_lib/security.js';
import { requireAuth, hasRole } from './_lib/auth.js';
import { sql } from './_lib/db.js';

export const config={runtime:'nodejs'};

function cleanRecord(x){
  const deadline=x.deadline||null;
  return {
    id:String(x.id||id('sch')),
    title:String(x.title||'').trim().slice(0,240),
    provider:String(x.provider||'').trim().slice(0,160),
    country:x.country?String(x.country).trim().slice(0,80):null,
    level:x.level?String(x.level).trim().slice(0,80):null,
    fields:Array.isArray(x.fields)?[...new Set(x.fields.map(v=>String(v).trim().slice(0,80)).filter(Boolean))].slice(0,30):[],
    eligibility:x.eligibility&&typeof x.eligibility==='object'?x.eligibility:{},
    amountText:x.amountText?String(x.amountText).trim().slice(0,240):null,
    deadline:/^\d{4}-\d{2}-\d{2}$/.test(String(deadline))?String(deadline):null,
    sourceUrl:x.sourceUrl?String(x.sourceUrl).trim().slice(0,1000):null,
  };
}

export default async function handler(req,res){
  try{
    const s=await requireAuth(req);
    if(req.method==='GET'){
      const country=req.query?.country?String(req.query.country).trim().slice(0,80):null;
      const level=req.query?.level?String(req.query.level).trim().slice(0,80):null;
      const field=req.query?.field?String(req.query.field).trim().slice(0,80):null;
      const r=await sql`SELECT id,title,provider,country,level,fields,eligibility,amount_text AS "amountText",deadline,source_url AS "sourceUrl" FROM scholarships WHERE status='published' AND (${country}::text IS NULL OR country=${country}) AND (${level}::text IS NULL OR level=${level}) AND (${field}::text IS NULL OR fields ? ${field}) AND (deadline IS NULL OR deadline>=CURRENT_DATE) ORDER BY deadline NULLS LAST,title ASC LIMIT 200`;
      return json(res,200,{ok:true,results:r.rows});
    }
    if(!hasRole(s,'admin')) return json(res,403,{error:{code:'FORBIDDEN',message:'Administrator role required.'}});
    if(req.method==='POST'){
      const x=cleanRecord(req.body||{});
      if(!x.title||!x.provider) return json(res,400,{error:{code:'INVALID_SCHOLARSHIP',message:'title and provider are required.'}});
      if(x.sourceUrl&&!/^https:\/\//i.test(x.sourceUrl)) return json(res,400,{error:{code:'INVALID_SOURCE_URL',message:'sourceUrl must use HTTPS.'}});
      await sql`INSERT INTO scholarships(id,title,provider,country,level,fields,eligibility,amount_text,deadline,source_url,status,created_by) VALUES(${x.id},${x.title},${x.provider},${x.country},${x.level},${JSON.stringify(x.fields)}::jsonb,${JSON.stringify(x.eligibility)}::jsonb,${x.amountText},${x.deadline||null},${x.sourceUrl},'draft',${s.user_id}) ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,provider=EXCLUDED.provider,country=EXCLUDED.country,level=EXCLUDED.level,fields=EXCLUDED.fields,eligibility=EXCLUDED.eligibility,amount_text=EXCLUDED.amount_text,deadline=EXCLUDED.deadline,source_url=EXCLUDED.source_url,updated_at=NOW()`;
      await writeAudit({actorUserId:s.user_id,action:'SCHOLARSHIP_UPSERT',entityType:'scholarship',entityId:x.id,metadata:{status:'draft'}});
      return json(res,201,{ok:true,id:x.id,status:'draft'});
    }
    if(req.method==='PUT'){
      const scholarshipId=String(req.query?.id||'').trim();
      const status=String(req.body?.status||'');
      if(!scholarshipId) return json(res,400,{error:{code:'INVALID_ID',message:'Scholarship id is required.'}});
      if(!['draft','published','archived'].includes(status)) return json(res,400,{error:{code:'INVALID_STATUS',message:'Invalid scholarship status.'}});
      const r=await sql`UPDATE scholarships SET status=${status},updated_at=NOW() WHERE id=${scholarshipId} RETURNING id`;
      if(!r.rows.length) return json(res,404,{error:{code:'SCHOLARSHIP_NOT_FOUND',message:'Scholarship not found.'}});
      await writeAudit({actorUserId:s.user_id,action:'SCHOLARSHIP_STATUS_CHANGE',entityType:'scholarship',entityId:scholarshipId,metadata:{status}});
      return json(res,200,{ok:true,id:scholarshipId,status});
    }
    return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET, POST or PUT required.'}},{Allow:'GET, POST, PUT'});
  }catch(e){return json(res,e.status||500,{error:{code:e.code||'SCHOLARSHIP_FAILED',message:e.status?e.message:'Unable to process scholarship request.'}});}
}
