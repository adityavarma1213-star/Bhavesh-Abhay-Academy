/* ============================================================
   js/data-access/repositories/teacherReviewRepository.js
   BAA OS — Section G1: teacher review repository.

   Maps Section B's `teacherReviews` (js/baa-assessment.js) onto
   teacher_reviews in db/schema.sql. The AI evaluation embedded in
   each review row (`aiEvaluation`) is kept as its own referenced
   object, mirroring ai_evaluation_records being a separate table
   from teacher_reviews (requirement 13 — AI evaluation is not the
   same record as the human decision).
   ============================================================ */
(function (global) {
  'use strict';

  function getRepo(adapter, learnerId) {
    function store() {
      return adapter.getSectionBStore();
    }

    return {
      // -> teacher_reviews rows
      listReviews(status) {
        return (store().teacherReviews || [])
          .filter(r => !status || r.teacherStatus === status)
          .map(r => ({
            id: r.id,
            attempt_id: r.attemptId,
            question_id: r.questionId,
            ai_evaluation_id: `${r.id}_ai_eval`, // 1:1 with the review's embedded AI evaluation
            learner_id: learnerId,
            teacher_status: r.teacherStatus,
            teacher_marks: r.teacherMarks,
            teacher_comment: r.teacherComment,
            reviewer_user_id: null, // no accounts yet (G2) — reviewer name is free text today
            reviewer_display_name: r.reviewer,
            reviewed_at: r.reviewedAt,
          }));
      },

      getReview(reviewId) {
        return this.listReviews().find(r => r.id === reviewId) || null;
      },
    };
  }

  const TeacherReviewRepository = { getRepo };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = TeacherReviewRepository;
  } else {
    global.BAATeacherReviewRepository = TeacherReviewRepository;
  }
})(typeof window !== 'undefined' ? window : global);
