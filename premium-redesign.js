/* ══════════════════════════════════════════════════════════════════════
   VELO PREMIUM — REDISEÑO HELPERS
   premium-redesign.js
   ───────────────────────────────────────────────────────────────────────
   Helpers visuales puramente ADITIVOS.
   - Inserta el ícono sol/luna según hora del día.
   - Hace editable el nombre del usuario en el Home.
   - Activa reveal palabra×palabra en el greeting.
   Cargar al final del <body>, después de premium.js.
   No toca ningún ID/handler existente — solo agrega.
   ══════════════════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  /* ── 1. Time-of-day sun/moon icon ──────────────────────────────── */
  const SUN_MORNING = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="rSun1c" cx="45%" cy="40%"><stop offset="0%" stop-color="#fffbe6"/><stop offset="45%" stop-color="#ffd966"/><stop offset="100%" stop-color="#f4a93b"/></radialGradient><radialGradient id="rSun1g" cx="50%" cy="50%"><stop offset="0%" stop-color="#fff5cc" stop-opacity=".7"/><stop offset="60%" stop-color="#ffd966" stop-opacity=".18"/><stop offset="100%" stop-color="#ffd966" stop-opacity="0"/></radialGradient></defs><circle cx="32" cy="32" r="30" fill="url(#rSun1g)"/><g stroke="#f4b93b" stroke-width="1.6" stroke-linecap="round" opacity=".85"><line x1="32" y1="6" x2="32" y2="12"/><line x1="32" y1="52" x2="32" y2="58"/><line x1="6" y1="32" x2="12" y2="32"/><line x1="52" y1="32" x2="58" y2="32"/><line x1="13" y1="13" x2="17" y2="17"/><line x1="47" y1="47" x2="51" y2="51"/><line x1="13" y1="51" x2="17" y2="47"/><line x1="47" y1="17" x2="51" y2="13"/></g><circle cx="32" cy="32" r="15" fill="url(#rSun1c)"/><circle cx="28" cy="28" r="3.5" fill="#fffceb" opacity=".65"/></svg>`;

  const SUN_AFTERNOON = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="rSun2c" cx="45%" cy="50%"><stop offset="0%" stop-color="#fff1d6"/><stop offset="40%" stop-color="#f6a04a"/><stop offset="100%" stop-color="#c75a25"/></radialGradient><radialGradient id="rSun2g" cx="50%" cy="50%"><stop offset="0%" stop-color="#ffd7a3" stop-opacity=".65"/><stop offset="60%" stop-color="#f6a04a" stop-opacity=".18"/><stop offset="100%" stop-color="#f6a04a" stop-opacity="0"/></radialGradient></defs><circle cx="32" cy="32" r="30" fill="url(#rSun2g)"/><g stroke="#e08840" stroke-width="1.4" stroke-linecap="round" opacity=".75"><line x1="32" y1="7" x2="32" y2="13"/><line x1="32" y1="51" x2="32" y2="57"/><line x1="7" y1="32" x2="13" y2="32"/><line x1="51" y1="32" x2="57" y2="32"/><line x1="14" y1="14" x2="18" y2="18"/><line x1="46" y1="46" x2="50" y2="50"/><line x1="14" y1="50" x2="18" y2="46"/><line x1="46" y1="18" x2="50" y2="14"/></g><circle cx="32" cy="34" r="16" fill="url(#rSun2c)"/><circle cx="28" cy="30" r="3.5" fill="#fff1d6" opacity=".5"/></svg>`;

  const MOON = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="rMoonC" cx="38%" cy="35%"><stop offset="0%" stop-color="#fbf6dd"/><stop offset="60%" stop-color="#e8dfb3"/><stop offset="100%" stop-color="#a09575"/></radialGradient><radialGradient id="rMoonG" cx="50%" cy="50%"><stop offset="0%" stop-color="#fdf6dc" stop-opacity=".5"/><stop offset="60%" stop-color="#e8dfb3" stop-opacity=".12"/><stop offset="100%" stop-color="#e8dfb3" stop-opacity="0"/></radialGradient></defs><circle cx="32" cy="32" r="30" fill="url(#rMoonG)"/><circle cx="32" cy="32" r="17" fill="url(#rMoonC)"/><ellipse cx="26" cy="28" rx="2.2" ry="1.8" fill="#9a9078" opacity=".4"/><ellipse cx="35" cy="34" rx="1.8" ry="1.4" fill="#9a9078" opacity=".35"/><circle cx="32" cy="24" r="1.2" fill="#9a9078" opacity=".3"/><g fill="#fdf6dc"><circle cx="54" cy="14" r="0.9" opacity=".9"/><circle cx="58" cy="22" r="0.55" opacity=".7"/><circle cx="48" cy="54" r="0.7" opacity=".75"/><circle cx="10" cy="50" r="0.6" opacity=".7"/></g></svg>`;

  function pickTimeIcon() {
    const h = new Date().getHours();
    if (h >= 5 && h < 12)  return { svg: SUN_MORNING,   period: 'morning' };
    if (h >= 12 && h < 19) return { svg: SUN_AFTERNOON, period: 'afternoon' };
    return                       { svg: MOON,          period: 'night' };
  }

  function injectTimeIcon() {
    const greet = document.getElementById('homeGreetTxt');
    if (!greet) return;
    // remove existing icon if any
    const existing = greet.querySelector('.r-time-icon');
    if (existing) existing.remove();
    const { svg, period } = pickTimeIcon();
    const span = document.createElement('span');
    span.className = 'r-time-icon is-' + period;
    span.innerHTML = svg;
    greet.appendChild(span);
  }

  /* ── 2. Make user name editable (small pencil) ─────────────────── */
  function makeNameEditable() {
    const nameEl = document.getElementById('homeUserName');
    if (!nameEl || nameEl.dataset.rEditWired === '1') return;
    nameEl.dataset.rEditWired = '1';

    const editBtn = document.createElement('button');
    editBtn.className = 'r-name-edit';
    editBtn.title = 'Editar mi nombre';
    editBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
    nameEl.parentNode.insertBefore(editBtn, nameEl.nextSibling);

    function startEdit(e) {
      if (e) e.stopPropagation();
      nameEl.classList.add('editing');
      nameEl.setAttribute('contenteditable', 'true');
      nameEl.focus();
      const range = document.createRange();
      range.selectNodeContents(nameEl);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    function endEdit() {
      nameEl.classList.remove('editing');
      nameEl.setAttribute('contenteditable', 'false');
      const newName = nameEl.textContent.trim() || 'Hola!';
      nameEl.textContent = newName;
      try {
        localStorage.setItem('velo-r-displayname', newName);
        // Also sync to velo_user_name so premium.js doesn't overwrite on next home load
        if (typeof safeLS === 'function') safeLS('set', 'velo_user_name', newName);
        else localStorage.setItem('velo_user_name', newName);
      } catch(e) {}
    }
    editBtn.addEventListener('click', startEdit);
    nameEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); endEdit(); }
      if (e.key === 'Escape') { endEdit(); }
    });
    nameEl.addEventListener('blur', endEdit);

    // restore saved — always apply user-edited name from velo-r-displayname
    try {
      const saved = localStorage.getItem('velo-r-displayname');
      if (saved && saved !== nameEl.textContent.trim()) {
        nameEl.textContent = saved;
        // Keep velo_user_name in sync so home refresh doesn't overwrite it
        if (typeof safeLS === 'function') safeLS('set', 'velo_user_name', saved);
        else localStorage.setItem('velo_user_name', saved);
      }
    } catch(e) {}
  }

  /* ── 3. Word-reveal animation on greeting line ─────────────────── */
  function wrapGreetingWords() {
    const greet = document.getElementById('homeGreetTxt');
    if (!greet || greet.dataset.rWrapped === '1') return;
    greet.dataset.rWrapped = '1';

    // Get only the text node (ignoring nested span like the icon)
    const textNodes = Array.from(greet.childNodes).filter(n => n.nodeType === Node.TEXT_NODE);
    textNodes.forEach(tn => {
      const txt = tn.textContent.trim();
      if (!txt) return;
      const wrap = document.createDocumentFragment();
      txt.split(/\s+/).forEach((w, i) => {
        const span = document.createElement('span');
        span.className = 'r-word-reveal';
        span.textContent = w;
        wrap.appendChild(span);
        wrap.appendChild(document.createTextNode(' '));
      });
      tn.parentNode.replaceChild(wrap, tn);
    });
  }

  /* ── 4. Boot ────────────────────────────────────────────────────── */
  function boot() {
    // Greeting + icon
    wrapGreetingWords();
    injectTimeIcon();
    // Re-inject icon every minute in case greeting text mutates
    setInterval(injectTimeIcon, 60000);

    // Editable name
    makeNameEditable();

    // Observe DOM mutations on greeting (app rewrites text on screen change)
    const greet = document.getElementById('homeGreetTxt');
    if (greet) {
      const mo = new MutationObserver(() => {
        // Re-wrap and re-inject icon if app rewrote the content
        if (!greet.querySelector('.r-word-reveal')) wrapGreetingWords();
        if (!greet.querySelector('.r-time-icon')) injectTimeIcon();
      });
      mo.observe(greet, { childList: true, characterData: true, subtree: true });
    }

    // Hero v2 stats — run immediately + every 5s
    syncHeroStats();
    setInterval(syncHeroStats, 5000);
  }

  /* ── 5. Sync valores dinámicos del hero v2 ──────────────────── */
  function syncHeroStats() {
    // Only run when home elements are present (skip on other pages)
    if (!document.getElementById('homeStatGuardians') &&
        !document.getElementById('homeGuardianCount')) return;

    // ── Guardian count ──────────────────────────────────────────
    // Read from premium.js global _liveGuardians (available after login)
    let guardianN = null;
    if (typeof _liveGuardians !== 'undefined' && Array.isArray(_liveGuardians)) {
      guardianN = _liveGuardians.filter(g => g.status !== 'incognito').length;
    }
    // Fallback: count guardian cards in the DOM
    if (guardianN === null) {
      const cards = document.querySelectorAll('#guardiansList .p-guardian-card');
      if (cards.length > 0) guardianN = cards.length;
    }
    const gcEl   = document.getElementById('homeGuardianCount');
    const statEl = document.getElementById('homeStatGuardians');
    if (gcEl && guardianN !== null) gcEl.textContent = guardianN;
    if (statEl && guardianN !== null) statEl.textContent = guardianN;

    // ── Visit streak ────────────────────────────────────────────
    let streak = 1;
    try {
      const days = JSON.parse(
        (typeof safeLS === 'function' ? safeLS('get','velo_visit_days') : localStorage.getItem('velo_visit_days')) || '[]'
      );
      streak = days.length || 1;
    } catch(e) {}
    const streakEl = document.getElementById('homeStatStreak');
    if (streakEl) streakEl.textContent = streak;

    // ── Plan label ──────────────────────────────────────────────
    let planLabel = '✦';
    try {
      const plan = typeof safeLS === 'function' ? safeLS('get','velo_plan') : localStorage.getItem('velo_plan');
      if (plan === 'plus' || plan === 'pro') planLabel = 'Plus';
      else if (plan === 'free' || !plan) planLabel = 'Free';
    } catch(e) {}
    const planEl = document.getElementById('homeStatPlan');
    if (planEl) planEl.textContent = planLabel;
  }

  /* ── 6. Dark mode init ──────────────────────────────────────────── */
  function applyDarkMode(dark) {
    if (dark) {
      document.body.classList.add('r-dark');
    } else {
      document.body.classList.remove('r-dark');
    }
    // update toggle label
    const lbl = document.getElementById('rDarkToggleLbl');
    if (lbl) lbl.textContent = dark ? '☀️ Modo claro' : '🌙 Modo oscuro';
  }

  function initDarkMode() {
    try {
      const saved = localStorage.getItem('velo-r-darkmode');
      if (saved === '1') {
        applyDarkMode(true);
      } else if (saved === null) {
        // Auto-detect system preference on first visit
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        applyDarkMode(prefersDark);
        localStorage.setItem('velo-r-darkmode', prefersDark ? '1' : '0');
      }
    } catch(e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 100));
    // Apply dark mode immediately (before boot) to avoid flash
    document.addEventListener('DOMContentLoaded', initDarkMode);
  } else {
    setTimeout(boot, 100);
    initDarkMode();
  }
})();

/* ── Dark mode toggle — global (called from HTML onclick) ─────────── */
function rToggleDarkMode() {
  var isDark = document.body.classList.toggle('r-dark');
  try { localStorage.setItem('velo-r-darkmode', isDark ? '1' : '0'); } catch(e) {}
  var lbl = document.getElementById('rDarkToggleLbl');
  if (lbl) lbl.textContent = isDark ? '☀️ Modo claro' : '🌙 Modo oscuro';
}
