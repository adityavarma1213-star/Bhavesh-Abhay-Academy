/* BAA Module 51 — Challenge & Competition Arena.
   Local-first UX with a production API boundary. Real cross-student play
   requires authenticated backend persistence; this module never pretends a
   local demo challenge is a live student challenge. */
(function(global){
'use strict';
const KEY='baa_challenges_v1';
const PROFILE_KEY='baa_challenge_profile_v1';
const MODES=[
 {id:'xp_race',name:'XP Race',icon:'⚡',desc:'Race to the target challenge XP.'},
 {id:'quiz_battle',name:'Quiz Battle',icon:'🧠',desc:'Class-appropriate questions with normalized scoring.'},
 {id:'streak_battle',name:'Study Streak Battle',icon:'🔥',desc:'Compare consistent study over the challenge window.'},
 {id:'weekly_xp',name:'Weekly XP Battle',icon:'📅',desc:'Highest challenge XP by week end wins.'},
 {id:'team_battle',name:'Team Battle',icon:'👥',desc:'Class or friend group versus another team.'}
];
function read(k,d){try{const x=JSON.parse(localStorage.getItem(k)||'null');return x??d}catch(_){return d}}
function write(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(_) {}}
function profile(){
 const xp=global.BAARewards?.getState?.()?.xp||0;
 const level=Math.max(1,Math.floor(xp/500)+1);
 return {xp,level,streak:read('baa_study_streak_v1',0),wins:read(PROFILE_KEY,{wins:0}).wins||0,losses:read(PROFILE_KEY,{losses:0}).losses||0};
}
function list(){return read(KEY,[])}
function save(ch){const all=list();all.unshift(ch);write(KEY,all.slice(0,50));return ch}
function create(opponent,mode='quiz_battle',target=500){
 const c={id:'local_'+Date.now().toString(36),opponent,mode,target,status:'pending',createdAt:new Date().toISOString(),localOnly:true};return save(c);
}
function counts(){const a=list();return {pending:a.filter(x=>x.status==='pending').length,active:a.filter(x=>x.status==='accepted').length,completed:a.filter(x=>x.status==='completed').length}}
function accept(id){const a=list();const c=a.find(x=>x.id===id);if(!c)return false;c.status='accepted';c.acceptedAt=new Date().toISOString();write(KEY,a);return true}
function decline(id){const a=list();const c=a.find(x=>x.id===id);if(!c)return false;c.status='declined';c.updatedAt=new Date().toISOString();write(KEY,a);return true}
function open(){
 const el=document.getElementById('world-challenge'); if(!el)return;
 refresh();el.classList.add('open');
}
function refresh(){
 const host=document.getElementById('challengeArenaPanel');if(!host)return;
 const p=profile(),cs=list();
 host.innerHTML=`<div class="arena-stats"><div><span>⭐ XP</span><b>${p.xp.toLocaleString()}</b></div><div><span>🏆 Level</span><b>${p.level}</b></div><div><span>⚔️ Wins</span><b>${p.wins}</b></div><div><span>📊 Record</span><b>${p.wins}-${p.losses}</b></div></div>
 <div class="arena-grid"><div class="arena-card"><div class="arena-card-head"><h3>⚔️ Challenge a student</h3><span>Cross-grade supported</span></div><p>Choose a student, then select a fair challenge mode. A Class 5 student can challenge a Class 9 or 10 student; Quiz Battle uses each student's own level before normalizing the result.</p><div class="arena-form"><input id="challengeOpponent" placeholder="Student name or invite ID" maxlength="80"><select id="challengeMode">${MODES.map(m=>`<option value="${m.id}">${m.icon} ${m.name}</option>`).join('')}</select><button class="btn-primary-sm" id="sendChallengeBtn">Send Challenge</button></div><small class="arena-note">Live student discovery is available when the authenticated Challenge API is connected. This browser build stores only local test challenges.</small></div>
 <div class="arena-card"><div class="arena-card-head"><h3>🔔 Your challenges</h3><span>${cs.length} local</span></div><div id="challengeList">${cs.length?cs.map(c=>`<div class="challenge-row"><div><b>${c.opponent}</b><small>${MODES.find(m=>m.id===c.mode)?.name||c.mode} · ${new Date(c.createdAt).toLocaleDateString()}</small></div><strong>${c.status}</strong>${c.status==='pending'?`<button data-accept="${c.id}">Accept</button><button data-decline="${c.id}">Decline</button>`:''}</div>`).join(''):'<div class="empty-arena">No challenges yet. Start one above.</div>'}</div></div></div>`;
 host.querySelector('#sendChallengeBtn').onclick=()=>{const name=host.querySelector('#challengeOpponent').value.trim();const mode=host.querySelector('#challengeMode').value;if(!name)return alert('Enter a student name or invite ID.');create(name,mode,mode==='xp_race'?500:0);refresh();};
 host.querySelectorAll('[data-accept]').forEach(b=>b.onclick=()=>{accept(b.dataset.accept);refresh();});host.querySelectorAll('[data-decline]').forEach(b=>b.onclick=()=>{decline(b.dataset.decline);refresh();});
}
global.BAAChallenge={MODES,profile,list,create,accept,decline,counts,open,refresh};
document.addEventListener('DOMContentLoaded',refresh);
})(window);
