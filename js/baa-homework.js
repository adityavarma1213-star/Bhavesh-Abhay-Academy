/* ============================================================
   js/baa-homework.js
   BAA OS — Module 8: AI Homework Scanner — data layer.

   CHECKPOINT: M8-A1 (foundation) + M8-A2 (image attachment metadata)
   + M8-B1 (evaluation call, text-only) + M8-B2 (validated structured result schema) + M8-C (PDF text extraction) + M8-D1 (Teacher Review queue integration).
   Scope of THIS file: store a homework submission that a student
   typed or pasted as plain text, optionally with a photo attached,
   return it back honestly, and (M8-B1) send its TEXT to a real
   evaluation endpoint and record an honest result.

   HONEST DATA RULE (same convention as Section B/js/baa-assessment.js):
   this file never fabricates a grade, score, correctness verdict, or
   AI evaluation. Every submission starts with status 'received',
   meaning "saved, not yet evaluated." evaluateSubmission() (M8-B1) is
   the only thing that can move it to 'evaluated' (real AI result) or
   'evaluation_failed' (honest failure, evaluation stays null) — never
   anything in between, and never automatically on submit.

   M8-A2 IMAGE PRIVACY NOTE (matches the pre-existing js/image.js / AI
   Tutor convention documented in SECTION-E-COVERAGE-MATRIX.md, E-Inv2):
   this file NEVER receives or stores raw image bytes/base64. Image
   selection, preview, and compression happen in the browser
   (js/baa-homework-image.js) and that compressed data is used only in
   memory for the current select→preview→submit flow, then discarded.
   Only honest, non-recoverable METADATA about the attachment (mime
   type, byte sizes, dimensions, original file name) is persisted here
   in the submission's `attachments` array. The photo itself is not
   retrievable from storage after submission — a future checkpoint
   (M8-B1) will need to define its own handling once an evaluation
   endpoint actually exists.

   NOT YET IN THIS FILE (future checkpoints):
   - M8-D1: Teacher Review queue integration via teacher-review.html.
   - M8-D2: Learning Memory / Mistake Archeology integration from evidence-gated AI learning signals.
   - Any evaluation of an attached photo's actual contents — M8-B1/B2 is
     text-only; an attached image is noted to the evaluator as present
     but its pixels are never sent or evaluated (see evaluateSubmission).

   STORAGE: TEMPORARY, PRIVATE, BROWSER-LOCAL testing data (localStorage),
   matching every other section (A–G) in this project. Single-student-
   per-browser. Not a production database. Image bytes are never part
   of this persisted store (see privacy note above).
   ============================================================ */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'baa_section_m8_homework_v1';
  const SCHEMA_VERSION = 1;
  const MIN_TEXT_LENGTH = 3;
  const MAX_TEXT_LENGTH = 8000;
  const ALLOWED_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
  const ALLOWED_PDF_MIME_TYPE = 'application/pdf';
  const transientImageData = new Map(); // raw image exists only during the current evaluation flow
  let syncLearnerId = null; let syncInFlight = false; let syncQueued = false;

  function emptyStore() {
    return {
      meta: {
        schemaVersion: SCHEMA_VERSION,
        storageType: 'LOCAL_BROWSER_STORAGE_TESTING_ONLY',
        createdAt: new Date().toISOString(),
      },
      submissions: [], // one row per homework submission
    };
  }

  function load() {
    try {
      const raw = global.localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyStore();
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.submissions)) return emptyStore();
      return parsed;
    } catch {
      // Corrupt/unavailable storage must never crash the page — start clean,
      // matching the recovery pattern used by every other section's store.
      return emptyStore();
    }
  }

  function save(store) {
    try { global.localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); pushServerSync(store); return true; } catch { return false; }
  }

  function setSyncTarget(learnerId){ syncLearnerId=learnerId||null; }
  function pushServerSync(store){
    if(!syncLearnerId || typeof global.fetch!=='function') return;
    if(syncInFlight){syncQueued=true;return;} syncInFlight=true;
    global.fetch(`/api/v1/homework?learnerId=${encodeURIComponent(syncLearnerId)}`,{method:'PUT',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({submissions:store.submissions||[]})})
      .catch(e=>console.warn('[BAA Homework] server sync failed; local data retained',e)).finally(()=>{syncInFlight=false;if(syncQueued){syncQueued=false;pushServerSync(load());}});
  }
  async function hydrateFromServer(learnerId){
    if(!learnerId||typeof global.fetch!=='function')return false;
    try{const r=await global.fetch(`/api/v1/homework?learnerId=${encodeURIComponent(learnerId)}`,{credentials:'include'});if(!r.ok)throw new Error(String(r.status));const p=await r.json();const st=load();const ids=new Set(st.submissions.map(x=>x.id));for(const x of (p.submissions||[]))if(!ids.has(x.id))st.submissions.push({...x,attachments:x.attachments||[],evaluation:x.evaluation||null});global.localStorage.setItem(STORAGE_KEY,JSON.stringify(st));setSyncTarget(learnerId);return true;}catch(e){console.warn('[BAA Homework] hydrate failed; continuing locally',e);return false;}
  }

  function makeId() {
    return 'hw_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  /* ---------------- Public API ---------------- */

  // Returns submissions newest-first. Never invents entries.
  function getSubmissions() {
    return load().submissions.slice().sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1));
  }

  function getSubmission(id) {
    return load().submissions.find((s) => s.id === id) || null;
  }

  // Validates an image METADATA descriptor (never raw bytes — see privacy
  // note at the top of this file). Returns a clean attachment record or
  // null if the input isn't a well-formed metadata object.
  function buildPdfAttachment(pdf) {
    if (!pdf || typeof pdf !== 'object') return null;
    if (pdf.mimeType !== ALLOWED_PDF_MIME_TYPE) return null;
    const num = (v) => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : null);
    return {
      type: 'pdf',
      mimeType: ALLOWED_PDF_MIME_TYPE,
      originalSizeBytes: num(pdf.originalSizeBytes),
      pageCount: num(pdf.pageCount),
      extractedChars: num(pdf.extractedChars),
      fileName: (typeof pdf.fileName === 'string' && pdf.fileName.trim())
        ? pdf.fileName.trim().slice(0, 200)
        : null,
    };
  }

  function buildImageAttachment(image) {
    if (!image || typeof image !== 'object') return null;
    if (!ALLOWED_IMAGE_MIME_TYPES.includes(image.mimeType)) return null;

    const num = (v) => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : null);
    return {
      type: 'image',
      mimeType: image.mimeType,
      originalSizeBytes: num(image.originalSizeBytes),
      compressedSizeBytes: num(image.compressedSizeBytes),
      width: num(image.width),
      height: num(image.height),
      fileName: (typeof image.fileName === 'string' && image.fileName.trim())
        ? image.fileName.trim().slice(0, 200)
        : null,
      // Intentionally no `data`/`dataUrl`/base64 field — image bytes are
      // never persisted by this data layer. See file header privacy note.
    };
  }

  // subjectHint is optional and free-form (student's own label, e.g.
  // "Mathematics" or "Ch.4 homework") — never validated against a fixed
  // curriculum, since M8-A1/A2 has no curriculum-matching logic.
  //
  // image (optional, M8-A2) is a METADATA descriptor produced by
  // js/baa-homework-image.js after the browser has already validated,
  // previewed, and compressed the photo — { mimeType, originalSizeBytes,
  // compressedSizeBytes, width, height, fileName }. Raw image bytes must
  // NEVER be passed here; this function does not accept or store them.
  function submitHomeworkText({ text, subjectHint, image, imageDataUrl, pdf } = {}) {
    const trimmed = typeof text === 'string' ? text.trim() : '';
    if (trimmed.length < MIN_TEXT_LENGTH) {
      return { ok: false, error: 'TEXT_TOO_SHORT', submission: null };
    }
    const clipped = trimmed.slice(0, MAX_TEXT_LENGTH);

    const attachments = [];
    if (image) {
      const attachment = buildImageAttachment(image);
      if (!attachment) {
        return { ok: false, error: 'INVALID_IMAGE_METADATA', submission: null };
      }
      attachments.push(attachment);
    }
    if (pdf) {
      const attachment = buildPdfAttachment(pdf);
      if (!attachment) {
        return { ok: false, error: 'INVALID_PDF_METADATA', submission: null };
      }
      attachments.push(attachment);
    }

    const submission = {
      id: makeId(),
      submittedAt: new Date().toISOString(),
      inputType: attachments.some(a => a.type === 'image') && attachments.some(a => a.type === 'pdf')
        ? 'text+image+pdf'
        : attachments.some(a => a.type === 'pdf')
          ? 'text+pdf'
          : attachments.some(a => a.type === 'image') ? 'text+image' : 'text', // honest, reflects what was actually attached
      text: clipped,
      subjectHint: (typeof subjectHint === 'string' && subjectHint.trim()) ? subjectHint.trim() : null,
      attachments,             // metadata only — never raw image bytes (see privacy note)
      status: 'received',      // honest state: saved only, not evaluated
      evaluation: null,        // set only by evaluateSubmission() (M8-B1) — never fabricated here
      lastEvaluationError: null,
    };

    const store = load();
    store.submissions.push(submission);
    if (image && typeof imageDataUrl === 'string' && imageDataUrl.startsWith('data:image/')) transientImageData.set(submission.id, imageDataUrl);
    const persisted = save(store);
    return { ok: persisted, error: persisted ? null : 'STORAGE_WRITE_FAILED', submission };
  }

  // ---------------- M8-B1: evaluation ----------------
  // Same honest-failure convention as js/baa-assessment.js's gradeWithAI:
  // the evaluation endpoint URL is passed in by the caller (kept out of
  // this shared file, same reasoning as EVAL_API_URL/CHAT_API_URL living in
  // their pages, not in js/baa-assessment.js) so this stays a single edit
  // point per deployment AND stays trivially testable with a mocked fetch.
  //
  // M8-B1 SCOPE: text-only evaluation (see api/evaluate-homework.js header).
  // If the submission has an image attachment, only its METADATA presence
  // is passed along as `imageAttached: true` so the response can honestly
  // note the photo itself was not evaluated — raw image bytes are never
  // sent (this data layer never even has them; see file header).
  //
  // On success: submission.status becomes 'evaluated' and
  // submission.evaluation holds the structured result.
  // On failure (network/upstream/parsing): submission.status becomes
  // 'evaluation_failed', submission.evaluation stays null, and
  // submission.lastEvaluationError records why — never a fabricated result.
  async function evaluateSubmission(id, evalApiUrl) {
    if (!evalApiUrl) {
      return { ok: false, error: 'MISSING_API_URL', submission: null };
    }
    const store = load();
    const submission = store.submissions.find((s) => s.id === id);
    if (!submission) {
      return { ok: false, error: 'SUBMISSION_NOT_FOUND', submission: null };
    }
    if (submission.status === 'evaluating') {
      return { ok: false, error: 'ALREADY_EVALUATING', submission };
    }

    submission.status = 'evaluating';
    save(store);

    const hasImage = (submission.attachments || []).some((a) => a.type === 'image');
    const imageDataUrl = hasImage ? transientImageData.get(submission.id) || null : null;

    try {
      const res = await global.fetch(evalApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: submission.text,
          subjectHint: submission.subjectHint,
          imageAttached: hasImage,
          imageDataUrl: imageDataUrl || undefined,
          submissionId: submission.id,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Evaluation service returned ${res.status}`);
      }
      const result = await res.json();
      const validAssessments = ['strong', 'good', 'needs_improvement', 'incomplete', 'uncertain'];
      const validConfidence = ['high', 'medium', 'low'];
      const validLists = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string');
      const schemaValid = result && result.schemaVersion === 1 && result.evaluationType === 'image_or_text'
        && validAssessments.includes(result.overallAssessment)
        && typeof result.summary === 'string'
        && validLists(result.strengths) && validLists(result.mistakes) && validLists(result.suggestions)
        && validConfidence.includes(result.confidence)
        && typeof result.humanReviewRequired === 'boolean'
        && Array.isArray(result.humanReviewReasons)
        && result.humanReviewReasons.every((item) => typeof item === 'string')
        && typeof result.imageEvaluated === 'boolean'
        && (!('learningSignals' in result) || (Array.isArray(result.learningSignals) && result.learningSignals.length <= 5));
      if (!schemaValid) throw new Error('Evaluation service returned an invalid structured result');

      const imageReviewRequired = hasImage && !result.imageEvaluated;
      submission.evaluation = {
        schemaVersion: 1,
        evaluationType: result.evaluationType,
        overallAssessment: result.overallAssessment,
        summary: result.summary.slice(0, 1000),
        strengths: result.strengths.map((item) => item.slice(0, 300)).slice(0, 10),
        mistakes: result.mistakes.map((item) => item.slice(0, 300)).slice(0, 10),
        suggestions: result.suggestions.map((item) => item.slice(0, 300)).slice(0, 10),
        confidence: result.confidence,
        humanReviewRequired: result.humanReviewRequired || imageReviewRequired,
        humanReviewReasons: result.humanReviewReasons.slice(0, 5),
        verdictToken: result.verdictToken || null, // server-signed; api/v1/homework.js verifies this, not the fields above
        learningSignals: Array.isArray(result.learningSignals) ? result.learningSignals.slice(0, 5).map(signal => ({
          concept: typeof signal?.concept === 'string' ? signal.concept.slice(0, 120) : '',
          outcome: typeof signal?.outcome === 'string' ? signal.outcome : 'uncertain',
          errorType: signal?.errorType == null ? null : String(signal.errorType).slice(0, 120),
          confidence: typeof signal?.confidence === 'string' ? signal.confidence : 'low',
        })).filter(signal => signal.concept) : [],
        evaluatedAt: new Date().toISOString(),
        // Honest even on success: M8-B1/B2 never evaluates image content.
        imageEvaluated: !!result.imageEvaluated,
      };
      submission.status = 'evaluated';
      transientImageData.delete(submission.id);
      submission.lastEvaluationError = null;

      // M8-D2: feed only the evaluator's explicit learning signals into the
      // existing Section B evidence engine. If the learning engine is not
      // loaded (for example in an isolated unit test), do not fabricate a
      // memory update; record that integration was unavailable instead.
      submission.learningIntegration = { status: 'pending', evidenceIds: [], integratedAt: null, reason: null };
      if (submission.evaluation.learningSignals.length) {
        if (global.BAAAssessment && typeof global.BAAAssessment.recordHomeworkEvaluation === 'function') {
          const integration = global.BAAAssessment.recordHomeworkEvaluation({
            submissionId: submission.id,
            submittedAt: submission.submittedAt,
            subjectHint: submission.subjectHint,
            evaluation: submission.evaluation,
          });
          submission.learningIntegration = integration.ok
            ? { status: 'integrated', evidenceIds: integration.evidenceIds || [], integratedAt: new Date().toISOString(), reason: null }
            : { status: 'not_integrated', evidenceIds: [], integratedAt: null, reason: integration.error || 'LEARNING_INTEGRATION_FAILED' };
        } else {
          submission.learningIntegration = { status: 'not_integrated', evidenceIds: [], integratedAt: null, reason: 'LEARNING_ENGINE_UNAVAILABLE' };
        }
      } else {
        submission.learningIntegration = { status: 'no_evidence_signal', evidenceIds: [], integratedAt: null, reason: 'NO_LEARNING_SIGNALS' };
      }

      // M8-D1: if the evaluator requires human review (including any image
      // attachment that was not actually evaluated), create exactly one
      // review row for the shared Teacher Review surface.
      if (submission.evaluation.humanReviewRequired) {
        if (!save(store)) {
          submission.status = 'evaluation_failed';
          submission.evaluation = null;
          submission.lastEvaluationError = 'STORAGE_WRITE_FAILED';
          return { ok: false, error: 'STORAGE_WRITE_FAILED', submission };
        }
        const reviewResult = createHomeworkReview(submission);
        if (!reviewResult.ok) {
          submission.status = 'evaluation_failed';
          submission.evaluation = null;
          submission.lastEvaluationError = reviewResult.error || 'HOMEWORK_REVIEW_QUEUE_FAILED';
          save(store);
          return { ok: false, error: 'REVIEW_QUEUE_FAILED', submission };
        }
      }
    } catch (err) {
      // AI evaluation failure must never silently invent a result.
      submission.status = 'evaluation_failed';
      submission.evaluation = null;
      submission.lastEvaluationError = (err && err.message) || 'unknown error';
      save(store);
      transientImageData.delete(submission.id);
      return { ok: false, error: 'EVALUATION_FAILED', submission };
    }

    const persisted = save(store);
    return { ok: persisted, error: persisted ? null : 'STORAGE_WRITE_FAILED', submission };
  }


  // ---------------- M8-D1: human review queue ----------------
  // Homework review records stay beside the homework submission rather than
  // changing Section B's assessment-attempt schema. teacher-review.html can
  // present both queues in one review surface. Original AI output is immutable.
  function createHomeworkReview(submission) {
    if (!submission || submission.status !== 'evaluated' || !submission.evaluation) {
      return { ok: false, error: 'HOMEWORK_NOT_EVALUATED', review: null };
    }
    const store = load();
    const existing = store.submissions.find(s => s.id === submission.id);
    if (!existing) return { ok: false, error: 'SUBMISSION_NOT_FOUND', review: null };
    if (!existing.evaluation.humanReviewRequired) {
      return { ok: false, error: 'HUMAN_REVIEW_NOT_REQUIRED', review: null };
    }
    if (existing.review && existing.review.id) return { ok: true, error: null, review: existing.review };

    const review = {
      id: 'hwreview_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8),
      type: 'homework',
      submissionId: existing.id,
      student: (typeof global.localStorage !== 'undefined' && global.localStorage.getItem('baa_student_name')) || 'Explorer',
      subjectHint: existing.subjectHint,
      createdAt: new Date().toISOString(),
      teacherStatus: 'pending',
      reviewer: null,
      reviewedAt: null,
      teacherComment: null,
      finalAssessment: null,
      finalSummary: null,
      originalAiEvaluation: JSON.parse(JSON.stringify(existing.evaluation)),
      decisionHistory: [],
    };
    existing.review = review;
    const persisted = save(store);
    return { ok: persisted, error: persisted ? null : 'STORAGE_WRITE_FAILED', review: persisted ? review : null };
  }

  function getHomeworkReviewQueue({ status = null } = {}) {
    const store = load();
    const rows = store.submissions
      .filter(s => s.review && s.review.type === 'homework')
      .map(s => ({
        ...s.review,
        submissionId: s.id,
        submittedAt: s.submittedAt,
        text: s.text,
        subjectHint: s.subjectHint,
        attachments: s.attachments || [],
        evaluation: s.evaluation,
      }));
    return status ? rows.filter(r => r.teacherStatus === status) : rows;
  }

  function submitHomeworkReview(reviewId, { action, reviewer, teacherComment, finalAssessment, finalSummary } = {}) {
    const store = load();
    const submission = store.submissions.find(s => s.review && s.review.id === reviewId);
    if (!submission || !submission.review) return { error: 'Homework review not found' };
    const review = submission.review;
    if (!['accept', 'edit', 'reject'].includes(action)) return { error: 'Invalid review action' };

    if (review.reviewedAt) {
      review.decisionHistory = Array.isArray(review.decisionHistory) ? review.decisionHistory : [];
      review.decisionHistory.push({
        teacherStatus: review.teacherStatus, reviewer: review.reviewer, reviewedAt: review.reviewedAt,
        teacherComment: review.teacherComment, finalAssessment: review.finalAssessment, finalSummary: review.finalSummary,
      });
    }

    const ai = submission.evaluation || review.originalAiEvaluation;
    review.teacherStatus = action === 'accept' ? 'accepted' : action === 'edit' ? 'edited' : 'rejected';
    review.reviewer = reviewer ? String(reviewer).slice(0, 60) : 'Reviewer';
    review.reviewedAt = new Date().toISOString();
    review.teacherComment = teacherComment ? String(teacherComment).slice(0, 1000) : null;
    review.finalAssessment = action === 'reject'
      ? 'Human reviewer rejected the AI evaluation.'
      : (finalAssessment ? String(finalAssessment).slice(0, 1000) : ai.overallAssessment);
    review.finalSummary = action === 'reject'
      ? null
      : (finalSummary ? String(finalSummary).slice(0, 2000) : ai.summary);

    const persisted = save(store);
    return persisted ? { review, submission } : { error: 'STORAGE_WRITE_FAILED' };
  }

  const BAAHomework = {
    STORAGE_KEY,
    ALLOWED_IMAGE_MIME_TYPES,
    getSubmissions,
    getSubmission,
    createHomeworkReview,
    getHomeworkReviewQueue,
    submitHomeworkReview,
    submitHomeworkText,
    evaluateSubmission,
    _load: load,        // exposed read-only for debugging, matches Section B convention
    _emptyStore: emptyStore,
    _buildImageAttachment: buildImageAttachment, // exposed for focused unit tests
    _buildPdfAttachment: buildPdfAttachment, // exposed for focused unit tests
    setSyncTarget,
    hydrateFromServer,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = BAAHomework;
  } else {
    global.BAAHomework = BAAHomework;
  }
})(typeof window !== 'undefined' ? window : global);
