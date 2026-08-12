import { sql } from '../_lib/db.js';
import { verifyPassword, randomToken, hashToken, id, json, cookie, writeAudit, clientIp } from '../_lib/security.js';

export const config={runtime:'nodejs'};
const SESSION_DAYS=7;

export default async function handler(req,res){
  if(req.method!=='POST') return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'POST required.'}},{Allow:'POST'});
  try{
    const {email,password}=req.body||{};
    const clean=String(email||'').trim().toLowerCase();
    const r=await sql`SELECT u.id,u.display_name,u.email,c.password_hash FROM users u JOIN credentials c ON c.user_id=u.id WHERE lower(u.email)=${clean} AND u.deactivated_at IS NULL LIMIT 1`;
    if(!r.rows.length || !verifyPassword(String(password||''),r.rows[0].password_hash)) return json(res,401,{error:{code:'INVALID_CREDENTIALS',message:'Incorrect email or password.'}});
    const raw=randomToken(), tokenHash=hashToken(raw), sessionId=id('session');
    await sql`INSERT INTO auth_sessions(id,user_id,token_hash,created_at,expires_at) VALUES(${sessionId},${r.rows[0].id},${tokenHash},NOW(),NOW()+INTERVAL '7 days')`;
    await writeAudit({actorUserId:r.rows[0].id,action:'auth.login',entityType:'auth_session',entityId:sessionId,metadata:{ip:clientIp(req)}});
    res.setHeader('Set-Cookie',cookie('baa_session',encodeURIComponent(raw),{maxAge:SESSION_DAYS*86400}));
    return json(res,200,{ok:true,user:{id:r.rows[0].id,name:r.rows[0].display_name,email:r.rows[0].email},expiresInDays:SESSION_DAYS});
  }catch(e){return json(res,500,{error:{code:e.code||'LOGIN_FAILED',message:'Unable to complete login.'}});}
}
