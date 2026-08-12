/* ============================================================
   js/data-access/repositories/learnerRepository.js
   BAA OS — Section G1: learner repository.

   Maps the active adapter's raw data onto the `learners` shape in
   db/schema.sql (id, display_name). No auth/role data — that is
   G2/G3.
   ============================================================ */
(function (global) {
  'use strict';

  function getRepo(adapter) {
    return {
      // Returns the single learner for this browser (see localStorageAdapter
      // header — there is no login system yet, so there is one learner).
      // Never fabricates a name: falls back to the same 'Explorer' default
      // js/baa-assessment.js already uses, so the two stay consistent.
      getCurrentLearner() {
        const id = adapter.getLocalLearnerId ? adapter.getLocalLearnerId() : null;
        const name = adapter.getStudentName ? adapter.getStudentName() : null;
        return {
          id,
          display_name: name || 'Explorer',
        };
      },
    };
  }

  const LearnerRepository = { getRepo };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = LearnerRepository;
  } else {
    global.BAALearnerRepository = LearnerRepository;
  }
})(typeof window !== 'undefined' ? window : global);
