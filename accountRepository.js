/* ============================================================
   js/data-access/repositories/accountRepository.js
   BAA OS — Section G2: account creation, login, and session
   management (client-side, local-testing only).

   ------------------------------------------------------------
   HONESTY RULE — READ BEFORE USING THIS FILE ANYWHERE ELSE
   ------------------------------------------------------------
   This repository is NOT production-secure authentication. It runs
   entirely in the browser, against localStorage, because this
   project still has no live database or backend (see SCHEMA.md
   section 12 and js/data-access/README.md). Concretely:

     - There is no server to keep a secret from the browser. Every
       byte this file writes (including the salted password hash)
       sits in the same localStorage any other script on the page
       can read. This is the same "LOCAL_BROWSER_STORAGE_TESTING_ONLY"
       posture Sections B/C/D already use for their own data.
     - Passwords are hashed with a per-user random salt before
       storage (SHA-256, salt:hash encoded into the single
       `password_hash` TEXT column db/schema.sql already defines —
       see hashPassword() below) so a plaintext password is never
       written anywhere. That is still not equivalent to a real,
       server-side, rate-limited, network-verified auth system.
       `db/schema.sql`'s `credentials.algorithm` column defaults to
       'argon2id' as a placeholder for that real system; this file
       honestly records 'sha256-salted-local-only' instead, because
       that is what it actually does — it does not claim to
       implement argon2id.
     - Session tokens work the same way `auth_sessions` was designed
       for: only a hash of the token (`token_hash`) is ever stored.
       The raw token itself still has to live somewhere in this
       browser so the page can prove "this is the same session" on
       the next load — it is kept in a separate localStorage key
       (see localStorageAdapter.js `currentSessionToken`), which is
       just as inspectable as everything else here.
     - A REAL, network-verified secure implementation is a G4
       concern (secure backend/API foundation) — see SCHEMA.md
       section 12 and db/schema.sql's file header.

   ------------------------------------------------------------
   SCOPE (what this file does and does not do)
   ------------------------------------------------------------
   Does:
     - create an account (users + credentials rows)
     - log in (verify password, issue a session)
     - log out (revoke a session)
     - resolve "who is logged in on this browser right now"

   Does NOT do (left for later sections, same as G2.1's own scope
   note in db/schema.sql / SCHEMA.md section 15):
     - assign or check any role/permission (`user_roles` untouched —
       that enforcement is Section G3)
     - wire the existing single-learner repositories (learner /
       assessment / evidence / planner / teacherReview / teacherNotes)
       to take an authenticated learnerId — those still read the one
       local_learner slot exactly as before (js/data-access/README.md
       already flags this as future work once accounts exist)
     - anything involving a real database or network call (G4/G5)
   ============================================================ */
