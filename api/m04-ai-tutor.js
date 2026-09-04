// BAA OS — M04 authoritative AI Tutor adapter.
// Server-owned academic evidence is supplied to the existing Gemini adapter.
import baseHandler from './chat.js';
import { sql } from './_lib/db.js';
import { requireAuth, requireLearnerAccess } from './_lib/auth.js';
import { json } from './_lib/security.js';
export const config = { runtime: 'nodejs' };
const MIN_EVIDENCE = 3;
const PAGE_SIZE = 200;
const MAX_MEMORY = 24;
const MAX_EVIDENCE = 120;
const MAX_ATTEMPTS = 24;
const MAX_LEARNER_ID_CHARS = 100;
function normalize(value){return typeof value==='string'?value.replace(/\s+/g,' ').trim():'';}
function display(value,max=120){return normalize(value).slice(0,max);}
function validateLearnerId(value){
  if(value==null||value==='')return '';
  if(typeof value!=='string'){
    const err=new Error('learnerId must be a string.');err.status=400;err.code='INVALID_LEARNER_ID';throw err;
  }
  const normalized=normalize(value);
  if(!normalized){const err=new Error('A learner context is required.');err.status=400;err.code='LEARNER_REQUIRED';throw err;}
  if(normalized.length>MAX_LEARNER_ID_CHARS){const err=new Error(`learnerId must be at most ${MAX_LEARNER_ID_CHARS} characters.`);err.status=400;err.code='LEARNER_ID_TOO_LONG';throw err;}
  return normalized;
}
async function resolveLearnerId(session,requested){const learnerId=validateLearnerId(requested);if(learnerId){await requireLearnerAccess(session,learnerId);return learnerId;}if(session.roles.includes('student')){const result=await sql`SELECT id FROM learners WHERE user_id=${session.user_id} AND deactivated_at IS NULL LIMIT 1`;if(result.rows[0]?.id)return String(result.rows[0].id);}return '';}
async function enforceParentPolicy(session,learnerId){if(!learnerId||!session?.roles?.includes('student'))return;const result=await sql`SELECT tutor_enabled FROM parent_ai_policies WHERE learner_id=${learnerId} LIMIT 1`;if(result.rows[0]&&result.rows[0].tutor_enabled===false){const err=new Error('AI Tutor is disabled by the active parent approval policy.');err.status=403;err.code='AI_TUTOR_DISABLED_BY_PARENT_POLICY';throw err;}}
async function pageMemory(learnerId,after){return after?sql`SELECT id,concept,status,evidence_count,correct_count,last_updated FROM learning_memory WHERE learner_id=${learnerId} AND status IN ('mastered','learning','needs_revision') AND evidence_count>=${MIN_EVIDENCE} AND (last_updated,id)<(${after.t},${after.id}::uuid) ORDER BY last_updated DESC,id DESC LIMIT ${PAGE_SIZE}`:sql`SELECT id,concept,status,evidence_count,correct_count,last_updated FROM learning_memory WHERE learner_id=${learnerId} AND status IN ('mastered','learning','needs_revision') AND evidence_count>=${MIN_EVIDENCE} ORDER BY last_updated DESC,id DESC LIMIT ${PAGE_SIZE}`;}
async function pageEvidence(learnerId,after){return after?sql`SELECT id,concept,subject,chapter,error_type,correctness,created_at FROM learning_evidence WHERE learner_id=${learnerId} AND (created_at,id)<(${after.t},${after.id}::uuid) ORDER BY created_at DESC,id DESC LIMIT ${PAGE_SIZE}`:sql`SELECT id,concept,subject,chapter,error_type,correctness,created_at FROM learning_evidence WHERE learner_id=${learnerId} ORDER BY created_at DESC,id DESC LIMIT ${PAGE_SIZE}`;}
async function pageAttempts(learnerId,after){return after?sql`SELECT id,score,max_score,end_time,start_time FROM assessment_attempts WHERE learner_id=${learnerId} AND status IN ('submitted','evaluated','completed') AND score IS NOT NULL AND max_score>0 AND (COALESCE(end_time,start_time),id)<(${after.t},${after.id}::uuid) ORDER BY COALESCE(end_time,start_time) DESC,id DESC LIMIT ${PAGE_SIZE}`:sql`SELECT id,score,max_score,end_time,start_time FROM assessment_attempts WHERE learner_id=${learnerId} AND status IN ('submitted','evaluated','completed') AND score IS NOT NULL AND max_score>0 ORDER BY COALESCE(end_time,start_time) DESC,id DESC LIMIT ${PAGE_SIZE}`;}
function nextAfter(row,dateKey){return {t:String(row[dateKey]),id:String(row.id)};}
async function readComplete(learnerId,kind,maxRows){const rows=[];let after=null;while(rows.length<maxRows){const result=kind==='memory'?await pageMemory(learnerId,after):kind==='evidence'?await pageEvidence(learnerId,after):await pageAttempts(learnerId,after);if(!result.rows.length)break;rows.push(...result.rows.slice(0,maxRows-rows.length));if(result.rows.length<PAGE_SIZE||rows.length>=maxRows)break;const last=result.rows[result.rows.length-1];after=nextAfter(last,kind==='memory'?'last_updated':kind==='evidence'?'created_at':'end_time');if(kind==='attempts'&&!last.end_time)after.t=String(last.start_time);}}
return rows;}
async function buildEvidenceContext(learnerId){if(!learnerId)return null;const [memory,evidence,attempts]=await Promise.all([readComplete(learnerId,'memory',MAX_MEMORY),readComplete(learnerId,'evidence',MAX_EVIDENCE),readComplete(learnerId,'attempts',MAX_ATTEMPTS)]);
const states=memory.map(row=>({concept:display(row.concept,70),status:display(row.status,30),evidence:Number(row.evidence_count||0),correct:Number(row.correct_count||0),_identity:normalize(row.concept)})).filter(row=>row._identity&&row.evidence>=MIN_EVIDENCE).map(({_identity,...row})=>row);
const evidenceCounts=new Map();
for(const row of evidence){const concept=normalize(row.concept);if(concept)evidenceCounts.set(concept,(evidenceCounts.get(concept)||0)+1);}
const mistakes=evidence.filter(row=>row.correctness!==true&&row.correctness!=='correct').filter(row=>{const concept=normalize(row.concept);return concept&&Number(evidenceCounts.get(concept)||0)>=MIN_EVIDENCE;}).slice(0,8).map(row=>[display(row.subject,30),display(row.chapter,40),display(row.concept,60),display(row.error_type,40)].filter(Boolean).join(' / ')).filter(Boolean);
const percentages=attempts.map(row=>Math.round((Number(row.score)/Number(row.max_score))*1000)/10);
if(!states.length&&!mistakes.length&&!percentages.length)return null;
return JSON.stringify({conceptStates:states,recentPossibleMisconceptions:mistakes,recentAssessmentPercentages:percentages,evidenceGate:{minimumEvidence:MIN_EVIDENCE,unit:'answered evidence items per concept',sparseConceptsExcluded:true},evidencePolicy:'Use only as academic evidence; do not diagnose or infer personal traits.'}).slice(0,1150);}
export default async function handler(req,res){try{res.setHeader('Cache-Control','private, no-store, max-age=0');if(req.method!=='POST')return json(res,405,{error:{code:'METHOD_NOT_ALLOWED',message:'POST required.'}});const session=await requireAuth(req);const body=await req.json();const learnerId=await resolveLearnerId(session,body?.learnerId);if(!learnerId)return json(res,400,{error:{code:'LEARNER_REQUIRED',message:'A learner context is required for the production AI Tutor path.'}});await enforceParentPolicy(session,learnerId);const learningContext=await buildEvidenceContext(learnerId);const authoritativeBody={...body,learnerId:undefined,learningContext};req.json=async()=>authoritativeBody;return baseHandler(req,res);}catch(e){return json(res,e.status||500,{error:{code:e.code||'AI_TUTOR_EVIDENCE_API_FAILED',message:e.status?e.message:'AI Tutor evidence service unavailable.'}});}}
