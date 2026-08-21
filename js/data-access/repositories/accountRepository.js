/* ============================================================
   js/data-access/repositories/accountRepository.js
   BAA OS — Section G2: account creation, login, and session
   management (client-side, local-testing only).

   NOTE: The production auth flow in index.html uses /api/auth/* and
   PostgreSQL. The legacy repository below remains for older tests and
   compatibility; it is NOT the production authentication boundary.
   ============================================================ */
(function (global) {
  'use strict';

  const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  function nowIso() { return new Date().toISOString(); }
  function getCrypto() {
    if (typeof module !== 'undefined' && module.exports) return require('crypto');
    return null;
  }
  function randomHex(byteLen) {
    if (typeof module !== 'undefined' && module.exports) return getCrypto().randomBytes(byteLen).toString('hex');
    const arr = new Uint8Array(byteLen);
    global.crypto.getRandomValues(arr);
    return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  function sha256Hex(text) {
    if (typeof module !== 'undefined' && module.exports) {
      const hash = getCrypto().createHash('sha256').update(text, 'utf8').digest('hex');
      return Promise.resolve(hash);
    }
    const data = new TextEncoder().encode(text);
    return global.crypto.subtle.digest('SHA-256', data).then((buf) =>
      Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
    );
  }
  function genId(prefix) { return `${prefix}_${Date.now().toString(36)}_${randomHex(4)}`; }
  function hashPassword(password) {
    const salt = randomHex(16);
    return sha256Hex(salt + password).then((digest) => `${salt}:${digest}`);
  }
  function verifyPassword(password, storedHash) {
    const parts = String(storedHash || '').split(':');
    if (parts.length !== 2) return Promise.resolve(false);
    return sha256Hex(parts[0] + password).then((computed) => computed === parts[1]);
  }
  function normalizeEmail(email) { return String(email || '').trim().toLowerCase(); }
  function validateSignupInput({ name, email, password }) {
    const errors = [];
    if (!name || !String(name).trim()) errors.push('Name is required.');
    const cleanEmail = normalizeEmail(email);
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) errors.push('A valid email address is required.');
    if (!password || String(password).length < 8) errors.push('Password must be at least 8 characters.');
    return errors;
  }
  function getRepo(adapter) {
    function readStore() { return adapter.getAccountsStore(); }
    function writeStore(store) { return adapter.saveAccountsStore(store); }
    function findUserByEmail(store, email) {
      const clean = normalizeEmail(email);
      return store.users.find((u) => normalizeEmail(u.email) === clean && !u.deactivated_at) || null;
    }
    function signUp({ name, email, password }) {
      const errors = validateSignupInput({ name, email, password });
      if (errors.length) return Promise.resolve({ ok: false, errors });
      const store = readStore();
      if (findUserByEmail(store, email)) return Promise.resolve({ ok: false, errors: ['An account with this email already exists.'] });
      const userId = genId('user');
      const ts = nowIso();
      const user = { id:userId, display_name:String(name).trim(), email:normalizeEmail(email), created_at:ts, updated_at:ts, deactivated_at:null };
      return hashPassword(String(password)).then((password_hash) => {
        store.users.push(user);
        store.credentials.push({ user_id:userId, password_hash, algorithm:'sha256-salted-local-only', created_at:ts, updated_at:ts });
        writeStore(store);
        return { ok:true, user };
      });
    }
    function logIn({ email, password }) {
      const store = readStore();
      const user = findUserByEmail(store, email);
      if (!user) return Promise.resolve({ ok:false, errors:['Incorrect email or password.'] });
      const credential = store.credentials.find((c) => c.user_id === user.id);
      if (!credential) return Promise.resolve({ ok:false, errors:['Incorrect email or password.'] });
      return verifyPassword(String(password || ''), credential.password_hash).then((valid) => {
        if (!valid) return { ok:false, errors:['Incorrect email or password.'] };
        const rawToken = randomHex(32);
        return sha256Hex(rawToken).then((token_hash) => {
          const ts = nowIso();
          const session = { id:genId('session'), user_id:user.id, token_hash, created_at:ts, expires_at:new Date(Date.now()+SESSION_TTL_MS).toISOString(), revoked_at:null };
          store.sessions.push(session);
          writeStore(store);
          adapter.setCurrentSessionToken(rawToken);
          return { ok:true, user, session };
        });
      });
    }
    function logOut(rawToken) {
      const token = rawToken || adapter.getCurrentSessionToken();
      adapter.setCurrentSessionToken(null);
      if (!token) return Promise.resolve({ ok:true, revoked:false });
      return sha256Hex(token).then((token_hash) => {
        const store = readStore();
        const session = store.sessions.find((s) => s.token_hash === token_hash && !s.revoked_at);
        if (!session) return { ok:true, revoked:false };
        session.revoked_at = nowIso();
        writeStore(store);
        return { ok:true, revoked:true };
      });
    }
    function getCurrentSession() {
      const token = adapter.getCurrentSessionToken();
      if (!token) return Promise.resolve(null);
      return sha256Hex(token).then((token_hash) => {
        const store = readStore();
        const session = store.sessions.find((s) => s.token_hash === token_hash);
        if (!session || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now()) return null;
        const user = store.users.find((u) => u.id === session.user_id && !u.deactivated_at);
        return user ? { user, session } : null;
      });
    }
    return { signUp, logIn, logOut, getCurrentSession };
  }

  const AccountRepository = { getRepo };
  if (typeof module !== 'undefined' && module.exports) module.exports = AccountRepository;
  else global.BAAAccountRepository = AccountRepository;
})(typeof window !== 'undefined' ? window : global);

