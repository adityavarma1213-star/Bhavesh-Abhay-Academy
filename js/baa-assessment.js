/* ============================================================
   js/baa-assessment.js
   BAA OS — Section B: Assessment + AI Evaluation data layer.

   HONEST DATA RULE: every function in this file either returns
   data that was actually produced by a real student action (an
   attempt, an answer, an AI evaluation), or it returns an explicit
   "not enough evidence yet" / empty state. Nothing in here invents
   scores, mastery, or improvement.

   STORAGE: this is a TEMPORARY, PRIVATE, BROWSER-LOCAL testing data
   layer (localStorage), not a production database. It is single-
   student-per-browser, matching how Section A already stores
   studentName (a JS variable / localStorage, not a real login
   system). See DEPLOYMENT.md "Section B data storage" for how this
   maps onto a real production database later.

   Shared by: assessment.html (player + results) and student-os.html
   (Learning Profile tabs, Mistake Archeology tab, Learning Outcome
   tab) so Section A's UI and Section B's engine read one source of
   truth.
   ============================================================ */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'baa_section_b_data_v1';
  const SCHEMA_VERSION = 1;

  // ---------- Marking-rule constants (documented, not arbitrary) ----------
  // A concept needs at least this many pieces of evidence before BAA will
  // say anything about mastery at all. Below this: "Not enough evidence yet."
  const MIN_EVIDENCE_FOR_JUDGEMENT = 3;
  // Mastery/learning/needs-revision bands are based on the correctness rate
  // across a concept's most recent evidence points (recency-weighted by
  // simply looking at the tail of the evidence list).
  const RECENT_WINDOW = 5;
  const MASTERED_THRESHOLD = 0.8;      // >= this recent correctness -> mastered
  const LEARNING_THRESHOLD = 0.5;      // >= this -> learning, below -> needs revision
  // Same error TYPE on the same CONCEPT this many times (regardless of the
  // overall correctness rate) surfaces a "possible misconception" pattern.
  const MISTAKE_PATTERN_THRESHOLD = 3;

  // ---------- Storage ----------
  function emptyStore() {
    return {
      meta: {
        schemaVersion: SCHEMA_VERSION,
        storageType: 'LOCAL_BROWSER_STORAGE_TESTING_ONLY',
        createdAt: new Date().toISOString(),
      },
      attempts: [],       // full attempt records, one per assessment start
      evidence: [],        // one row per question answered, feeds Learning Memory
      learningMemory: {},  // keyed by concept -> {status, evidenceCount, ...}
      mistakePatterns: [], // keyed list of possible-misconception patterns
      teacherReviews: [],  // one row per question result that could be reviewed
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyStore();
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.meta?.schemaVersion !== SCHEMA_VERSION) return emptyStore();
      return parsed;
    } catch {
      return emptyStore();
    }
  }

  function save(store) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
      return true;
    } catch (e) {
      console.warn('[BAA Section B] Could not save to localStorage (quota or private mode?)', e);
      return false;
    }
  }

  function getStudentName() {
    return localStorage.getItem('baa_student_name') || 'Explorer';
  }
  function setStudentName(name) {
    if (typeof name === 'string' && name.trim()) {
      localStorage.setItem('baa_student_name', name.trim().slice(0, 40));
    }
  }

  function uid(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  // ============================================================
  // ATTEMPTS
  // ============================================================

  // Starts a new attempt. Never overwrites a prior attempt for the same
  // assessment — every start is its own row, so reattempts are preserved.
  function startAttempt(assessment) {
    const store = load();
    const attempt = {
      id: uid('attempt'),
      assessmentId: assessment.id,
      assessmentTitle: assessment.title,
      student: getStudentName(),
      startTime: new Date().toISOString(),
      endTime: null,
      answers: {},              // questionId -> raw student answer
      questionResults: [],      // filled in on submit
      score: null,
      maxScore: assessment.totalMarks,
      status: 'in_progress',    // in_progress | submitted | evaluated
      evaluationStatus: 'pending', // pending | partial | complete | failed
      reviewStatus: 'not_reviewed', // not_reviewed | pending_review | accepted | edited | rejected
      attemptNumber: store.attempts.filter(a => a.assessmentId === assessment.id).length + 1,
    };
    store.attempts.push(attempt);
    save(store);
    return attempt;
  }

  function getAttempt(attemptId) {
    return load().attempts.find(a => a.id === attemptId) || null;
  }

  function saveAnswer(attemptId, questionId, answer) {
    const store = load();
    const attempt = store.attempts.find(a => a.id === attemptId);
    if (!attempt) return false;
    attempt.answers[questionId] = answer;
    save(store);
    return true;
  }

  function getAttemptHistory(assessmentId) {
    const store = load();
    let list = store.attempts;
    if (assessmentId) list = list.filter(a => a.assessmentId === assessmentId);
    return list.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
  }

  // ============================================================
  // DETERMINISTIC (AUTO) GRADING — MCQ / True-False
  // Never call the AI for something gradable by exact match.
  // ============================================================
  function isAutoGradable(question) {
    return question.type === 'mcq' || question.type === 'true_false';
  }

  function gradeAuto(question, studentAnswer) {
    if (studentAnswer === undefined || studentAnswer === null || studentAnswer === '') {
      return {
        questionId: question.id,
        gradingMode: 'auto',
        isCorrect: false,
        score: 0,
        maxScore: question.marks,
        correctAnswer: question.correctAnswer,
        explanation: question.explanation || null,
        answered: false,
      };
    }
    const isCorrect = String(studentAnswer).trim().toLowerCase()
      === String(question.correctAnswer).trim().toLowerCase();
    return {
      questionId: question.id,
      gradingMode: 'auto',
      isCorrect,
      score: isCorrect ? question.marks : 0,
      maxScore: question.marks,
      correctAnswer: question.correctAnswer,
      explanation: question.explanation || null,
      answered: true,
    };
  }

  // ============================================================
  // SUBJECTIVE (AI) GRADING — calls api/evaluate.js
  // ============================================================
  // evalApiUrl is passed in by the caller (assessment.html), same pattern
  // as CHAT_API_URL in student-os.html — kept out of this shared file so
  // it stays a single edit point per deployment.
  async function gradeWithAI(question, studentAnswer, evalApiUrl) {
    if (!studentAnswer || !String(studentAnswer).trim()) {
      return {
        questionId: question.id,
        gradingMode: 'ai',
        score: 0,
        maxScore: question.marks,
        correctness: 'incorrect',
        explanation: 'No answer was submitted for this question.',
        errors: [],
        missingConcepts: [],
        suggestedImprovement: null,
        confidence: 'high',
        humanReviewRequired: false,
        answered: false,
      };
    }
    try {
      const res = await fetch(evalApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: {
            text: question.text,
            type: question.type,
            marks: question.marks,
            modelAnswer: question.modelAnswer || null,
            concept: question.concept,
            subject: question.subject,
          },
          studentAnswer: String(studentAnswer).slice(0, 4000),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Evaluation service returned ${res.status}`);
      }
      const result = await res.json();
      return {
        questionId: question.id,
        gradingMode: 'ai',
        score: clamp(Number(result.score) || 0, 0, question.marks),
        maxScore: question.marks,
        correctness: result.correctness || 'uncertain',
        explanation: result.explanation || '',
        errors: Array.isArray(result.errors) ? result.errors : [],
        missingConcepts: Array.isArray(result.missingConcepts) ? result.missingConcepts : [],
        suggestedImprovement: result.suggestedImprovement || null,
        confidence: result.confidence || 'low',
        humanReviewRequired: !!result.humanReviewRequired || result.confidence === 'low',
        answered: true,
      };
    } catch (err) {
      // AI evaluation failure must never silently invent a score.
      return {
        questionId: question.id,
        gradingMode: 'ai',
        score: null,
        maxScore: question.marks,
        correctness: 'uncertain',
        explanation: 'AI evaluation could not be completed for this question. It has been flagged for human review.',
        errors: [],
        missingConcepts: [],
        suggestedImprovement: null,
        confidence: 'human_review_required',
        humanReviewRequired: true,
        evaluationFailed: true,
        errorMessage: err.message || 'unknown error',
        answered: true,
      };
    }
  }

  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

  // ============================================================
  // SUBMIT — grades every question (auto where possible, AI where needed),
  // writes the attempt, produces Learning Evidence, and updates Learning
  // Memory / Mistake Archeology. Returns the completed attempt.
  // ============================================================
  async function submitAttempt(attempt, questions, evalApiUrl, onProgress) {
    const results = [];
    let scoredCount = 0, totalGraded = 0;
    let anyFailed = false;

    for (const q of questions) {
      const ans = attempt.answers[q.id];
      let result;
      if (isAutoGradable(q)) {
        result = gradeAuto(q, ans);
      } else {
        if (onProgress) onProgress(q.id, 'evaluating');
        result = await gradeWithAI(q, ans, evalApiUrl);
        if (result.evaluationFailed) anyFailed = true;
      }
      results.push(result);
      if (typeof result.score === 'number') { scoredCount += result.score; totalGraded += result.maxScore; }
    }

    const store = load();
    const stored = store.attempts.find(a => a.id === attempt.id);
    if (!stored) throw new Error('Attempt not found in storage');

    stored.endTime = new Date().toISOString();
    stored.questionResults = results;
    stored.score = scoredCount;
    stored.status = 'submitted';
    stored.evaluationStatus = anyFailed ? 'partial' : 'complete';
    stored.reviewStatus = results.some(r => r.humanReviewRequired) ? 'pending_review' : 'not_reviewed';

    // ---- Learning Evidence: one evidence row per answered question ----
    const newEvidence = [];
    for (const q of questions) {
      const r = results.find(x => x.questionId === q.id);
      if (!r || !r.answered) continue;
      const correctness = r.isCorrect === true ? 'correct'
        : r.isCorrect === false ? 'incorrect'
        : r.correctness || 'uncertain';
      const evidenceRow = {
        id: uid('ev'),
        attemptId: stored.id,
        assessmentId: stored.assessmentId,
        questionId: q.id,
        subject: q.subject,
        chapter: q.chapter,
        topic: q.topic,
        concept: q.concept,
        difficulty: q.difficulty,
        correctness,
        errorType: correctness !== 'correct' ? (q.commonErrorType || inferErrorType(q, r)) : null,
        score: r.score,
        maxScore: r.maxScore,
        confidence: r.confidence || 'high',
        timestamp: new Date().toISOString(),
      };
      newEvidence.push(evidenceRow);
    }
    store.evidence.push(...newEvidence);

    // ---- Learning Memory update (evidence-gated, see rules above) ----
    updateLearningMemory(store, newEvidence);

    // ---- Mistake Archeology: look for repeated error-type patterns ----
    updateMistakePatterns(store, newEvidence);

    // ---- Human review queue for anything the AI flagged ----
    for (const r of results) {
      if (r.humanReviewRequired) {
        store.teacherReviews.push({
          id: uid('review'),
          attemptId: stored.id,
          questionId: r.questionId,
          aiEvaluation: r,
          teacherStatus: 'pending',
          teacherMarks: null,
          teacherComment: null,
          // Section E — Module 39: distinguishes an AI-flagged review from
          // one a student/parent later requested via requestReevaluation().
          // decisionHistory preserves every prior decision on this same
          // review row (never overwritten silently — see submitTeacherReview).
          source: 'ai_flagged',
          appeal: null,
          decisionHistory: [],
          reviewedAt: null,
          reviewer: null,
        });
      }
    }

    save(store);
    return { attempt: stored, evidence: newEvidence };
  }

  // Objectively-gradable errors don't need inference; for AI-graded
  // questions without a specific error tag from the model, fall back to a
  // generic bucket rather than guessing a specific misconception.
  function inferErrorType(question, result) {
    if (Array.isArray(result.errors) && result.errors.length) return result.errors[0];
    return 'general_error';
  }

  // ============================================================
  // LEARNING MEMORY (connects to Section A "Learning Profile")
  // ============================================================
  function updateLearningMemory(store, newEvidenceRows) {
    const concepts = new Set(newEvidenceRows.map(e => e.concept));
    for (const concept of concepts) {
      const allForConcept = store.evidence.filter(e => e.concept === concept);
      const recent = allForConcept.slice(-RECENT_WINDOW);
      const evidenceCount = allForConcept.length;

      let status;
      if (evidenceCount < MIN_EVIDENCE_FOR_JUDGEMENT) {
        status = 'insufficient_evidence';
      } else {
        const correctRate = recent.filter(e => e.correctness === 'correct').length / recent.length;
        if (correctRate >= MASTERED_THRESHOLD) status = 'mastered';
        else if (correctRate >= LEARNING_THRESHOLD) status = 'learning';
        else status = 'needs_revision';
      }

      const existing = store.learningMemory[concept] || { history: [] };
      store.learningMemory[concept] = {
        concept,
        subject: allForConcept[allForConcept.length - 1].subject,
        topic: allForConcept[allForConcept.length - 1].topic,
        status,
        evidenceCount,
        correctCount: allForConcept.filter(e => e.correctness === 'correct').length,
        lastUpdated: new Date().toISOString(),
        history: [...existing.history, {
          at: new Date().toISOString(),
          status,
          evidenceCount,
        }].slice(-20),
      };
    }
  }

  function getLearningMemory() {
    return load().learningMemory;
  }

  // ============================================================
  // MISTAKE ARCHEOLOGY (connects to Section A "Mistake Archeology")
  // ============================================================
  function updateMistakePatterns(store, newEvidenceRows) {
    for (const row of newEvidenceRows) {
      if (row.correctness === 'correct' || !row.errorType) continue;
      let pattern = store.mistakePatterns.find(
        p => p.concept === row.concept && p.errorType === row.errorType
      );
      if (!pattern) {
        pattern = {
          id: uid('pattern'),
          concept: row.concept,
          subject: row.subject,
          errorType: row.errorType,
          occurrences: [],
          firstDetected: new Date().toISOString(),
          status: 'watching', // watching (below threshold) | possible_misconception
        };
        store.mistakePatterns.push(pattern);
      }
      pattern.occurrences.push({ attemptId: row.attemptId, questionId: row.questionId, at: row.timestamp });
      pattern.status = pattern.occurrences.length >= MISTAKE_PATTERN_THRESHOLD
        ? 'possible_misconception' : 'watching';
      pattern.lastSeen = new Date().toISOString();
    }
  }

  function getMistakePatterns({ onlyConfirmed = false } = {}) {
    const patterns = load().mistakePatterns;
    return onlyConfirmed ? patterns.filter(p => p.status === 'possible_misconception') : patterns;
  }

  // ============================================================
  // HUMAN REVIEW (Section B minimum review component)
  // A teacherReviews row is created (see submitAttempt above) for every
  // question the AI flagged humanReviewRequired for. This section lets a
  // reviewer accept/edit/reject that AI evaluation WITHOUT ever destroying
  // it: the original AI evaluation is copied onto the question result the
  // first time it is reviewed (originalAiEvaluation) and stays there
  // forever, even if the score is later overridden. The review row itself
  // also keeps the original aiEvaluation object it was created with.
  // ============================================================
  function getTeacherReviewQueue({ status = null } = {}) {
    const store = load();
    let list = store.teacherReviews;
    if (status) list = list.filter(r => r.teacherStatus === status);
    return list.map(r => {
      const attempt = store.attempts.find(a => a.id === r.attemptId);
      const question = (typeof global.BAAGetQuestion === 'function') ? global.BAAGetQuestion(r.questionId) : null;
      return {
        ...r,
        assessmentTitle: attempt ? attempt.assessmentTitle : null,
        student: attempt ? attempt.student : null,
        studentAnswer: attempt ? attempt.answers[r.questionId] : null,
        questionText: question ? question.text : null,
        questionType: question ? question.type : null,
        subject: question ? question.subject : null,
        concept: question ? question.concept : null,
      };
    }).sort((a, b) => (a.teacherStatus === 'pending' ? -1 : 1) - (b.teacherStatus === 'pending' ? -1 : 1));
  }

  // action: 'accept' | 'edit' | 'reject'. teacherMarks is required (and used)
  // only for 'edit'. Recomputes the attempt's total score and updates the
  // Learning Evidence row for this question so Learning Memory / Mistake
  // Archeology reflect the reviewer's final word, not the AI's first guess.
  function submitTeacherReview(reviewId, { action, teacherMarks, teacherComment, reviewer } = {}) {
    if (!['accept', 'edit', 'reject'].includes(action)) {
      return { error: 'action must be accept, edit, or reject' };
    }
    const store = load();
    const review = store.teacherReviews.find(r => r.id === reviewId);
    if (!review) return { error: 'Review not found' };
    const attempt = store.attempts.find(a => a.id === review.attemptId);
    if (!attempt) return { error: 'Attempt not found for this review' };
    const qResult = attempt.questionResults.find(r => r.questionId === review.questionId);
    if (!qResult) return { error: 'Question result not found in attempt' };

    // Preserve the ORIGINAL AI evaluation exactly once, on first review.
    if (!qResult.originalAiEvaluation) {
      qResult.originalAiEvaluation = {
        score: qResult.score,
        correctness: qResult.correctness,
        explanation: qResult.explanation,
        confidence: qResult.confidence,
        errors: qResult.errors,
        missingConcepts: qResult.missingConcepts,
      };
    }
    const maxScore = qResult.maxScore;

    let finalScore, teacherStatus;
    if (action === 'accept') {
      finalScore = qResult.originalAiEvaluation.score ?? 0;
      teacherStatus = 'accepted';
    } else if (action === 'edit') {
      const n = Number(teacherMarks);
      if (!Number.isFinite(n) || n < 0 || n > maxScore) {
        return { error: `teacherMarks must be a number between 0 and ${maxScore}` };
      }
      finalScore = n;
      teacherStatus = 'edited';
    } else { // reject
      finalScore = 0;
      teacherStatus = 'rejected';
    }

    // Section E — Module 39: if this review already carries a prior decision
    // (e.g. it is being re-decided after an appeal), preserve that decision
    // in decisionHistory BEFORE it is overwritten. No historical decision is
    // ever silently replaced — the old one stays on record alongside the new.
    if (review.reviewedAt) {
      if (!Array.isArray(review.decisionHistory)) review.decisionHistory = [];
      review.decisionHistory.push({
        teacherStatus: review.teacherStatus,
        teacherMarks: review.teacherMarks,
        teacherComment: review.teacherComment,
        reviewer: review.reviewer,
        reviewedAt: review.reviewedAt,
        supersededAt: new Date().toISOString(),
        supersededReason: review.appeal ? 'appeal_decision' : 're_review',
      });
    }

    qResult.score = finalScore;
    qResult.humanReview = {
      status: teacherStatus,
      finalScore,
      teacherComment: teacherComment ? String(teacherComment).slice(0, 1000) : null,
      reviewer: reviewer ? String(reviewer).slice(0, 60) : 'Reviewer',
      reviewedAt: new Date().toISOString(),
    };

    review.teacherStatus = teacherStatus;
    review.teacherMarks = finalScore;
    review.teacherComment = qResult.humanReview.teacherComment;
    review.reviewer = qResult.humanReview.reviewer;
    review.reviewedAt = qResult.humanReview.reviewedAt;
    // An appeal is resolved the moment a reviewer decides on it again.
    if (review.appeal && review.appeal.status === 'pending') {
      review.appeal.status = 'resolved';
      review.appeal.resolvedAt = review.reviewedAt;
    }

    // Recompute attempt total from the (now possibly-overridden) question results.
    attempt.score = attempt.questionResults.reduce(
      (sum, r) => sum + (typeof r.score === 'number' ? r.score : 0), 0);
    const stillPending = store.teacherReviews.some(
      r => r.attemptId === attempt.id && r.teacherStatus === 'pending');
    attempt.reviewStatus = stillPending ? 'pending_review' : 'reviewed';

    // The reviewer's final score is the true record for Learning Evidence —
    // correct the matching evidence row so Learning Memory / Mistake
    // Archeology are built on the reviewed outcome, not the AI's first guess.
    const evidenceRow = store.evidence.find(
      e => e.attemptId === attempt.id && e.questionId === review.questionId);
    if (evidenceRow) {
      evidenceRow.correctness = finalScore <= 0 ? 'incorrect'
        : finalScore >= maxScore ? 'correct' : 'partially_correct';
      evidenceRow.score = finalScore;
      evidenceRow.humanReviewed = true;
      updateLearningMemory(store, [evidenceRow]);
    }

    save(store);
    return { review, questionResult: qResult, attempt };
  }

  // ============================================================
  // Section E — Module 39: AI Review & Appeal System
  // Builds on the teacherReviews queue above instead of creating a second,
  // disconnected review system. A student or parent can ask for human
  // re-evaluation of ANY graded question — not just ones the AI already
  // flagged. If a teacherReviews row already exists for that question, this
  // reopens it (marks it pending again, records the appeal) rather than
  // creating a duplicate row for the same question.
  // ============================================================
  function requestReevaluation(attemptId, questionId, { requestedBy = 'student', reason = '' } = {}) {
    const store = load();
    const attempt = store.attempts.find(a => a.id === attemptId);
    if (!attempt) return { error: 'Attempt not found' };
    const qResult = attempt.questionResults.find(r => r.questionId === questionId);
    if (!qResult) return { error: 'Question result not found in this attempt' };
    if (!['student', 'parent'].includes(requestedBy)) {
      return { error: 'requestedBy must be student or parent' };
    }

    const appeal = {
      status: 'pending',
      requestedBy,
      reason: reason ? String(reason).slice(0, 1000) : '',
      requestedAt: new Date().toISOString(),
      resolvedAt: null,
    };

    let review = store.teacherReviews.find(
      r => r.attemptId === attemptId && r.questionId === questionId);

    if (review) {
      // Reopening an already-decided review. Preserve the decision that is
      // about to be reopened INTO decisionHistory right here — before its
      // fields are reset to 'pending' — so no historical decision is ever
      // silently overwritten. (If the review was already 'pending' with no
      // prior decision, reviewedAt is null and there is nothing to preserve.)
      if (review.reviewedAt) {
        if (!Array.isArray(review.decisionHistory)) review.decisionHistory = [];
        review.decisionHistory.push({
          teacherStatus: review.teacherStatus,
          teacherMarks: review.teacherMarks,
          teacherComment: review.teacherComment,
          reviewer: review.reviewer,
          reviewedAt: review.reviewedAt,
          supersededAt: new Date().toISOString(),
          supersededReason: 'reopened_for_appeal',
        });
      }
      review.teacherStatus = 'pending';
      review.teacherMarks = null;
      review.reviewedAt = null;
      review.source = review.source === 'ai_flagged' ? 'ai_flagged' : 'appeal';
      review.appeal = appeal;
    } else {
      // No original AI flag on this question (it was auto-accepted or
      // auto-graded) — an appeal creates a genuine new review row, built
      // from the question's real recorded evaluation, never a fabricated one.
      review = {
        id: uid('review'),
        attemptId,
        questionId,
        aiEvaluation: {
          questionId,
          score: qResult.score,
          maxScore: qResult.maxScore,
          correctness: qResult.correctness,
          explanation: qResult.explanation || null,
          confidence: qResult.confidence || null,
        },
        teacherStatus: 'pending',
        teacherMarks: null,
        teacherComment: null,
        source: 'appeal',
        appeal,
        decisionHistory: [],
        reviewedAt: null,
      };
      store.teacherReviews.push(review);
    }

    attempt.reviewStatus = 'pending_review';
    save(store);
    return { review };
  }

  // ============================================================
  // RESULTS / SUMMARY helpers
  // ============================================================
  function summarizeAttempt(attempt) {
    const isFirstAttempt = attempt.attemptNumber === 1;
    const percentage = attempt.maxScore > 0 && typeof attempt.score === 'number'
      ? Math.round((attempt.score / attempt.maxScore) * 1000) / 10 : null;
    const correct = attempt.questionResults.filter(r => r.isCorrect === true).length;
    const incorrect = attempt.questionResults.filter(r => r.isCorrect === false
      || r.correctness === 'incorrect').length;
    const partial = attempt.questionResults.filter(r =>
      typeof r.score === 'number' && r.score > 0 && r.score < r.maxScore).length;
    return { isFirstAttempt, percentage, correct, incorrect, partial, total: attempt.questionResults.length };
  }

  // Compares this attempt's evidence against the PREVIOUS attempt of the
  // same assessment. Only reports a direction once two real data points
  // exist — never on a single attempt.
  function compareToPreviousAttempt(assessmentId, currentAttemptId) {
    const history = getAttemptHistory(assessmentId).filter(a => a.status !== 'in_progress');
    const idx = history.findIndex(a => a.id === currentAttemptId);
    if (idx === -1 || idx === history.length - 1) {
      return { hasComparison: false, message: 'This is your first completed attempt at this assessment — nothing to compare yet.' };
    }
    const current = history[idx];
    const previous = history[idx + 1]; // history sorted newest-first
    if (typeof current.score !== 'number' || typeof previous.score !== 'number') {
      return { hasComparison: false, message: 'Not enough graded evidence yet to compare attempts.' };
    }
    const curPct = (current.score / current.maxScore) * 100;
    const prevPct = (previous.score / previous.maxScore) * 100;
    const delta = Math.round((curPct - prevPct) * 10) / 10;
    let direction = 'steady';
    if (delta > 2) direction = 'improved';
    else if (delta < -2) direction = 'declined';
    return { hasComparison: true, direction, delta, previousPercentage: Math.round(prevPct * 10) / 10, currentPercentage: Math.round(curPct * 10) / 10 };
  }

  // Targeted-practice recommendation, built only from real evidence.
  function getTargetedPracticeRecommendations() {
    const memory = getLearningMemory();
    const weak = Object.values(memory)
      .filter(m => m.status === 'needs_revision' || m.status === 'struggling')
      .sort((a, b) => a.evidenceCount - b.evidenceCount);
    return weak.map(m => ({
      concept: m.concept,
      subject: m.subject,
      topic: m.topic,
      reason: `Recent evidence (${m.evidenceCount} questions) shows this concept still needs revision.`,
      suggestion: `Practice ${m.concept} for about 15 minutes, then try a short reassessment.`,
    }));
  }

  // ============================================================
  // AI TUTOR CONNECTION (smallest safe integration — see DEPLOYMENT.md)
  // Builds a short, factual, bounded summary of REAL Section B evidence for
  // the AI Tutor to optionally use as context. Never invents anything: if
  // there's no qualifying evidence, returns null and student-os.html sends
  // no learningContext field at all, so the Tutor behaves exactly as it did
  // before Section B existed. This function does not call the Tutor and
  // does not touch chat state — it only reads the existing Section B store.
  // ============================================================
  function getLearningContextForTutor({ maxConcepts = 3 } = {}) {
    const store = load();
    const memory = Object.values(store.learningMemory)
      .filter(m => m.status === 'needs_revision' || m.status === 'learning')
      .sort((a, b) => a.evidenceCount - b.evidenceCount)
      .slice(0, maxConcepts);
    const patterns = store.mistakePatterns
      .filter(p => p.status === 'possible_misconception')
      .slice(0, maxConcepts);
    if (!memory.length && !patterns.length) return null;

    const lines = [];
    for (const m of memory) {
      lines.push(`- ${m.concept.replace(/-/g, ' ')} (${m.subject}): status "${m.status}", ${m.correctCount}/${m.evidenceCount} correct in recent assessment evidence.`);
    }
    for (const p of patterns) {
      lines.push(`- Possible misconception in ${p.concept.replace(/-/g, ' ')}: recurring "${p.errorType.replace(/-/g, ' ')}" error, seen ${p.occurrences.length} times.`);
    }
    return (
      `The student has recent BAA assessment evidence for these areas (from real graded ` +
      `assessments, not a diagnosis — use it only if relevant to what they ask, never bring ` +
      `it up unprompted, and never state it as more certain than "recent evidence suggests"):\n` +
      lines.join('\n')
    );
  }

  // ============================================================
  // Public API
  // ============================================================
  global.BAAAssessment = {
    STORAGE_KEY,
    getStudentName,
    setStudentName,
    startAttempt,
    getAttempt,
    saveAnswer,
    getAttemptHistory,
    isAutoGradable,
    gradeAuto,
    gradeWithAI,
    submitAttempt,
    getLearningMemory,
    getMistakePatterns,
    getTargetedPracticeRecommendations,
    getTeacherReviewQueue,
    submitTeacherReview,
    requestReevaluation,
    summarizeAttempt,
    compareToPreviousAttempt,
    getLearningContextForTutor,
    _load: load,   // exposed for student-os.html read-only panels + debugging
    _emptyStore: emptyStore,
  };
})(window);
