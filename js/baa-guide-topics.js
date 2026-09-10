/* ============================================================
   js/baa-guide-topics.js — BAA OS Module 63: Guide Robot catalogue.

   CRITICAL RULE (see the master engineering specification, Part 9):
   every entry below describes a feature that is genuinely reachable
   and working as of this writing — confirmed against the real,
   currently-shipped source, not the Blueprint's aspirational list.
   A module that is still an orphan (no real UI/backend) MUST NOT get
   an entry here — that would make the guide itself a source of false
   completion claims, which is exactly what this whole build process
   has been checking against. When a currently-orphaned module is
   genuinely completed later, add its entry then, not before.
   ============================================================ */
(function (global) {
  'use strict';

  const GUIDE_TOPICS = [
    // ---------------- STUDENT (student-os.html) ----------------
    { id: 'ai-tutor', title: 'AI Tutor', roles: ['student'], pages: ['student-os.html'],
      shortExplainer: 'Ask questions and get step-by-step explanations in your own words, using what BAA already knows about what you find hard.',
      whereToFind: 'Open the AI Tutor world from your BAA OS home screen.' },
    { id: 'ai-mentor', title: 'AI Mentor Chat', roles: ['student'], pages: ['student-os.html'],
      shortExplainer: 'A single place to ask big-picture questions — what to study today, your weakest chapter, how ready you are for an exam.',
      whereToFind: 'Open the AI Mentor Chat world.' },
    { id: 'assessment', title: 'Smart Assessment', roles: ['student'], pages: ['student-os.html', 'assessment.html'],
      shortExplainer: 'Real, evidence-backed quizzes and tests. Every result is graded transparently and feeds your real learning record.',
      whereToFind: 'Start an assessment from your Planner or the Assessment world.' },
    { id: 'homework-scanner', title: 'Homework Scanner', roles: ['student'], pages: ['student-os.html', 'homework-scanner.html'],
      shortExplainer: 'Photograph or upload your homework and get real, AI-evaluated feedback, with corrections tied to your actual weak topics.',
      whereToFind: 'Open Homework Scanner from your BAA OS home screen.' },
    { id: 'learning-memory', title: 'Learning Memory & Confidence', roles: ['student'], pages: ['student-os.html'],
      shortExplainer: 'BAA remembers your real strengths and weaknesses over time, so explanations and practice account for your actual history, not a fresh guess every time.',
      whereToFind: 'Visible throughout your Learning Profile.' },
    { id: 'planner', title: 'AI Planner', roles: ['student'], pages: ['student-os.html'],
      shortExplainer: 'A daily plan built from your real evidence, that adapts as your evidence changes.',
      whereToFind: 'Open the Planner world.' },
    { id: 'guardian', title: 'AI Guardian', roles: ['student'], pages: ['student-os.html'],
      shortExplainer: 'A quiet check-in when your real activity shows signs you might be falling behind — never a surprise, always explained.',
      whereToFind: 'Alerts appear in your Learning Profile when real evidence supports one.' },
    { id: 'custom-mode', title: 'Custom Mode', roles: ['student'], pages: ['student-os.html'],
      shortExplainer: 'Choose your own subject and chapter order — BAA keeps tracking your real progress either way.',
      whereToFind: 'Switch to Custom Mode from your BAA OS home screen.' },
    { id: 'hybrid-mode', title: 'Hybrid Mode', roles: ['student'], pages: ['student-os.html'],
      shortExplainer: 'Let the AI suggest a plan, then override it whenever you want — the rest of the week rebuilds around what you actually did.',
      whereToFind: 'Switch to Hybrid Mode from your BAA OS home screen.' },
    { id: 'practice-weakness-strength', title: 'Practice, Weakness & Strength', roles: ['student'], pages: ['student-os.html'],
      shortExplainer: 'Practice questions are chosen from your real weak concepts; consistently strong topics unlock extension challenges instead of repeats.',
      whereToFind: 'Woven into your Planner and Assessment results.' },
    { id: 'revision', title: 'Revision Engine', roles: ['student'], pages: ['student-os.html'],
      shortExplainer: 'A real spaced-review schedule (1, 3, 7, 15, 30, 60 days) so concepts come back for review before you forget them.',
      whereToFind: 'Revision due items appear in your Learning Profile.' },
    { id: 'goals', title: 'Goal Tracker', roles: ['student'], pages: ['student-os.html'],
      shortExplainer: 'Set a concrete goal and see real evidence of your progress toward it — no invented percentages.',
      whereToFind: 'Goal Tracker panel in your Learning Profile.' },
    { id: 'rewards', title: 'Achievements & Rewards', roles: ['student'], pages: ['student-os.html'],
      shortExplainer: 'Real XP and badges earned from your actual completed work.',
      whereToFind: 'Rewards panel in your Learning Profile.' },
    { id: 'learning-resources', title: 'Learning Resources', roles: ['student'], pages: ['student-os.html'],
      shortExplainer: 'Suggested formats (visual, video, practice) matched to your real weak concepts and your stated format preference.',
      whereToFind: 'Learning Resources panel in your Learning Profile.' },
    { id: 'mistake-map', title: 'Mistake Map', roles: ['student'], pages: ['student-os.html'],
      shortExplainer: 'Groups your real recorded mistakes by concept, with the actual questions behind each one. A pattern only appears once real evidence repeats.',
      whereToFind: 'Mistake Map panel in your Learning Profile.' },
    { id: 'progress-check', title: 'Real Progress Check', roles: ['student'], pages: ['student-os.html'],
      shortExplainer: 'Compares your earliest and most recent accuracy on a concept — only shown once there is enough real evidence on both sides.',
      whereToFind: 'Real Progress Check panel in your Learning Profile.' },
    { id: 'weekly-review', title: 'Weekly AI Review', roles: ['student'], pages: ['student-os.html'],
      shortExplainer: 'One honest weekly summary of your real activity — says plainly when there is not enough evidence yet, rather than guessing.',
      whereToFind: 'Weekly AI Review panel at the top of your Learning Profile.' },
    { id: 'scholarships', title: 'Scholarships', roles: ['student'], pages: ['student-os.html'],
      shortExplainer: 'Real, published scholarship opportunities — nothing invented or estimated.',
      whereToFind: 'Scholarships panel in your Learning Profile.' },
    { id: 'mentors', title: 'Find a Mentor', roles: ['student'], pages: ['student-os.html'],
      shortExplainer: 'Search verified, safeguarding-checked human mentors and request one. A request goes to the mentor — nothing books automatically.',
      whereToFind: 'Find a Mentor panel in your Learning Profile.' },
    { id: 'data-saver', title: 'Data Saver', roles: ['student'], pages: ['student-os.html', 'homework-scanner.html'],
      shortExplainer: 'Turns on more aggressive photo compression for homework uploads and turns off background animation, for a slow or expensive connection.',
      whereToFind: 'Data Saver panel in your Learning Profile.' },
    { id: 'language', title: 'Response Language', roles: ['student'], pages: ['student-os.html'],
      shortExplainer: 'Choose the language the AI Tutor replies in. Math notation and code stay accurate regardless of language.',
      whereToFind: 'Language selector in the AI Tutor world.' },
    { id: 'voice', title: 'Voice Input & Read-Aloud', roles: ['student'], pages: ['student-os.html'],
      shortExplainer: 'Speak your question instead of typing, and have explanations read aloud.',
      whereToFind: 'Microphone and speaker icons in the AI Tutor chat.' },
    { id: 'todays-pacing', title: "Today's Pacing", roles: ['student'], pages: ['student-os.html'],
      shortExplainer: "Checks your real planned workload against your real available time (and today's energy check-in, if you did one) and can reduce today's plan if you ask it to — never automatically.",
      whereToFind: "Today's pacing panel in the Planner world." },
    { id: 'cognitive-safety', title: "How's Today Going?", roles: ['student'], pages: ['student-os.html'],
      shortExplainer: 'An optional, private check-in about pressure and breaks — never a diagnosis, just a way for your plan to adjust on a heavier day.',
      whereToFind: 'Planner world.' },
    { id: 'mastery-gate', title: 'Mastery Gate', roles: ['student', 'parent'], pages: ['student-os.html', 'parent-os.html', 'assessment.html'],
      shortExplainer: 'Some chapters lock until real evidence shows you have mastered the one before. Your parent can unlock one early if needed — that action is logged.',
      whereToFind: 'Appears automatically when a locked chapter is reached.' },
    { id: 'appeal', title: 'Request a Review', roles: ['student'], pages: ['assessment.html', 'trust-privacy.html'],
      shortExplainer: 'Disagree with a grade? Request a real human review — your teacher sees it, and the original AI evaluation is never silently changed.',
      whereToFind: 'On a graded result, click "Request re-evaluation" — it opens the review request form.' },

    // ---------------- PARENT (parent-os.html) ----------------
    { id: 'parent-dashboard', title: 'Parent Dashboard', roles: ['parent'], pages: ['parent-os.html'],
      shortExplainer: "A real overview of your child's activity, strengths, and areas needing attention.",
      whereToFind: 'Your Parent OS home screen.' },
    { id: 'parent-approval', title: 'Parent Approval Mode', roles: ['parent'], pages: ['parent-os.html'],
      shortExplainer: 'Set real boundaries — which AI features are enabled, maximum daily study minutes — that actually apply to your child\'s account.',
      whereToFind: 'Parent Approval Mode card on your Parent OS home screen.' },
    { id: 'mastery-gate-bypass', title: 'Chapter Bypass', roles: ['parent'], pages: ['parent-os.html'],
      shortExplainer: 'If your child is stuck on a locked chapter, unlock it early by re-entering your password and giving a reason. This is logged and does not erase real findings.',
      whereToFind: 'Mastery Gate & Parent Bypass card.' },
    { id: 'exam-forecast', title: 'Exam Forecast', roles: ['parent', 'student'], pages: ['parent-os.html', 'student-os.html'],
      shortExplainer: "A real, evidence-based prediction for upcoming exams — and an honest 'not enough evidence yet' when there isn't enough real history.",
      whereToFind: 'Mastery Gate & Parent Bypass card.' },
    { id: 'parent-conversation', title: 'Conversation Starter', roles: ['parent'], pages: ['parent-os.html'],
      shortExplainer: "Real, supportive conversation prompts grounded in your child's actual recorded weak area — never a diagnosis.",
      whereToFind: 'Conversation starter card.' },
    { id: 'school-calendar', title: 'School Calendar', roles: ['student', 'parent'], pages: ['student-os.html'],
      shortExplainer: 'Add real exam and holiday dates so the study plan adapts around them.',
      whereToFind: 'Planner world.' },

    // ---------------- TEACHER (teacher-os.html, teacher-portal.html) ----------------
    { id: 'syllabus-upload', title: 'Syllabus Upload', roles: ['teacher'], pages: ['teacher-portal.html'],
      shortExplainer: 'Upload, draft, and publish real syllabus material for your classes.',
      whereToFind: 'Teacher Portal.' },
    { id: 'class-analytics', title: 'Class Analytics', roles: ['teacher'], pages: ['teacher-os.html'],
      shortExplainer: 'A real class-wide and per-student heatmap built from actual assessment evidence, plus common mistakes pulled from real recorded patterns.',
      whereToFind: 'Class Analytics panel in Teacher OS.' },
    { id: 'group-assign', title: 'Group & Assign', roles: ['teacher'], pages: ['teacher-os.html'],
      shortExplainer: "Groups your class by real per-student evidence on one concept, then can push a real, differentiated task into each group's actual planner.",
      whereToFind: 'Group & Assign section within Class Analytics.' },
    { id: 'review-queue', title: 'Student Review Queue', roles: ['teacher'], pages: ['teacher-review.html'],
      shortExplainer: 'Real, server-backed reviews a student has requested — resolve them without ever silently altering the original AI evaluation.',
      whereToFind: 'Student-requested reviews section.' },

    // ---------------- ADMIN / FOUNDER (admin.html) ----------------
    { id: 'ai-council', title: 'BAA AI Council', roles: ['admin'], pages: ['admin.html'],
      shortExplainer: 'A real, structured multi-reviewer decision record. Never claims a reviewer responded unless their actual response is recorded.',
      whereToFind: 'AI Council card.' },
    { id: 'erp-connections', title: 'ERP Connections', roles: ['admin'], pages: ['admin.html'],
      shortExplainer: 'Manage real school ERP connection records. No live provider is contacted without real deployment credentials.',
      whereToFind: 'School ERP Connections card.' },
    { id: 'founder-lab', title: 'Founder Lab Testing Log', roles: ['admin'], pages: ['admin.html'],
      shortExplainer: 'A real, dated testing journal for the private testing phase — never a claim that a study happened before it did.',
      whereToFind: 'Founder Lab — Testing Log card.' },
  ];

  function getTopicsFor(page, role) {
    return GUIDE_TOPICS.filter(t => t.pages.includes(page) && t.roles.includes(role));
  }
  function getAllTopics() {
    return GUIDE_TOPICS.slice();
  }

  global.BAAGuideTopics = { getTopicsFor, getAllTopics, ALL: GUIDE_TOPICS };
})(window);
