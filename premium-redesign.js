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
    if (h >= 6 && h < 12)  return { svg: SUN_MORNING,   period: 'morning' };    // Buenos días
    if (h >= 12 && h < 20) return { svg: SUN_AFTERNOON, period: 'afternoon' };  // Buenas tardes
    return                       { svg: MOON,          period: 'night' };       // Buenas noches
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

    // Particle animations — green for light bg, warm gold for dark bg
    setTimeout(function() {
      initParticles('landingCanvas',  60, 0.5);
      initParticles('loginCanvas',    40, 0.4);
      initParticles('registerCanvas', 40, 0.4);
      initParticles('homeBgCanvas',   60, 0.35, '200,158,56');  // warm gold
      initParticles('profileBgCanvas', 40, 0.30, '80,170,220');  // sky blue for celeste bg
      initParticles('helpBgCanvas',    35, 0.38, '109,204,63');
    }, 300);

    initGuardianLabelObserver();
    initSurveyDismissal();
    enrichGreeting();
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
    // Async: query Supabase guardian_presence for real-time count
    if (typeof sbClient !== 'undefined' && sbClient && (gcEl || statEl)) {
      var myUid = (typeof safeLS === 'function') ? safeLS('get','velo_user_id') : localStorage.getItem('velo_user_id');
      var cutoff = new Date(Date.now() - 4*60*1000).toISOString(); // 4-min window — more accurate "right now"
      sbClient.from('guardian_presence')
        .select('user_id,status', {count:'exact'})
        .neq('status','offline')
        .gte('last_seen', cutoff)
        .then(function(res){
          if(res && res.data){
            var n = res.data.filter(function(r){
              return r.status !== 'incognito' && r.user_id !== myUid; // exclude self
            }).length;
            if(gcEl) gcEl.textContent = n;
            if(statEl) statEl.textContent = n;
          }
        }).catch(function(){});
    }

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
    const lbl = document.getElementById('rDarkToggleLbl');
    if (lbl) lbl.textContent = dark ? '☀️ Modo claro' : '🌙 Modo oscuro';
    const icon = document.getElementById('rDarkToggleIcon');
    if (icon) icon.textContent = dark ? '☀️' : '🌙';
    // Swap logo src based on background (light logo on dark bg, dark logo on light bg)
    var logoSrc = dark ? 'assets/logo.png' : 'assets/logo-dark.png';
    var topLogo = document.querySelector('.p-topbar-logo-img');
    var sideLogo = document.querySelector('.p-sidebar-logo-img');
    if (topLogo) topLogo.src = logoSrc;
    if (sideLogo) sideLogo.src = logoSrc;
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
  var icon = document.getElementById('rDarkToggleIcon');
  if (icon) icon.textContent = isDark ? '☀️' : '🌙';
  var logoSrc = isDark ? 'assets/logo.png' : 'assets/logo-dark.png';
  var topLogo = document.querySelector('.p-topbar-logo-img');
  var sideLogo = document.querySelector('.p-sidebar-logo-img');
  if (topLogo) topLogo.src = logoSrc;
  if (sideLogo) sideLogo.src = logoSrc;
}

/* ── Particle animation — firefly style ─────────────────────────── */
function initParticles(canvasId, count, maxOpacity, color) {
  var canvas = document.getElementById(canvasId);
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var particleColor = color || '232,213,163';
  var particles = [];
  function resize() {
    canvas.width  = canvas.offsetWidth  || window.innerWidth  || 600;
    canvas.height = canvas.offsetHeight || window.innerHeight || 900;
  }
  resize();
  window.addEventListener('resize', resize);
  for (var i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: 1 + Math.random() * 2,
      op: 0.08 + Math.random() * maxOpacity,
      phase: Math.random() * Math.PI * 2
    });
  }
  var frame = 0;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    frame++;
    particles.forEach(function(p) {
      p.x += p.vx + Math.sin(frame * 0.01 + p.phase) * 0.2;
      p.y += p.vy + Math.cos(frame * 0.013 + p.phase) * 0.15;
      if (p.x < 0) p.x = canvas.width;
      if (p.x > canvas.width) p.x = 0;
      if (p.y < 0) p.y = canvas.height;
      if (p.y > canvas.height) p.y = 0;
      var gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3);
      gr.addColorStop(0, 'rgba(' + particleColor + ',' + p.op + ')');
      gr.addColorStop(1, 'rgba(' + particleColor + ',0)');
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 3, 0, Math.PI * 2);
      ctx.fillStyle = gr;
      ctx.fill();
    });
    requestAnimationFrame(draw);
  }
  draw();
}

