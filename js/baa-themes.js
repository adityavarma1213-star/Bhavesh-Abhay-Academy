/* BAA Theme Engine — M62 final theme selector
   One OS, six visual experiences, three display modes.
   Persists only the user's visual preference in localStorage.
*/
(function(){
  'use strict';
  const KEY='baa.theme.preferences.v1';
  const THEMES={aurora:{name:'Aurora',icon:'⭐',desc:'Flagship BAA experience'},galaxy:{name:'Galaxy',icon:'🌌',desc:'Student exploration & adventure'},academic:{name:'Academic',icon:'📚',desc:'Clean, focused & structured'},neoglass:{name:'NeoGlass',icon:'💎',desc:'Premium modern interface'},calm:{name:'Calm',icon:'🌿',desc:'Focus & wellbeing'},duology:{name:'Duology',icon:'🧸',desc:'Animated kids experience'}};
  const MODES={light:'☀️ Light',dark:'🌙 Dark',system:'🖥️ System'};
  let prefs={theme:'aurora',mode:'system'}; let active=false;
  try{prefs=Object.assign(prefs,JSON.parse(localStorage.getItem(KEY)||'{}'));}catch(e){}
  if(!THEMES[prefs.theme])prefs.theme='aurora'; if(!MODES[prefs.mode])prefs.mode='system';
  function apply(){if(!active)return;const root=document.documentElement;root.dataset.baaTheme=prefs.theme;root.dataset.baaMode=prefs.mode;document.body.classList.toggle('baa-kids-motion',prefs.theme==='duology');const label=document.getElementById('themeCurrentLabel');if(label)label.textContent=THEMES[prefs.theme].name;const icon=document.getElementById('themeCurrentIcon');if(icon)icon.textContent=THEMES[prefs.theme].icon;document.querySelectorAll('[data-baa-theme-option]').forEach(function(el){el.setAttribute('aria-checked',String(el.dataset.baaThemeOption===prefs.theme));el.classList.toggle('selected',el.dataset.baaThemeOption===prefs.theme);});document.querySelectorAll('[data-baa-mode-option]').forEach(function(el){el.setAttribute('aria-checked',String(el.dataset.baaModeOption===prefs.mode));el.classList.toggle('selected',el.dataset.baaModeOption===prefs.mode);});try{localStorage.setItem(KEY,JSON.stringify(prefs));}catch(e){}}
  function chooseTheme(theme){if(!THEMES[theme])return;prefs.theme=theme;apply();}
  function chooseMode(mode){if(!MODES[mode])return;prefs.mode=mode;apply();}
  function close(){const p=document.getElementById('baaThemePanel');const b=document.getElementById('baaThemeButton');if(!p)return;p.classList.remove('open');if(b)b.setAttribute('aria-expanded','false');}
  function toggle(){const p=document.getElementById('baaThemePanel');const b=document.getElementById('baaThemeButton');if(!p)return;const open=!p.classList.contains('open');p.classList.toggle('open',open);if(b)b.setAttribute('aria-expanded',String(open));if(open){const first=p.querySelector('[data-baa-theme-option]');if(first)first.focus();}}
  function build(){if(document.getElementById('baaThemeButton')){apply();return;}if(!active)return;let host=document.querySelector('#screen-home .tb-right, .tb-right');let floating=false;if(!host){host=document.body;floating=true;}const wrap=document.createElement('div');wrap.className=floating?'baa-theme-wrap baa-theme-wrap-floating':'baa-theme-wrap';wrap.innerHTML=`<button id="baaThemeButton" class="baa-theme-button" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="baaThemePanel" title="Choose BAA theme"><span id="themeCurrentIcon">⭐</span><span class="baa-theme-button-label">BAA OS Engine</span><span id="themeCurrentLabel">Aurora</span><span class="baa-theme-chevron">⌄</span></button><div id="baaThemePanel" class="baa-theme-panel" role="dialog" aria-label="BAA Theme Selector"><div class="baa-theme-head"><div><strong>Theme Engine</strong><small>BAA OS Engine • Choose your visual experience</small></div><button type="button" class="baa-theme-close" aria-label="Close theme selector">×</button></div><div class="baa-theme-grid" role="radiogroup" aria-label="Themes">${Object.entries(THEMES).map(([key,t])=>`<button type="button" class="baa-theme-option" data-baa-theme-option="${key}" role="radio" aria-checked="false"><span class="baa-theme-icon">${t.icon}</span><span><b>${t.name}</b><small>${t.desc}</small></span><span class="baa-theme-check">✓</span></button>`).join('')}</div><div class="baa-mode-title">Display mode</div><div class="baa-mode-grid" role="radiogroup" aria-label="Display mode">${Object.entries(MODES).map(([key,label])=>`<button type="button" class="baa-mode-option" data-baa-mode-option="${key}" role="radio" aria-checked="false">${label}</button>`).join('')}</div><div class="baa-theme-note">System follows your device/browser preference automatically.</div></div>`;if(floating)host.appendChild(wrap);else host.insertBefore(wrap,host.firstChild);document.getElementById('baaThemeButton').addEventListener('click',toggle);document.querySelector('.baa-theme-close').addEventListener('click',close);document.querySelectorAll('[data-baa-theme-option]').forEach(el=>el.addEventListener('click',()=>chooseTheme(el.dataset.baaThemeOption)));document.querySelectorAll('[data-baa-mode-option]').forEach(el=>el.addEventListener('click',()=>chooseMode(el.dataset.baaModeOption)));document.addEventListener('click',function(e){if(!wrap.contains(e.target))close();});document.addEventListener('keydown',function(e){if(e.key==='Escape')close();});apply();}
  function activate(){active=true;build();apply();}
  function deactivate(){active=false;close();var wrap=document.querySelector('.baa-theme-wrap');if(wrap)wrap.remove();document.documentElement.removeAttribute('data-baa-theme');document.documentElement.removeAttribute('data-baa-mode');document.body.classList.remove('baa-kids-motion');}
  window.BAAThemeEngine={getPreferences:()=>Object.assign({},prefs),setTheme:chooseTheme,setMode:chooseMode,open:toggle,close:close,apply:apply,activate:activate,deactivate:deactivate};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',activate);else activate();
  if(window.matchMedia)window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change',function(){if(prefs.mode==='system')apply();});
  function installPasswordToggle(inputId){const input=document.getElementById(inputId);if(!input||input.dataset.visibilityReady==='1')return;input.dataset.visibilityReady='1';const parent=input.parentElement;if(!parent)return;const wrap=document.createElement('div');wrap.style.cssText='position:relative;width:100%;';parent.insertBefore(wrap,input);wrap.appendChild(input);input.style.paddingRight='68px';const button=document.createElement('button');button.type='button';button.textContent='Show';button.setAttribute('aria-label','Show password');button.style.cssText='position:absolute;right:10px;top:50%;transform:translateY(-50%);border:0;background:rgba(124,92,252,.18);color:#FDF9F0;padding:7px 10px;border-radius:8px;font:600 .76rem Inter,Arial,sans-serif;cursor:pointer;z-index:3;';button.addEventListener('click',function(){const visible=input.type==='text';input.type=visible?'password':'text';button.textContent=visible?'Show':'Hide';button.setAttribute('aria-label',visible?'Show password':'Hide password');});wrap.appendChild(button);}
  function installKeepSignedIn(){
    const password=document.getElementById('authPassword');
    if(!password || document.getElementById('keepSignedInWrap')) return;
    const wrap=document.createElement('label');
    wrap.id='keepSignedInWrap';
    wrap.style.cssText='display:none;align-items:center;gap:9px;margin:-2px 0 12px;color:var(--modal-fg-dim);font:500 .8rem Inter,Arial,sans-serif;cursor:pointer;user-select:none;';
    wrap.innerHTML='<input id="keepSignedIn" type="checkbox" style="width:16px;height:16px;accent-color:#7C5CFC;cursor:pointer"><span>Keep me signed in</span>';
    password.parentElement.insertAdjacentElement('afterend',wrap);
    const sync=function(){const loginMode=document.getElementById('authTabLogin')?.classList.contains('active');wrap.style.display=loginMode?'flex':'none';};
    sync();
    document.getElementById('authTabLogin')?.addEventListener('click',sync);
    document.getElementById('authTabSignup')?.addEventListener('click',sync);
    const original=window.callAuthApi;
    if(typeof original==='function' && !window.__baaRememberPatch){
      window.__baaRememberPatch=true;
      window.callAuthApi=function(action,body){
        if(action==='login') body=Object.assign({},body,{remember:!!document.getElementById('keepSignedIn')?.checked});
        return original(action,body);
      };
    }
  }
  function installAuthUx(){installPasswordToggle('authPassword');installPasswordToggle('resetPassword');const style=document.createElement('style');style.textContent='.modal input:focus-visible,.modal button:focus-visible{outline:2px solid #F5B942;outline-offset:2px}.modal .auth-tab,.modal .btn-primary{min-height:44px}#keepSignedInWrap input{margin:0}';document.head.appendChild(style);installKeepSignedIn();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installAuthUx);else installAuthUx();

  /* Role-aware workspace navigation: teachers/admins must be able to reach
     Academic Management from the OS instead of knowing a hidden URL. This is
     additive and server-authoritative: the link is shown only after /api/auth/me
     confirms the role. */
  function installRoleWorkspaceLink(){
    if(document.getElementById('baaRoleWorkspaceLink')) return;
    fetch('/api/auth/me',{credentials:'include',cache:'no-store'}).then(function(r){return r.ok?r.json():null}).then(function(session){
      const roles=session&&session.user&&(session.user.roles||session.user.role);
      const list=Array.isArray(roles)?roles:[roles].filter(Boolean);
      if(!list.includes('teacher')&&!list.includes('admin')) return;
      const host=document.querySelector('.tb-right,#screen-home .tb-right,.topbar,.top');
      if(!host) return;
      const link=document.createElement('a');
      link.id='baaRoleWorkspaceLink';
      link.href='teacher-portal.html';
      link.setAttribute('aria-label','Open Teacher and Academic Management');
      link.textContent='👩‍🏫 Teacher Portal';
      link.style.cssText='display:inline-flex;align-items:center;gap:7px;margin-left:8px;padding:9px 13px;border:1px solid rgba(76,217,232,.38);border-radius:999px;background:rgba(76,217,232,.08);color:#4CD9E8;text-decoration:none;font:700 .78rem Inter,Arial,sans-serif;white-space:nowrap;';
      host.appendChild(link);
    }).catch(function(){});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installRoleWorkspaceLink);else installRoleWorkspaceLink();

  function installLandingLinks(){
    const path=window.location.pathname;
    if(!(path==='/' || path.endsWith('/index.html'))) return;
    if(document.getElementById('baaLandingTools')) return;
    const wrap=document.createElement('div');
    wrap.id='baaLandingTools';
    wrap.style.cssText='position:fixed;right:18px;bottom:18px;z-index:9998;display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;';
    wrap.innerHTML='<a href="demo.html" style="display:inline-flex;align-items:center;gap:7px;padding:11px 15px;border-radius:999px;background:#7C5CFC;color:#fff;text-decoration:none;font:700 13px Inter,Arial,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25)">▶ Demo</a><a href="user-guide.html" style="display:inline-flex;align-items:center;gap:7px;padding:11px 15px;border-radius:999px;background:#173b73;color:#fff;text-decoration:none;font:700 13px Inter,Arial,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25)">📖 User Guide</a>';
    document.body.appendChild(wrap);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installLandingLinks);else installLandingLinks();
})();
