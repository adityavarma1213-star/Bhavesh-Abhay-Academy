import { json, id, writeAudit } from './_lib/security.js';
import { requireAuth, hasRole } from './_lib/auth.js';
import { sql } from './_lib/db.js';

export const config={runtime:'nodejs'};

const PROVIDER_URL=String(process.env.BAA_SCHOLARSHIPS_PROVIDER_URL||'').trim();
const PROVIDER_TOKEN=String(process.env.BAA_SCHOLARSHIPS_PROVIDER_TOKEN||'').trim();
const PROVIDER_TIMEOUT_MS=8000;
const MAX_RESULTS=200;

function cleanRecord(x){
  const deadline=x.deadline||null;
  return {
    id:String(x.id||id('sch')).trim().slice(0,120),
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

function noStore(res){res.setHeader('Cache-Control','private, no-store, max-age=0');}
function isHttpsUrl(value){return typeof value==='string'&&/^https:\/\//i.test(value);}

async function fetchProvider(req){
  if(!PROVIDER_URL)return {configured:false,results:[],message:'Scholarship provider is not configured. Live scholarship data is unavailable.'};
  let target;
  try{
    const base=new URL(PROVIDER_URL);
    if(base.protocol!=='https:')return {configured:true,results:[],message:'Scholarship provider URL must use HTTPS.'};
    const params=new URLSearchParams();
    for(const key of ['country','level','field']){
      const value=String(req.query?.[key]||'').trim().slice(0,80);
      if(value)params.set(key,value);
    }
    target=new URL(base.toString());
    for(const [key,value] of params)target.searchParams.set(key,value);
  }catch{return {configured:true,results:[],message:'Scholarship provider URL is invalid.'};}

  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),PROVIDER_TIMEOUT_MS);
  try{
    const response=await fetch(target.toString(),{method:'GET',headers:{Accept:'application/json',...(PROVIDER_TOKEN?{Authorization:`Bearer ${PROVIDER_TOKEN}`}:{})},signal:controller.signal,redirect:'manual'});
    if(response.status>=300&&response.status<400)return {configured:true,results:[],message:'Scholarship provider redirect blocked for security.'};
    if(!response.ok)return {configured:true,results:[],message:`Scholarship provider returned HTTP ${response.status}.`};
    const body=await response.json();
    const source=Array.isArray(body)?body:Array.isArray(body?.results)?body.results:Array.isArray(body?.scholarships)?body.scholarships:[];
    const results=source.map(cleanRecord).filter(x=>x.title&&x.provider&&isHttpsUrl(x.sourceUrl)).slice(0,MAX_RESULTS);
    return {configured:true,results,message:null};
  }catch(error){
    return {configured:true,results:[],message:error?.name==='AbortError'?'Scholarship provider timed out.':'Scholarship provider could not be reached.'};
  }finally{clearTimeout(timer);}
}

export default async function handler(req,res){
  noStore(res);
  try{
    const s=await requireAuth(req);
    if(req.method==='GET'){
      const country=req.query?.country?String(req.query.country).trim().slice(0,80):null;
      const level=req.query?.level?String(req.query.level).trim().slice(0,80):null;
      const field=req.query?.field?String(req.query.field).trim().slice(0,80):null;
      const local=await sql`SELECT id,title,provider,country,level,fields,eligibility,amount_text AS "amountText",deadline,source_url AS "sourceUrl" FROM scholarships WHERE status='published' AND source_url IS NOT NULL AND source_url LIKE 'https://%' AND (${country}::text IS NULL OR country=${country}) AND (${level}::text IS NULL OR level=${level}) AND (${field}::text IS NULL OR fields ? ${field}) AND (deadline IS NULL OR deadline>=CURRENT_DATE) ORDER BY deadline NULLS LAST,title ASC LIMIT 200`;
      const provider=await fetchProvider(req);
      const seen=new Set();
      const results=[...provider.results,...local.rows].filter(item=>{const key=String(item.sourceUrl||item.id||'');if(!key||seen.has(key))return false;seen.add(key);return true;}).slice(0,MAX_RESULTS);
      if(provider.configured&&provider.results.length)await writeAudit({actorUserId:s.user_id,action:'scholarship.search',entityType:'scholarship_provider',entityId:'m43',metadata:{providerResultCount:provider.results.length}}).catch(()=>{});
      return json(res,200,{ok:true,results,providerConfigured:provider.configured,live:provider.results.length>0,sourcePolicy:{publishedResultsRequireHttpsSource:true,providerResultsRequireHttpsSource:true,providerRedirectsBlocked:true},message:provider.message});
    }
    if(!hasRole(s,'admin'))return json(res,403,{error:{code:'FORBIDDEN',message:'Administrator role required.'}});
    if(req.method==='POST'){
      const x=cleanRecord(req.body||{});
      if(!x.title||!x.provider)return json(res,400,{error:{code:'INVALID_SCHOLARSHIP',message:'title and provider are required.'}});
      if(x.sourceUrl&&!isHttpsUrl(x.sourceUrl))return json(res,400,{error:{code:'INVALID_SOURCE_URL',message:'sourceUrl must use HTTPS.'}});
      await sql`INSERT INTO scholarships(id,title,provider,country,level,fields,eligibility,amount_text,deadline,source_url,status,created_by) VALUES(${x.id},${x.title},${x.provider},${x.country},${x.level},${JSON.stringify(x.fields)}::jsonb,${JSON.stringify(x.eligibility)}::jsonb,${x.amountText},${x.deadline||null},${x.sourceUrl},'draft',${s.user_id}) ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,provider=EXCLUDED.provider,country=EXCLUDED.country,level=EXCLUDED.level,fields=EXCLUDED.fields,eligibility=EXCLUDED.eligibility,amount_text=EXCLUDED.amount_text,deadline=EXCLUDED.deadline,source_url=EXCLUDED.source_url,updated_at=NOW()`;
      await writeAudit({actorUserId:s.user_id,action:'SCHOLARSHIP_UPSERT',entityType:'scholarship',entityId:x.id,metadata:{status:'draft',hasHttpsSource:isHttpsUrl(x.sourceUrl)}});
      return json(res,201,{ok:true,id:x.id,status:'draft'});
    }
    if(req.method==='PUT'){
      const scholarshipId=String(req.query?.id||'').trim();
      const status=String(req.body?.status||'');
      if(!scholarshipId)return json(res,400,{error:{code:'INVALID_ID',message:'Scholarship id is required.'}});
      if(!['draft','published','archived'].includes(status))return json(res,400,{error:{code:'INVALID_STATUS',message:'Invalid scholarship status.'}});
      if(status==='published'){
        const source=await sql`SELECT source_url AS "sourceUrl" FROM scholarships WHERE id=${scholarshipId} LIMIT 1`;
        if(!source.rows.length)return json(res,404,{error:{code:'SCHOLARSHIP_NOT_FOUND',message:'Scholarship not found.'}});
        if(!isHttpsUrl(source.rows[0].sourceUrl))return json(res,400,{error:{code:'PUBLISH_SOURCE_REQUIRED',message:'A published scholarship must have an HTTPS sourceUrl that applicants can verify.'}});
      }
      const r=await sql`UPDATE scholarships SET status=${status},updated_at=NOW() WHERE id=${scholarshipId} RETURNING id`;
      if(!r.rows.length)return json(res,404,{error:{code:'SCHOLARSHIP_NOT_FOUND',message:'Scholarship not found.'}});
      await writeAudit({actorUserId:s.user_id,action:'SCHOLARSHIP_STATUS_CHANGE',entityType:'scholarship',entityId:scholarshipId,metadata:{status,sourceVerified:status==='published'}});
      return json(res,200,{ok:true,id:scholarshipId,status});
    }
    return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET, POST or PUT required.'}},{Allow:'GET, POST, PUT'});
  }catch(e){return json(res,e.status||500,{error:{code:e.code||'SCHOLARSHIP_FAILED',message:e.status?e.message:'Unable to process scholarship request.'}});}
}
