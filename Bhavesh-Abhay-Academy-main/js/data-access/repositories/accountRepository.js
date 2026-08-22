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
   ------------------------------------------------------------
   This is UI-only and does not change authentication/storage.
   It adds an explicit Show/Hide control to every password input
   present in the auth modal, including reset-password fields.
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
      button.type = 'button';
      button.textContent = 'Show';
      button.setAttribute('aria-label', 'Show password');
      button.style.cssText = [
        'position:absolute', 'right:10px', 'top:50%', 'transform:translateY(-50%)',
        'border:0', 'background:transparent', 'color:var(--modal-fg-dim,#c8c9e8)',
        'font:600 0.75rem var(--body,Inter,sans-serif)', 'cursor:pointer',
        'padding:6px 8px', 'border-radius:6px'
      ].join(';');

      button.addEventListener('click', () => {
        const showing = input.type === 'text';
        input.type = showing ? 'password' : 'text';
        button.textContent = showing ? 'Show' : 'Hide';
        button.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
      });
      wrapper.appendChild(button);
    });
  }

  if (typeof document === 'undefined') return;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true });
  else install();
})();
