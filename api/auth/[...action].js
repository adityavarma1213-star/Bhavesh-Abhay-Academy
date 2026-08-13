import { hashPassword, id, json, writeAudit } from '../_lib/security.js';
import { hashToken, json, cookie, writeAudit } from '../_lib/security.js';
import { json } from '../_lib/security.js';
import { requireAuth } from '../_lib/auth.js';
import { sql } from '../_lib/db.js';
import { verifyPassword, randomToken, hashToken, id, json, cookie, writeAudit, clientIp } from '../_lib/security.js';

export const config={runtime:'nodejs'};

/* ================ login.js ================ */
function __build_login(){
const SESSION_DAYS=7;

async function handler(req,res){
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
  return handler;
}
const handler_login = __build_login();

/* ================ logout.js ================ */
function __build_logout(){
async function handler(req,res){
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
  return handler;
}
const handler_logout = __build_logout();

/* ================ me.js ================ */
function __build_me(){
async function handler(req,res){
  if(req.method!=='GET') return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'GET required.'}},{Allow:'GET'});
  try{const s=await requireAuth(req);return json(res,200,{ok:true,user:{id:s.user_id,name:s.display_name,email:s.email,roles:s.roles},expiresAt:s.expires_at});}
  catch(e){return json(res,e.status||500,{error:{code:e.code||'SESSION_LOOKUP_FAILED',message:e.status?e.message:'Unable to resolve session.'}});}
}
  return handler;
}
const handler_me = __build_me();

/* ================ signup.js ================ */
function __build_signup(){
async function handler(req,res){
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
    // A 'student' account needs a learners row to hold any per-student data
    // (planner, homework, assessments, etc.) — without this there is no
    // valid learnerId for the rest of the app to write to. See G7 audit.
    let learnerId=null;
    if (role==='student') {
      learnerId=id('learner');
      await sql`INSERT INTO learners(id,user_id,display_name,created_at,updated_at) VALUES(${learnerId},${userId},${String(name).trim()},${now},${now})`;
      await writeAudit({actorUserId:userId,action:'learner.create',entityType:'learner',entityId:learnerId,metadata:{viaSignup:true}});
    }
    await writeAudit({actorUserId:userId,action:'account.create',entityType:'user',entityId:userId,metadata:{role}});
    return json(res,201,{ok:true,user:{id:userId,name:String(name).trim(),email:cleanEmail,role},learnerId});
  }catch(e){ return json(res,500,{error:{code:e.code||'SIGNUP_FAILED',message:'Unable to create account.'}}); }
}
  return handler;
}
const handler_signup = __build_signup();

export default async function handler(req,res){
  try{
    const seg = req.query.action;
    const route = Array.isArray(seg) ? seg[0] : seg;
    if(route==='login') return handler_login(req,res);
    if(route==='logout') return handler_logout(req,res);
    if(route==='me') return handler_me(req,res);
    if(route==='signup') return handler_signup(req,res);
    return json(res,404,{error:{code:'NOT_FOUND',message:'Unknown route.'}});
  }catch(e){
    return json(res,500,{error:{code:e.code||'INTERNAL_ERROR',message:'Unexpected server error.'}});
  }
}
