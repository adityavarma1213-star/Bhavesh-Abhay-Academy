import { sql } from '../_lib/db.js';
import { hashToken, json, cookie, writeAudit } from '../_lib/security.js';

export const config={runtime:'nodejs'};
export default async function handler(req,res){
  if(req.method!=='POST') return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'POST required.'}},{Allow:'POST'});
  try{
    const h=String(req.headers.authorization||'');
    const cookieHeader=String(req.headers.cookie||'');
    const m=cookieHeader.match(/(?:^|;\s*)baa_session=([^;]+)/);
    const raw=h.startsWith('Bearer ')?h.slice(7).trim():(m?decodeURIComponent(m[1]):null);
    if(raw){
      const tokenHash=hashToken(raw);
      const r=await sql`UPDATE auth_sessions SET revoked_at=NOW() WHERE token_hash=${tokenHash} AND revoked_at IS NULL RETURNING id,user_id`;
      if(r.rows.length) await writeAudit({actorUserId:r.rows[0].user_id,action:'auth.logout',entityType:'auth_session',entityId:r.rows[0].id});
    }
    res.setHeader('Set-Cookie',cookie('baa_session','',{maxAge:0}));
    return json(res,200,{ok:true});
  }catch(e){return json(res,500,{error:{code:e.code||'LOGOUT_FAILED',message:'Unable to complete logout.'}});}
}
