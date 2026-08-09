/* ============================================================
   js/data-access/repositories/plannerRepository.js
   BAA OS — Section G1: planner repository.

   Maps Section C's raw planner store (js/baa-planner.js) onto
   planner_preferences / planner_goals / planner_upcoming_assessments
   / planner_tasks / planner_task_events in db/schema.sql.
   ============================================================ */
(function (global) {
  'use strict';

  function getRepo(adapter, learnerId) {
    function store() {
      return adapter.getSectionCStore();
    }

    return {
      // -> planner_preferences row
      getPreferences() {
        const p = store().preferences || {};
        return {
          learner_id: learnerId,
          available_minutes_per_day: p.availableMinutesPerDay,
        };
      },

      // -> planner_goals rows
      listGoals() {
        return (store().goals || []).map(g => ({
          id: g.id,
          learner_id: learnerId,
          text: g.text,
          created_at: g.createdAt,
        }));
      },

      // -> planner_upcoming_assessments rows
      listUpcomingAssessments() {
        return (store().upcomingAssessments || []).map(u => ({
          id: u.id,
          learner_id: learnerId,
          title: u.title,
          subject: u.subject,
          date: u.date,
          assessment_id: u.assessmentId || null,
        }));
      },

      // -> planner_tasks rows (status transitions preserved, never deleted)
      listTasks(scheduledDate) {
        return (store().tasks || [])
          .filter(t => !scheduledDate || t.scheduledDate === scheduledDate)
          .map(t => ({
            id: t.id,
            learner_id: learnerId,
            type: t.type,
            title: t.title,
            concept: t.concept,
            subject: t.subject,
            estimated_minutes: t.estimatedMinutes,
            priority: t.priority,
            reasons: t.reasons,
            action: t.action,
            status: t.status,
            scheduled_date: t.scheduledDate,
            created_at: t.createdAt,
            completed_at: t.completedAt,
          }));
      },

      // -> planner_task_events rows (source of the task's append-only history)
      listTaskEvents(taskId) {
        const task = (store().tasks || []).find(t => t.id === taskId);
        if (!task) return [];
        return (task.history || []).map((h, i) => ({
          id: `${task.id}_evt_${i}`,
          task_id: task.id,
          event: h.event,
          note: h.note,
          occurred_at: h.at,
        }));
      },
    };
  }

  const PlannerRepository = { getRepo };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = PlannerRepository;
  } else {
    global.BAAPlannerRepository = PlannerRepository;
  }
})(typeof window !== 'undefined' ? window : global);
