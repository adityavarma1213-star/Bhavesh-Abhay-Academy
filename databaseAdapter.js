/* ============================================================
   js/data-access/adapters/databaseAdapter.js
   BAA OS — Section G1: Data Access Layer / Database Adapter (STUB).

   HONESTY RULE (requirement 20/28): this project has NO live
   database connection or credentials configured. This adapter must
   never pretend otherwise. Every read/write method below throws a
   DATABASE_NOT_CONNECTED error rather than returning fabricated or
   empty-but-successful data.

   This file exists so:
     1. repositories/*.js have a second, schema-shaped implementation
        of the same interface as localStorageAdapter.js, proving the
        abstraction isn't tied to localStorage's exact shape.
     2. G4 has one clear place to implement a real client later
        (e.g. an HTTP-based Postgres driver compatible with Vercel
        Edge Functions — see SCHEMA.md §20) without touching every
        repository or page.
     3. Tests (test/run-g1-tests.js) can assert that "not connected"
        is reported truthfully instead of silently succeeding.

   G1 explicitly does NOT:
     - connect to any database
     - read DATABASE_URL / any credential env var
     - migrate any real data (see MIGRATION-MAPPING.md — that is G5)
   ============================================================ */
(function (global) {
  'use strict';

  function notConnected(method) {
    const err = new Error(
      `[BAA DatabaseAdapter] ${method}() called, but no live database is connected in this ` +
      'project (Section G1 is schema/design only). See SCHEMA.md and MIGRATION-MAPPING.md.'
    );
    err.code = 'DATABASE_NOT_CONNECTED';
    throw err;
  }

  const DatabaseAdapter = {
    type: 'database',

    // Always honest: false, because nothing is connected. A future real
    // implementation (G4) would check an actual connection/credential
    // here instead of hardcoding a value.
    isConnected() {
      return false;
    },

    getLocalLearnerId() { notConnected('getLocalLearnerId'); },
    getStudentName() { notConnected('getStudentName'); },
    getSectionBStore() { notConnected('getSectionBStore'); },
    getSectionCStore() { notConnected('getSectionCStore'); },
    getTeacherNotes() { notConnected('getTeacherNotes'); },

    // Section G2: same honesty rule — no live database, so these throw
    // exactly like every other method here, never a silent empty success.
    getAccountsStore() { notConnected('getAccountsStore'); },
    saveAccountsStore() { notConnected('saveAccountsStore'); },
    getCurrentSessionToken() { notConnected('getCurrentSessionToken'); },
    setCurrentSessionToken() { notConnected('setCurrentSessionToken'); },

    // Section G3: same honesty rule — no live database, so these throw
    // exactly like every other method here, never a silent empty success.
    getAuthorizationStore() { notConnected('getAuthorizationStore'); },
    saveAuthorizationStore() { notConnected('saveAuthorizationStore'); },
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = DatabaseAdapter;
  } else {
    global.BAADatabaseAdapter = DatabaseAdapter;
  }
})(typeof window !== 'undefined' ? window : global);
