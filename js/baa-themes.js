/* BAA Theme Engine — M62 final theme selector
   One OS, six visual experiences, three display modes.
   Persists only the user's visual preference in localStorage.
*/
(function(){
  'use strict';
  const KEY='baa.theme.preferences.v1';
  const THEMES={
    aurora:{name:'Aurora',icon:'⭐',desc:'Flagship BAA experience'},
    galaxy:{name:'Galaxy',icon:'🌌',desc:'Student exploration & adventure'},
    academic:{name:'Academic',icon:'📚',desc:'Clean, focused & structured'},
    neoglass:{name:'NeoGlass',icon:'💎',desc:'Premium modern interface'},
    calm:{name:'Calm',icon:'🌿',desc:'Focus & wellbeing'},
    duology:{name:'Duology',icon:'🧸',desc:'Animated kids experience'}
  };
  const MODES={light:'☀️ Light',dark:'🌙 Dark',system:'🖥️ System'};
  let prefs={theme:'aurora',mode:'system'};
  let active=false;
  try{ prefs=Object.assign(prefs,JSON.parse(localStorage.getItem(KEY)||'{}')); }catch(e){}
  if(!THEMES[prefs.theme]) prefs.theme='aurora';
  if(!MODES[prefs.mode]) prefs.mode='system';

  function apply(){
    if(!active) return;
    const root=document.documentElement;
    root.dataset.baaTheme=prefs.theme;
    root.dataset.baaMode=prefs.mode;
    document.body.classList.toggle('baa-kids-motion',prefs.theme==='duology');
    const label=document.getElementById('themeCurrentLabel');
    if(label) label.textContent=THEMES[prefs.theme].name;
    const icon=document.getElementById('themeCurrentIcon');
    if(icon) icon.textContent=THEMES[prefs.theme].icon;
    document.querySelectorAll('[data-baa-theme-option]').forEach(function(el){
      el.setAttribute('aria-checked',String(el.dataset.baaThemeOption===prefs.theme));
      el.classList.toggle('selected',el.dataset.baaThemeOption===prefs.theme);
    });
    document.querySelectorAll('[data-baa-mode-option]').forEach(function(el){
      el.setAttribute('aria-checked',String(el.dataset.baaModeOption===prefs.mode));
      el.classList.toggle('selected',el.dataset.baaModeOption===prefs.mode);
    });
    try{localStorage.setItem(KEY,JSON.stringify(prefs));}catch(e){}
  }
  function chooseTheme(theme){
    if(!THEMES[theme]) return;
    prefs.theme=theme; apply();
  }
  function chooseMode(mode){
    if(!MODES[mode]) return;
    prefs.mode=mode; apply();
  }
  function close(){
    const p=document.getElementById('baaThemePanel');
    const b=document.getElementById('baaThemeButton');
    if(!p) return;
    p.classList.remove('open');
    if(b) b.setAttribute('aria-expanded','false');
  }
  function toggle(){
    const p=document.getElementById('baaThemePanel');
    const b=document.getElementById('baaThemeButton');
    if(!p) return;
    const open=!p.classList.contains('open');
    p.classList.toggle('open',open);
    if(b) b.setAttribute('aria-expanded',String(open));
    if(open){ const first=p.querySelector('[data-baa-theme-option]'); if(first) first.focus(); }
  }
  function build(){
    if(document.getElementById('baaThemeButton')){apply();return;}
    if(!active) return;
    // Prefer an existing top-bar slot if the page has one; otherwise mount
    // a small fixed floating button so the engine works on ANY page,
    // including ones with no .tb-right container at all (billing, account,
    // feature-map, index, etc.).
    let host=document.querySelector('#screen-home .tb-right, .tb-right');
    let floating=false;
    if(!host){ host=document.body; floating=true; }
    const wrap=document.createElement('div');
    wrap.className=floating?'baa-theme-wrap baa-theme-wrap-floating':'baa-theme-wrap';
    wrap.innerHTML=`
      <button id="baaThemeButton" class="baa-theme-button" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="baaThemePanel" title="Choose BAA theme">
        <span id="themeCurrentIcon">⭐</span><span class="baa-theme-button-label">BAA OS Engine</span><span id="themeCurrentLabel">Aurora</span><span class="baa-theme-chevron">⌄</span>
      </button>
      <div id="baaThemePanel" class="baa-theme-panel" role="dialog" aria-label="BAA Theme Selector">
        <div class="baa-theme-head"><div><strong>Theme Engine</strong><small>BAA OS Engine • Choose your visual experience</small></div><button type="button" class="baa-theme-close" aria-label="Close theme selector">×</button></div>
        <div class="baa-theme-grid" role="radiogroup" aria-label="Themes">
          ${Object.entries(THEMES).map(([key,t])=>`<button type="button" class="baa-theme-option" data-baa-theme-option="${key}" role="radio" aria-checked="false"><span class="baa-theme-icon">${t.icon}</span><span><b>${t.name}</b><small>${t.desc}</small></span><span class="baa-theme-check">✓</span></button>`).join('')}
        </div>
        <div class="baa-mode-title">Display mode</div>
        <div class="baa-mode-grid" role="radiogroup" aria-label="Display mode">
          ${Object.entries(MODES).map(([key,label])=>`<button type="button" class="baa-mode-option" data-baa-mode-option="${key}" role="radio" aria-checked="false">${label}</button>`).join('')}
        </div>
        <div class="baa-theme-note">System follows your device/browser preference automatically.</div>
      </div>`;
    if(floating){ host.appendChild(wrap); } else { host.insertBefore(wrap,host.firstChild); }
    document.getElementById('baaThemeButton').addEventListener('click',toggle);
    document.querySelector('.baa-theme-close').addEventListener('click',close);
    document.querySelectorAll('[data-baa-theme-option]').forEach(el=>el.addEventListener('click',()=>chooseTheme(el.dataset.baaThemeOption)));
    document.querySelectorAll('[data-baa-mode-option]').forEach(el=>el.addEventListener('click',()=>chooseMode(el.dataset.baaModeOption)));
    document.addEventListener('click',function(e){if(!wrap.contains(e.target)) close();});
    document.addEventListener('keydown',function(e){if(e.key==='Escape') close();});
    apply();
  }
  function activate(){ active=true; build(); apply(); }
  function deactivate(){ active=false; close(); var wrap=document.querySelector('.baa-theme-wrap'); if(wrap) wrap.remove(); document.documentElement.removeAttribute('data-baa-theme'); document.documentElement.removeAttribute('data-baa-mode'); document.body.classList.remove('baa-kids-motion'); }
  window.BAAThemeEngine={getPreferences:()=>Object.assign({},prefs),setTheme:chooseTheme,setMode:chooseMode,open:toggle,close:close,apply:apply,activate:activate,deactivate:deactivate};
  // The engine now activates itself on every page that includes this
  // script, so the theme button is never dependent on a page remembering
  // to call activate() manually. Pages (like student-os.html's onboarding
  // flow) that still call activate() explicitly later are unaffected —
  // build()/apply() are idempotent and just no-op if already mounted.
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',activate);
  } else {
    activate();
  }
  if(window.matchMedia){ window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change',function(){if(prefs.mode==='system')apply();}); }
})();