/* ── Guardian sub-label: "Modo guardián activo" when ON ───────────── */
function initGuardianLabelObserver() {
  var gBtn = document.getElementById('homeGuardianBtn');
  var lbl  = document.getElementById('guardianSubLabel');
  if (!gBtn || !lbl) return;
  function sync() {
    var on = gBtn.textContent.includes('Activado');
    lbl.textContent  = on ? 'Modo guardián activo' : 'Estado · activá el escudo para modo guardián';
    lbl.style.color  = on ? 'var(--sage2)' : 'var(--ink5)';
    lbl.style.fontWeight = on ? '600' : '400';
  }
  sync();
  new MutationObserver(sync).observe(gBtn, { childList: true, characterData: true, subtree: true });
}

/* ── Greeting enrichment: append user's first name ───────────────── */
function enrichGreeting() {
  var greetEl = document.getElementById('homeGreetTxt');
  var nameEl  = document.getElementById('homeUserName');
  if (!greetEl || !nameEl) return;

  function tryAppend() {
    var name = (nameEl.textContent || '').trim().split(' ')[0];
    if (!name || name.length < 2) return;
    var current = (greetEl.firstChild && greetEl.firstChild.nodeType === 3)
      ? greetEl.firstChild.textContent.trim()
      : greetEl.textContent.trim();
    if (current.includes(name) || current.includes(',')) return;
    var newText = current.replace(/\.$/, '') + ', ' + name + '.';
    var icon = greetEl.querySelector('.r-time-icon');
    if (greetEl.firstChild && greetEl.firstChild.nodeType === 3) {
      greetEl.firstChild.textContent = newText + ' ';
    } else {
      greetEl.textContent = newText + ' ';
      if (icon) greetEl.appendChild(icon);
    }
  }

  new MutationObserver(function() { tryAppend(); })
    .observe(nameEl, { childList: true, characterData: true, subtree: true });
  setTimeout(tryAppend, 600);
}

/* ── Survey banner: cookie-based 24h dismissal ────────────────────── */
function initSurveyDismissal() {
  var dismissed = document.cookie.includes('velo_survey_dismissed=1');
  new MutationObserver(function() {
    document.querySelectorAll('.p-toast').forEach(function(t) {
      var txt = t.textContent || '';
      if (!txt.includes('encuesta') && !txt.includes('Encuesta')) return;
      if (dismissed) { t.remove(); return; }
      var btn = t.querySelector('.p-toast-close') ||
                t.querySelector('button[aria-label*="close"]') ||
                t.querySelector('button[onclick*="ose"]');
      if (btn && !btn._surveyCookied) {
        btn._surveyCookied = true;
        btn.addEventListener('click', function() {
          document.cookie = 'velo_survey_dismissed=1; Max-Age=86400; SameSite=Lax; path=/';
          dismissed = true;
        }, { once: true });
      }
    });
  }).observe(document.body, { childList: true, subtree: true });
}

/* ══════════════════════════════════════════════════════════════════════
   v168: Modo Guardián — fix toggle re-render + ocupado (yellow) state
   ══════════════════════════════════════════════════════════════════════ */
