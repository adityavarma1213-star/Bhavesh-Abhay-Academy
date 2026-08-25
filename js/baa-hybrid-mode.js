// BAA OS — Module 3, Hybrid Mode.
// Combines AI + Custom learning paths, with bounded local editing and
// authenticated server-backed persistence for cross-device continuity.
(function (global) {
  'use strict';
  const SCHEMA_VERSION = 1, MODE = 'hybrid', MAX_STEPS = 14;
  const STORAGE_KEY = 'baa_hybrid_path_v1';
  const VALID_TYPES = new Set(['learn','practice','review','assessment','tutor','custom']);
  const VALID_PRIORITIES = new Set(['student','balanced','ai']);
  const cleanText = (v, m=180) => typeof v === 'string' ? v.replace(/\s+/g,' ').trim().slice(0,m) : '';
  const cleanPriority = v => VALID_PRIORITIES.has(v) ? v : 'balanced';
  function normalizeStep(step, source, index) {
    if (!step || typeof step !== 'object') return null;
    const title=cleanText(step.title,120), minutes=Number(step.minutes), type=cleanText(step.type,20);
    if (!title || !Number.isInteger(minutes) || minutes<5 || minutes>120) return null;
    const safeType=source==='custom'?'custom':type;
    if (!VALID_TYPES.has(safeType)) return null;
    return {id:(typeof step.id==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(step.id))?step.id:`${source}-${index}-${title.toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,32)}`,title,minutes,type:safeType,source,completed:Boolean(step.completed),included:step.included!==false,reason:cleanText(step.reason,240)};
  }
  function normalizePath(raw) {
    const value=raw&&typeof raw==='object'?raw:{};
    const steps=(Array.isArray(value.steps)?value.steps.slice(0,MAX_STEPS):[]).map((s,i)=>normalizeStep(s,s?.source==='custom'?'custom':'ai',i)).filter(Boolean);
    return {schemaVersion:SCHEMA_VERSION,mode:MODE,steps,totalMinutes:steps.filter(s=>s.included!==false).reduce((n,s)=>n+s.minutes,0),generatedAt:cleanText(value.generatedAt,40)||new Date().toISOString(),...(value.priority!==undefined?{priority:cleanPriority(value.priority)}:{}),...(value.conflictPolicy?{conflictPolicy:cleanText(value.conflictPolicy,180)}:{})};
  }
  function conflictKey(s){return cleanText(s?.title,120).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
  function resolveConflicts(steps, priority='balanced') {
    const p=cleanPriority(priority), seen=new Map(), result=[];
    for(const step of steps){const key=conflictKey(step); if(!key){result.push(step);continue;} const i=seen.get(key); if(i==null){seen.set(key,result.length);result.push(step);continue;} if(p==='balanced'){result.push(step);continue;} const preferred=p==='student'?'custom':'ai'; if(step.source===preferred&&result[i].source!==preferred) result[i]=step;}
    return result;
  }
  function savePath(path){const normalized=normalizePath(path); try{global.localStorage?.setItem(STORAGE_KEY,JSON.stringify(normalized));return {ok:true,path:normalized};}catch{return {ok:false,error:{code:'STORAGE_WRITE_FAILED',message:'Hybrid Mode could not save the combined path.'}};}}
  function getPath(){try{return normalizePath(JSON.parse(global.localStorage?.getItem(STORAGE_KEY)||'null'));}catch{return normalizePath(null);}}
  function compose(aiPlan, customPath){
    const ai=(Array.isArray(aiPlan?.steps)?aiPlan.steps:[]).map((s,i)=>normalizeStep(s,'ai',i)).filter(Boolean);
    const custom=(Array.isArray(customPath?.steps)?customPath.steps:[]).map((s,i)=>normalizeStep(s,'custom',i)).filter(Boolean);
    const steps=[...ai,...custom].slice(0,MAX_STEPS);
    return {schemaVersion:SCHEMA_VERSION,mode:MODE,steps,totalMinutes:steps.reduce((n,s)=>n+s.minutes,0),generatedAt:new Date().toISOString(),sources:{ai:ai.length,custom:custom.length}};
  }
  function applyPriority(path, priority='balanced'){
    const normalized=normalizePath(path), p=cleanPriority(priority), resolved=resolveConflicts(normalized.steps,p), ids=new Set(resolved.map(s=>s.id));
    normalized.steps=normalized.steps.filter(s=>ids.has(s.id)).map(s=>({...s,priority:p})); normalized.priority=p;
    normalized.conflictPolicy=p==='student'?'Student-created step wins same-title conflicts.':p==='ai'?'AI step wins same-title conflicts.':'Both sides remain available; student decides by include/exclude.';
    normalized.totalMinutes=normalized.steps.filter(s=>s.included!==false).reduce((n,s)=>n+s.minutes,0); return savePath(normalized);
  }
  function setStepIncluded(path,id,included){const p=normalizePath(path),s=p.steps.find(x=>x.id===id);if(!s)return {ok:false,error:{code:'STEP_NOT_FOUND'}};s.included=included!==false;return savePath(p);}
  function moveStep(path,id,direction){const p=normalizePath(path),i=p.steps.findIndex(s=>s.id===id);if(i<0)return {ok:false,error:{code:'STEP_NOT_FOUND'}};const n=direction==='up'?i-1:direction==='down'?i+1:i;if(n>=0&&n<p.steps.length){const x=p.steps.splice(i,1)[0];p.steps.splice(n,0,x);}return savePath(p);}
  function getActiveSteps(path){return normalizePath(path).steps.filter(s=>s.included!==false);}
  function saveStudentAdjustedPath(path){return savePath(path);}
  function resetPath(){try{global.localStorage?.removeItem(STORAGE_KEY);return {ok:true,path:normalizePath(null)};}catch{return {ok:false,error:{code:'STORAGE_RESET_FAILED'}};}}
  function getSummary(path){const p=normalizePath(path),a=getActiveSteps(p);return {mode:MODE,priority:p.priority||'balanced',totalSteps:p.steps.length,activeSteps:a.length,aiSteps:p.steps.filter(s=>s.source==='ai').length,customSteps:p.steps.filter(s=>s.source==='custom').length,totalMinutes:a.reduce((n,s)=>n+s.minutes,0)};}
  async function loadServer(learnerId){if(!learnerId)return {ok:false,error:{code:'LEARNER_ID_REQUIRED'}};try{const r=await fetch(`/api/m03-hybrid-mode?learnerId=${encodeURIComponent(learnerId)}`,{credentials:'include'}),d=await r.json().catch(()=>null);if(!r.ok)return {ok:false,error:d?.error||{code:'HYBRID_MODE_SERVER_READ_FAILED'}};const path=normalizePath(d?.path);savePath(path);return {ok:true,path,updatedAt:d?.updatedAt||null};}catch{return {ok:false,error:{code:'HYBRID_MODE_NETWORK_ERROR'}};}}
  async function saveServer(learnerId,path=getPath()){if(!learnerId)return {ok:false,error:{code:'LEARNER_ID_REQUIRED'}};const normalized=normalizePath(path);try{const r=await fetch(`/api/m03-hybrid-mode?learnerId=${encodeURIComponent(learnerId)}`,{method:'PUT',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(normalized)}),d=await r.json().catch(()=>null);if(!r.ok)return {ok:false,error:d?.error||{code:'HYBRID_MODE_SERVER_WRITE_FAILED'}};savePath(normalizePath(d?.path||normalized));return {ok:true,path:normalizePath(d?.path||normalized)};}catch{return {ok:false,error:{code:'HYBRID_MODE_NETWORK_ERROR'}};}}
  async function clearServer(learnerId){if(!learnerId)return {ok:false,error:{code:'LEARNER_ID_REQUIRED'}};try{const r=await fetch(`/api/m03-hybrid-mode?learnerId=${encodeURIComponent(learnerId)}`,{method:'DELETE',credentials:'include'}),d=await r.json().catch(()=>null);if(!r.ok)return {ok:false,error:d?.error||{code:'HYBRID_MODE_SERVER_DELETE_FAILED'}};return savePath(normalizePath(d?.path));}catch{return {ok:false,error:{code:'HYBRID_MODE_NETWORK_ERROR'}};}}
  global.BAAHybridMode={SCHEMA_VERSION,MODE,STORAGE_KEY,MAX_STEPS,compose,normalizePath,savePath,saveStudentAdjustedPath,setStepIncluded,moveStep,getActiveSteps,getPath,VALID_PRIORITIES:Array.from(VALID_PRIORITIES),cleanPriority,resolveConflicts,applyPriority,resetPath,getSummary,loadServer,saveServer,clearServer};
})(window);
