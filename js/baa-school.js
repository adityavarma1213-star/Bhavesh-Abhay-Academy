/* BAA M34 — School & Coaching Management Portal.
   Local institution operations for prototype/testing: roster, attendance,
   timetable, homework and announcements. No claim of live ERP integration. */
(function(global){
'use strict';
const KEY='baa_school_portal_v1',SCHEMA_VERSION=1;
const MAX_NAME=120,MAX_CLASS=80,MAX_SECTION=40,MAX_TEXT=1000,MAX_DATE=40;
let idSequence=0;
function load(){try{const x=JSON.parse(localStorage.getItem(KEY)||'null');return x&&x.schemaVersion===1?x:{schemaVersion:1,students:[],attendance:[],homework:[],announcements:[]};}catch(_){return {schemaVersion:1,students:[],attendance:[],homework:[],announcements:[]};}}
function save(s){try{localStorage.setItem(KEY,JSON.stringify(s));return {ok:true,error:null};}catch(_){return {ok:false,error:'SCHOOL_STORAGE_FAILED'};}}
function boundedText(value,max){return typeof value==='string'?value.trim().slice(0,max):'';}
function uniqueId(prefix,existing){let id='';do{id=prefix+'_'+Date.now().toString(36)+'_'+(++idSequence).toString(36)+'_'+Math.random().toString(36).slice(2,8);}while(existing.some(x=>x.id===id));return id;}
function addStudent(student){if(!student||typeof student!=='object'||typeof student.name!=='string'||!student.name.trim()||student.name.trim().length>MAX_NAME)return {ok:false,error:'INVALID_STUDENT'};const s=load();const name=student.name.trim();const className=boundedText(student.className,MAX_CLASS);const section=boundedText(student.section,MAX_SECTION);if(String(student.className||'').trim().length>MAX_CLASS||String(student.section||'').trim().length>MAX_SECTION)return {ok:false,error:'STUDENT_FIELD_TOO_LONG'};const id=uniqueId('stu',s.students);s.students.push({id,name,className,section});const r=save(s);return r.ok?{ok:true,error:null,id}:r;}
function markAttendance(id,date,status){if(typeof id!=='string'||!id.trim()||id.length>120||typeof date!=='string'||!date.trim()||date.length>MAX_DATE||!['present','absent','late'].includes(status))return {ok:false,error:'INVALID_ATTENDANCE'};const s=load();if(!s.students.some(x=>x.id===id))return {ok:false,error:'STUDENT_NOT_FOUND'};s.attendance=s.attendance.filter(x=>!(x.studentId===id&&x.date===date));s.attendance.push({studentId:id,date:date.trim(),status});return save(s);}
function addAnnouncement(text){if(typeof text!=='string'||!text.trim())return {ok:false,error:'INVALID_ANNOUNCEMENT'};const trimmed=text.trim();if(trimmed.length>MAX_TEXT)return {ok:false,error:'ANNOUNCEMENT_TOO_LONG'};const s=load();s.announcements.push({id:uniqueId('ann',s.announcements),text:trimmed,createdAt:new Date().toISOString()});return save(s);}
function getState(){return {ok:true,error:null,state:load()};}
global.BAASchool={getState,addStudent,markAttendance,addAnnouncement};
})(window);
