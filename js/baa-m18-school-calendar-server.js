/* BAA M18 — authenticated server calendar bridge.
 * The existing calendar module remains the presentation/domain layer; this
 * bridge makes the server snapshot canonical for authenticated learners and
 * keeps local storage only as a last-resort private fallback.
 */
(function(global){
  'use strict';
  const API='api/m18-school-calendar';
  let ready=null;

  function learnerId(){
    return String(global.BAA_LEARNER_ID || global.BAA_AUTH?.learnerId || '').trim();
  }

  function ensureCalendar(){
    if(global.BAASchoolCalendar) return Promise.resolve(global.BAASchoolCalendar);
    if(ready) return ready;
    ready=new Promise(function(resolve,reject){
      const script=document.createElement('script');
      script.src='js/baa-school-calendar.js';
      script.async=false;
      script.onload=function(){ global.BAASchoolCalendar ? resolve(global.BAASchoolCalendar) : reject(new Error('Calendar unavailable')); };
      script.onerror=function(){ reject(new Error('Calendar unavailable')); };
      document.head.appendChild(script);
    });
    return ready;
  }

  async function request(method, body){
    const id=learnerId();
    if(!id) throw new Error('Learner session unavailable');
    const response=await fetch(API+'?learnerId='+encodeURIComponent(id),{
      method,
      credentials:'include',
      headers:{'Content-Type':'application/json'},
      body:body ? JSON.stringify(Object.assign({learnerId:id},body)) : undefined
    });
    const data=await response.json().catch(function(){return {};});
    if(!response.ok) throw new Error(data?.error?.message || 'School calendar request failed');
    return data;
  }

  async function sync(){
    const calendar=await ensureCalendar();
    const data=await request('GET');
    const state=calendar._load();
    state.events=Array.isArray(data.events) ? data.events : [];
    try{localStorage.setItem('baa_school_calendar_v1',JSON.stringify(state));}catch{}
    global.dispatchEvent(new CustomEvent('baa:m18-calendar-synced',{detail:data}));
    return data.events || [];
  }

  async function addEvent(event){
    await ensureCalendar();
    const data=await request('POST',event);
    try{ await sync(); }catch{}
    return data.event || null;
  }

  async function removeEvent(id){
    await ensureCalendar();
    const data=await request('DELETE',{id});
    try{ await sync(); }catch{}
    return !!data.deleted;
  }

  global.BAAM18SchoolCalendar={sync,addEvent,removeEvent,isServerBacked:function(){return !!learnerId();}};

  function boot(){
    if(!learnerId()) return;
    sync().catch(function(error){
      global.dispatchEvent(new CustomEvent('baa:m18-calendar-unavailable',{detail:{message:error.message}}));
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot);
  else boot();
})(window);
