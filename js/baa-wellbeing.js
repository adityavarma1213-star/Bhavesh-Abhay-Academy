/* ============================================================
   js/baa-wellbeing.js
   BAA OS — SECTION E, Module 54: Student Psychological Safety &
   Cognitive Recovery.

   Small, additive session-pacing helper. Tracks how long the CURRENT
   browser tab has been open (session time only — nothing persisted
   about a student's overall screen time or habits, and nothing sent
   anywhere) and offers a single, supportive, dismissible break
   suggestion after a healthy stretch of continuous use. That's it.

   DESIGN RULES THIS FILE FOLLOWS (Module 54 + Module 60):
   - No shame, no guilt language, ever ("you've been working hard",
     never "you've been on this too long").
   - No punishment animations, no red/alarm styling, no countdown
     pressure.
   - No dark pattern to re-engage — the suggestion does not reappear
     immediately after being dismissed, and dismissing it costs nothing
     and unlocks nothing.
   - No comparison to any other student, ever (there is only one
     student in this build regardless).
   - This is a SUGGESTION, never a lock-out. The student stays in
     control; nothing here can block access to the app.

   STORAGE: only ONE preference is persisted (whether break reminders
   are enabled at all) — everything else (session start time, whether
   today's reminder already fired) lives in memory/sessionStorage and
   resets on tab close, because it is a same-session pacing nudge, not
   a tracked behavioral record.
   ============================================================ */
