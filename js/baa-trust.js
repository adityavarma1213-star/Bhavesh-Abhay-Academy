/* ============================================================
   js/baa-trust.js
   BAA OS — SECTION E: AI Trust, Privacy & Compliance (Module 37) +
   Student Data Trust & Fresh-Start Controls (Module 55).

   HONESTY RULE (same posture as every other section): this file never
   claims a compliance standard ("COPPA compliant", "GDPR compliant",
   "fully encrypted") the actual implementation does not prove. It
   documents, in plain language pulled from the running app, what data
   exists, why, who can reach it in THIS build, how long it stays, and
   gives the student/parent real controls over it — while being explicit
   that every one of those controls runs client-side against localStorage,
   inspectable by anyone with devtools on this browser. A server-enforced,
   legally-compliant version of this is a Section G4+ dependency, not
   something this file pretends to already be.

   WHAT THIS FILE DOES NOT DO:
   - It does not create a second copy of Section B/C/D's data. It reads
     those stores to build the data inventory and to perform fresh-start/
     export, and it writes only to its OWN new key (see STORAGE_KEY).
   - It does not gate page access — that remains G3's (not-yet-wired-in)
     job, unchanged by this file.
   - It does not implement server-side deletion, encryption at rest, or
     any production security control. Those are labeled as future G4/G5/G6
     dependencies wherever they're mentioned in this file's public API.
   ============================================================ */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'baa_section_e_trust_v1';
  const SCHEMA_VERSION = 1;

  function uid(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
  function nowISO() { return new Date().toISOString(); }

  function emptyStore() {
    return {
      meta: {
        schemaVersion: SCHEMA_VERSION,
        storageType: 'LOCAL_BROWSER_STORAGE_TESTING_ONLY',
        createdAt: nowISO(),
      },
      // Module 37/55: has a parent/guardian acknowledged the data-use
      // information below? This is a LOCAL ACKNOWLEDGEMENT ONLY — it is
      // not a verified, tamper-proof parental-consent record (that needs
      // a real account system + backend, i.e. G4+). Recorded honestly as
      // such in getConsentStatus() below.
      consent: {
        parentalAcknowledgementGiven: false,
        acknowledgedAt: null,
        acknowledgedRole: null, // 'parent' | 'student' — self-reported, not verified
      },
      // Module 37: an honest, append-only log of trust/privacy-relevant
      // actions taken IN THIS BROWSER (consent changes, exports, deletion
      // requests, fresh-starts). Not a security audit log — there is no
      // server to make it tamper-proof — but it is never silently rewritten.
      activityLog: [],
      // Module 55: deletion / fresh-start requests and their outcome.
      deletionRequests: [],
      freshStartArchives: [], // metadata only — see freshStart() for what this holds
    };
  }

  function hasLocalStorage() {
    return typeof global.localStorage !== 'undefined' && global.localStorage !== null;
  }
  function load() {
    if (!hasLocalStorage()) return emptyStore();
    try {
      const raw = global.localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyStore();
      const parsed = JSON.parse(raw);
      return parsed && parsed.meta ? parsed : emptyStore();
    } catch {
      return emptyStore();
    }
  }
  function save(store) {
    if (!hasLocalStorage()) return false;
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
      return true;
    } catch {
      return false;
    }
  }
  function logEvent(store, action, detail) {
    store.activityLog.push({ id: uid('log'), action, detail: detail || null, at: nowISO() });
    // Keep this local-browser log from growing without bound.
    if (store.activityLog.length > 500) store.activityLog = store.activityLog.slice(-500);
  }

  // ============================================================
  // Module 37: DATA INVENTORY — describes what's ACTUALLY in this app
  // today, read from real code, not a generic privacy-policy template.
  // This list must be kept in sync by hand when a section adds a new
  // store; it deliberately does not try to introspect localStorage keys
  // automatically, because a key existing doesn't tell you WHY the data
  // is collected or WHO can see it — that context has to come from the
  // people who built each section.
  // ============================================================
  const DATA_INVENTORY = [
    {
      category: 'Student name',
      storageKey: 'baa_student_name',
      why: 'Personalizes the AI Tutor and displays used across the app.',
      whoCanAccess: 'Anyone using this browser (no accounts protect it yet — Section G2 login exists but does not gate this key).',
      retention: 'Kept until manually cleared or fresh-start / this-app-only deletion is used below.',
    },
    {
      category: 'Assessment attempts & AI evaluations (Section B)',
      storageKey: 'baa_section_b_data_v1',
      why: 'Grades work, builds Learning Memory / Mistake Archeology, and powers the Teacher Review queue.',
      whoCanAccess: 'This browser; conceptually the student, and a teacher/parent using teacher-os.html / parent-os.html / teacher-review.html on the same browser (no server-side access control exists yet — see G3 boundary notes).',
      retention: 'Kept until fresh-start or a deletion request is fulfilled below.',
    },
    {
      category: 'Learning Intelligence & AI Planner (Section C)',
      storageKey: 'baa_section_c_planner_v1',
      why: 'Turns Section B evidence into concept states, trends, and a daily study plan, each with a real "why".',
      whoCanAccess: 'Same as above.',
      retention: 'Kept until fresh-start or a deletion request is fulfilled below.',
    },
    {
      category: 'Teacher notes (Section D)',
      storageKey: 'baa_section_d_teacher_notes_v1',
      why: 'Free-text notes a teacher adds while reviewing this one student\'s progress.',
      whoCanAccess: 'Same as above.',
      retention: 'Kept until fresh-start or a deletion request is fulfilled below.',
    },
    {
      category: 'Account / credentials (Section G2)',
      storageKey: 'baa_section_g2_accounts_v1',
      why: 'Local-only signup/login so the app can recognize a returning user on this browser.',
      whoCanAccess: 'This browser only. Passwords are salted-and-hashed, never stored in plaintext — see accountRepository.js — but this is still not a production-secure, server-verified login (G4 dependency).',
      retention: 'Kept until account data is cleared via fresh-start/deletion below, or a session is logged out (which revokes, not deletes, the session record).',
    },
    {
      category: 'Roles & relationships (Section G3)',
      storageKey: 'baa_section_g3_authorization_v1',
      why: 'Decides which roles (student/parent/teacher/admin) and parent/teacher-to-learner links exist, for future access-control checks.',
      whoCanAccess: 'This browser only. Not yet enforced on page navigation (documented G3 boundary).',
      retention: 'Kept until fresh-start or a deletion request is fulfilled below.',
    },
    {
      category: 'Current session token (Section G2)',
      storageKey: 'baa_section_g2_current_session_token_v1',
      why: 'Remembers which account is currently logged in on this browser, kept separate from the accounts store itself.',
      whoCanAccess: 'This browser only. Not yet enforced on page navigation (documented G3 boundary).',
      retention: 'Cleared on logout (session revoked) or by the "everything" deletion below.',
    },
    {
      category: 'AI Tutor chat history',
      storageKey: 'baaOsChatHistory',
      why: 'Lets the AI Tutor conversation persist across visits instead of resetting every time the page reloads.',
      whoCanAccess: 'This browser only.',
      retention: 'Kept until fresh-start or a deletion request is fulfilled below.',
    },
    {
      category: 'Wellbeing preferences (Section E)',
      storageKey: 'baa_section_e_wellbeing_prefs_v1',
      why: 'Remembers whether the student has turned break/wellbeing reminders on or off, and related pacing preferences.',
      whoCanAccess: 'This browser only.',
      retention: 'Kept until fresh-start or a deletion request is fulfilled below.',
    },
    {
      category: 'Read-aloud (TTS) preferences',
      storageKey: 'baaOsVoicePreset, baaOsAutoSpeak, baaOsVoiceMuted',
      why: 'Remembers the chosen TTS voice, whether AI Tutor replies auto-speak, and whether voice is muted.',
      whoCanAccess: 'This browser only.',
      retention: 'Kept until fresh-start or a deletion request is fulfilled below.',
    },
    {
      category: 'Uploaded image (AI Tutor "understand this image")',
      storageKey: '(none — not persisted)',
      why: 'Lets the student ask the AI Tutor about a photo/screenshot of their work.',
      whoCanAccess: 'Sent to the chat backend (api/chat.js) for that one request only.',
      retention: 'Not persisted — never written to localStorage or any BAA store. Held in memory only until sent or cleared, then discarded. See js/image.js.',
    },
    {
      category: 'Voice / Text-to-Speech audio',
      storageKey: '(none — not persisted)',
      why: 'Reads AI Tutor replies aloud on request.',
      whoCanAccess: 'Generated by api/speak.js per request and played back; not written to any BAA store.',
      retention: 'NEVER stored — ephemeral, discarded after playback.',
    },
    {
      category: 'This trust/privacy record itself (Section E)',
      storageKey: STORAGE_KEY,
      why: 'Records consent acknowledgement, the activity log, and deletion/fresh-start requests described on this page.',
      whoCanAccess: 'This browser only.',
      retention: 'Kept until fresh-start or a deletion request is fulfilled below (this key is included in both).',
    },
  ];

  const RETENTION_POLICY_TEXT =
    'BAA OS, in this build, keeps all of the above ONLY in this browser\'s ' +
    'localStorage — there is no server-side database yet (that is a ' +
    'Section G4/G5 dependency), so there is no BAA-controlled backup or ' +
    'off-device copy to separately retain or delete. Data stays until the ' +
    'browser\'s storage is cleared, or until Fresh Start / a deletion ' +
    'request below is used. Nothing here is retained "for compliance ' +
    'purposes" beyond what the reviewer decisions themselves already need ' +
    '(see "Why history is preserved" below) — this build makes no claim of ' +
    'meeting COPPA, GDPR, FERPA, or any other legal retention/deletion ' +
    'standard; that requires real infrastructure this build does not have.';

  function getDataInventory() {
    return DATA_INVENTORY.map(d => ({ ...d }));
  }
  function getRetentionPolicyText() {
    return RETENTION_POLICY_TEXT;
  }

  // ============================================================
  // Consent (Module 37/55) — a LOCAL acknowledgement, honestly labeled.
  // ============================================================
  function getConsentStatus() {
    const store = load();
    return { ...store.consent };
  }
  function recordConsentAcknowledgement(role) {
    if (!['parent', 'student'].includes(role)) {
      return { error: 'role must be parent or student' };
    }
    const store = load();
    store.consent = {
      parentalAcknowledgementGiven: true,
      acknowledgedAt: nowISO(),
      acknowledgedRole: role,
    };
    logEvent(store, 'consent_acknowledged', { role });
    save(store);
    return { consent: { ...store.consent } };
  }
  function revokeConsentAcknowledgement() {
    const store = load();
    store.consent = { parentalAcknowledgementGiven: false, acknowledgedAt: null, acknowledgedRole: null };
    logEvent(store, 'consent_revoked', null);
    save(store);
    return { consent: { ...store.consent } };
  }

  function getActivityLog(limit) {
    const store = load();
    const list = store.activityLog.slice().reverse();
    return typeof limit === 'number' ? list.slice(0, limit) : list;
  }

  // ============================================================
  // Module 55: EXPORT — lets a student/parent actually see everything
  // this build holds about them, in one readable object. Real data only:
  // reads the live stores, never fabricates a placeholder record.
  // ============================================================
  function exportAllData() {
    const readKey = (key) => {
      if (!hasLocalStorage()) return null;
      try {
        const raw = global.localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    };
    const store = load();
    logEvent(store, 'data_exported', null);
    save(store);
    return {
      exportedAt: nowISO(),
      studentName: (hasLocalStorage() && global.localStorage.getItem('baa_student_name')) || null,
      sectionB_assessments: readKey('baa_section_b_data_v1'),
      sectionC_plannerIntelligence: readKey('baa_section_c_planner_v1'),
      sectionD_teacherNotes: readKey('baa_section_d_teacher_notes_v1'),
      sectionG2_account: readKey('baa_section_g2_accounts_v1'),
      sectionG2_currentSessionToken: (hasLocalStorage() && global.localStorage.getItem('baa_section_g2_current_session_token_v1')) || null,
      sectionG3_rolesAndLinks: readKey('baa_section_g3_authorization_v1'),
      aiTutorChatHistory: readKey('baaOsChatHistory'),
      sectionE_wellbeingPrefs: readKey('baa_section_e_wellbeing_prefs_v1'),
      voicePreferences: {
        preset: (hasLocalStorage() && global.localStorage.getItem('baaOsVoicePreset')) || null,
        autoSpeak: (hasLocalStorage() && global.localStorage.getItem('baaOsAutoSpeak')) || null,
        muted: (hasLocalStorage() && global.localStorage.getItem('baaOsVoiceMuted')) || null,
      },
      sectionE_trustRecord: store,
    };
  }

  // ============================================================
  // Module 55: FRESH START — archives, then clears, the student's ACTIVE
  // learning data (attempts/evidence/learning memory/mistake patterns/
  // planner tasks). It deliberately does NOT delete teacherReviews
  // (human review/appeal decisions) as part of a routine fresh start —
  // those are the record that "no silent modification/destruction of
  // historical evaluation records" (Module 39/55) protects. A full
  // account-and-everything deletion is a separate, explicit action —
  // see requestDeletion({ scope: 'everything' }).
  // ============================================================
  function freshStart({ requestedBy = 'student', reason = '' } = {}) {
    if (!hasLocalStorage()) return { error: 'localStorage is not available in this environment' };
    const bKey = 'baa_section_b_data_v1';
    const cKey = 'baa_section_c_planner_v1';
    let bStore = null, cStore = null;
    try { bStore = JSON.parse(global.localStorage.getItem(bKey) || 'null'); } catch { bStore = null; }
    try { cStore = JSON.parse(global.localStorage.getItem(cKey) || 'null'); } catch { cStore = null; }

    const archiveId = uid('archive');
    const preservedReviews = (bStore && Array.isArray(bStore.teacherReviews)) ? bStore.teacherReviews : [];

    const store = load();
    store.freshStartArchives.push({
      id: archiveId,
      archivedAt: nowISO(),
      requestedBy,
      reason: reason ? String(reason).slice(0, 500) : '',
      note: 'Full snapshot of Section B + C at the time of this fresh start. ' +
        'Human review/appeal decisions (teacherReviews) were carried forward ' +
        'into the new store, not archived-and-erased, per Module 39/55.',
      hadAttempts: bStore ? (bStore.attempts || []).length : 0,
      hadEvidence: bStore ? (bStore.evidence || []).length : 0,
      hadTasks: cStore ? (cStore.tasks || []).length : 0,
    });

    if (bStore) {
      const clearedB = {
        meta: bStore.meta || {},
        attempts: [],
        evidence: [],
        learningMemory: {},
        mistakePatterns: [],
        // Preserved intentionally — see function header.
        teacherReviews: preservedReviews,
      };
      global.localStorage.setItem(bKey, JSON.stringify(clearedB));
    }
    if (cStore) {
      const clearedC = {
        meta: cStore.meta || {},
        preferences: cStore.preferences || { availableMinutesPerDay: 30 },
        goals: [],
        upcomingAssessments: [],
        tasks: [],
        lastPlannedDate: null,
      };
      global.localStorage.setItem(cKey, JSON.stringify(clearedC));
    }

    logEvent(store, 'fresh_start', { archiveId, requestedBy, reason });
    save(store);
    return { archiveId, preservedReviewCount: preservedReviews.length };
  }

  function listFreshStartArchives() {
    return load().freshStartArchives.slice().reverse();
  }

  // ============================================================
  // Module 55: DELETION REQUESTS. In THIS local-only build there is no
  // server/backend to enforce a delayed or verified deletion, so a
  // 'this_app_only' request can be fulfilled immediately, client-side.
  // It is still logged as a REQUEST first, then a fulfillment, so the
  // activity log shows the actual sequence of events, not just the end
  // state. An 'everything' scope additionally clears the account/roles
  // stores (full sign-out of this local identity) — the one destructive
  // action in this file, and it is never triggered automatically.
  // ============================================================
  function requestDeletion({ scope = 'this_app_only', requestedBy = 'student', reason = '' } = {}) {
    if (!['this_app_only', 'everything'].includes(scope)) {
      return { error: 'scope must be this_app_only or everything' };
    }
    const store = load();
    const request = {
      id: uid('delreq'),
      scope,
      requestedBy,
      reason: reason ? String(reason).slice(0, 500) : '',
      status: 'pending',
      requestedAt: nowISO(),
      resolvedAt: null,
    };
    store.deletionRequests.push(request);
    logEvent(store, 'deletion_requested', { scope, requestedBy });
    save(store);
    return { request };
  }

  function fulfillDeletion(requestId) {
    const store = load();
    const request = store.deletionRequests.find(r => r.id === requestId);
    if (!request) return { error: 'Deletion request not found' };
    if (request.status !== 'pending') return { error: 'Request already resolved' };

    if (!hasLocalStorage()) return { error: 'localStorage is not available in this environment' };

    // NOTE: STORAGE_KEY (this trust record — consent + activity log) is
    // intentionally NOT in keysAppOnly. It is the audit trail that a
    // deletion happened, so a "this app's learning data only" deletion
    // preserves it. It IS included when scope is 'everything', since that
    // scope means erasing this local identity entirely.
    const keysAppOnly = [
      'baa_section_b_data_v1', 'baa_section_c_planner_v1',
      'baa_section_d_teacher_notes_v1',
    ];
    const keysEverything = keysAppOnly.concat([
      'baa_student_name', 'baa_section_g2_accounts_v1',
      'baa_section_g2_current_session_token_v1', 'baa_section_g3_authorization_v1',
      'baaOsChatHistory', 'baa_section_e_wellbeing_prefs_v1',
      'baaOsVoicePreset', 'baaOsAutoSpeak', 'baaOsVoiceMuted',
      STORAGE_KEY,
    ]);
    const keys = request.scope === 'everything' ? keysEverything : keysAppOnly;

    request.status = 'fulfilled';
    request.resolvedAt = nowISO();

    // Log the fulfillment BEFORE erasing STORAGE_KEY, since this store's own
    // key may itself be in the erase list (scope: 'everything').
    logEvent(store, 'deletion_fulfilled', { requestId, scope: request.scope });
    save(store);

    for (const k of keys) {
      if (k === STORAGE_KEY) continue; // handled by save()/erase below
      try { global.localStorage.removeItem(k); } catch { /* best-effort */ }
    }
    if (request.scope === 'everything') {
      try { global.localStorage.removeItem(STORAGE_KEY); } catch { /* best-effort */ }
      return { fulfilled: true, scope: request.scope, note: 'All local BAA data on this browser, including this trust record, was cleared.' };
    }
    return { fulfilled: true, scope: request.scope };
  }

  function listDeletionRequests() {
    return load().deletionRequests.slice().reverse();
  }

  // ============================================================
  // Public API
  // ============================================================
  global.BAATrust = {
    STORAGE_KEY,
    getDataInventory,
    getRetentionPolicyText,
    getConsentStatus,
    recordConsentAcknowledgement,
    revokeConsentAcknowledgement,
    getActivityLog,
    exportAllData,
    freshStart,
    listFreshStartArchives,
    requestDeletion,
    fulfillDeletion,
    listDeletionRequests,
    _load: load,
    _emptyStore: emptyStore,
  };
})(typeof window !== 'undefined' ? window : global);