(function (global) {
  'use strict';

  const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days, local-testing default

  function nowIso() {
    return new Date().toISOString();
  }

  function getCrypto() {
    // Browser: Web Crypto (window.crypto). Node (tests): the 'crypto' module.
    if (typeof module !== 'undefined' && module.exports) {
      // eslint-disable-next-line global-require
      return require('crypto');
    }
    return null; // browser path handled directly with global.crypto below
  }

  function randomHex(byteLen) {
    if (typeof module !== 'undefined' && module.exports) {
      return getCrypto().randomBytes(byteLen).toString('hex');
    }
    const arr = new Uint8Array(byteLen);
    global.crypto.getRandomValues(arr);
    return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Returns a Promise<string> hex digest — async everywhere so the same
  // call works against Node's sync crypto and the browser's async
  // SubtleCrypto without two code paths at the call site.
  function sha256Hex(text) {
    if (typeof module !== 'undefined' && module.exports) {
      const hash = getCrypto().createHash('sha256').update(text, 'utf8').digest('hex');
      return Promise.resolve(hash);
    }
    const data = new TextEncoder().encode(text);
    return global.crypto.subtle.digest('SHA-256', data).then((buf) => {
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    });
  }

  function genId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${randomHex(4)}`;
  }

  // password_hash column encoding: "<saltHex>:<sha256Hex(salt+password)>".
  // One TEXT column (matches db/schema.sql exactly), no plaintext, no
  // schema change. See file header for why this isn't argon2id.
  function hashPassword(password) {
    const salt = randomHex(16);
    return sha256Hex(salt + password).then((digest) => `${salt}:${digest}`);
  }
  function verifyPassword(password, storedHash) {
    const parts = String(storedHash || '').split(':');
    if (parts.length !== 2) return Promise.resolve(false);
    const [salt, digest] = parts;
    return sha256Hex(salt + password).then((computed) => computed === digest);
  }

  function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
  }

  function validateSignupInput({ name, email, password }) {
    const errors = [];
    if (!name || !String(name).trim()) errors.push('Name is required.');
    const cleanEmail = normalizeEmail(email);
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      errors.push('A valid email address is required.');
    }
    if (!password || String(password).length < 8) {
      errors.push('Password must be at least 8 characters.');
    }
    return errors;
  }

  function getRepo(adapter) {
    function readStore() {
      return adapter.getAccountsStore();
    }
    function writeStore(store) {
      return adapter.saveAccountsStore(store);
    }

    function findUserByEmail(store, email) {
      const clean = normalizeEmail(email);
      return store.users.find((u) => normalizeEmail(u.email) === clean && !u.deactivated_at) || null;
    }

    // Creates a new account. Returns { ok: true, user } or
    // { ok: false, errors: string[] }. Never throws for expected
    // validation/duplicate-email cases — those are normal user input,
    // not exceptional failures.
    function signUp({ name, email, password }) {
      const errors = validateSignupInput({ name, email, password });
      if (errors.length) return Promise.resolve({ ok: false, errors });

      const store = readStore();
      if (findUserByEmail(store, email)) {
        return Promise.resolve({ ok: false, errors: ['An account with this email already exists.'] });
      }

      const userId = genId('user');
      const ts = nowIso();
      const user = {
        id: userId,
        display_name: String(name).trim(),
        email: normalizeEmail(email),
        created_at: ts,
        updated_at: ts,
        deactivated_at: null,
      };

      return hashPassword(String(password)).then((password_hash) => {
        const credential = {
          user_id: userId,
          password_hash,
          algorithm: 'sha256-salted-local-only', // see file header — honest label, not argon2id
          created_at: ts,
          updated_at: ts,
        };
        store.users.push(user);
        store.credentials.push(credential);
        writeStore(store);
        return { ok: true, user };
      });
    }

    // Verifies credentials and, on success, issues a session (rejects
    // with ok:false, never throws, for a wrong password / unknown
    // email — that's expected user input, not an exceptional failure).
    function logIn({ email, password }) {
      const store = readStore();
      const user = findUserByEmail(store, email);
      if (!user) return Promise.resolve({ ok: false, errors: ['Incorrect email or password.'] });

      const credential = store.credentials.find((c) => c.user_id === user.id);
      if (!credential) return Promise.resolve({ ok: false, errors: ['Incorrect email or password.'] });

      return verifyPassword(String(password || ''), credential.password_hash).then((valid) => {
        if (!valid) return { ok: false, errors: ['Incorrect email or password.'] };

        const rawToken = randomHex(32);
        return sha256Hex(rawToken).then((token_hash) => {
          const ts = nowIso();
          const session = {
            id: genId('session'),
            user_id: user.id,
            token_hash,
            created_at: ts,
            expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
            revoked_at: null,
          };
          store.sessions.push(session);
          writeStore(store);
          adapter.setCurrentSessionToken(rawToken);
          return { ok: true, user, session };
        });
      });
    }

    // Revokes the session matching this browser's stored raw token (or
    // the token passed in) and clears the stored raw token. Idempotent —
    // logging out twice, or with no session, is not an error.
    function logOut(rawToken) {
      const token = rawToken || adapter.getCurrentSessionToken();
      adapter.setCurrentSessionToken(null);
      if (!token) return Promise.resolve({ ok: true, revoked: false });

      return sha256Hex(token).then((token_hash) => {
        const store = readStore();
        const session = store.sessions.find((s) => s.token_hash === token_hash && !s.revoked_at);
        if (!session) return { ok: true, revoked: false };
        session.revoked_at = nowIso();
        writeStore(store);
        return { ok: true, revoked: true };
      });
    }

    // Resolves "who is logged in on this browser right now", honestly
    // returning null (never a fabricated user) if there is no stored
    // token, no matching session, or the session is expired/revoked.
    function getCurrentSession() {
      const token = adapter.getCurrentSessionToken();
      if (!token) return Promise.resolve(null);

      return sha256Hex(token).then((token_hash) => {
        const store = readStore();
        const session = store.sessions.find((s) => s.token_hash === token_hash);
        if (!session) return null;
        if (session.revoked_at) return null;
        if (new Date(session.expires_at).getTime() <= Date.now()) return null;
        const user = store.users.find((u) => u.id === session.user_id && !u.deactivated_at);
        if (!user) return null;
        return { user, session };
      });
    }

    return { signUp, logIn, logOut, getCurrentSession };
  }

  const AccountRepository = { getRepo };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = AccountRepository;
  } else {
    global.BAAAccountRepository = AccountRepository;
  }
})(typeof window !== 'undefined' ? window : global);