(function() {
  // Override pHomeToggleGuardian so the pill re-renders after every toggle
  window.pHomeToggleGuardian = function() {
    var wasOn = safeLS('get', 'velo_is_guardian') === 'true';
    if (!wasOn) {
      var bio = safeLS('get', 'velo_guardian_bio') || '';
      if (!bio.trim()) {
        if (typeof pShowGuardianSetupModal === 'function') pShowGuardianSetupModal();
        return;
      }
    }
    if (typeof pToggleGuardianMode === 'function') pToggleGuardianMode();
    setTimeout(function() {
      if (typeof _renderHomeStatusToggle === 'function') _renderHomeStatusToggle();
    }, 60);
  };

  // Patch pSaveGuardianSetup so the pill also re-renders after bio is saved
  var _origSaveSetup = window.pSaveGuardianSetup;
  window.pSaveGuardianSetup = function() {
    if (typeof _origSaveSetup === 'function') _origSaveSetup.apply(this, arguments);
    setTimeout(function() {
      if (typeof _renderHomeStatusToggle === 'function') _renderHomeStatusToggle();
    }, 130);
  };

  // Override _renderHomeStatusToggle to add ocupado (yellow) state on guardian pill
  window._renderHomeStatusToggle = function() {
    var el = document.getElementById('homeStatusToggle');
    if (!el) return;
    var st = safeLS('get', 'velo_user_status') || 'disponible';
    var isGuardian = safeLS('get', 'velo_is_guardian') === 'true';

    var segPill = '<div class="r-status-combined-pill">'
      + '<button class="r-status-seg' + (st === 'disponible' ? ' active' : '') + '" onclick="pSetUserStatus(\'disponible\')">'
      + '<span class="r-status-dot r-status-dot--' + (st === 'disponible' ? 'green' : 'gray') + '"></span>Disponible</button>'
      + '<button class="r-status-seg' + (st === 'ocupado' ? ' active' : '') + '" onclick="pSetUserStatus(\'ocupado\')">'
      + '<span class="r-status-dot r-status-dot--' + (st === 'ocupado' ? 'yellow' : 'gray') + '"></span>Ocupado</button>'
      + '</div>';

    var guardClasses = 'r-guardian-pill'
      + (isGuardian ? (st === 'ocupado' ? ' r-guardian-pill--on r-guardian-pill--ocupado' : ' r-guardian-pill--on') : '');

    var guardPill = '<button class="' + guardClasses + '" onclick="pHomeToggleGuardian()">'
      + '<span style="font-size:14px">🛡️</span>'
      + '<span>Modo Guardián</span>'
      + '<span class="r-guardian-toggle"><span class="r-guardian-knob"></span></span>'
      + '</button>';

    el.innerHTML = segPill + guardPill;
    var gWrap = document.getElementById('homeGuardianWrap');
    if (gWrap) gWrap.style.display = 'none';
  };

  // Happy wall: scroll-to-collapse compose + post-submit collapse
  document.addEventListener('scroll', function(e) {
    var feed = document.getElementById('happyFeedScroll');
    if (feed && feed.contains(e.target)) pCollapseHappyCompose();
  }, true);
  // Collapse compose after a post is published
  var _origSubmitHappy = window.pSubmitHappyPost;
  if (typeof _origSubmitHappy === 'function') {
    window.pSubmitHappyPost = async function() {
      await _origSubmitHappy.apply(this, arguments);
      setTimeout(pCollapseHappyCompose, 400);
    };
  }
  // Populate compose bar avatar with user's avatar when available
  var _happyCbarAv = document.getElementById('happyComposeAv');
  if (_happyCbarAv) {
    var _trySetComposeAv = function() {
      var av = safeLS('get','velo_user_av') || '';
      if (av && av.length > 1) {
        if (av.startsWith('data:') || av.startsWith('http')) {
          _happyCbarAv.innerHTML = '<img src="'+av+'" style="width:28px;height:28px;border-radius:50%;object-fit:cover;display:block">';
        } else {
          _happyCbarAv.textContent = av;
        }
      }
    };
    _trySetComposeAv();
    setTimeout(_trySetComposeAv, 1500);
  }
})();

function pExpandHappyCompose() {
  var bar  = document.getElementById('happyComposeBar');
  var body = document.getElementById('happyComposeBody');
  if (!bar || !body) return;
  bar.style.display = 'none';
  body.classList.add('happy-compose--open');
  var ta = document.getElementById('happyPostTa');
  if (ta) setTimeout(function(){ ta.focus(); }, 50);
}

function pCollapseHappyCompose() {
  var ta = document.getElementById('happyPostTa');
  if (ta && ta.value.trim()) return; // keep open if user is typing
  var bar  = document.getElementById('happyComposeBar');
  var body = document.getElementById('happyComposeBody');
  if (!bar || !body) return;
  bar.style.display = '';
  body.classList.remove('happy-compose--open');
}
