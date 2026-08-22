/* ============================================================
   js/data-access/repositories/assessmentRepository.js
   BAA OS — Section G1: assessment repository.

   Maps Section B's raw `attempts` array (js/baa-assessment.js) onto
   the assessment_attempts / assessment_answers / assessment_results
   shapes in db/schema.sql. Source data only — this repository does
   not grade, does not invent scores, and does not touch Section B's
   own storage.
   ============================================================ */
(function (global) {
  'use strict';

  function getRepo(adapter, learnerId) {
    function rawAttempts() {
      return adapter.getSectionBStore().attempts || [];
    }

    return {
      // -> assessment_attempts rows
      listAttempts(assessmentId) {
        return rawAttempts()
          .filter(a => !assessmentId || a.assessmentId === assessmentId)
          .map(a => ({
            id: a.id,
            assessment_id: a.assessmentId,
            learner_id: learnerId,
            attempt_number: a.attemptNumber,
            start_time: a.startTime,
            end_time: a.endTime,
            status: a.status,
            evaluation_status: a.evaluationStatus,
            review_status: a.reviewStatus,
            score: a.score,
            max_score: a.maxScore,
          }));
      },

      getAttempt(attemptId) {
        return this.listAttempts().find(a => a.id === attemptId) || null;
      },

      // -> assessment_answers rows (raw student answers, source data)
      listAnswers(attemptId) {
        const attempt = rawAttempts().find(a => a.id === attemptId);
        if (!attempt) return [];
        return Object.keys(attempt.answers || {}).map(questionId => ({
          id: `${attempt.id}_${questionId}`, // deterministic composite, matches UNIQUE(attempt_id, question_id)
          attempt_id: attempt.id,
          question_id: questionId,
          raw_answer: attempt.answers[questionId],
          answered_at: attempt.endTime || attempt.startTime,
        }));
      },

      // -> assessment_results rows (graded outcome per question, source data)
      listResults(attemptId) {
        const attempt = rawAttempts().find(a => a.id === attemptId);
        if (!attempt) return [];
        return (attempt.questionResults || []).map(r => ({
          id: `${attempt.id}_${r.questionId}_result`,
          attempt_id: attempt.id,
          question_id: r.questionId,
          grading_mode: r.gradingMode,
          is_correct: typeof r.isCorrect === 'boolean' ? r.isCorrect : null,
          correctness: r.correctness || (r.isCorrect === true ? 'correct' : r.isCorrect === false ? 'incorrect' : null),
          score: r.score,
          max_score: r.maxScore,
          confidence: r.confidence || null,
          human_review_required: !!r.humanReviewRequired,
          evaluation_failed: !!r.evaluationFailed,
        }));
      },

      // -> ai_evaluation_records rows, for AI-graded questions only.
      // Deliberately separate from listResults()/teacher decisions —
      // requirement 13.
      listAiEvaluations(attemptId) {
        return this.listResults(attemptId)
          .filter(r => r.grading_mode === 'ai')
          .map(r => ({
            id: `${r.id}_ai`,
            attempt_id: r.attempt_id,
            question_id: r.question_id,
            model: null, // not recorded client-side today; G4 to capture from api/evaluate.js
            score: r.score,
            correctness: r.correctness,
            confidence: r.confidence,
            human_review_required: r.human_review_required,
          }));
      },
    };
  }

  const AssessmentRepository = { getRepo };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = AssessmentRepository;
  } else {
    global.BAAAssessmentRepository = AssessmentRepository;
  }
})(typeof window !== 'undefined' ? window : global);
