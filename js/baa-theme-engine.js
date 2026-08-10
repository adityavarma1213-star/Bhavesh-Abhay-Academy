/* BAA OS Theme Engine — six themes + Light/Dark/System mode. */
(function(global){
'use strict';
const KEY='baa_os_theme_v1';
const themes={
  aurora:{name:'Aurora',icon:'⭐',vars:{bg:'#f6f8ff',surface:'#ffffff',surface2:'#eef2ff',text:'#182033',muted:'#5e6780',accent:'#6d5dfc',accent2:'#17b9c8',gold:'#e6a52e',border:'rgba(24,32,51,.10)'}},
  galaxy:{name:'Galaxy',icon:'🌌',vars:{bg:'#0b0f2e',surface:'#141b4d',surface2:'#1b2460',text:'#fdf9f0',muted:'rgba(253,249,240,.68)',accent:'#7c5cfc',accent2:'#4cd9e8',gold:'#f5b942',border:'rgba(253,249,240,.10)'}},
  academic:{name:'Academic',icon:'📚',vars:{bg:'#f5f7fa',surface:'#ffffff',surface2:'#edf2f7',text:'#172033',muted:'#5f6b7a',accent:'#3157d5',accent2:'#159a9c',gold:'#b57912',border:'rgba(23,32,51,.12)'}},
  neoglass:{name:'NeoGlass',icon:'💎',vars:{bg:'#eef3ff',surface:'rgba(255,255,255,.70)',surface2:'rgba(255,255,255,.45)',text:'#19213d',muted:'#59627c',accent:'#7657e8',accent2:'#27b8d4',gold:'#d79b25',border:'rgba(255,255,255,.55)'}},
  calm:{name:'Calm',icon:'🌿',vars:{bg:'#f2f8f4',surface:'#ffffff',surface2:'#e7f2eb',text:'#193129',muted:'#60736b',accent:'#2f8f68',accent2:'#4ca6a8',gold:'#b27a28',border:'rgba(25,49,41,.10)'}},
  duology:{name:'Duology',icon:'🧸',vars:{bg:'#fff7fb',surface:'#ffffff',surface2:'#fff0f6',text:'#3a2850',muted:'#766a7d',accent:'#ff6f91',accent2:'#5b8cff',gold:'#f5b642',border:'rgba(58,40,80,.10)'}}
};
function get(){try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch(_){return {}}}
function save(v){try{localStorage.setItem(KEY,JSON.stringify(v))}catch(_) {}}
function systemMode(){return matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}
function apply(theme,mode){
  theme=themes[theme]?theme:'aurora'; mode=['light','dark','system'].includes(mode)?mode:'system';
  const effective=mode==='system'?systemMode():mode;
  const root=document.documentElement; const base=themes[theme].vars;
  const dark=effective==='dark';
  const vars=dark?{
    bg:'#0d1228',surface:'#151c3a',surface2:'#20284c',text:'#f8f8ff',muted:'rgba(248,248,255,.70)',
    accent:base.accent,accent2:base.accent2,gold:base.gold,border:'rgba(255,255,255,.12)'
  }:base;
  Object.entries(vars).forEach(([k,v])=>root.style.setProperty('--baa-'+k,v));
  root.dataset.baaTheme=theme; root.dataset.baaMode=effective; root.dataset.baaModePreference=mode;
  document.body?.setAttribute('data-baa-theme',theme);
  document.body?.setAttribute('data-baa-mode',effective);
  const state={theme,mode}; save(state);
  updateLabel();
}
function init(){const s=get();apply(s.theme||'aurora',s.mode||'system');matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change',()=>{if(get().mode==='system')apply(get().theme||'aurora','system')});}
function setTheme(t){const s=get();apply(t,s.mode||'system');}
function setMode(m){const s=get();apply(s.theme||'aurora',m);}
function updateLabel(){const s=get();const t=themes[s.theme||'aurora'];document.querySelectorAll('[data-baa-theme-label]').forEach(el=>el.textContent=t.icon+' '+t.name);document.querySelectorAll('[data-baa-mode-label]').forEach(el=>el.textContent=(s.mode||'system').replace(/^./,x=>x.toUpperCase()));}
function openPicker(){
  let el=document.getElementById('baaThemePicker'); if(!el){
    el=document.createElement('div'); el.id='baaThemePicker'; el.className='baa-theme-picker';
    el.innerHTML=`<div class="baa-theme-backdrop" data-close-theme></div><div class="baa-theme-panel" role="dialog" aria-modal="true" aria-labelledby="baaThemeTitle"><button class="baa-theme-close" data-close-theme aria-label="Close">×</button><div class="baa-theme-eyebrow">BAA OS</div><h2 id="baaThemeTitle">Choose your experience</h2><p>One BAA engine, six visual experiences.</p><div class="baa-theme-grid">${Object.entries(themes).map(([id,t])=>`<button class="baa-theme-option" data-theme="${id}"><span>${t.icon}</span><b>${t.name} OS</b><small>${id==='duology'?'Animated kids':id==='academic'?'Parents • Teachers • Schools':id==='galaxy'?'Student exploration':id==='calm'?'Focus • wellbeing':id==='neoglass'?'Premium • modern':'Flagship • all-round'}</small></button>`).join('')}</div><div class="baa-mode-row"><b>Display mode</b><button data-mode="light">☀️ Light</button><button data-mode="dark">🌙 Dark</button><button data-mode="system">🖥️ System</button></div></div>`;
    document.body.appendChild(el);el.addEventListener('click',e=>{const t=e.target.closest('[data-theme]');if(t){setTheme(t.dataset.theme);closePicker();}const m=e.target.closest('[data-mode]');if(m)setMode(m.dataset.mode);if(e.target.closest('[data-close-theme]'))closePicker();});
  }
  el.classList.add('open');
}
function closePicker(){document.getElementById('baaThemePicker')?.classList.remove('open')}
global.BAATheme={themes,init,setTheme,setMode,get,openPicker,closePicker};
document.addEventListener('DOMContentLoaded',init);
})(window);