(function (global) {
  'use strict';

  /* M37 page-level Trust Center gate.
     trust-privacy.html already loads this script near the end of body,
     so the check runs before the browser gets a normal post-script paint.
     The server, not local role/session state, decides whether the page is
     exposed. Other pages are completely untouched. */
  function installTrustCenterGate() {
    const path = global.location && global.location.pathname || '';
    if (!(path.endsWith('/trust-privacy.html') || path === '/trust-privacy.html')) return;
    if (!global.document || !global.document.body) return;

    const body = global.document.body;
    body.style.visibility = 'hidden';
    body.setAttribute('aria-busy', 'true');

    const veil = global.document.createElement('div');
    veil.id = 'baaTrustEarlyGate';
    veil.setAttribute('role', 'status');
    veil.style.cssText = 'position:fixed;inset:0;z-index:100000;background:#0B0F2E;color:#FDF9F0;display:flex;align-items:center;justify-content:center;padding:24px;font:500 15px Inter,Arial,sans-serif;visibility:visible;';
    veil.innerHTML = '<div style="max-width:520px;text-align:center"><div style="font-size:32px;margin-bottom:12px">🔒</div><h1 style="font:600 28px Fraunces,serif;margin-bottom:10px">Trust &amp; Privacy Center</h1><p id="baaTrustEarlyMessage" style="color:rgba(253,249,240,.7);line-height:1.6">Checking your signed-in account…</p></div>';
    body.appendChild(veil);

    const reveal = function () {
      body.style.visibility = '';
      body.removeAttribute('aria-busy');
      veil.remove();
    };
    const deny = function (status) {
      const message = global.document.getElementById('baaTrustEarlyMessage');
      if (message) {
        message.textContent = status === 401
          ? 'Please sign in to open your Trust & Privacy Center.'
          : 'This Trust & Privacy Center is only available to authenticated BAA accounts.';
      }
      const link = global.document.createElement('a');
      link.href = 'account.html?next=trust-privacy.html';
      link.textContent = 'Sign in to continue';
      link.style.cssText = 'display:inline-flex;margin-top:18px;padding:11px 18px;border-radius:999px;background:#7C5CFC;color:#fff;text-decoration:none;font-weight:700;';
      veil.querySelector('div').appendChild(link);
      veil.setAttribute('role', 'alert');
    };

    global.fetch('/api/m37-trust-access', { credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' } })
      .then(function (response) {
        if (!response.ok) throw { status: response.status };
        return response.json();
      })
      .then(function (session) {
        if (!session || session.authenticated !== true) throw { status: 403 };
        reveal();
      })
      .catch(function (error) {
        deny(Number(error && error.status) || 500);
      });
  }
  installTrustCenterGate();

  const PREF_KEY = 'baa_section_e_wellbeing_prefs_v1';
  const SESSION_FLAG_KEY = 'baa_section_e_wellbeing_session_v1'; // sessionStorage — resets per tab

  // A healthy default: gently suggest a break after 25 continuous minutes
  // in one sitting (not a hard rule — see getDefaultPrefs()).
  const DEFAULT_INTERVAL_MINUTES = 25;

  const sessionStartedAt = Date.now();

  function hasLocalStorage() {
    return typeof global.localStorage !== 'undefined' && global.localStorage !== null;
  }
  function hasSessionStorage() {
    return typeof global.sessionStorage !== 'undefined' && global.sessionStorage !== null;
  }

  function getPrefs() {
    const fallback = { remindersEnabled: true, intervalMinutes: DEFAULT_INTERVAL_MINUTES };
    if (!hasLocalStorage()) return fallback;
    try {
      const raw = global.localStorage.getItem(PREF_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return {
        remindersEnabled: typeof parsed.remindersEnabled === 'boolean' ? parsed.remindersEnabled : true,
        intervalMinutes: Number.isFinite(parsed.intervalMinutes) ? parsed.intervalMinutes : DEFAULT_INTERVAL_MINUTES,
      };
    } catch {
      return fallback;
    }
  }
  function setPrefs(next) {
    if (!hasLocalStorage()) return false;
    const merged = { ...getPrefs(), ...next };
    try {
      global.localStorage.setItem(PREF_KEY, JSON.stringify(merged));
      return true;
    } catch {
      return false;
    }
  }

  function getSessionFlags() {
    const fallback = { lastReminderAt: null };
    if (!hasSessionStorage()) return fallback;
    try {
      const raw = global.sessionStorage.getItem(SESSION_FLAG_KEY);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }
  function setSessionFlags(next) {
    if (!hasSessionStorage()) return false;
    try {
      global.sessionStorage.setItem(SESSION_FLAG_KEY, JSON.stringify({ ...getSessionFlags(), ...next }));
      return true;
    } catch {
      return false;
    }
  }

  // A rotating set of supportive, non-shaming, non-comparative messages.
  // Every message is a suggestion with a concrete, healthy alternative —
  // never a warning, never phrased as a failure.
  const SUGGESTIONS = [
    { title: "Nice focused stretch.", body: "You've been at this a while — a short break (stretch, water, look away from the screen) can help the next bit stick better." },
    { title: "Good time for a pause.", body: "A quick walk or a few minutes away from the screen is a completely normal part of studying well — nothing here is going anywhere." },
    { title: "Your plan will still be here.", body: "Consider a short offline break. Movement or a stretch for a few minutes often makes the next session easier, not harder." },
  ];

  // Returns { shouldSuggestBreak, minutesElapsed, suggestion } — never
  // throws, never blocks. Call this periodically (e.g. every minute) from
  // the page; it decides on its own whether enough time has passed and
  // whether a reminder already fired this session.
  function checkBreakSuggestion() {
    const prefs = getPrefs();
    const minutesElapsed = Math.floor((Date.now() - sessionStartedAt) / 60000);
    if (!prefs.remindersEnabled) {
      return { shouldSuggestBreak: false, minutesElapsed, suggestion: null };
    }
    const flags = getSessionFlags();
    const dueForFirst = !flags.lastReminderAt && minutesElapsed >= prefs.intervalMinutes;
    const minutesSinceLast = flags.lastReminderAt ? Math.floor((Date.now() - flags.lastReminderAt) / 60000) : null;
    const dueForNext = flags.lastReminderAt && minutesSinceLast >= prefs.intervalMinutes;

    if (dueForFirst || dueForNext) {
      const pick = SUGGESTIONS[Math.floor(Math.random() * SUGGESTIONS.length)];
      return { shouldSuggestBreak: true, minutesElapsed, suggestion: pick };
    }
    return { shouldSuggestBreak: false, minutesElapsed, suggestion: null };
  }

  // Call when the suggestion banner is shown, so it doesn't repeat before
  // the next interval — dismissing costs nothing and is never penalized.
  function acknowledgeBreakSuggestion() {
    setSessionFlags({ lastReminderAt: Date.now() });
  }

  function setReminderPreference(enabled, intervalMinutes) {
    const next = { remindersEnabled: !!enabled };
    if (Number.isFinite(intervalMinutes) && intervalMinutes >= 0) next.intervalMinutes = intervalMinutes;
    return setPrefs(next);
  }

  // ============================================================
  // Module 54/60 supportive-copy helpers — used wherever the app needs
  // to phrase a miss/skip/low score WITHOUT shame or comparison. Kept
  // here as the one shared source so pages don't each invent their own
  // wording (and risk drifting into shame-adjacent phrasing).
  // ============================================================
  function supportiveMissedTaskCopy() {
    return "Yesterday's plan wasn't fully completed — that's alright. Life happens; I've adjusted today's plan.";
  }
  function supportiveLowScoreCopy() {
    return "This one didn't go the way you wanted — that's genuinely useful information about what to practice next, not a verdict on you.";
  }

  global.BAAWellbeing = {
    getPrefs,
    setReminderPreference,
    checkBreakSuggestion,
    acknowledgeBreakSuggestion,
    supportiveMissedTaskCopy,
    supportiveLowScoreCopy,
  };
})(typeof window !== 'undefined' ? window : global);
