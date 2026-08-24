import { json, id, writeAudit } from './_lib/security.js';
import { requireAuth, hasRole } from './_lib/auth.js';
import { sql } from './_lib/db.js';

export const config={runtime:'nodejs'};
const DIRECTIONS=new Set(['pull','push']);
const ENTITY_TYPES=new Set(['students','attendance','classes','results','teachers']);

function text(v,max){return typeof v==='string'?v.trim().slice(0,max):'';}
function metadata(v){return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}

export default async function handler(req,res){
  try{
    const s=await requireAuth(req);
    if(!hasRole(s,'admin')&&!hasRole(s,'teacher')) return json(res,403,{error:{code:'FORBIDDEN',message:'School administrator or teacher role required.'}});

    if(req.method==='GET'){
      const r=await sql`SELECT id,provider,base_url AS "baseUrl",status,last_sync_at AS "lastSyncAt",last_error AS "lastError",metadata FROM erp_connections WHERE owner_user_id=${s.user_id} ORDER BY updated_at DESC LIMIT 50`;
      return json(res,200,{ok:true,connections:r.rows});
    }

    if(req.method!=='POST') return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET or POST required.'}},{Allow:'GET, POST'});

    if(req.query?.action==='sync'){
      const connectionId=text(req.query?.id,120);
      const direction=text(req.body?.direction,20)||'pull';
      const entityType=text(req.body?.entityType,80)||'students';
      if(!DIRECTIONS.has(direction)||!ENTITY_TYPES.has(entityType)) return json(res,400,{error:{code:'INVALID_SYNC_REQUEST',message:'Invalid direction or entity type.'}});
      const c=await sql`SELECT id,status FROM erp_connections WHERE id=${connectionId} AND owner_user_id=${s.user_id} LIMIT 1`;
      if(!c.rows.length) return json(res,404,{error:{code:'ERP_NOT_FOUND',message:'ERP connection not found.'}});
      if(c.rows[0].status==='disabled') return json(res,409,{error:{code:'ERP_DISABLED',message:'ERP connection is disabled.'}});
      const runId=id('erprun');
      await sql`INSERT INTO erp_sync_runs(id,connection_id,direction,entity_type,status,created_at) VALUES(${runId},${connectionId},${direction},${entityType},'queued',NOW())`;
      await writeAudit({actorUserId:s.user_id,action:'ERP_SYNC_QUEUED',entityType:'erp_sync_run',entityId:runId,metadata:{connectionId,direction,entityType}});
      return json(res,202,{ok:true,id:runId,status:'queued',integrationStatus:'connector_required',message:'Synchronization is queued. No external provider is contacted until deployment credentials and the provider adapter are configured.'});
    }

    const b=req.body||{};
    const provider=text(b.provider,100);
    const baseUrl=text(b.baseUrl,500);
    if(!provider||!/^https:\/\//i.test(baseUrl)) return json(res,400,{error:{code:'INVALID_ERP_CONFIG',message:'provider and an HTTPS baseUrl are required.'}});
    const credentialRef=text(b.credentialRef,240)||null;
    const connectionId=id('erp');
    await sql`INSERT INTO erp_connections(id,owner_user_id,provider,base_url,credential_ref,status,metadata) VALUES(${connectionId},${s.user_id},${provider},${baseUrl},${credentialRef},'configured',${JSON.stringify(metadata(b.metadata))}::jsonb)`;
    await writeAudit({actorUserId:s.user_id,action:'ERP_CONNECTION_CONFIGURED',entityType:'erp_connection',entityId:connectionId,metadata:{provider}});
    return json(res,201,{ok:true,id:connectionId,status:'configured',message:'ERP adapter configured. Provider credentials remain deployment secrets; no credential is stored in source code.'});
  }catch(e){return json(res,e.status||500,{error:{code:e.code||'ERP_FAILED',message:e.status?e.message:'Unable to process ERP request.'}});}
}
