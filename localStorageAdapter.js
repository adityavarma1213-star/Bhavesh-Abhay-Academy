/* ============================================================
   js/data-access/adapters/localStorageAdapter.js
   BAA OS — Section G1: Data Access Layer / LocalStorage Adapter.

   HONESTY RULE: this adapter reads/writes the SAME localStorage
   keys that js/baa-assessment.js, js/baa-planner.js and the
   Section D teacher-notes store already use. It does not invent a
   parallel data store, does not change those keys' shape, and does
   not replace those files. It exists so repositories/*.js have one
   stable interface today (backed by localStorage) that can later be
   pointed at databaseAdapter.js instead (G4/G5), without every page
   needing to change.

   SCOPE: single-learner-per-browser, matching current app behavior.
   There is no login system yet (G2), so there is exactly one
   learner "slot" per browser. LOCAL_LEARNER_ID below is a fixed,
   stable placeholder id used only to shape data consistently with
   SCHEMA.md's learner_id columns — it is NOT a real database id and
   is never sent anywhere.
   ============================================================ */
(function (global) {
  'use strict';

  const KEYS = {
    studentName: 'baa_student_name',
    sectionB: 'baa_section_b_data_v1',       // js/baa-assessment.js STORAGE_KEY
    sectionC: 'baa_section_c_planner_v1',    // js/baa-planner.js STORAGE_KEY
    teacherNotes: 'baa_section_d_teacher_notes_v1', // teacher-os.html NOTES_KEY
    // Section G2: accounts/credentials/sessions. New key, new store — does
    // not touch or reshape any key above. See accountRepository.js header
    // for the full honesty notes on what this local-only store is and
    // is not.
    accounts: 'baa_section_g2_accounts_v1',
    // Raw (unhashed) session token for "who is currently logged in on this
    // browser" — kept separate from the accounts store above so the
    // accounts store itself never has to hold a raw token next to the
    // hashed session rows it also contains.
    currentSessionToken: 'baa_section_g2_current_session_token_v1',
    // Section G3: roles/relationships. NEW key, new store — does not
    // touch or reshape the G2 accounts store above. See
    // authorizationRepository.js header for the honesty notes this
    // key defers to.
    authorization: 'baa_section_g3_authorization_v1',
  };

  // Stable placeholder learner id for the single-learner-per-browser model.
  // See file header. Replaced by a real learner.id once G2/G5 exist.
  const LOCAL_LEARNER_ID = 'local_learner';

  function hasLocalStorage() {
    return typeof global.localStorage !== 'undefined' && global.localStorage !== null;
  }

  function readJSON(key, fallback) {
    if (!hasLocalStorage()) return fallback;
    try {
      const raw = global.localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed === null || parsed === undefined ? fallback : parsed;
    } catch {
      return fallback;
    }
  }

  function emptySectionB() {
    return { meta: {}, attempts: [], evidence: [], learningMemory: {}, mistakePatterns: [], teacherReviews: [] };
  }
  function emptySectionC() {
    return { meta: {}, preferences: { availableMinutesPerDay: 30 }, goals: [], upcomingAssessments: [], tasks: [], lastPlannedDate: null };
  }
  function emptyAccountsStore() {
    // Shaped after db/schema.sql's users / credentials / auth_sessions
    // (Section G1 + G2.1). This is a NEW store — it does not read or
    // write baa_student_name, sectionB, sectionC, or teacherNotes, and
    // nothing added here changes what those existing keys contain.
    return { users: [], credentials: [], sessions: [] };
  }

  function emptyAuthorizationStore() {
    // Shaped after db/schema.sql's user_roles / parent_learner /
    // teacher_learner / classes / class_members (Section G1). This is a
    // NEW store — it does not read or write baa_section_g2_accounts_v1
    // or any earlier key, and nothing added here changes what those
    // existing keys contain.
    return { userRoles: [], parentLearner: [], teacherLearner: [], classes: [], classMembers: [] };
  }

  function writeJSON(key, value) {
    if (!hasLocalStorage()) return false;
    try {
      global.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  const LocalStorageAdapter = {
    type: 'localStorage',

    // A real connection check, not a fabricated one: true only when a
    // usable localStorage is actually present in this environment.
    isConnected() {
      return hasLocalStorage();
    },

    getLocalLearnerId() {
      return LOCAL_LEARNER_ID;
    },

    getStudentName() {
      if (!hasLocalStorage()) return null;
      try {
        return global.localStorage.getItem(KEYS.studentName) || null;
      } catch {
        return null;
      }
    },

    // Raw Section B store: attempts / evidence / learningMemory /
    // mistakePatterns / teacherReviews — exact shape js/baa-assessment.js
    // already writes. Read-only from this adapter's perspective; G1 does
    // not write back into A/B/C/D's own stores.
    getSectionBStore() {
      return readJSON(KEYS.sectionB, emptySectionB());
    },

    // Raw Section C (planner) store — exact shape js/baa-planner.js
    // already writes.
    getSectionCStore() {
      return readJSON(KEYS.sectionC, emptySectionC());
    },

    // Raw Section D teacher notes list — exact shape teacher-os.html
    // already writes ({ id, text, createdAt }[]).
    getTeacherNotes() {
      return readJSON(KEYS.teacherNotes, []);
    },

    // ---------- Section G2: accounts / credentials / sessions ----------
    // NEW read/write surface — every other method above this point stays
    // read-only exactly as G1 left it. Local-testing storage only: see
    // accountRepository.js for the honesty notes this adapter defers to.
    getAccountsStore() {
      return readJSON(KEYS.accounts, emptyAccountsStore());
    },
    saveAccountsStore(store) {
      return writeJSON(KEYS.accounts, store || emptyAccountsStore());
    },
    getCurrentSessionToken() {
      if (!hasLocalStorage()) return null;
      try {
        return global.localStorage.getItem(KEYS.currentSessionToken) || null;
      } catch {
        return null;
      }
    },
    setCurrentSessionToken(token) {
      if (!hasLocalStorage()) return false;
      try {
        if (token) global.localStorage.setItem(KEYS.currentSessionToken, token);
        else global.localStorage.removeItem(KEYS.currentSessionToken);
        return true;
      } catch {
        return false;
      }
    },

    // ---------- Section G3: roles / relationships / access control ----------
    // NEW read/write surface — every method above this point is untouched
    // from G1/G2. Local-testing storage only, same posture as the rest of
    // this file. See authorizationRepository.js for the honesty notes.
    getAuthorizationStore() {
      return readJSON(KEYS.authorization, emptyAuthorizationStore());
    },
    saveAuthorizationStore(store) {
      return writeJSON(KEYS.authorization, store || emptyAuthorizationStore());
    },
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = LocalStorageAdapter;
  } else {
    global.BAALocalStorageAdapter = LocalStorageAdapter;
  }
})(typeof window !== 'undefined' ? window : global);
