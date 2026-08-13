/* ============================================================
   js/data-access/index.js
   BAA OS — Section G1: Data Access Layer entrypoint.

   Selects the active adapter. Defaults to LocalStorageAdapter,
   which matches current production behavior for A–D exactly — G1
   does not change what Sections A–D do. A future G4/G5 change is
   expected to add a way to switch this to DatabaseAdapter once a
   real database exists; nothing here does that switch itself.
   ============================================================ */
(function (global) {
  'use strict';

  function loadNode(relPath) {
    // eslint-disable-next-line global-require
    return require(relPath);
  }

  function getAdapters() {
    if (typeof module !== 'undefined' && module.exports) {
      return {
        localStorage: loadNode('./adapters/localStorageAdapter.js'),
        database: loadNode('./adapters/databaseAdapter.js'),
      };
    }
    return {
      localStorage: global.BAALocalStorageAdapter,
      database: global.BAADatabaseAdapter,
    };
  }

  function getActiveAdapter() {
    // G1 default: localStorage, unconditionally. No env-based switch
    // exists yet — introducing one without a real database behind it
    // would risk silently breaking A–D, which G1 must not do.
    return getAdapters().localStorage;
  }

  const DataAccess = { getAdapters, getActiveAdapter };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = DataAccess;
  } else {
    global.BAADataAccess = DataAccess;
  }
})(typeof window !== 'undefined' ? window : global);
