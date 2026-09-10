/* ============================================================
   js/baa-school-calendar.js
   BAA OS — Module 18: School Calendar Integration.
   Local/private testing calendar layer. Events are explicitly entered
   and are never invented from assumptions.
   ============================================================ */
(function(global){
  'use strict';
  const STORAGE_KEY='baa_school_calendar_v1';
  const SCHEMA_VERSION=1;
  function load(){
    try{
      const raw=localStorage.getItem(STORAGE_KEY);
      if(!raw)return {meta:{schemaVersion:SCHEMA_VERSION},events:[]};
      const p=JSON.parse(raw);
      return p&&p.meta?.schemaVersion===SCHEMA_VERSION?p:{meta:{schemaVersion:SCHEMA_VERSION},events:[]};
    }catch{return {meta:{schemaVersion:SCHEMA_VERSION},events:[]};}
  }
  function save(s){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(s));pushSync(s);return true;}catch{return false;}}

  // ------------------------------------------------------------
  // Server sync — was previously localStorage-only (see audit notes).
  // ------------------------------------------------------------
  let syncLearnerId=null;
  const STATE_KEY='school_calendar_v1';
  function setSyncTarget(learnerId){syncLearnerId=learnerId||null;}
  function pushSync(store){
    if(!syncLearnerId||typeof fetch==='undefined')return;
    const url=`/api/v1/client-state?learnerId=${encodeURIComponent(syncLearnerId)}&stateKey=${STATE_KEY}`;
    const opts={method:'PUT',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(store)};
    fetch(url,opts).catch((e)=>{
      if(global.BAAOfflineSync)global.BAAOfflineSync.enqueue(url,opts);
      console.warn('[BAA Module 18] School Calendar sync queued offline',e);
    });
  }
  async function hydrateFromServer(learnerId){
    if(!learnerId||typeof fetch==='undefined')return false;
    try{
      const res=await fetch(`/api/v1/client-state?learnerId=${encodeURIComponent(learnerId)}&stateKey=${STATE_KEY}`,{credentials:'include'});
      if(!res.ok)throw new Error(`server returned ${res.status}`);
      const {state}=await res.json();
      if(state&&state.meta?.schemaVersion===SCHEMA_VERSION){
        localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
      }
      setSyncTarget(learnerId);
      return true;
    }catch(e){
      console.warn('[BAA Module 18] Could not hydrate School Calendar from server — continuing with local data only.',e);
      return false;
    }
  }
  function addEvent({title,date,type='school_event',subject=null}={}){
    if(!title||!date)return null;
    const allowed=['exam','deadline','holiday','school_event'];
    if(!allowed.includes(type))return null;
    const s=load();
    const row={id:`cal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`,title:String(title).slice(0,120),date, type,subject:subject?String(subject).slice(0,80):null};
    s.events.push(row);save(s);return row;
  }
  function removeEvent(id){const s=load();s.events=s.events.filter(e=>e.id!==id);return save(s);}
  function getEvents({from,to}={}){
    return load().events.filter(e=>(!from||e.date>=from)&&(!to||e.date<=to)).sort((a,b)=>a.date.localeCompare(b.date));
  }
  function getDateContext(date){
    const events=getEvents({from:date,to:date});
    return {date,events,isHoliday:events.some(e=>e.type==='holiday'),examSubjects:[...new Set(events.filter(e=>e.type==='exam'&&e.subject).map(e=>e.subject))]};
  }
  global.BAASchoolCalendar={addEvent,removeEvent,getEvents,getDateContext,_load:load,setSyncTarget,hydrateFromServer};
})(window);
