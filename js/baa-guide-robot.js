/* ============================================================
   js/baa-guide-robot.js — BAA OS Module 63: Guide Robot widget.

   This is a real, curated feature explainer, not a live AI assistant —
   deliberately. Calling an LLM for "what does this button do" risks
   describing features that don't exist (the one thing this whole
   module exists to avoid — see the honesty rule in
   js/baa-guide-topics.js). The catalogue is real, hand-authored
   content; this file is purely the interaction/accessibility layer
   around it.

   No network call is required anywhere in the core open -> filter ->
   select -> read path. The one optional exception (usage logging) is
   isolated in logTopicOpen() and is fire-and-forget, non-blocking, and
   never gates the panel's functionality.
   ============================================================ */
(function (global) {
  'use strict';

  let panelEl = null, btnEl = null, listEl = null, detailEl = null, liveRegionEl = null;
  let lastFocused = null;
  let currentRole = 'student';
  let currentPage = '';
  let currentTopics = [];

  function currentPageFile() {
    const path = global.location ? global.location.pathname : '';
    const file = path.split('/').pop();
    return file || 'index.html';
  }

  async function resolveRole() {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (!res.ok) return null;
      const j = await res.json();
      const roles = Array.isArray(j?.user?.roles) ? j.user.roles : [j?.user?.roles || j?.user?.role].filter(Boolean);
      if (roles.includes('admin')) return 'admin';
      if (roles.includes('teacher')) return 'teacher';
      if (roles.includes('parent')) return 'parent';
      if (roles.includes('student')) return 'student';
      return null;
    } catch (_) {
      return null;
    }
  }

  function esc(v) {
    const d = document.createElement('div');
    d.textContent = String(v ?? '');
    return d.innerHTML;
  }

  function renderTopicList(topics) {
    if (!topics.length) {
      listEl.innerHTML = '<div class="baa-guide-empty">No guide available for this yet.</div>';
      return;
    }
    listEl.innerHTML = topics.map((t, i) =>
      `<button type="button" class="baa-guide-topic" data-topic-id="${esc(t.id)}" id="baa-guide-topic-${i}">${esc(t.title)}</button>`
    ).join('');
    listEl.querySelectorAll('[data-topic-id]').forEach(btn => {
      btn.addEventListener('click', () => selectTopic(btn.dataset.topicId));
    });
  }

  function selectTopic(topicId) {
    const topic = currentTopics.find(t => t.id === topicId);
    detailEl.innerHTML = '';
    listEl.setAttribute('hidden', '');
    detailEl.removeAttribute('hidden');
    if (!topic) {
      detailEl.innerHTML = '<div class="baa-guide-empty">No guide available for this yet.</div>';
      announce('No guide available for this yet.');
      return;
    }
    detailEl.innerHTML = `
      <button type="button" class="baa-guide-back" id="baa-guide-back-btn">← Back to topics</button>
      <h3>${esc(topic.title)}</h3>
      <p>${esc(topic.shortExplainer)}</p>
      <p class="baa-guide-where"><b>Where to find it:</b> ${esc(topic.whereToFind)}</p>
    `;
    document.getElementById('baa-guide-back-btn').addEventListener('click', showTopicList);
    document.getElementById('baa-guide-back-btn').focus();
    announce(`${topic.title}. ${topic.shortExplainer}`);
    logTopicOpen(topic.id);
  }

  function showTopicList() {
    detailEl.setAttribute('hidden', '');
    listEl.removeAttribute('hidden');
    const first = listEl.querySelector('[data-topic-id]');
    if (first) first.focus();
  }

  function announce(text) {
    if (liveRegionEl) liveRegionEl.textContent = text;
  }

  // Optional, isolated, fire-and-forget usage logging. Never awaited by
  // the interaction path above, never blocks or gates the real feature.
  function logTopicOpen(topicId) {
    if (typeof fetch === 'undefined') return;
    fetch('/api/v1/guide-robot-sessions', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicId, page: currentPage, role: currentRole }),
    }).catch(() => { /* silent — this is optional insight, never required */ });
  }

  function trapFocus(e) {
    if (e.key !== 'Tab') return;
    const focusable = panelEl.querySelectorAll('button:not([hidden] button), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    const visible = Array.from(focusable).filter(el => el.offsetParent !== null);
    if (!visible.length) return;
    const first = visible[0], last = visible[visible.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function onKeydown(e) {
    if (e.key === 'Escape') { close(); return; }
    trapFocus(e);
  }

  async function open() {
    lastFocused = document.activeElement;
    panelEl.hidden = false;
    btnEl.setAttribute('aria-expanded', 'true');
    document.addEventListener('keydown', onKeydown);
    currentTopics = (global.BAAGuideTopics ? global.BAAGuideTopics.getTopicsFor(currentPage, currentRole) : []);
    showTopicList();
    renderTopicList(currentTopics);
    const closeBtn = panelEl.querySelector('.baa-guide-close');
    if (closeBtn) closeBtn.focus();
  }

  function close() {
    panelEl.hidden = true;
    btnEl.setAttribute('aria-expanded', 'false');
    document.removeEventListener('keydown', onKeydown);
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
    else btnEl.focus();
  }

  async function init(opts) {
    opts = opts || {};
    currentPage = opts.page || currentPageFile();
    btnEl = document.getElementById('baaGuideRobotBtn');
    panelEl = document.getElementById('baaGuideRobotPanel');
    listEl = document.getElementById('baaGuideTopicList');
    detailEl = document.getElementById('baaGuideTopicDetail');
    liveRegionEl = document.getElementById('baaGuideLiveRegion');
    if (!btnEl || !panelEl) return; // page didn't include the markup — fail silently, not loudly
    btnEl.addEventListener('click', () => { panelEl.hidden ? open() : close(); });
    const closeBtn = panelEl.querySelector('.baa-guide-close');
    if (closeBtn) closeBtn.addEventListener('click', close);
    panelEl.addEventListener('click', (e) => { if (e.target === panelEl) close(); });
    currentRole = opts.role || (await resolveRole()) || 'student';
  }

  global.BAAGuideRobot = { init, open, close };
})(window);
