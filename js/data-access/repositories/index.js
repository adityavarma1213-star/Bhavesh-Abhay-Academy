/* ============================================================
   js/data-access/repositories/index.js
   BAA OS — Section G1: repositories entrypoint.

   Wires each repository to the active adapter (js/data-access/index.js)
   and the current learner id, and returns a single object the app
   (or tests) can call. This is the one function pages would import
   if/when they're switched onto the data-access layer — nothing
   does that switch yet (see js/data-access/README.md).
   ============================================================ */
(function (global) {
  'use strict';

  function loadNode(relPath) {
    // eslint-disable-next-line global-require
    return require(relPath);
  }

  function getRepoModules() {
    if (typeof module !== 'undefined' && module.exports) {
      return {
        dataAccess: loadNode('../index.js'),
        learner: loadNode('./learnerRepository.js'),
        assessment: loadNode('./assessmentRepository.js'),
        evidence: loadNode('./evidenceRepository.js'),
        planner: loadNode('./plannerRepository.js'),
        teacherReview: loadNode('./teacherReviewRepository.js'),
        teacherNotes: loadNode('./teacherNotesRepository.js'),
        account: loadNode('./accountRepository.js'),
        authorization: loadNode('./authorizationRepository.js'),
      };
    }
    return {
      dataAccess: global.BAADataAccess,
      learner: global.BAALearnerRepository,
      assessment: global.BAAAssessmentRepository,
      evidence: global.BAAEvidenceRepository,
      planner: global.BAAPlannerRepository,
      teacherReview: global.BAATeacherReviewRepository,
      teacherNotes: global.BAATeacherNotesRepository,
      account: global.BAAAccountRepository,
      authorization: global.BAAAuthorizationRepository,
    };
  }

  function getRepositories(adapterOverride) {
    const m = getRepoModules();
    const adapter = adapterOverride || m.dataAccess.getActiveAdapter();
    const learnerRepo = m.learner.getRepo(adapter);
    const learnerId = learnerRepo.getCurrentLearner().id;
    return {
      adapter,
      learner: learnerRepo,
      assessment: m.assessment.getRepo(adapter, learnerId),
      evidence: m.evidence.getRepo(adapter, learnerId),
      planner: m.planner.getRepo(adapter, learnerId),
      teacherReview: m.teacherReview.getRepo(adapter, learnerId),
      teacherNotes: m.teacherNotes.getRepo(adapter, learnerId),
      // Section G2: account repo takes no learnerId — accounts/sessions
      // are not scoped to the single-learner model the repos above use.
      account: m.account.getRepo(adapter),
      // Section G3: authorization repo takes no learnerId — roles and
      // relationships are not scoped to the single-learner model the
      // repos above use.
      authorization: m.authorization.getRepo(adapter),
    };
  }

  const Repositories = { getRepositories };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Repositories;
  } else {
    global.BAARepositories = Repositories;
  }
})(typeof window !== 'undefined' ? window : global);
