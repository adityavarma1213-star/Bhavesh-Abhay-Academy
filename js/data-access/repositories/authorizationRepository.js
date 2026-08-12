/* ============================================================
   js/data-access/repositories/authorizationRepository.js
   BAA OS — Section G3: Authorization, Roles & Access Control
   (client-side, local-testing only).

   ------------------------------------------------------------
   HONESTY RULE — READ BEFORE USING THIS FILE ANYWHERE ELSE
   ------------------------------------------------------------
   This is NOT production-secure authorization. Every check below
   runs in the same browser as the data it's protecting, against
   localStorage — the same "LOCAL_BROWSER_STORAGE_TESTING_ONLY"
   posture accountRepository.js (G2) already documents. Anyone with
   access to this browser's devtools can read or rewrite the
   authorization store this file reads from, exactly like every
   other local-only store in this project. This file gives the
   *application* an honest, consistent, documented way to ask "is
   this user allowed to do this?" — it does NOT make that answer
   trustworthy against a hostile client. A real, server-enforced
   authorization layer (rules that can't be bypassed by editing
   localStorage) is a Section G4 concern (secure backend/API
   foundation), same as G2's own login/session honesty notes.

   ------------------------------------------------------------
   SCOPE (from SCHEMA.md §1/§3 and db/schema.sql section 1 —
   "IDENTITY / RELATIONSHIPS... foundation for G2/G3")
   ------------------------------------------------------------
   Does:
     - assign/revoke/check roles from user_roles' documented CHECK
       constraint: 'student' | 'parent' | 'teacher' | 'admin'
       (db/schema.sql line ~52)
     - manage parent_learner / teacher_learner relationship rows
       (create + soft-revoke, matching those tables' own
       status/revoked_at columns)
     - manage classes / class_members for teacher->class->learner
       access (same soft-revoke pattern class_members already
       defines: status 'active'|'removed')
     - answer "can this userId access this learnerId's data?" and
       "can this userId access this class's roster?" using ONLY
       the relationships above, never a fabricated yes
     - answer "is this session's user authorized for this role?"

   Does NOT do (left for later sections, matching this project's
   existing scope notes elsewhere):
     - enforce anything server-side or make localStorage
       tamper-proof (G4)
     - gate page navigation / add route middleware to the HTML
       pages (no page is wired to call this file yet — same
       "defined but not yet wired in" posture G1's data-access
       layer itself started in)
     - rewire the learner/assessment/evidence/planner/teacherReview/
       teacherNotes repositories to take an authenticated learnerId
       instead of the single local-learner slot (still G2's own
       documented gap, untouched by G3)
     - real database storage (G4/G5)
   ============================================================ */
