/* BAA M34 — School & Coaching Management Portal.
   Local institution operations for prototype/testing: roster, attendance,
   timetable, homework and announcements. No claim of live ERP integration. */
(function(global){
'use strict';
const KEY='baa_school_portal_v1',SCHEMA_VERSION=1;
function load(){try{const x=JSON.parse(localStorage.getItem(KEY)||'null');return x&&x.schemaVersion===1?x:{schemaVersion:1,students:[],attendance:[],homework:[],announcements:[]};}catch(_){return {schemaVersion:1,students:[],attendance:[],homework:[],announcements:[]};}}
function save(s){try{localStorage.setItem(KEY,JSON.stringify(s));return {ok:true,error:null};}catch(_){return {ok:false,error:'SCHOOL_STORAGE_FAILED'};}}
function addStudent(student){if(!student||typeof student!=='object'||typeof student.name!=='string'||!student.name.trim())return {ok:false,error:'INVALID_STUDENT'};const s=load();const id='stu_'+Date.now();s.students.push({id,name:student.name.trim(),className:String(student.className||'').trim(),section:String(student.section||'').trim()});const r=save(s);return r.ok?{ok:true,error:null,id}:r;}
function markAttendance(id,date,status){if(typeof id!=='string'||typeof date!=='string'||!['present','absent','late'].includes(status))return {ok:false,error:'INVALID_ATTENDANCE'};const s=load();s.attendance=s.attendance.filter(x=>!(x.studentId===id&&x.date===date));s.attendance.push({studentId:id,date,status});return save(s);}
function addAnnouncement(text){if(typeof text!=='string'||!text.trim())return {ok:false,error:'INVALID_ANNOUNCEMENT'};const s=load();s.announcements.push({id:'ann_'+Date.now(),text:text.trim(),createdAt:new Date().toISOString()});return save(s);}
function getState(){return {ok:true,error:null,state:load()};}
global.BAASchool={getState,addStudent,markAttendance,addAnnouncement};
})(window);
