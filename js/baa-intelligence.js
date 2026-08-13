/* ============================================================
   js/baa-intelligence.js
   BAA OS — SECTION C, Part 1: Learning Intelligence.

   HONEST DATA RULE (same as Section B): every function here either
   returns something computed from real evidence rows already stored
   by js/baa-assessment.js (Section B), or an explicit "not enough
   evidence" / empty result. This file NEVER invents a score, a
   trend, a strength, or a misconception. It adds no new evidence
   store of its own — it reads BAAAssessment's existing store
   (attempts, evidence, learningMemory, mistakePatterns) and layers
   interpretation on top. See README.md "Section C — Learning
   Intelligence" for the full rationale and a record of exactly which
   Section B rules this extends vs. leaves untouched.

   WHAT THIS FILE DOES NOT DO:
   - It does not touch localStorage directly for evidence — all raw
     reads go through BAAAssessment._load() / BAAAssessment.getLearningMemory()
     etc., so there is exactly one evidence store (Section B's), not two.
   - It does not assign a "strong"/"mastered"/"struggling" state from
     a single question.
   - It does not manufacture false precision (no "83.74% mastery").
   ============================================================ */
(function (global) {
  'use strict';

  function core() {
    if (typeof global.BAAAssessment === 'undefined') {
      throw new Error('BAAAssessment (Section B) must be loaded before baa-intelligence.js');
    }
    return global.BAAAssessment;
  }

  // ---------- Constants (documented; extend Section B, never silently override it) ----------
  // Section B already gates ALL judgement behind MIN_EVIDENCE_FOR_JUDGEMENT (3) and computes
  // a base status (mastered / learning / needs_revision / insufficient_evidence) from the
  // correctness rate over the last RECENT_WINDOW (5) evidence rows for a concept. Section C
  // does not change either of those numbers. It ONLY adds a second, optional refinement pass
  // that can split "mastered" into "mastered" vs "strong", and "needs_revision" into
  // "needs_revision" vs "struggling" — never the reverse (Section C never upgrades a concept
  // Section B rated below the base bar).
  //
  // WHY these specific extra bars, spelled out:
  // - "mastered" (the strict 🟢) additionally requires evidence from at least 2 DIFFERENT
  //   question types AND that the most recent evidence point is correct — i.e. not just a
  //   high recent average, but recent + varied. Everything that clears Section B's mastered
  //   bar but not this extra one is shown as "strong" (🔵) instead of silently downgraded —
  //   it is still a real Section B "mastered" concept, just not asserted with the highest
  //   confidence label.
  // - "struggling" (the harsher 🔴) requires the recent correctness rate to be at or below
  //   this fraction, distinguishing "still needs revision" from "actively struggling" so the
  //   Planner can tell them apart when prioritizing.
  const STRUGGLING_THRESHOLD = 0.25;
  const STRICT_MASTERY_TYPES_REQUIRED = 2;
  // Trend needs at least this many evidence points for a concept before Section C will say
  // "improving" / "declining" — one or two points is not a trend, it's noise.
  const MIN_EVIDENCE_FOR_TREND = 4;
  // Evidence-confidence bands, in evidence-row count (separate from the mastery bands above —
  // this is about how sure BAA is in the INFERENCE itself, not the mastery label).
  const CONFIDENCE_HIGH_MIN = 6;
  const CONFIDENCE_MEDIUM_MIN = 3; // matches Section B's MIN_EVIDENCE_FOR_JUDGEMENT

  const STATE_META = {
    mastered:               { icon: '🟢', label: 'Mastered' },
    strong:                 { icon: '🔵', label: 'Strong' },
    learning:               { icon: '🟡', label: 'Learning' },
    needs_revision:         { icon: '🟠', label: 'Needs Revision' },
    struggling:             { icon: '🔴', label: 'Struggling' },
    insufficient_evidence:  { icon: '⚪', label: 'Not Enough Evidence' },
  };

  function humanConcept(c) { return String(c || '').replace(/-/g, ' '); }

  // ============================================================
  // CONCEPT LEARNING STATES (refines Section B's learningMemory)
  // ============================================================
  function getConceptStates() {
    const store = core()._load();
    const memory = Object.values(store.learningMemory);
    return memory.map(m => refineConceptState(store, m));
  }

  function refineConceptState(store, m) {
    const evidenceRows = store.evidence.filter(e => e.concept === m.concept);
    const recent = evidenceRows.slice(-5); // mirrors Section B's RECENT_WINDOW

    let state = m.status; // Section B base: mastered | learning | needs_revision | insufficient_evidence
    if (state === 'mastered') {
      const distinctTypes = new Set(recent.map(e => e.questionId)).size; // proxy: distinct questions
      const typeVariety = new Set(recent.map(e => e.difficulty)).size >= STRICT_MASTERY_TYPES_REQUIRED
        || distinctTypes >= STRICT_MASTERY_TYPES_REQUIRED;
      const lastIsCorrect = recent.length && recent[recent.length - 1].correctness === 'correct';
      state = (typeVariety && lastIsCorrect) ? 'mastered' : 'strong';
    } else if (state === 'needs_revision') {
      const rate = recent.length ? recent.filter(e => e.correctness === 'correct').length / recent.length : 0;
      state = rate <= STRUGGLING_THRESHOLD ? 'struggling' : 'needs_revision';
    }

    return {
      concept: m.concept,
      conceptLabel: humanConcept(m.concept),
      subject: m.subject,
      topic: m.topic,
      state,
      stateIcon: STATE_META[state].icon,
      stateLabel: STATE_META[state].label,
      evidenceCount: m.evidenceCount,
      correctCount: m.correctCount,
      confidence: getEvidenceConfidence(m.concept, store),
      trend: getConceptTrend(m.concept, store),
      lastUpdated: m.lastUpdated,
      why: explainConceptState(m.concept, store, state),
    };
  }

  function getConceptState(concept) {
    const store = core()._load();
    const m = store.learningMemory[concept];
    if (!m) return null;
    return refineConceptState(store, m);
  }

  // ============================================================
  // EVIDENCE CONFIDENCE — confidence in the INFERENCE, not the student's
  // emotional confidence. Separate axis from the state itself.
  // ============================================================
  function getEvidenceConfidence(concept, store) {
    store = store || core()._load();
    const rows = store.evidence.filter(e => e.concept === concept);
    if (rows.length < CONFIDENCE_MEDIUM_MIN) return 'insufficient_evidence';
    const anyLowConfidenceAI = rows.some(e => e.confidence === 'low' || e.confidence === 'human_review_required');
    if (anyLowConfidenceAI) return 'low';
    if (rows.length >= CONFIDENCE_HIGH_MIN) return 'high';
    return 'medium';
  }

  // ============================================================
  // TRENDS — needs multiple real data points, never one assessment.
  // ============================================================
  function getConceptTrend(concept, store) {
    store = store || core()._load();
    const rows = store.evidence.filter(e => e.concept === concept)
      .slice().sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    if (rows.length < MIN_EVIDENCE_FOR_TREND) return 'insufficient_evidence';
    const mid = Math.floor(rows.length / 2);
    const older = rows.slice(0, mid);
    const newer = rows.slice(mid);
    const rate = arr => arr.filter(e => e.correctness === 'correct').length / arr.length;
    const delta = rate(newer) - rate(older);
    if (delta > 0.15) return 'improving';
    if (delta < -0.15) return 'declining';
    return 'stable';
  }

  // ============================================================
  // STRENGTHS / WEAKNESSES — evidence-supported only.
  // ============================================================
  function getStrengths() {
    return getConceptStates().filter(c => c.state === 'mastered' || c.state === 'strong');
  }

  function getWeaknesses() {
    return getConceptStates()
      .filter(c => c.state === 'needs_revision' || c.state === 'struggling')
      .sort((a, b) => (a.state === 'struggling' ? 0 : 1) - (b.state === 'struggling' ? 0 : 1));
  }

  // ============================================================
  // MISTAKE INTELLIGENCE — layers "improving?" onto Section B's mistakePatterns.
  // ============================================================
  function getMistakeIntelligence() {
    const store = core()._load();
    return store.mistakePatterns.map(p => {
      const occurrences = p.occurrences.slice().sort((a, b) => new Date(a.at) - new Date(b.at));
      // "Improving" here means the same error type has NOT recurred in this concept's most
      // recent evidence, even though it has appeared before — i.e. a real signal, not a guess.
      const conceptEvidence = store.evidence.filter(e => e.concept === p.concept)
        .slice().sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      const recentConceptEvidence = conceptEvidence.slice(-3);
      const recurredRecently = recentConceptEvidence.some(e => e.errorType === p.errorType);
      let improving = 'insufficient_evidence';
      if (conceptEvidence.length >= MIN_EVIDENCE_FOR_TREND) {
        improving = recurredRecently ? 'not_improving' : 'improving';
      }
      return {
        id: p.id,
        concept: p.concept,
        conceptLabel: humanConcept(p.concept),
        subject: p.subject,
        errorType: p.errorType,
        errorLabel: humanConcept(p.errorType),
        occurrenceCount: occurrences.length,
        status: p.status, // 'watching' | 'possible_misconception' (Section B's own gate, unchanged)
        improving,
        firstDetected: p.firstDetected,
        lastSeen: p.lastSeen,
      };
    });
  }

  // ============================================================
  // EXPLAINABLE RECOMMENDATIONS — every state/recommendation traces to
  // real evidence rows, not a bare "AI recommends this."
  // ============================================================
  function explainConceptState(concept, store, state) {
    store = store || core()._load();
    const rows = store.evidence.filter(e => e.concept === concept);
    if (!rows.length) return 'No evidence yet for this concept.';
    if (rows.length < CONFIDENCE_MEDIUM_MIN) {
      return `Only ${rows.length} question${rows.length === 1 ? '' : 's'} answered on this concept so far — not enough yet to say anything definite.`;
    }
    const recent = rows.slice(-5);
    const correct = recent.filter(e => e.correctness === 'correct').length;
    const errorTypes = [...new Set(recent.filter(e => e.errorType).map(e => e.errorType))];
    let sentence = `Your last ${recent.length} answer${recent.length === 1 ? '' : 's'} on this concept show${recent.length === 1 ? 's' : ''} ${correct}/${recent.length} correct.`;
    if (errorTypes.length && (state === 'needs_revision' || state === 'struggling')) {
      sentence += ` Repeated difficulty pattern: ${humanConcept(errorTypes[0])}${errorTypes.length > 1 ? ', among others' : ''}.`;
    }
    return sentence;
  }

  // Generic "why" for a concept, usable from the Learning Profile or the Planner's
  // "Why this task?" — always references real numbers, never "AI recommends this."
  function whyForConcept(concept) {
    const s = getConceptState(concept);
    if (!s) return 'No evidence yet for this concept.';
    return s.why;
  }

  // ============================================================
  // LEARNING SUMMARY — the single object the Learning Profile UI and the
  // Planner both read, so "what am I good at / learning / need to revise /
  // what mistakes keep appearing / what's improving" all come from one place.
  // ============================================================
  // M10-C1: Aggregate confidence is a band, never a fabricated percentage.
  // It is based only on concepts with enough real evidence to support a confidence label.
  // This deliberately reports "insufficient_evidence" instead of manufacturing a score.
  function getConfidenceSummary() {
    const concepts = getConceptStates();
    const eligible = concepts.filter(c => ['high', 'medium', 'low'].includes(c.confidence));
    if (!eligible.length) {
      return {
        band: 'insufficient_evidence',
        label: 'Not enough evidence yet',
        eligibleConcepts: 0,
        totalTrackedConcepts: concepts.length,
        explanation: 'BAA needs at least 3 evidence rows for a concept before it contributes to the confidence meter.',
      };
    }

    const counts = { high: 0, medium: 0, low: 0 };
    eligible.forEach(c => { counts[c.confidence] += 1; });

    // Conservative aggregate: the weakest evidence band represented among the
    // concepts with sufficient evidence. This avoids averaging labels into false precision.
    const band = counts.low > 0 ? 'low' : counts.medium > 0 ? 'medium' : 'high';
    const labels = {
      high: 'High evidence confidence',
      medium: 'Moderate evidence confidence',
      low: 'Low evidence confidence',
    };
    const explanations = {
      high: 'Most tracked concepts have at least 6 evidence rows and no low-confidence AI evidence.',
      medium: 'Tracked concepts have enough evidence to judge, but some still have fewer than 6 evidence rows.',
      low: 'At least one tracked concept contains low-confidence or human-review-required evidence.',
    };

    return {
      band,
      label: labels[band],
      eligibleConcepts: eligible.length,
      totalTrackedConcepts: concepts.length,
      explanation: explanations[band],
    };
  }

  function getLearningSummary() {
    const states = getConceptStates();
    const mistakes = getMistakeIntelligence();
    return {
      hasAnyEvidence: states.length > 0,
      mastered: states.filter(c => c.state === 'mastered'),
      strong: states.filter(c => c.state === 'strong'),
      learning: states.filter(c => c.state === 'learning'),
      needsRevision: states.filter(c => c.state === 'needs_revision'),
      struggling: states.filter(c => c.state === 'struggling'),
      insufficientEvidence: states.filter(c => c.state === 'insufficient_evidence'),
      confirmedMistakePatterns: mistakes.filter(m => m.status === 'possible_misconception'),
      improvingMistakePatterns: mistakes.filter(m => m.status === 'possible_misconception' && m.improving === 'improving'),
    };
  }

  global.BAAIntelligence = {
    getConceptStates,
    getConceptState,
    getEvidenceConfidence,
    getConceptTrend,
    getStrengths,
    getWeaknesses,
    getMistakeIntelligence,
    whyForConcept,
    getLearningSummary,
    getConfidenceSummary,
    STATE_META,
    _humanConcept: humanConcept,
  };
})(window);
