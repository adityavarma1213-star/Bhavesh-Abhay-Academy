/* BAA M18 — authenticated server calendar bridge.
 * The existing calendar module remains the presentation/domain layer; this
 * bridge makes the server snapshot canonical for authenticated learners and
 * keeps local storage only as a last-resort private fallback.
 */
(function(global){
  'use strict';
  const API='api/m18-school-calendar';
  const MAX_RESPONSE_BYTES=1024*1024;
  let ready=null;
  function learnerId(){return String(global.BAA_LEARNER_ID || global.BAA_AUTH?.learnerId || '').trim();}
  function ensureCalendar(){if(global.BAASchoolCalendar)return Promise.resolve(global.BAASchoolCalendar);if(ready)return ready;ready=new Promise(function(resolve,reject){const script=document.createElement('script');script.src='js/baa-school-calendar.js';script.async=false;script.onload=function(){global.BAASchoolCalendar?resolve(global.BAASchoolCalendar):reject(new Error('Calendar unavailable'));};script.onerror=function(){reject(new Error('Calendar unavailable'));};document.head.appendChild(script);});return ready;}
  async function readJsonResponse(response){
    const declared=Number(response?.headers?.get?.('content-length'));
    if(Number.isFinite(declared)&&declared>MAX_RESPONSE_BYTES){try{response.body?.cancel?.();}catch(_){}throw new Error('M18_RESPONSE_TOO_LARGE');}
    if(!response?.body||typeof response.body.getReader!=='function'){
      try{
        const text=await response.text();
        const size=typeof TextEncoder!=='undefined'?new TextEncoder().encode(text).byteLength:typeof Buffer!=='undefined'?Buffer.byteLength(text,'utf8'):text.length;
        if(size>MAX_RESPONSE_BYTES)throw new Error('M18_RESPONSE_TOO_LARGE');
        return JSON.parse(text);
      }catch(error){if(error?.message==='M18_RESPONSE_TOO_LARGE')throw error;throw new Error('M18_INVALID_RESPONSE');}
    }
    const reader=response.body.getReader();const chunks=[];let total=0;
    try{while(true){const part=await reader.read();if(part.done)break;const chunk=part.value instanceof Uint8Array?part.value:new Uint8Array(part.value||[]);total+=chunk.byteLength;if(total>MAX_RESPONSE_BYTES){try{await reader.cancel();}catch(_){}throw new Error('M18_RESPONSE_TOO_LARGE');}chunks.push(chunk);}}catch(error){try{await reader.cancel();}catch(_){}if(error?.message==='M18_RESPONSE_TOO_LARGE')throw error;throw new Error('M18_INVALID_RESPONSE');}
    try{const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return JSON.parse(new TextDecoder().decode(bytes));}catch(_){throw new Error('M18_INVALID_RESPONSE');}
  }
  async function request(method,body){const id=learnerId();if(!id)throw new Error('Learner session unavailable');const response=await fetch(API+'?learnerId='+encodeURIComponent(id),{method,credentials:'include',cache:'no-store',headers:{'Accept':'application/json','Content-Type':'application/json'},body:body?JSON.stringify(Object.assign({learnerId:id},body)):undefined});const data=await readJsonResponse(response);if(!response.ok)throw new Error(data?.error?.message||'School calendar request failed');return data;}
  async function sync(){const calendar=await ensureCalendar();const data=await request('GET');const state=calendar._load();state.events=Array.isArray(data.events)?data.events:[];try{localStorage.setItem('baa_school_calendar_v1',JSON.stringify(state));}catch{}global.dispatchEvent(new CustomEvent('baa:m18-calendar-synced',{detail:data}));return data.events||[];}
  async function addEvent(event){await ensureCalendar();const data=await request('POST',event);try{await sync();}catch{}return data.event||null;}
  async function removeEvent(id){await ensureCalendar();const data=await request('DELETE',{id});try{await sync();}catch{}return !!data.deleted;}
  global.BAAM18SchoolCalendar={sync,addEvent,removeEvent,isServerBacked:function(){return !!learnerId();}};
  function patchCalendar(calendar){if(calendar.__m18ServerPatched)return;const localAdd=calendar.addEvent;const localRemove=calendar.removeEvent;calendar.addEvent=function(event){const row=localAdd(event);if(learnerId()&&row)addEvent(event).catch(function(error){global.dispatchEvent(new CustomEvent('baa:m18-calendar-write-failed',{detail:{message:error.message}}));});return row;};calendar.removeEvent=function(id){const ok=localRemove(id);if(learnerId()&&ok)removeEvent(id).catch(function(error){global.dispatchEvent(new CustomEvent('baa:m18-calendar-write-failed',{detail:{message:error.message}}));});return ok;};calendar.__m18ServerPatched=true;}
  function boot(){if(!learnerId())return;ensureCalendar().then(function(calendar){patchCalendar(calendar);return sync();}).catch(function(error){global.dispatchEvent(new CustomEvent('baa:m18-calendar-unavailable',{detail:{message:error.message}}));});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})(window);
