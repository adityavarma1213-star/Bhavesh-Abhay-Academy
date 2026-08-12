/* ============================================================
   js/data-access/repositories/teacherNotesRepository.js
   BAA OS — Section G1: teacher notes repository.

   Maps Section D's raw teacher notes list (teacher-os.html,
   baa_section_d_teacher_notes_v1) onto teacher_notes in
   db/schema.sql. Does not delete or alter the existing Section D
   localStorage notes (requirement 14).
   ============================================================ */
(function (global) {
  'use strict';

  function getRepo(adapter, learnerId) {
    return {
      // -> teacher_notes rows
      listNotes() {
        return (adapter.getTeacherNotes() || []).map(n => ({
          id: n.id,
          learner_id: learnerId,
          author_user_id: null, // no accounts yet (G2) — Section D notes have no author field today
          text: n.text,
          created_at: n.createdAt,
        }));
      },
    };
  }

  const TeacherNotesRepository = { getRepo };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = TeacherNotesRepository;
  } else {
    global.BAATeacherNotesRepository = TeacherNotesRepository;
  }
})(typeof window !== 'undefined' ? window : global);