/* ============================================================
   Accessible password visibility control
   ============================================================ */
(function addPasswordVisibilityControls() {
  function install() {
    document.querySelectorAll('input[type="password"]').forEach((input) => {
      if (input.dataset.baaPasswordToggle === '1') return;
      input.dataset.baaPasswordToggle = '1';
      const wrapper = document.createElement('span');
      wrapper.style.cssText = 'position:relative;display:block;width:100%;';
      input.parentNode.insertBefore(wrapper, input);
      wrapper.appendChild(input);
      input.style.paddingRight = '78px';
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = 'Show'; button.setAttribute('aria-label', 'Show password');
      button.style.cssText = ['position:absolute','right:10px','top:50%','transform:translateY(-50%)','border:0','background:transparent','color:var(--modal-fg-dim,#c8c9e8)','font:600 0.75rem var(--body,Inter,sans-serif)','cursor:pointer','padding:6px 8px','border-radius:6px'].join(';');
      button.addEventListener('click', () => {
        const showing = input.type === 'text';
        input.type = showing ? 'password' : 'text';
        button.textContent = showing ? 'Show' : 'Hide';
        button.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
      });
      wrapper.appendChild(button);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true });
  else install();
})();

/* ============================================================
   Production login UI: Keep Me Signed In
   ------------------------------------------------------------
   index.html already loads this repository before its DOM-ready phase.
   We therefore add the missing control here without duplicating the
   large inline index.html file. The wrapper calls the existing production
   auth function and only changes the login payload by adding `remember`.
   The server already supports this field and issues a 30-day cookie when
   it is true.
   ============================================================ */
(function installProductionRememberMe() {
  function install() {
    const form = document.getElementById('authForm');
    const password = document.getElementById('authPassword');
    const submit = document.getElementById('authSubmitBtn');
    if (!form || !password || !submit || document.getElementById('baaRememberMe')) return;

    const row = document.createElement('label');
    row.id = 'baaRememberMeRow';
    row.style.cssText = 'display:flex;align-items:center;gap:8px;margin:-2px 0 14px;color:var(--modal-fg-dim,#c8c9e8);font:500 .78rem var(--body,Inter,sans-serif);text-align:left;cursor:pointer;';
    row.innerHTML = '<input id="baaRememberMe" type="checkbox" style="width:16px;height:16px;accent-color:var(--violet);cursor:pointer;"><span>Keep me signed in</span>';
    password.parentNode.insertBefore(row, submit);

    // The existing index handler is kept intact for signup. For login, replace
    // only the submit handler so the server receives the explicit remember flag.
    form.addEventListener('submit', function(event) {
      if (typeof globalThis.authMode === 'undefined' || globalThis.authMode !== 'login') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (typeof globalThis.hideAuthError === 'function') globalThis.hideAuthError();
      const email = document.getElementById('authEmail').value.trim();
      const pass = password.value;
      submit.disabled = true;
      Promise.resolve(globalThis.callAuthApi('login', { email, password: pass, remember: document.getElementById('baaRememberMe').checked }))
        .then(result => {
          if (!result.ok) {
            if (typeof globalThis.showAuthError === 'function') globalThis.showAuthError((result.errors && result.errors[0]) || 'Something went wrong. Please try again.');
            return;
          }
          const name = (result.user && result.user.name) || '';
          window.location.href = 'student-os.html' + (name ? ('?name=' + encodeURIComponent(name)) : '');
        })
        .catch(() => {
          if (typeof globalThis.showAuthError === 'function') globalThis.showAuthError('Unable to complete login. Please try again.');
        })
        .finally(() => { submit.disabled = false; });
    }, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true });
  else install();
})();