(function (global) {
  'use strict';

  const VALID_ROLES = ['student', 'parent', 'teacher', 'admin'];
  const VALID_PARENT_RELATIONSHIPS = ['parent', 'guardian', 'other_authorized_adult'];

  function nowIso() {
    return new Date().toISOString();
  }

  function genId(prefix) {
    // Same uid() shape convention SCHEMA.md §4 documents and G1/G2
    // already use (see accountRepository.js genId()).
    const rand = Math.random().toString(16).slice(2, 8);
    return `${prefix}_${Date.now().toString(36)}_${rand}`;
  }

  function isValidRole(role) {
    return VALID_ROLES.indexOf(role) !== -1;
  }

  function getRepo(adapter) {
    function readStore() {
      return adapter.getAuthorizationStore();
    }
    function writeStore(store) {
      return adapter.saveAuthorizationStore(store);
    }

    // ---------------- Roles (user_roles) ----------------

    // Grants a role to a user. Idempotent: granting a role the user
    // already holds does not create a duplicate row (matches
    // user_roles' own PRIMARY KEY (user_id, role)). Returns
    // { ok: false, errors } for an undocumented role rather than
    // inventing a new one.
    function assignRole(userId, role) {
      if (!userId) return Promise.resolve({ ok: false, errors: ['userId is required.'] });
      if (!isValidRole(role)) {
        return Promise.resolve({
          ok: false,
          errors: [`Unknown role "${role}". Documented roles are: ${VALID_ROLES.join(', ')}.`],
        });
      }
      const store = readStore();
      const existing = store.userRoles.find((r) => r.user_id === userId && r.role === role);
      if (existing) return Promise.resolve({ ok: true, role: existing, created: false });

      const row = { user_id: userId, role, granted_at: nowIso() };
      store.userRoles.push(row);
      writeStore(store);
      return Promise.resolve({ ok: true, role: row, created: true });
    }

    // Revokes a role. user_roles has no revoked_at/status column in
    // db/schema.sql (unlike parent_learner/teacher_learner/
    // class_members), so revocation removes the row — that is the
    // schema's own design, not a shortcut taken here. Idempotent:
    // revoking a role the user does not hold is not an error.
    function revokeRole(userId, role) {
      const store = readStore();
      const before = store.userRoles.length;
      store.userRoles = store.userRoles.filter((r) => !(r.user_id === userId && r.role === role));
      const removed = store.userRoles.length !== before;
      if (removed) writeStore(store);
      return Promise.resolve({ ok: true, revoked: removed });
    }

    function getRoles(userId) {
      const store = readStore();
      return Promise.resolve(store.userRoles.filter((r) => r.user_id === userId).map((r) => r.role));
    }

    function hasRole(userId, role) {
      return getRoles(userId).then((roles) => roles.indexOf(role) !== -1);
    }

    // ---------------- Parent <-> learner relationships ----------------

    // Links a parent/guardian user to a learner. Idempotent per
    // (parent_user_id, learner_id) — matches parent_learner's own
    // UNIQUE constraint. Re-linking a revoked pair re-activates it
    // rather than creating a second row.
    function linkParentToLearner(parentUserId, learnerId, relationship) {
      if (!parentUserId || !learnerId) {
        return Promise.resolve({ ok: false, errors: ['parentUserId and learnerId are required.'] });
      }
      const rel = relationship || 'parent';
      if (VALID_PARENT_RELATIONSHIPS.indexOf(rel) === -1) {
        return Promise.resolve({
          ok: false,
          errors: [`Unknown relationship "${rel}". Documented values are: ${VALID_PARENT_RELATIONSHIPS.join(', ')}.`],
        });
      }
      const store = readStore();
      let link = store.parentLearner.find((l) => l.parent_user_id === parentUserId && l.learner_id === learnerId);
      const ts = nowIso();
      if (link) {
        link.status = 'active';
        link.relationship = rel;
        link.revoked_at = null;
      } else {
        link = {
          id: genId('parentlink'),
          parent_user_id: parentUserId,
          learner_id: learnerId,
          relationship: rel,
          status: 'active',
          created_at: ts,
          revoked_at: null,
        };
        store.parentLearner.push(link);
      }
      writeStore(store);
      return Promise.resolve({ ok: true, link });
    }

    function revokeParentLink(parentUserId, learnerId) {
      const store = readStore();
      const link = store.parentLearner.find(
        (l) => l.parent_user_id === parentUserId && l.learner_id === learnerId && l.status === 'active'
      );
      if (!link) return Promise.resolve({ ok: true, revoked: false });
      link.status = 'revoked';
      link.revoked_at = nowIso();
      writeStore(store);
      return Promise.resolve({ ok: true, revoked: true });
    }

    // ---------------- Teacher <-> learner relationships ----------------

    function linkTeacherToLearner(teacherUserId, learnerId) {
      if (!teacherUserId || !learnerId) {
        return Promise.resolve({ ok: false, errors: ['teacherUserId and learnerId are required.'] });
      }
      const store = readStore();
      let link = store.teacherLearner.find((l) => l.teacher_user_id === teacherUserId && l.learner_id === learnerId);
      const ts = nowIso();
      if (link) {
        link.status = 'active';
        link.revoked_at = null;
      } else {
        link = {
          id: genId('teacherlink'),
          teacher_user_id: teacherUserId,
          learner_id: learnerId,
          status: 'active',
          created_at: ts,
          revoked_at: null,
        };
        store.teacherLearner.push(link);
      }
      writeStore(store);
      return Promise.resolve({ ok: true, link });
    }

    function revokeTeacherLink(teacherUserId, learnerId) {
      const store = readStore();
      const link = store.teacherLearner.find(
        (l) => l.teacher_user_id === teacherUserId && l.learner_id === learnerId && l.status === 'active'
      );
      if (!link) return Promise.resolve({ ok: true, revoked: false });
      link.status = 'revoked';
      link.revoked_at = nowIso();
      writeStore(store);
      return Promise.resolve({ ok: true, revoked: true });
    }

    // ---------------- Classes / class membership ----------------

    function createClass(teacherUserId, name, subject) {
      if (!teacherUserId || !name) {
        return Promise.resolve({ ok: false, errors: ['teacherUserId and name are required.'] });
      }
      const store = readStore();
      const ts = nowIso();
      const cls = {
        id: genId('class'),
        teacher_user_id: teacherUserId,
        name: String(name).trim(),
        subject: subject || null,
        created_at: ts,
        updated_at: ts,
        archived_at: null,
      };
      store.classes.push(cls);
      writeStore(store);
      return Promise.resolve({ ok: true, class: cls });
    }

    function addClassMember(classId, learnerId) {
      const store = readStore();
      const cls = store.classes.find((c) => c.id === classId);
      if (!cls) return Promise.resolve({ ok: false, errors: ['Unknown classId.'] });

      let member = store.classMembers.find((m) => m.class_id === classId && m.learner_id === learnerId);
      const ts = nowIso();
      if (member) {
        member.status = 'active';
        member.removed_at = null;
      } else {
        member = {
          id: genId('classmember'),
          class_id: classId,
          learner_id: learnerId,
          status: 'active',
          joined_at: ts,
          removed_at: null,
        };
        store.classMembers.push(member);
      }
      writeStore(store);
      return Promise.resolve({ ok: true, member });
    }

    function removeClassMember(classId, learnerId) {
      const store = readStore();
      const member = store.classMembers.find(
        (m) => m.class_id === classId && m.learner_id === learnerId && m.status === 'active'
      );
      if (!member) return Promise.resolve({ ok: true, removed: false });
      member.status = 'removed';
      member.removed_at = nowIso();
      writeStore(store);
      return Promise.resolve({ ok: true, removed: true });
    }

    // ---------------- Access checks ----------------

    // The single source of truth for "can userId access learnerId's
    // data?" Every path here traces back to a real, documented
    // relationship row — never a fabricated allow. `learnerOwnerUserId`
    // is learners.user_id (the account, if any, that the learner
    // record itself belongs to per SCHEMA.md — pass null/undefined if
    // unknown, which simply disables the self-access path, never
    // silently grants it).
    function canAccessLearner(userId, learnerId, learnerOwnerUserId) {
      if (!userId || !learnerId) {
        return Promise.resolve({ allowed: false, reason: 'missing_identifier' });
      }
      const store = readStore();

      return getRoles(userId).then((roles) => {
        if (roles.indexOf('admin') !== -1) {
          return { allowed: true, reason: 'admin' };
        }
        if (learnerOwnerUserId && learnerOwnerUserId === userId && roles.indexOf('student') !== -1) {
          return { allowed: true, reason: 'self' };
        }
        const parentLink = store.parentLearner.find(
          (l) => l.parent_user_id === userId && l.learner_id === learnerId && l.status === 'active'
        );
        if (parentLink) return { allowed: true, reason: 'parent_link' };

        const teacherLink = store.teacherLearner.find(
          (l) => l.teacher_user_id === userId && l.learner_id === learnerId && l.status === 'active'
        );
        if (teacherLink) return { allowed: true, reason: 'teacher_link' };

        // Teacher access via an active class the teacher owns and the
        // learner is an active member of.
        const teacherClassIds = store.classes
          .filter((c) => c.teacher_user_id === userId && !c.archived_at)
          .map((c) => c.id);
        const classMember = store.classMembers.find(
          (m) => teacherClassIds.indexOf(m.class_id) !== -1 && m.learner_id === learnerId && m.status === 'active'
        );
        if (classMember) return { allowed: true, reason: 'class_membership' };

        return { allowed: false, reason: 'no_relationship' };
      });
    }

    // "Can userId see classId's roster?" — true only for the class's
    // own teacher or an admin, never fabricated.
    function canAccessClass(userId, classId) {
      if (!userId || !classId) return Promise.resolve({ allowed: false, reason: 'missing_identifier' });
      const store = readStore();
      return getRoles(userId).then((roles) => {
        if (roles.indexOf('admin') !== -1) return { allowed: true, reason: 'admin' };
        const cls = store.classes.find((c) => c.id === classId);
        if (!cls) return { allowed: false, reason: 'unknown_class' };
        if (cls.teacher_user_id === userId) return { allowed: true, reason: 'class_owner' };
        return { allowed: false, reason: 'no_relationship' };
      });
    }

    return {
      // roles
      assignRole,
      revokeRole,
      getRoles,
      hasRole,
      // parent/teacher relationships
      linkParentToLearner,
      revokeParentLink,
      linkTeacherToLearner,
      revokeTeacherLink,
      // classes
      createClass,
      addClassMember,
      removeClassMember,
      // access checks
      canAccessLearner,
      canAccessClass,
    };
  }

  const AuthorizationRepository = { getRepo, VALID_ROLES, VALID_PARENT_RELATIONSHIPS };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuthorizationRepository;
  } else {
    global.BAAAuthorizationRepository = AuthorizationRepository;
  }
})(typeof window !== 'undefined' ? window : global);
