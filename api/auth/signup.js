import { sql } from '../_lib/db.js';
import { hashPassword, id, json, writeAudit } from '../_lib/security.js';

export const config={runtime:'nodejs'};

export default async function handler(req,res){
  if(req.method!=='POST') return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'POST required.'}},{Allow:'POST'});
  try{
    const {name,email,password,role='student'}=req.body||{};
    const cleanEmail=String(email||'').trim().toLowerCase();
    if(!String(name||'').trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || String(password||'').length<8)
      return json(res,400,{error:{code:'INVALID_SIGNUP',message:'Name, valid email and password of at least 8 characters are required.'}});
    if(!['student','parent','teacher'].includes(role)) return json(res,400,{error:{code:'INVALID_ROLE',message:'Public signup supports student, parent or teacher.'}});
    const existing=await sql`SELECT id FROM users WHERE lower(email)=${cleanEmail} AND deactivated_at IS NULL LIMIT 1`;
    if(existing.rows.length) return json(res,409,{error:{code:'EMAIL_EXISTS',message:'An account with this email already exists.'}});
    const userId=id('user'), now=new Date().toISOString();
    await sql`INSERT INTO users(id,display_name,email,created_at,updated_at) VALUES(${userId},${String(name).trim()},${cleanEmail},${now},${now})`;
    await sql`INSERT INTO credentials(user_id,password_hash,algorithm,created_at,updated_at) VALUES(${userId},${hashPassword(password)},'pbkdf2-sha256-310000',${now},${now})`;
    await sql`INSERT INTO user_roles(user_id,role,granted_at) VALUES(${userId},${role},${now})`;
    await writeAudit({actorUserId:userId,action:'account.create',entityType:'user',entityId:userId,metadata:{role}});
    return json(res,201,{ok:true,user:{id:userId,name:String(name).trim(),email:cleanEmail,role}});
  }catch(e){ return json(res,500,{error:{code:e.code||'SIGNUP_FAILED',message:'Unable to create account.'}}); }
}
