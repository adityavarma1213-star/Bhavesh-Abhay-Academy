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
  let fallbackSequence=0;
  function load(){
    try{
      const raw=localStorage.getItem(STORAGE_KEY);
      if(!raw)return {meta:{schemaVersion:SCHEMA_VERSION},events:[]};
      const p=JSON.parse(raw);
      return p&&p.meta?.schemaVersion===SCHEMA_VERSION?p:{meta:{schemaVersion:SCHEMA_VERSION},events:[]};
    }catch{return {meta:{schemaVersion:SCHEMA_VERSION},events:[]};}
  }
  function save(s){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(s));return true;}catch{return false;}}
  function makeId(){
    try{
      if(global.crypto?.randomUUID)return `cal_${global.crypto.randomUUID()}`;
      if(global.crypto?.getRandomValues){
        const bytes=new Uint32Array(2);global.crypto.getRandomValues(bytes);
        return `cal_${Date.now().toString(36)}_${bytes[0].toString(36)}${bytes[1].toString(36)}`;
      }
    }catch{}
    fallbackSequence=(fallbackSequence+1)%0x1000000;
    return `cal_${Date.now().toString(36)}_${fallbackSequence.toString(36).padStart(6,'0')}`;
  }
  function validDate(value){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
    const d=new Date(`${value}T00:00:00Z`);
    return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;
  }
  function addEvent({title,date,type='school_event',subject=null}={}){
    if(typeof title!=='string'||!title.trim()||typeof date!=='string'||!validDate(date))return null;
    const allowed=['exam','deadline','holiday','school_event'];
    if(!allowed.includes(type))return null;
    const s=load();
    const row={id:makeId(),title:title.trim().slice(0,120),date, type,subject:subject?String(subject).slice(0,80):null};
    s.events.push(row);
    if(!save(s))return null;
    return row;
  }
  function removeEvent(id){const s=load();s.events=s.events.filter(e=>e.id!==id);return save(s);}
  function getEvents({from,to}={}){
    const lower=from==null||validDate(from)?from:null;
    const upper=to==null||validDate(to)?to:null;
    return load().events.filter(e=>(!lower||e.date>=lower)&&(!upper||e.date<=upper)).sort((a,b)=>a.date.localeCompare(b.date));
  }
  function getDateContext(date){
    const events=getEvents({from:date,to:date});
    return {date,events,isHoliday:events.some(e=>e.type==='holiday'),examSubjects:[...new Set(events.filter(e=>e.type==='exam'&&e.subject).map(e=>e.subject))]};
  }
  global.BAASchoolCalendar={addEvent,removeEvent,getEvents,getDateContext,_load:load};
})(window);
