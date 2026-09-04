import { json, id, writeAudit } from './_lib/security.js';
import { requireAuth, hasRole } from './_lib/auth.js';
import { sql } from './_lib/db.js';
import { lookup } from 'node:dns/promises';
import net from 'node:net';

export const config={runtime:'nodejs'};

const PROVIDER_URL=String(process.env.BAA_SCHOLARSHIPS_PROVIDER_URL||'').trim();
const PROVIDER_TOKEN=String(process.env.BAA_SCHOLARSHIPS_PROVIDER_TOKEN||'').trim();
const PROVIDER_TIMEOUT_MS=8000;
const MAX_PROVIDER_BYTES=1024*1024;
const MAX_RESULTS=200;
const MAX_ID_CHARS=120;
const MAX_TITLE_CHARS=240;
const MAX_PROVIDER_NAME_CHARS=160;
const MAX_COUNTRY_CHARS=80;
const MAX_LEVEL_CHARS=80;
const MAX_SOURCE_URL_CHARS=1000;
function boundedText(value,max,name,{required=false,code='VALUE_TOO_LONG'}={}){
  if(value==null)return required?'':null;
  if(typeof value!=='string'){const e=new Error(`${name} must be a string.`);e.status=400;e.code='INVALID_VALUE';throw e;}
  const text=value.trim();
  if(required&&!text){const e=new Error(`${name} is required.`);e.status=400;e.code='REQUIRED_VALUE';throw e;}
  if(text.length>max){const e=new Error(`${name} must be at most ${max} characters.`);e.status=400;e.code=code;throw e;}
  return text;
}
function cleanRecord(x){
  const deadline=x.deadline||null;
  return {
    id:String(x.id||id('sch')).trim().slice(0,MAX_ID_CHARS),
    title:String(x.title||'').trim().slice(0,MAX_TITLE_CHARS),
    provider:String(x.provider||'').trim().slice(0,MAX_PROVIDER_NAME_CHARS),
    country:x.country?String(x.country).trim().slice(0,MAX_COUNTRY_CHARS):null,
    level:x.level?String(x.level).trim().slice(0,MAX_LEVEL_CHARS):null,
    fields:Array.isArray(x.fields)?[...new Set(x.fields.map(v=>String(v).trim().slice(0,80)).filter(Boolean))].slice(0,30):[],
    eligibility:x.eligibility&&typeof x.eligibility==='object'?x.eligibility:{},
    amountText:x.amountText?String(x.amountText).trim().slice(0,240):null,
    deadline:/^\d{4}-\d{2}-\d{2}$/.test(String(deadline))?String(deadline):null,
    sourceUrl:x.sourceUrl?String(x.sourceUrl).trim().slice(0,MAX_SOURCE_URL_CHARS):null,
  };
}
function noStore(res){res.setHeader('Cache-Control','private, no-store, max-age=0');}
function isHttpsUrl(value){return typeof value==='string'&&/^https:\/\//i.test(value);}
function isPrivateIpv4(host){
  const octets=host.split('.').map(Number);
  if(octets.length!==4||octets.some(n=>!Number.isInteger(n)||n<0||n>255))return true;
  const [a,b]=octets;
  return a===0||a===10||a===100&&b>=64&&b<=127||a===127||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||a>=224;
}
function ipv6ToBigInt(value){
  const clean=value.split('%')[0].toLowerCase();
  const mapped=clean.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if(mapped)return null;
  const parts=clean.split('::');
  if(parts.length>2)return null;
  const left=parts[0]?parts[0].split(':'):[];
  const right=parts.length===2&&parts[1]?parts[1].split(':'):[];
  if(left.some(x=>!x||!/^[0-9a-f]{1,4}$/.test(x))||right.some(x=>!x||!/^[0-9a-f]{1,4}$/.test(x)))return null;
  const missing=8-left.length-right.length;
  if(parts.length===1&&missing!==0||parts.length===2&&missing<1)return null;
  const words=[...left,...Array(Math.max(0,missing)).fill('0'),...right];
  if(words.length!==8)return null;
  return words.reduce((n,w)=>(n<<16n)+BigInt(parseInt(w,16)),0n);
}
function isPrivateIp(address){
  if(net.isIPv4(address))return isPrivateIpv4(address);
  if(!net.isIPv6(address))return true;
  const mapped=address.toLowerCase().replace(/^::ffff:/,'');
  if(net.isIPv4(mapped))return isPrivateIpv4(mapped);
  const n=ipv6ToBigInt(address);
  if(n===null)return true;
  const top7=n>>(128n-7n);
  const top10=n>>(128n-10n);
  const top64=n>>(128n-64n);
  return n===0n||n===1n||top7===0b1111111n||top7===0b1111110n||top10===0b1111111010n||top7===0b1111110n&&((n>>(128n-8n))&1n)===1n||top64===0n;
}
async function resolvesToPublicDnsHost(hostname){
  if(net.isIP(hostname))return !isPrivateIp(hostname);
  try{
    const answers=await lookup(hostname,{all:true,verbatim:true});
    if(!answers.length)return false;
    return answers.every(answer=>!isPrivateIp(answer.address));
  }catch{return false;}
}
function isSafeProviderUrl(value){
  try{
    const url=new URL(value);
    if(url.protocol!=='https:')return false;
    if(net.isIP(url.hostname))return false;
    const host=url.hostname.toLowerCase();
    if(host==='localhost'||host.endsWith('.localhost')||host==='metadata.google.internal'||host==='metadata')return false;
    return true;
  }catch{return false;}
}
async function fetchProvider(req){
  if(!PROVIDER_URL)return {configured:false,results:[],message:'Scholarship provider is not configured. Live scholarship data is unavailable.'};
  let target;
  try{
    const base=new URL(PROVIDER_URL);
    if(!isSafeProviderUrl(base.toString()))return {configured:true,results:[],message:'Scholarship provider URL must use HTTPS and a public DNS hostname.'};
    if(!(await resolvesToPublicDnsHost(base.hostname)))return {configured:true,results:[],message:'Scholarship provider hostname does not resolve exclusively to public addresses.'};
    const params=new URLSearchParams();
    for(const key of ['country','level','field']){
      const value=boundedText(req.query?.[key],key==='field'?80:key==='country'?MAX_COUNTRY_CHARS:MAX_LEVEL_CHARS,key,{required:false,code:'VALUE_TOO_LONG'});
      if(value)params.set(key,value);
    }
    target=new URL(base.toString());
    for(const [key,value] of params)target.searchParams.set(key,value);
  }catch(error){
    if(error?.status===400)throw error;
    return {configured:true,results:[],message:'Scholarship provider URL is invalid or not publicly reachable.'};
  }
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),PROVIDER_TIMEOUT_MS);
  try{
    const response=await fetch(target.toString(),{method:'GET',headers:{Accept:'application/json',...(PROVIDER_TOKEN?{Authorization:`Bearer ${PROVIDER_TOKEN}`}:{})},signal:controller.signal,redirect:'manual'});
    if(response.status>=300&&response.status<400)return {configured:true,results:[],message:'Scholarship provider redirect blocked for security.'};
    if(!response.ok)return {configured:true,results:[],message:`Scholarship provider returned HTTP ${response.status}.`};
    const declaredLength=Number(response.headers.get('content-length')||0);
    if(Number.isFinite(declaredLength)&&declaredLength>MAX_PROVIDER_BYTES)return {configured:true,results:[],message:'Scholarship provider response is too large.'};
    const bytes=await response.arrayBuffer();
    if(bytes.byteLength>MAX_PROVIDER_BYTES)return {configured:true,results:[],message:'Scholarship provider response is too large.'};
    let body;
    try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{return {configured:true,results:[],message:'Scholarship provider returned invalid JSON.'};}
    const source=Array.isArray(body)?body:Array.isArray(body?.results)?body.results:Array.isArray(body?.scholarships)?body.scholarships:[];
    const results=source.map(cleanRecord).filter(x=>x.title&&x.provider&&isHttpsUrl(x.sourceUrl)).slice(0,MAX_RESULTS);
    return {configured:true,results,message:null};
  }catch(error){return {configured:true,results:[],message:error?.name==='AbortError'?'Scholarship provider timed out.':'Scholarship provider could not be reached.'};}
  finally{clearTimeout(timer);}
}
export default async function handler(req,res){
  noStore(res);
  try{
    const s=await requireAuth(req);
    if(req.method==='GET'){
      const country=boundedText(req.query?.country,MAX_COUNTRY_CHARS,'country');
      const level=boundedText(req.query?.level,MAX_LEVEL_CHARS,'level');
      const field=boundedText(req.query?.field,80,'field');
      const local=await sql`SELECT id,title,provider,country,level,fields,eligibility,amount_text AS "amountText",deadline,source_url AS "sourceUrl" FROM scholarships WHERE status='published' AND source_url IS NOT NULL AND source_url LIKE 'https://%' AND (${country}::text IS NULL OR country=${country}) AND (${level}::text IS NULL OR level=${level}) AND (${field}::text IS NULL OR fields ? ${field}) AND (deadline IS NULL OR deadline>=CURRENT_DATE) ORDER BY deadline NULLS LAST,title ASC LIMIT 200`;
      const provider=await fetchProvider(req);
      const seen=new Set();
      const results=[...provider.results,...local.rows].filter(item=>{const key=String(item.sourceUrl||item.id||'');if(!key||seen.has(key))return false;seen.add(key);return true;}).slice(0,MAX_RESULTS);
      if(provider.configured&&provider.results.length)await writeAudit({actorUserId:s.user_id,action:'scholarship.search',entityType:'scholarship_provider',entityId:'m43',metadata:{providerResultCount:provider.results.length}}).catch(()=>{});
      return json(res,200,{ok:true,results,providerConfigured:provider.configured,live:provider.results.length>0,sourcePolicy:{publishedResultsRequireHttpsSource:true,providerResultsRequireHttpsSource:true,providerRedirectsBlocked:true,providerHostMustBeDnsName:true,providerDnsMustResolveToPublicAddresses:true,providerPayloadMaxBytes:MAX_PROVIDER_BYTES},message:provider.message});
    }
    if(!hasRole(s,'admin'))return json(res,403,{error:{code:'FORBIDDEN',message:'Administrator role required.'}});
    if(req.method==='POST'){
      const raw=req.body&&typeof req.body==='object'?req.body:{};
      const rawLengths=[['id',MAX_ID_CHARS],['title',MAX_TITLE_CHARS],['provider',MAX_PROVIDER_NAME_CHARS],['country',MAX_COUNTRY_CHARS],['level',MAX_LEVEL_CHARS],['sourceUrl',MAX_SOURCE_URL_CHARS]];
      for(const [field,max] of rawLengths){if(raw[field]!=null&&String(raw[field]).trim().length>max)return json(res,400,{error:{code:'VALUE_TOO_LONG',message:`${field} must be at most ${max} characters.`}});}
      const x=cleanRecord(raw);
      if(!x.title||!x.provider)return json(res,400,{error:{code:'INVALID_SCHOLARSHIP',message:'title and provider are required.'}});
      if(x.sourceUrl&&!isHttpsUrl(x.sourceUrl))return json(res,400,{error:{code:'INVALID_SOURCE_URL',message:'sourceUrl must use HTTPS.'}});
      await sql`INSERT INTO scholarships(id,title,provider,country,level,fields,eligibility,amount_text,deadline,source_url,status,created_by) VALUES(${x.id},${x.title},${x.provider},${x.country},${x.level},${JSON.stringify(x.fields)}::jsonb,${JSON.stringify(x.eligibility)}::jsonb,${x.amountText},${x.deadline||null},${x.sourceUrl},'draft',${s.user_id}) ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,provider=EXCLUDED.provider,country=EXCLUDED.country,level=EXCLUDED.level,fields=EXCLUDED.fields,eligibility=EXCLUDED.eligibility,amount_text=EXCLUDED.amount_text,deadline=EXCLUDED.deadline,source_url=EXCLUDED.source_url,updated_at=NOW()`;
      await writeAudit({actorUserId:s.user_id,action:'SCHOLARSHIP_UPSERT',entityType:'scholarship',entityId:x.id,metadata:{status:'draft',hasHttpsSource:isHttpsUrl(x.sourceUrl)}});
      return json(res,201,{ok:true,id:x.id,status:'draft'});
    }
    if(req.method==='PUT'){
      const scholarshipId=boundedText(req.query?.id,MAX_ID_CHARS,'id',{required:true,code:'INVALID_ID'});
      const status=String(req.body?.status||'');
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