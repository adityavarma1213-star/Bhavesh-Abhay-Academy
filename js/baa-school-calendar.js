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
  function save(s){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(s));return true;}catch{return false;}}
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
  global.BAASchoolCalendar={addEvent,removeEvent,getEvents,getDateContext,_load:load};
})(window);
