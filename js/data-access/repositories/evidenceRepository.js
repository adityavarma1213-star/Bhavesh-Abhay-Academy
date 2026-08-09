/* ============================================================
   js/data-access/repositories/evidenceRepository.js
   BAA OS — Section G1: evidence repository.

   Maps Section B's raw evidence / learningMemory / mistakePatterns
   onto learning_evidence (SOURCE), learning_memory (DERIVED, see
   SCHEMA.md §10 — recomputable from evidence, never treated as the
   source of truth here), and mistake_patterns +
   mistake_pattern_occurrences (kept explainable by linking back to
   the evidence rows that produced each pattern — requirement 12).
   ============================================================ */
(function (global) {
  'use strict';

  function getRepo(adapter, learnerId) {
    function store() {
      return adapter.getSectionBStore();
    }

    return {
      // -> learning_evidence rows (SOURCE data)
      listEvidence(concept) {
        const rows = store().evidence || [];
        return rows
          .filter(e => !concept || e.concept === concept)
          .map(e => ({
            id: e.id,
            learner_id: learnerId,
            attempt_id: e.attemptId,
            question_id: e.questionId,
            subject: e.subject,
            chapter: e.chapter,
            topic: e.topic,
            concept: e.concept,
            difficulty: e.difficulty,
            correctness: e.correctness,
            error_type: e.errorType,
            score: e.score,
            max_score: e.maxScore,
            confidence: e.confidence,
            evidence_type: 'assessment_answer',
            source: 'section_b_assessment',
            created_at: e.timestamp,
          }));
      },

      // -> learning_memory rows. DERIVED/cacheable: this reads Section
      // B's already-computed cache rather than recomputing, but callers
      // must treat it as a cache of listEvidence(), never as a second
      // source of truth (SCHEMA.md §10).
      listLearningMemory() {
        const mem = store().learningMemory || {};
        return Object.keys(mem).map(concept => {
          const m = mem[concept];
          return {
            learner_id: learnerId,
            concept: m.concept,
            subject: m.subject,
            topic: m.topic,
            status: m.status,
            evidence_count: m.evidenceCount,
            correct_count: m.correctCount,
            last_updated: m.lastUpdated,
          };
        });
      },

      // -> mistake_patterns rows + their mistake_pattern_occurrences,
      // returned together so the link to underlying evidence is never
      // dropped.
      listMistakePatterns() {
        const evidenceRows = store().evidence || [];
        const patterns = store().mistakePatterns || [];
        return patterns.map(p => ({
          id: p.id,
          learner_id: learnerId,
          concept: p.concept,
          subject: p.subject,
          error_type: p.errorType,
          status: p.status,
          first_detected: p.firstDetected,
          last_detected: (p.occurrences && p.occurrences.length)
            ? p.occurrences[p.occurrences.length - 1].at
            : p.firstDetected,
          // Each occurrence is matched back to the specific evidence row
          // (by attemptId + questionId) it came from, so the pattern stays
          // traceable to real evidence rather than only an aggregate count.
          occurrences: (p.occurrences || []).map((o, i) => {
            const ev = evidenceRows.find(e => e.attemptId === o.attemptId && e.questionId === o.questionId);
            return {
              id: `${p.id}_occ_${i}`,
              pattern_id: p.id,
              evidence_id: ev ? ev.id : null,
              occurred_at: o.at,
            };
          }),
        }));
      },
    };
  }

  const EvidenceRepository = { getRepo };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EvidenceRepository;
  } else {
    global.BAAEvidenceRepository = EvidenceRepository;
  }
})(typeof window !== 'undefined' ? window : global);
