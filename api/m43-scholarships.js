import { json, id } from './_lib/security.js';
import { requireAuth, hasRole } from './_lib/auth.js';
import { sql } from './_lib/db.js';

export const config={runtime:'nodejs'};

function cleanRecord(x){
  return {
    id:String(x.id||id('sch')),
    title:String(x.title||'').trim().slice(0,240),
    provider:String(x.provider||'').trim().slice(0,160),
    country:x.country?String(x.country).slice(0,80):null,
    level:x.level?String(x.level).slice(0,80):null,
    fields:Array.isArray(x.fields)?x.fields.map(v=>String(v).slice(0,80)).slice(0,30):[],
    eligibility:x.eligibility&&typeof x.eligibility==='object'?x.eligibility:{},
    amountText:x.amountText?String(x.amountText).slice(0,240):null,
    deadline:x.deadline||null,
    sourceUrl:x.sourceUrl?String(x.sourceUrl).slice(0,1000):null,
  };
}

export default async function handler(req,res){
  try{
    const s=await requireAuth(req);
    if(req.method==='GET'){
      const country=req.query?.country?String(req.query.country):null;
      const level=req.query?.level?String(req.query.level):null;
      const field=req.query?.field?String(req.query.field):null;
      const r=await sql`SELECT id,title,provider,country,level,fields,eligibility,amount_text AS "amountText",deadline,source_url AS "sourceUrl" FROM scholarships WHERE status='published' AND (${country}::text IS NULL OR country=${country}) AND (${level}::text IS NULL OR level=${level}) AND (${field}::text IS NULL OR fields ? ${field}) ORDER BY deadline NULLS LAST,title ASC LIMIT 200`;
      return json(res,200,{ok:true,results:r.rows});
    }
    if(!hasRole(s,'admin')) return json(res,403,{error:{code:'FORBIDDEN',message:'Administrator role required.'}});
    if(req.method==='POST'){
      const x=cleanRecord(req.body||{});
      if(!x.title||!x.provider) return json(res,400,{error:{code:'INVALID_SCHOLARSHIP',message:'title and provider are required.'}});
      await sql`INSERT INTO scholarships(id,title,provider,country,level,fields,eligibility,amount_text,deadline,source_url,status,created_by) VALUES(${x.id},${x.title},${x.provider},${x.country},${x.level},${JSON.stringify(x.fields)}::jsonb,${JSON.stringify(x.eligibility)}::jsonb,${x.amountText},${x.deadline||null},${x.sourceUrl},'draft',${s.user_id}) ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,provider=EXCLUDED.provider,country=EXCLUDED.country,level=EXCLUDED.level,fields=EXCLUDED.fields,eligibility=EXCLUDED.eligibility,amount_text=EXCLUDED.amount_text,deadline=EXCLUDED.deadline,source_url=EXCLUDED.source_url,updated_at=NOW()`;
      return json(res,201,{ok:true,id:x.id,status:'draft'});
    }
    if(req.method==='PUT'){
      const scholarshipId=String(req.query?.id||'');
      const status=String(req.body?.status||'');
      if(!['draft','published','archived'].includes(status)) return json(res,400,{error:{code:'INVALID_STATUS',message:'Invalid scholarship status.'}});
      await sql`UPDATE scholarships SET status=${status},updated_at=NOW() WHERE id=${scholarshipId}`;
      return json(res,200,{ok:true,id:scholarshipId,status});
    }
    return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET, POST or PUT required.'}},{Allow:'GET, POST, PUT'});
  }catch(e){return json(res,e.status||500,{error:{code:e.code||'SCHOLARSHIP_FAILED',message:e.status?e.message:'Unable to process scholarship request.'}});}
}
