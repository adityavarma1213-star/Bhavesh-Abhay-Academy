import { hashPassword, verifyPassword, randomToken, hashToken, id, json, cookie, writeAudit, clientIp } from '../_lib/security.js';
import { requireAuth } from '../_lib/auth.js';
import { sql } from '../_lib/db.js';
import { sendPasswordResetEmail } from '../_lib/email.js';
import { consumeAiRateLimit } from '../_lib/ai-rate-limit.js';

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
    if(!String(name||'').trim() || !/^\S+@\S+\.\S+$/.test(cleanEmail) || String(password||'').length<8)
      return json(res,400,{error:{code:'INVALID_SIGNUP',message:'Name, valid email and password of at least 8 characters are required.'}});
    if(!['student','parent','teacher'].includes(role)) return json(res,400,{error:{code:'INVALID_ROLE',message:'Public signup supports student, parent or teacher.'}});
    const existing=await sql`SELECT id FROM users WHERE lower(email)=${cleanEmail} AND deactivated_at IS NULL LIMIT 1`;
    if(existing.rows.length) return json(res,409,{error:{code:'EMAIL_EXISTS',message:'An account with this email already exists.'}});
    const userId=id('user'), now=new Date().toISOString();
    await sql`INSERT INTO users(id,display_name,email,created_at,updated_at) VALUES(${userId},${String(name).trim()},${cleanEmail},${now},${now})`;
    await sql`INSERT INTO credentials(user_id,password_hash,algorithm,created_at,updated_at) VALUES(${userId},${hashPassword(password)},'pbkdf2-sha256-310000',${now},${now})`;
    await sql`INSERT INTO user_roles(user_id,role,granted_at) VALUES(${userId},${role},${now})`;
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

/* ================ request-password-reset ================ */
function __build_request_password_reset(){
async function handler(req,res){
  if(req.method!=='POST') return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'POST required.'}},{Allow:'POST'});
  try{
    const {email}=req.body||{};
    const cleanEmail=String(email||'').trim().toLowerCase();
    if(!/^\S+@\S+\.\S+$/.test(cleanEmail)) return json(res,400,{error:{code:'INVALID_EMAIL',message:'A valid email is required.'}});
    const rate = await consumeAiRateLimit('password-reset-request', clientIp(req), { windowSeconds: 900, maxRequests: 5 });
    if (rate.limited) return json(res,429,{error:{code:'TOO_MANY_REQUESTS',message:'Too many reset requests — please wait and try again.'}});
    const r=await sql`SELECT id FROM users WHERE lower(email)=${cleanEmail} AND deactivated_at IS NULL LIMIT 1`;
    let emailSent = false, emailReason = null;
    if (r.rows.length) {
      const userId = r.rows[0].id;
      const raw = randomToken(), tokenHash = hashToken(raw);
      const tokenId = id('reset');
      await sql`INSERT INTO password_reset_tokens(id,user_id,token_hash,expires_at,requested_ip) VALUES(${tokenId},${userId},${tokenHash},NOW()+INTERVAL '1 hour',${clientIp(req)})`;
      const origin = req.headers.origin || `https://${req.headers.host}`;
      const resetUrl = `${origin}/index.html?reset=${encodeURIComponent(raw)}`;
      const result = await sendPasswordResetEmail({ to: cleanEmail, resetUrl });
      emailSent = result.sent;
      emailReason = result.sent ? null : result.reason;
      await writeAudit({actorUserId:userId,action:'auth.password_reset_requested',entityType:'user',entityId:userId,metadata:{emailSent}});
    }
    return json(res,200,{ok:true,emailSent,emailReason});
  }catch(e){ return json(res,500,{error:{code:e.code||'RESET_REQUEST_FAILED',message:'Unable to process reset request.'}}); }
}
  return handler;
}
const handler_request_password_reset = __build_request_password_reset();

/* ================ reset-password ================ */
function __build_reset_password(){
async function handler(req,res){
  if(req.method!=='POST') return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'POST required.'}},{Allow:'POST'});
  try{
    const {token,newPassword}=req.body||{};
    if(!String(token||'').trim() || String(newPassword||'').length<8)
      return json(res,400,{error:{code:'INVALID_RESET',message:'A reset token and a password of at least 8 characters are required.'}});
    const tokenHash=hashToken(token);
    const r=await sql`SELECT id,user_id,expires_at,used_at FROM password_reset_tokens WHERE token_hash=${tokenHash} LIMIT 1`;
    if(!r.rows.length) return json(res,400,{error:{code:'INVALID_TOKEN',message:'This reset link is invalid.'}});
    const row=r.rows[0];
    if(row.used_at) return json(res,400,{error:{code:'TOKEN_ALREADY_USED',message:'This reset link has already been used.'}});
    if(new Date(row.expires_at) <= new Date()) return json(res,400,{error:{code:'TOKEN_EXPIRED',message:'This reset link has expired. Please request a new one.'}});
    const now=new Date().toISOString();
    await sql`UPDATE credentials SET password_hash=${hashPassword(newPassword)}, updated_at=${now} WHERE user_id=${row.user_id}`;
    await sql`UPDATE password_reset_tokens SET used_at=NOW() WHERE id=${row.id}`;
    await sql`UPDATE auth_sessions SET revoked_at=NOW() WHERE user_id=${row.user_id} AND revoked_at IS NULL`;
    await writeAudit({actorUserId:row.user_id,action:'auth.password_reset_completed',entityType:'user',entityId:row.user_id,metadata:{}});
    return json(res,200,{ok:true});
  }catch(e){ return json(res,500,{error:{code:e.code||'RESET_FAILED',message:'Unable to reset password.'}}); }
}
  return handler;
}
const handler_reset_password = __build_reset_password();

export default async function handler(req,res){
  try{
    const seg = req.query.action;
    const route = Array.isArray(seg) ? seg[0] : seg;
    if(route==='login') return handler_login(req,res);
    if(route==='logout') return handler_logout(req,res);
    if(route==='me') return handler_me(req,res);
    if(route==='signup') return handler_signup(req,res);
    if(route==='request-password-reset') return handler_request_password_reset(req,res);
    if(route==='reset-password') return handler_reset_password(req,res);
    return json(res,404,{error:{code:'NOT_FOUND',message:'Unknown route.'}});
  }catch(e){
    return json(res,500,{error:{code:e.code||'INTERNAL_ERROR',message:'Unexpected server error.'}});
  }
}
