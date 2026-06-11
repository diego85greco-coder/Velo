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

  /* ── Weather SVG icons ─────────────────────────────────────────── */
  const SUN_CLOUD = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="wSunC" cx="42%" cy="38%"><stop offset="0%" stop-color="#ffe066"/><stop offset="100%" stop-color="#f4a93b"/></radialGradient><linearGradient id="wCld1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#deeaf5"/><stop offset="100%" stop-color="#b8cfea"/></linearGradient></defs><circle cx="22" cy="25" r="12" fill="url(#wSunC)" opacity=".92"/><g stroke="#f4b93b" stroke-width="1.4" stroke-linecap="round" opacity=".65"><line x1="22" y1="7" x2="22" y2="11"/><line x1="22" y1="39" x2="22" y2="43"/><line x1="4" y1="25" x2="8" y2="25"/><line x1="36" y1="25" x2="40" y2="25"/><line x1="9" y1="12" x2="12" y2="15"/><line x1="9" y1="38" x2="12" y2="35"/><line x1="32" y1="12" x2="35" y2="15"/></g><circle cx="30" cy="42" r="11" fill="url(#wCld1)"/><circle cx="42" cy="43" r="9" fill="url(#wCld1)"/><circle cx="20" cy="45" r="9" fill="url(#wCld1)"/><rect x="11" y="42" width="40" height="12" rx="6" fill="url(#wCld1)"/></svg>`;

  const MOON_CLOUD = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="wMoonC" cx="38%" cy="35%"><stop offset="0%" stop-color="#fbf6dd"/><stop offset="100%" stop-color="#c8b87a"/></radialGradient><linearGradient id="wCld2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#c5d4e8"/><stop offset="100%" stop-color="#8faac4"/></linearGradient></defs><circle cx="22" cy="22" r="13" fill="url(#wMoonC)" opacity=".88"/><ellipse cx="18" cy="18" rx="2" ry="1.6" fill="#9a9078" opacity=".35"/><g fill="#fdf6dc"><circle cx="48" cy="10" r="0.8" opacity=".9"/><circle cx="56" cy="18" r="0.5" opacity=".7"/></g><circle cx="32" cy="43" r="12" fill="url(#wCld2)"/><circle cx="44" cy="44" r="10" fill="url(#wCld2)"/><circle cx="22" cy="46" r="10" fill="url(#wCld2)"/><rect x="12" y="43" width="42" height="13" rx="6" fill="url(#wCld2)"/></svg>`;

  const RAIN = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="wRainC" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#8aaac5"/><stop offset="100%" stop-color="#5c82a0"/></linearGradient></defs><circle cx="26" cy="28" r="14" fill="url(#wRainC)"/><circle cx="40" cy="30" r="12" fill="url(#wRainC)"/><circle cx="18" cy="32" r="10" fill="url(#wRainC)"/><rect x="8" y="30" width="48" height="14" rx="7" fill="url(#wRainC)"/><g stroke="#4a9fd4" stroke-width="2.2" stroke-linecap="round" opacity=".82"><line x1="21" y1="49" x2="19" y2="58"/><line x1="31" y1="49" x2="29" y2="58"/><line x1="41" y1="49" x2="39" y2="58"/><line x1="26" y1="53" x2="24" y2="62"/><line x1="36" y1="53" x2="34" y2="62"/></g></svg>`;

  const STORM = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="wStormC" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#6a7a8e"/><stop offset="100%" stop-color="#3e5066"/></linearGradient></defs><circle cx="26" cy="26" r="14" fill="url(#wStormC)"/><circle cx="40" cy="28" r="12" fill="url(#wStormC)"/><circle cx="18" cy="30" r="10" fill="url(#wStormC)"/><rect x="8" y="28" width="48" height="13" rx="6" fill="url(#wStormC)"/><polygon points="34,42 28,52 33,52 29,62 42,47 36,47 40,42" fill="#f6c644" opacity=".92"/></svg>`;

  const SNOW = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="wSnowC" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#d8e8f5"/><stop offset="100%" stop-color="#a8c2da"/></linearGradient></defs><circle cx="26" cy="27" r="14" fill="url(#wSnowC)"/><circle cx="40" cy="29" r="12" fill="url(#wSnowC)"/><circle cx="18" cy="31" r="10" fill="url(#wSnowC)"/><rect x="8" y="29" width="48" height="13" rx="6" fill="url(#wSnowC)"/><g fill="#7ab8e0" opacity=".8"><circle cx="22" cy="50" r="2.5"/><circle cx="32" cy="54" r="2.5"/><circle cx="42" cy="50" r="2.5"/><circle cx="27" cy="58" r="2"/><circle cx="37" cy="58" r="2"/></g></svg>`;

  const OVERCAST = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="wOvC" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#c8d8e8"/><stop offset="100%" stop-color="#96b0c8"/></linearGradient></defs><circle cx="24" cy="30" r="15" fill="url(#wOvC)"/><circle cx="40" cy="28" r="14" fill="url(#wOvC)"/><circle cx="16" cy="36" r="11" fill="url(#wOvC)"/><circle cx="48" cy="34" r="10" fill="url(#wOvC)"/><rect x="5" y="30" width="54" height="18" rx="9" fill="url(#wOvC)"/></svg>`;

  /* ── Weather via Open-Meteo geocoding — user enters city manually ── */
  var _weatherIconType = null;
  var _weatherTemp     = null;
  var _weatherCity     = null;
  var _W_CACHE  = 'velo_weather_cache';
  var _W_CITY   = 'velo_weather_city';

  function _wmoToType(code, isNight) {
    if (code === 0)                               return isNight ? 'clear-night' : 'clear-day';
    if (code <= 2)                                return isNight ? 'moon-cloud'  : 'sun-cloud';
    if (code === 3 || code === 45 || code === 48) return 'overcast';
    if (code >= 71 && code <= 77)                 return 'snow';
    if (code >= 95)                               return 'storm';
    if (code >= 51 && code <= 82)                 return 'rain';
    return isNight ? 'clear-night' : 'clear-day';
  }

  function _weatherEmoji(type) {
    switch(type) {
      case 'clear-day':   return { emoji: '☀️',  period: 'morning' };
      case 'sun-cloud':   return { emoji: '🌤️', period: 'morning' };
      case 'clear-night': return { emoji: '🌙',  period: 'night' };
      case 'moon-cloud':  return { emoji: '🌙',  period: 'night' };
      case 'rain':        return { emoji: '🌧️', period: 'rain' };
      case 'storm':       return { emoji: '⛈️',  period: 'storm' };
      case 'snow':        return { emoji: '🌨️', period: 'snow' };
      case 'overcast':    return { emoji: '☁️',  period: 'overcast' };
      default: return null;
    }
  }

  function _renderWeatherInfo() {
    var info = document.getElementById('homeWeatherInfo');
    if (!info) return;
    if (_weatherTemp === null || _weatherTemp === undefined) { info.style.display = 'none'; return; }
    // Home page always has dark green background — always use dark palette
    var cardBg   = 'rgba(8,32,18,.70)';
    var cardBord = 'rgba(116,198,157,.38)';
    var tempClr  = '#b8f0d0';
    var cityClr  = 'rgba(200,240,218,.92)';
    var editClr  = 'rgba(140,210,175,.62)';
    var divClr   = 'rgba(116,198,157,.28)';

    info.innerHTML = '';
    info.style.cssText += ';display:block;text-align:center';

    var card = document.createElement('div');
    card.style.cssText = [
      'display:inline-flex', 'align-items:center', 'gap:0',
      'background:' + cardBg,
      'backdrop-filter:blur(16px)', '-webkit-backdrop-filter:blur(16px)',
      'border:1.5px solid ' + cardBord,
      'border-radius:100px',
      'padding:10px 22px 10px 18px',
      'box-shadow:0 6px 32px rgba(0,0,0,.40),inset 0 1px 0 rgba(116,198,157,.14)',
      'position:relative', 'z-index:2', 'margin-top:-22px'
    ].join(';');

    // Temperature — large, light weight
    var tempEl = document.createElement('div');
    tempEl.style.cssText = [
      'font-size:30px', 'font-weight:300', 'letter-spacing:-.8px',
      'color:' + tempClr,
      'font-family:\'Jost\',sans-serif', 'line-height:1',
      'padding-right:12px',
      'border-right:1px solid ' + divClr
    ].join(';');
    tempEl.textContent = _weatherTemp + '°';

    // City + edit button
    var cityWrap = document.createElement('div');
    cityWrap.style.cssText = 'display:flex;flex-direction:column;align-items:flex-start;padding-left:12px;gap:3px';

    var cityEl = document.createElement('div');
    cityEl.style.cssText = [
      'font-size:15px', 'font-weight:600', 'letter-spacing:.1px',
      'color:' + cityClr,
      'font-family:\'Jost\',sans-serif', 'line-height:1.2'
    ].join(';');
    cityEl.textContent = _weatherCity || '';

    var editBtn = document.createElement('div');
    editBtn.textContent = 'Cambiar ciudad ✎';
    editBtn.style.cssText = [
      'font-size:9px', 'cursor:pointer',
      'color:' + editClr,
      'font-family:\'Jost\',sans-serif',
      'letter-spacing:.3px', 'line-height:1',
      'transition:opacity .15s', 'opacity:.75'
    ].join(';');
    editBtn.onmouseover = function(){ editBtn.style.opacity = '1'; };
    editBtn.onmouseout  = function(){ editBtn.style.opacity = '.75'; };
    editBtn.onclick = function(e) {
      e.stopPropagation();
      try { localStorage.removeItem(_W_CACHE); localStorage.removeItem(_W_CITY); } catch(e2) {}
      _weatherTemp = null; _weatherCity = null; _weatherIconType = null;
      injectTimeIcon();
      _showCityInput();
    };

    cityWrap.appendChild(cityEl);
    cityWrap.appendChild(editBtn);
    card.appendChild(tempEl);
    card.appendChild(cityWrap);
    info.appendChild(card);
  }

  function _showCityInput() {
    var info = document.getElementById('homeWeatherInfo');
    if (!info) return;
    var isDark = document.body.classList.contains('r-dark');
    var ink = isDark ? 'rgba(210,235,220,.88)' : 'rgba(15,50,28,.78)';
    var borderCol = isDark ? 'rgba(140,200,160,.30)' : 'rgba(60,120,80,.28)';
    var bg = isDark ? 'rgba(255,255,255,.07)' : 'rgba(255,255,255,.55)';
    var dropBg = isDark ? 'rgba(18,38,26,.97)' : 'rgba(245,252,248,.98)';
    info.innerHTML = '';
    info.style.cssText += ';display:block;color:' + ink;

    var wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:relative;display:inline-block';

    var form = document.createElement('form');
    form.style.cssText = 'display:flex;align-items:center;gap:4px;justify-content:center;margin-top:2px';

    var input = document.createElement('input');
    input.type = 'text';
    input.placeholder = '¿Tu ciudad?';
    input.autocomplete = 'off';
    input.style.cssText = [
      'font-size:11.5px', 'padding:3px 9px', 'border-radius:20px',
      'border:1px solid ' + borderCol, 'background:' + bg,
      'color:inherit', 'outline:none', 'width:120px',
      'font-family:\'Jost\',sans-serif'
    ].join(';');

    var submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = '→';
    submit.style.cssText = 'font-size:13px;border:none;background:transparent;cursor:pointer;padding:0 2px;color:inherit;opacity:.65';

    // Autocomplete dropdown
    var dropdown = document.createElement('div');
    dropdown.style.cssText = [
      'position:absolute', 'top:calc(100% + 4px)', 'left:0',
      'min-width:170px', 'max-width:240px',
      'background:' + dropBg,
      'border:1px solid ' + borderCol,
      'border-radius:10px', 'overflow:hidden',
      'box-shadow:0 6px 20px rgba(0,0,0,.22)',
      'z-index:9999', 'display:none'
    ].join(';');

    form.appendChild(input);
    form.appendChild(submit);
    wrapper.appendChild(form);
    wrapper.appendChild(dropdown);
    info.appendChild(wrapper);

    var _debTimer = null;
    var _lastQ = '';

    function _showDropdown(results) {
      dropdown.innerHTML = '';
      if (!results || !results.length) { dropdown.style.display = 'none'; return; }
      results.forEach(function(loc) {
        var item = document.createElement('div');
        var parts = [loc.name];
        if (loc.admin1) parts.push(loc.admin1);
        if (loc.country) parts.push(loc.country);
        item.textContent = parts.join(', ');
        item.style.cssText = [
          'padding:6px 12px', 'font-size:11px', 'cursor:pointer',
          'color:' + ink, 'font-family:\'Jost\',sans-serif',
          'border-bottom:1px solid ' + (isDark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.05)'),
          'transition:background .10s', 'white-space:nowrap', 'overflow:hidden', 'text-overflow:ellipsis'
        ].join(';');
        item.addEventListener('mouseover', function() {
          item.style.background = isDark ? 'rgba(116,198,157,.18)' : 'rgba(116,198,157,.22)';
        });
        item.addEventListener('mouseout', function() { item.style.background = 'transparent'; });
        item.addEventListener('mousedown', function(e) {
          e.preventDefault();
          dropdown.style.display = 'none';
          input.value = loc.name;
          info.innerHTML = '';
          info.appendChild(document.createTextNode('🔍…'));
          // Pass lat/lon directly — skip geocoding round-trip
          _fetchWeatherCoords(loc.name, loc.latitude, loc.longitude);
        });
        dropdown.appendChild(item);
      });
      dropdown.style.display = 'block';
    }

    input.addEventListener('input', function() {
      clearTimeout(_debTimer);
      var q = input.value.trim();
      if (q.length < 2) { dropdown.style.display = 'none'; _lastQ = ''; return; }
      if (q === _lastQ) return;
      _debTimer = setTimeout(function() {
        _lastQ = q;
        fetch('https://geocoding-api.open-meteo.com/v1/search?name=' +
          encodeURIComponent(q) + '&count=6&language=es&format=json')
          .then(function(r){ return r.json(); })
          .then(function(d){ _showDropdown(d.results); })
          .catch(function(){ dropdown.style.display = 'none'; });
      }, 350);
    });

    input.addEventListener('blur', function() {
      setTimeout(function(){ dropdown.style.display = 'none'; }, 180);
    });

    form.addEventListener('submit', function(e) {
      e.preventDefault();
      var city = input.value.trim();
      if (!city) return;
      dropdown.style.display = 'none';
      info.innerHTML = '';
      info.appendChild(document.createTextNode('🔍…'));
      _fetchWeatherByCity(city);
    });

    // Hint below input
    var hint = document.createElement('div');
    hint.textContent = '🌍 Elegí tu ciudad — la recordaremos para tus próximas sesiones. Podés cambiarla cuando quieras.';
    hint.style.cssText = [
      'margin-top:7px', 'font-size:9.5px', 'line-height:1.5',
      'opacity:.58', 'text-align:center', 'max-width:210px',
      'font-family:\'Jost\',sans-serif', 'font-style:italic'
    ].join(';');
    info.appendChild(hint);

    setTimeout(function(){ input.focus(); }, 80);
  }

  // Fetch weather when we already have coordinates (from autocomplete selection)
  function _fetchWeatherCoords(cityName, lat, lon) {
    var forecastUrl = 'https://api.open-meteo.com/v1/forecast?latitude=' +
      lat + '&longitude=' + lon + '&current_weather=true&timezone=auto';
    fetch(forecastUrl)
      .then(function(r){ return r.json(); })
      .then(function(weather) {
        var cw   = weather.current_weather;
        var type = _wmoToType(cw.weathercode, cw.is_day === 0);
        var temp = Math.round(cw.temperature);
        _weatherIconType = type;
        _weatherTemp     = temp;
        _weatherCity     = cityName;
        try { localStorage.setItem(_W_CITY, cityName); } catch(e) {}
        try {
          localStorage.setItem(_W_CACHE, JSON.stringify({
            ts: Date.now(), type: type, temp: temp, city: cityName
          }));
        } catch(e) {}
        try {
          var _wUid = typeof safeLS === 'function' ? safeLS('get','velo_user_id') : localStorage.getItem('velo_user_id');
          if (_wUid && typeof sbClient !== 'undefined') {
            sbClient.from('profiles').update({ weather_city: cityName }).eq('id', _wUid).then(function(){}).catch(function(){});
          }
        } catch(e) {}
        injectTimeIcon();
        _renderWeatherInfo();
      })
      .catch(function() {
        var info = document.getElementById('homeWeatherInfo');
        if (info) { info.innerHTML = ''; info.appendChild(document.createTextNode('⚠️ Sin conexión')); }
        setTimeout(_showCityInput, 2200);
      });
  }

  function _fetchWeatherByCity(cityName) {
    var geoUrl = 'https://geocoding-api.open-meteo.com/v1/search?name=' +
      encodeURIComponent(cityName) + '&count=1&language=es&format=json';
    fetch(geoUrl)
      .then(function(r){ return r.json(); })
      .then(function(data) {
        if (!data.results || !data.results.length) {
          var info = document.getElementById('homeWeatherInfo');
          if (info) { info.innerHTML = ''; info.appendChild(document.createTextNode('❌ Ciudad no encontrada')); }
          setTimeout(_showCityInput, 1800);
          return;
        }
        var loc = data.results[0];
        _fetchWeatherCoords(loc.name, loc.latitude, loc.longitude);
      })
      .catch(function() {
        var info = document.getElementById('homeWeatherInfo');
        if (info) { info.innerHTML = ''; info.appendChild(document.createTextNode('⚠️ Sin conexión')); }
        setTimeout(_showCityInput, 2200);
      });
  }

  function _trySyncCityFromSupabase() {
    // Runs in background on first visit — if Supabase has a city saved from another device,
    // auto-populate without the user needing to type it again
    setTimeout(function() {
      try {
        var uid = typeof safeLS === 'function' ? safeLS('get','velo_user_id') : localStorage.getItem('velo_user_id');
        if (!uid || typeof sbClient === 'undefined') return;
        sbClient.from('profiles').select('weather_city').eq('id', uid).limit(1)
          .then(function(res) {
            if (res && res.data && res.data[0] && res.data[0].weather_city) {
              var city = res.data[0].weather_city;
              try { localStorage.setItem(_W_CITY, city); } catch(e) {}
              _fetchWeatherByCity(city);
            }
          })
          .catch(function(){});
      } catch(e) {}
    }, 2500);
  }

  function _initWeather() {
    // 1. Valid cache (30-min TTL) → show immediately, no network call
    try {
      var c = JSON.parse(localStorage.getItem(_W_CACHE) || 'null');
      if (c && typeof c.temp === 'number' && Date.now() - c.ts < 30 * 60 * 1000) {
        _weatherIconType = c.type;
        _weatherTemp     = c.temp;
        _weatherCity     = c.city || '';
        injectTimeIcon();
        _renderWeatherInfo();
        return;
      }
    } catch(e) {}
    // 2. Saved city in localStorage but stale cache → re-fetch weather silently
    try {
      var saved = localStorage.getItem(_W_CITY);
      if (saved) { _fetchWeatherByCity(saved); return; }
    } catch(e) {}
    // 3. First visit on this device — show input, but also check Supabase in background
    _showCityInput();
    _trySyncCityFromSupabase();
  }

  function pickTimeIcon() {
    var h = new Date().getHours();
    var isNight = (h >= 20 || h < 6);
    if (_weatherIconType) {
      var effectiveType = _weatherIconType;
      if (isNight) {
        if (effectiveType === 'clear-day')  effectiveType = 'clear-night';
        else if (effectiveType === 'sun-cloud') effectiveType = 'moon-cloud';
      }
      var wr = _weatherEmoji(effectiveType);
      if (wr) return Object.assign({}, wr, { type: effectiveType });
    }
    if (h >= 6 && h < 12)  return { emoji: '☀️', period: 'morning',   type: 'clear-day' };
    if (h >= 12 && h < 20) return { emoji: '☀️', period: 'afternoon',  type: 'clear-day' };
    return                        { emoji: '🌙', period: 'night',      type: 'clear-night' };
  }

  /* ── Basmilius weather-icons animated SVG — free CDN via jsDelivr ── */
  function _weatherAnimSvg(period, type) {
    var map = {
      'clear-day':   'clear-day',
      'clear-night': 'clear-night',
      'sun-cloud':   'partly-cloudy-day',
      'moon-cloud':  'partly-cloudy-night',
      'overcast':    'overcast',
      'rain':        'rain',
      'storm':       'thunderstorms',
      'snow':        'snow'
    };
    var file = map[type] || (period === 'night' ? 'clear-night' : 'clear-day');
    var url = 'https://cdn.jsdelivr.net/gh/basmilius/weather-icons@dev/production/fill/svg/' + file + '.svg';
    return '<img src="' + url + '" class="weather-hero-img" data-period="' + period + '" alt="" draggable="false">';
  }

  function injectTimeIcon() {
    var iconWrap = document.getElementById('homeTimeIcon');
    var greet    = document.getElementById('homeGreetTxt');
    if (greet) { var oldG = greet.querySelector('.r-time-icon'); if (oldG) oldG.remove(); }
    var result = pickTimeIcon();
    var span = document.createElement('span');
    span.className = 'r-time-icon is-' + result.period;
    span.innerHTML = _weatherAnimSvg(result.period, result.type || '');
    span.style.cssText = 'display:block;text-align:center;cursor:default;user-select:none;line-height:0';
    if (iconWrap) {
      var oldIcon = iconWrap.querySelector('.r-time-icon');
      if (oldIcon) oldIcon.remove();
      var weatherEl = document.getElementById('homeWeatherInfo');
      if (weatherEl && weatherEl.parentNode === iconWrap) iconWrap.insertBefore(span, weatherEl);
      else iconWrap.insertBefore(span, iconWrap.firstChild);
    } else if (greet) { greet.appendChild(span); }
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
    // Weather: load from cache, re-fetch saved city, or ask user to enter city
    _initWeather();
    // Re-inject icon every minute in case greeting text mutates
    setInterval(injectTimeIcon, 60000);

    // Editable name
    makeNameEditable();

    // Profile chip — reads directly from localStorage (same source as _updateSidebarUser)
    function _fillProfileChip() {
      var _ls = function(k) { try { return (typeof safeLS==='function' ? safeLS('get',k) : localStorage.getItem(k))||''; } catch(e){ return ''; } };
      var name = _ls('velo_user_name');
      var av   = _ls('velo_user_av');
      var nameEl = document.getElementById('homeProfileChipName');
      var chipAv = document.getElementById('homeProfileChipAv');
      if (nameEl) nameEl.textContent = name ? name.split(' ')[0] : '—';
      if (chipAv) {
        var isImg = av && (av.startsWith('data:') || av.startsWith('http'));
        if (isImg) {
          chipAv.style.backgroundImage    = 'url(' + av + ')';
          chipAv.style.backgroundSize     = 'cover';
          chipAv.style.backgroundPosition = 'center';
          chipAv.style.backgroundRepeat   = 'no-repeat';
          chipAv.style.fontSize = '0';
          chipAv.textContent = '';
        } else {
          chipAv.style.backgroundImage = '';
          chipAv.style.fontSize = '';
          chipAv.textContent = av || (name ? name[0].toUpperCase() : '?');
        }
      }
    }
    _fillProfileChip();
    setTimeout(_fillProfileChip, 3500);
    // Mirror sidebar updates (avatar upload, Supabase sync — sidebar and chip share velo_user_av)
    var _sbAv = document.getElementById('sidebarUserAv');
    if (_sbAv) {
      new MutationObserver(function() { _fillProfileChip(); })
        .observe(_sbAv, { attributes: true, attributeFilter: ['style'], childList: true });
    }

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

    // Particle animations — light color / dark mode color pairs
    setTimeout(function() {
      initParticles('landingCanvas',    140, 0.78, '130,90,18',   '140,210,155');
      initParticles('loginCanvas',       90, 0.72, '130,90,18',   '140,210,155');
      initParticles('registerCanvas',    90, 0.72, '130,90,18',   '140,210,155');
      initParticles('homeBgCanvas',     320, 0.88, '130,90,18',   '100,210,145');
      initParticles('moodBgCanvas',      100, 0.68, '150,120,200', '145,190,230');
      initParticles('profileBgCanvas',   95, 0.58, '70,120,180',  '100,200,180');
      initParticles('helpBgCanvas',      85, 0.60, '45,120,75',   '120,200,240');
      initParticles('respiraBgCanvas',   80, 0.60, '60,170,195',  '80,190,215');
      // Help chat: always dark green bg — use green particles visible on dark
      initParticles('helpChatBgCanvas',  70, 0.58, '80,185,120',  '100,220,155');
      setTimeout(initAllPageParticles, 200);
    }, 300);

    initGuardianLabelObserver();
    initSurveyDismissal();
    enrichGreeting();
    initGreetingRotation();
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

    // ── Visit days (total unique days, same metric as profile "DÍAS") ──
    let streak = 1;
    try {
      if (typeof _getVisitDayCount === 'function') {
        streak = _getVisitDayCount() || 1;
      } else {
        const days = JSON.parse(
          (typeof safeLS === 'function' ? safeLS('get','velo_visit_days') : localStorage.getItem('velo_visit_days')) || '[]'
        );
        streak = days.length || 1;
      }
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
  // Force repaint on iOS Safari — toggling a class doesn't always trigger a repaint
  document.body.style.webkitTransform = 'translateZ(0)';
  requestAnimationFrame(function(){ requestAnimationFrame(function(){ document.body.style.webkitTransform = ''; }); });
}

/* ── Particle animation — firefly + rising embers style ─────────── */
function initParticles(canvasId, count, maxOpacity, color, darkColor) {
  var canvas = document.getElementById(canvasId);
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var lightColor = color || '232,213,163';
  var darkModeColor = darkColor || '140,210,155';
  var particles = [];
  function resize() {
    canvas.width  = canvas.offsetWidth  || window.innerWidth  || 600;
    canvas.height = canvas.offsetHeight || window.innerHeight || 900;
  }
  resize();
  window.addEventListener('resize', resize);
  for (var i = 0; i < count; i++) {
    var kind = Math.random();
    var isRising = kind > 0.5 && kind <= 0.8;
    var isDrifter = kind > 0.8;
    particles.push({
      x:     Math.random() * canvas.width,
      y:     Math.random() * canvas.height,
      vx:    (Math.random() - 0.5) * (isDrifter ? 0.18 : 0.35),
      vy:    isRising ? -(0.12 + Math.random() * 0.45) : (Math.random() - 0.5) * (isDrifter ? 0.12 : 0.3),
      r:     isDrifter ? 2 + Math.random() * 2.5 : 0.8 + Math.random() * 2,
      op:    0.06 + Math.random() * maxOpacity,
      phase: Math.random() * Math.PI * 2,
      pulse: Math.random() * Math.PI * 2,
      pspd:  0.008 + Math.random() * 0.018
    });
  }
  var frame = 0;
  function draw() {
    // Skip drawing when owning page is inactive (saves CPU on hidden pages)
    var page = canvas.closest && canvas.closest('.p-page');
    if (page && !page.classList.contains('active')) {
      requestAnimationFrame(draw);
      return;
    }
    // Auto-resize: only when canvas has real layout dimensions (page is visible).
    // Do NOT fall back to window.innerHeight — on mobile it changes constantly
    // as the browser toolbar hides/shows, causing a flicker feedback loop.
    var dw = canvas.offsetWidth;
    var dh = canvas.offsetHeight;
    if (dw && dh && (canvas.width !== dw || canvas.height !== dh)) {
      canvas.width  = dw;
      canvas.height = dh;
    }
    var particleColor = document.body.classList.contains('r-dark') ? darkModeColor : lightColor;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    frame++;
    particles.forEach(function(p) {
      p.x += p.vx + Math.sin(frame * 0.009 + p.phase) * 0.28;
      p.y += p.vy + Math.cos(frame * 0.011 + p.phase) * 0.22;
      if (p.x < -20) p.x = canvas.width  + 20;
      if (p.x > canvas.width  + 20) p.x = -20;
      if (p.y < -20) p.y = canvas.height + 20;
      if (p.y > canvas.height + 20) p.y = -20;
      var pulseOp = p.op * (0.55 + 0.45 * Math.sin(frame * p.pspd + p.pulse));
      var radius = p.r * 3.2;
      var gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
      gr.addColorStop(0,   'rgba(' + particleColor + ',' + pulseOp + ')');
      gr.addColorStop(0.4, 'rgba(' + particleColor + ',' + (pulseOp * 0.4) + ')');
      gr.addColorStop(1,   'rgba(' + particleColor + ',0)');
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = gr;
      ctx.fill();
    });
    requestAnimationFrame(draw);
  }
  draw();
}

/* ── Inject particle canvas into every standard content page ─────── */
function initAllPageParticles() {
  document.querySelectorAll('.p-page').forEach(function(page) {
    // Skip pages that already have a canvas (landing/login/register/home/help/profile/respira)
    if (page.querySelector('canvas')) return;
    // Skip pure chat rooms (dark backgrounds with no .p-page-scroll AND have inline background style)
    var hasBg = (page.getAttribute('style')||'').indexOf('background:') >= 0;
    if (!page.querySelector('.p-page-scroll') && hasBg) return;
    var canvasId = 'pgBg_' + (page.id || Math.random().toString(36).slice(2));
    var cv = document.createElement('canvas');
    cv.id = canvasId;
    cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0';
    page.insertBefore(cv, page.firstChild);
    initParticles(canvasId, 95, 0.68, '130,90,18',   '140,210,155');
  });
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
    var txt = greetEl.textContent.trim();
    if (txt.includes(name) || txt.includes(',')) return;
    greetEl.textContent = txt.replace(/\.$/, '') + ', ' + name + '.';
  }

  new MutationObserver(function() { tryAppend(); })
    .observe(nameEl, { childList: true, characterData: true, subtree: true });
  setTimeout(tryAppend, 600);
}

/* ── Greeting rotation — disabled; saludo es estático ─────────────── */
function initGreetingRotation() { return; /* animation removed per v312 */
  var greetBlock = document.getElementById('homeGreetBlock');
  var h1         = document.getElementById('homeGreetTxt');
  var subtitle   = document.getElementById('homeGreetSub');
  var quoteWrap  = document.getElementById('homeGreetQuote');
  if (!h1 || !quoteWrap) return;

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var FADE = reduced ? 0 : 1400;   // transition ms
  var SHOW = 8000;                  // visible ms

  var greetH1Text  = null;
  var greetSubText = null;

  var CSS_TRANS = 'opacity ' + FADE + 'ms cubic-bezier(.4,0,.2,1), transform ' + FADE + 'ms cubic-bezier(.4,0,.2,1)';

  function applyFade(el, show) {
    el.style.transition = reduced ? 'none' : CSS_TRANS;
    el.style.opacity    = show ? '1' : '0';
    el.style.transform  = show ? 'translateY(0)' : 'translateY(8px)';
    el.style.pointerEvents = show ? '' : 'none';
  }

  function showQuote() {
    var quoteEl  = document.getElementById('homeDailyQuoteText');
    var authorEl = document.getElementById('homeDailyQuoteAuthor');
    var q = (quoteEl  ? quoteEl.textContent.trim()  : '') || 'La calma también es una forma de avanzar.';
    var a = (authorEl ? authorEl.textContent.trim() : '') || '— Anónimo';

    greetH1Text  = h1.textContent.trim() || greetH1Text;
    greetSubText = subtitle ? subtitle.textContent.trim() : greetSubText;

    // Fade out greeting block
    if (greetBlock) applyFade(greetBlock, false);
    else {
      applyFade(h1, false);
      if (subtitle) applyFade(subtitle, false);
    }

    setTimeout(function() {
      if (greetBlock) greetBlock.style.visibility = 'hidden';
      else {
        h1.style.visibility = 'hidden';
        if (subtitle) subtitle.style.visibility = 'hidden';
      }

      // Prepare and fade in quote
      quoteWrap.innerHTML = '“' + q + '”'
        + (a ? '<span class=”r-greet-quote-author”>' + a + '</span>' : '');
      quoteWrap.style.display = 'block';
      quoteWrap.style.opacity = '0';
      quoteWrap.style.transform = 'translateY(8px)';
      quoteWrap.style.pointerEvents = '';

      requestAnimationFrame(function() {
        requestAnimationFrame(function() { applyFade(quoteWrap, true); });
      });

      setTimeout(showGreeting, SHOW);
    }, FADE + 50);
  }

  function showGreeting() {
    applyFade(quoteWrap, false);

    setTimeout(function() {
      quoteWrap.style.display = 'none';
      // Restore greeting text (enrichGreeting may have set name)
      if (greetH1Text) h1.textContent = greetH1Text;
      if (greetSubText && subtitle) subtitle.textContent = greetSubText;

      if (greetBlock) {
        greetBlock.style.visibility = '';
        greetBlock.style.opacity = '0';
        greetBlock.style.transform = 'translateY(8px)';
        requestAnimationFrame(function() {
          requestAnimationFrame(function() { applyFade(greetBlock, true); });
        });
      } else {
        h1.style.visibility = '';
        h1.style.opacity = '0';
        h1.style.transform = 'translateY(8px)';
        if (subtitle) { subtitle.style.visibility = ''; subtitle.style.opacity = '0'; subtitle.style.transform = 'translateY(8px)'; }
        requestAnimationFrame(function() {
          requestAnimationFrame(function() {
            applyFade(h1, true);
            if (subtitle) applyFade(subtitle, true);
          });
        });
      }

      setTimeout(showQuote, SHOW);
    }, FADE + 50);
  }

  // First cycle after one full SHOW period
  setTimeout(showQuote, SHOW);
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
  // Activate guardian mode directly — no bio/form required
  window.pHomeToggleGuardian = function() {
    if (typeof pToggleGuardianMode === 'function') pToggleGuardianMode();
    setTimeout(function() {
      if (typeof _renderHomeStatusToggle === 'function') _renderHomeStatusToggle();
    }, 60);
  };

  // Suppress the setup modal everywhere — if called, just activate directly
  window.pShowGuardianSetupModal = function() {
    var isOn = safeLS('get', 'velo_is_guardian') === 'true';
    if (!isOn && typeof pToggleGuardianMode === 'function') pToggleGuardianMode();
    setTimeout(function() {
      if (typeof _renderHomeStatusToggle === 'function') _renderHomeStatusToggle();
    }, 60);
  };

  // Sync Home page toggles WITHOUT recreating DOM — same mechanism as Profile page
  window._renderHomeStatusToggle = function() {
    var el = document.getElementById('homeStatusToggle');
    if (!el) return;
    var st = safeLS('get', 'velo_user_status') || 'disponible';
    var isGuardian = safeLS('get', 'velo_is_guardian') === 'true';
    var isIncognito = safeLS('get', 'velo_incognito') === 'true';

    // Keep the Privacidad card (homeGuardianWrap) visible — never hide it
    var gWrap = document.getElementById('homeGuardianWrap');
    if (gWrap) gWrap.style.display = '';

    // Sync guardian toggle using classList (identical to Profile page, no DOM recreation)
    var togG = document.getElementById('homeGuardianModeTog');
    if (togG) { togG.classList.remove('on'); if (isGuardian) togG.classList.add('on'); }

    // Sync incógnito toggle using classList
    var togI = document.getElementById('homeIncognitoTog');
    if (togI) { togI.classList.remove('on'); if (isIncognito) togI.classList.add('on'); }

    // Disponible/Ocupado status pills — create once, update innerHTML in place
    var segEl = document.getElementById('homeStatusSegPill');
    if (!segEl) {
      segEl = document.createElement('div');
      segEl.id = 'homeStatusSegPill';
      el.insertBefore(segEl, gWrap || el.firstChild);
    }
    segEl.innerHTML = '<div class="r-status-combined-pill">'
      + '<button class="r-status-seg r-status-seg--disp' + (st === 'disponible' ? ' active' : '') + '" onclick="pSetUserStatus(\'disponible\')">Disponible</button>'
      + '<button class="r-status-seg r-status-seg--ocup' + (st === 'ocupado' ? ' active' : '') + '" onclick="pSetUserStatus(\'ocupado\')">Ocupado</button>'
      + '</div>';
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
  body.style.display = '';  // clear any inline display:none set by pSubmitHappyPost
  body.classList.add('happy-compose--open');
  if (typeof pOpenHappyPost === 'function') pOpenHappyPost(); // reset form state
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

// ── v192: "Mío" tab — expiry banner + mine card border + comment scroll ──
(function() {
  var _orig = window._renderMyHappy;
  if (typeof _orig !== 'function') return;
  window._renderMyHappy = function(list, posts, queue, myId) {
    _orig.call(this, list, posts, queue, myId);
    var mine = posts.filter(function(p) { return p.userId === myId; });
    var active = mine[0];
    if (!active) return;
    var card = list.querySelector('.happy-card[data-id="' + active.id + '"]');
    if (!card) return;
    // Green border to distinguish from feed cards
    card.classList.add('happy-mine-card');
    // Scrollable comment section on desktop
    var commSect = card.querySelector('div[style*="border-top"]');
    if (commSect) commSect.classList.add('happy-mine-comments');
    // Expiry warning banner
    if (typeof _happyTimeLeft === 'function') {
      var timeLeft = _happyTimeLeft(active.ts);
      if (timeLeft) {
        var banner = document.createElement('div');
        banner.className = 'happy-expiry-banner';
        banner.innerHTML = '🗑 Tu publicación se eliminará del muro en <strong>' + timeLeft
          + '</strong> &nbsp;·&nbsp; <span style="opacity:.78">El historial se conserva</span>';
        card.insertAdjacentElement('afterend', banner);
      }
    }
  };
})();

// ── v192: History tab — row layout + per-item Ver/Borrar ─────────
(function() {
  if (typeof window._renderHappyHistory !== 'function') return;
  window._renderHappyHistory = function(list) {
    var history = [];
    try { history = JSON.parse(safeLS('get','velo_happy_history') || '[]'); } catch(e) {}
    if (!history.length) {
      list.innerHTML = '<div class="p-empty" style="grid-column:1/-1"><span class="p-empty-emoji">📅</span>'
        + '<div class="p-empty-title">Tu historial está vacío</div>'
        + '<div class="p-empty-sub">Cuando publiques algo en el Muro, quedará guardado aquí para siempre 🌟</div></div>';
      return;
    }
    list.innerHTML = '<div class="hh-list">'
      + history.map(function(h, i) {
          var date = new Date(h.ts);
          var dateStr = date.toLocaleDateString('es', { day:'2-digit', month:'short', year:'numeric' });
          var relStr = typeof _happyRelTime === 'function' ? _happyRelTime(h.ts) : '';
          var text = (h.text || '');
          var preview = text.length > 55 ? text.slice(0, 55) + '…' : text;
          return '<div class="hh-row">'
            + '<div class="hh-left"><div class="hh-date">' + dateStr + '</div>'
            + (relStr ? '<div class="hh-rel">' + relStr + '</div>' : '')
            + '</div>'
            + '<div class="hh-mid"><span class="hh-emoji">' + (h.emoji || '☀️') + '</span>'
            + '<span class="hh-text">' + (typeof _escHtml === 'function' ? _escHtml(preview) : preview) + '</span></div>'
            + '<div class="hh-actions">'
            + '<button class="hh-btn hh-btn-view" onclick="pHappyHistView(' + i + ')">👁 Ver</button>'
            + '<button class="hh-btn hh-btn-del" onclick="pHappyHistDel(' + i + ')" title="Eliminar">🗑</button>'
            + '</div></div>';
        }).join('')
      + '</div>';
  };
})();

function pHappyHistView(idx) {
  var history = [];
  try { history = JSON.parse(safeLS('get','velo_happy_history') || '[]'); } catch(e) {}
  var h = history[idx];
  if (!h) return;
  var date = new Date(h.ts);
  var dateStr = date.toLocaleDateString('es', { day:'2-digit', month:'long', year:'numeric' });
  var rxHtml = '';
  if (h.reactions) {
    Object.keys(h.reactions).forEach(function(e) {
      if ((h.reactions[e] || 0) > 0)
        rxHtml += '<span style="font-size:13px;background:rgba(255,224,102,.2);border-radius:100px;padding:4px 10px;font-weight:600">' + e + ' ' + h.reactions[e] + '</span>';
    });
  }
  var existing = document.getElementById('happyHistOv');
  if (existing) existing.remove();
  var ov = document.createElement('div');
  ov.id = 'happyHistOv';
  ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);animation:p-fadeIn .2s ease';
  var esc = typeof _escHtml === 'function' ? _escHtml : function(s){ return s; };
  ov.innerHTML = '<div class="hh-modal">'
    + '<div class="hh-modal-hdr">'
    +   '<div><div style="font-size:10px;font-weight:800;color:var(--sage);letter-spacing:.8px;text-transform:uppercase;margin-bottom:2px">Historial</div>'
    +   '<div style="font-size:14px;font-weight:700;color:var(--ink)">' + dateStr + '</div></div>'
    +   '<button onclick="document.getElementById(\'happyHistOv\').remove()" style="background:rgba(0,0,0,.06);border:none;font-size:18px;cursor:pointer;color:var(--ink4);line-height:1;padding:6px 9px;border-radius:50%">✕</button>'
    + '</div>'
    + (h.photo ? '<img src="' + h.photo + '" style="width:100%;max-height:260px;object-fit:cover;border-radius:12px;margin-bottom:16px;display:block">' : '')
    + (h.text ? '<p style="font-size:15px;line-height:1.75;color:var(--ink);font-family:\'Cormorant Garamond\',serif;font-style:italic;margin:0 0 16px">"' + esc(h.text) + '"</p>' : '')
    + (rxHtml ? '<div style="display:flex;gap:6px;flex-wrap:wrap">' + rxHtml + '</div>' : '')
    + '</div>';
  ov.addEventListener('click', function(e) { if (e.target === ov) ov.remove(); });
  document.body.appendChild(ov);
}

function pHappyHistDel(idx) {
  if (!confirm('¿Eliminar esta entrada del historial? Esta acción no se puede deshacer.')) return;
  var history = [];
  try { history = JSON.parse(safeLS('get','velo_happy_history') || '[]'); } catch(e) {}
  history.splice(idx, 1);
  safeLS('set','velo_happy_history', JSON.stringify(history));
  if (typeof pRenderHappy === 'function') pRenderHappy();
  if (typeof pToast === 'function') pToast('🗑️', 'Entrada eliminada del historial');
}

/* ══════════════════════════════════════════════════════════════════════
   v324: Unified Chat Template — emoji picker, @mentions, anon avatar
   ══════════════════════════════════════════════════════════════════════ */
(function(){
  // ── 1. Override _buildMsgBubble for anonymous avatar + hint ───────
  var _origBubble = window._buildMsgBubble;
  if(typeof _origBubble === 'function'){
    window._buildMsgBubble = function(text, isUser, av, senderName, inputId, replyBarId, quoteText, reactions, sbId, senderId){
      if(!isUser){
        var isAnon = !senderName
          || senderName === 'Usuario Anónimo' || senderName === 'Anónimo'
          || senderName === 'Anónimo/a' || senderName === 'Usuario anónimo';
        if(isAnon){
          av = '💙';
          senderName = senderName || 'Usuario anónimo';
        }
      }
      var html = _origBubble(text, isUser, av, senderName, inputId, replyBarId, quoteText, reactions, sbId, senderId);
      // Inject anonymous CSS classes post-render via DOM after a tick
      return html;
    };
  }

  // ── 2. Emoji sets ─────────────────────────────────────────────────
  var EMOJIS = ['❤️','💙','💚','💛','🧡','💜','🖤','🤍','😊','😂','😍','🥰','😘','🤗',
    '😢','😅','😎','🥺','😴','🤔','😌','🤩','😤','😭','🥳','😇','🙏','✨','🌟','🌈',
    '🌸','🌺','🌻','🍀','🌿','💐','🎉','🎊','👏','🤝','💪','🤞','👍','❓','‼️',
    '💯','🔥','⭐','🌙','☀️','🌊','🦋','🕊️','🐾','💌','📖','🎵','🎶','🤍'];

  // ── 3. Emoji panel toggle ─────────────────────────────────────────
  window.vChatToggleEmoji = function(panelId, btnEl){
    var panel = document.getElementById(panelId);
    if(!panel) return;
    var open = panel.style.display === 'flex';
    panel.style.display = open ? 'none' : 'flex';
    if(btnEl) btnEl.classList.toggle('active', !open);
    if(!open && !panel.dataset.built){
      panel.dataset.built = '1';
      panel.innerHTML = EMOJIS.map(function(e){
        var inp = panel.dataset.input || '';
        return '<button type="button" onclick="vChatInsertEmoji('+JSON.stringify(e)+','+JSON.stringify(inp)+',this.closest(\'[id]\'))">'+ e +'</button>';
      }).join('');
    }
  };

  window.vChatInsertEmoji = function(emoji, inputId, panel){
    var ta = document.getElementById(inputId);
    if(!ta) return;
    var start = ta.selectionStart || ta.value.length;
    var end   = ta.selectionEnd   || start;
    ta.value = ta.value.slice(0,start) + emoji + ta.value.slice(end);
    ta.selectionStart = ta.selectionEnd = start + emoji.length;
    ta.focus();
    // Trigger auto-resize
    ta.dispatchEvent(new Event('input'));
  };

  // ── 4. @mention autocomplete ──────────────────────────────────────
  var _mentionDrop = null;
  var _mentionInput = null;
  var _mentionAt = -1;

  function _getMentionables(){
    var list = [];
    try{
      // Guardian chat peer
      if(typeof _gcPeer !== 'undefined' && _gcPeer && _gcPeer.name)
        list.push({ name: _gcPeer.name, av: _gcPeer.av || '🌿' });
      // DM peer
      if(typeof _dmPeer !== 'undefined' && _dmPeer && _dmPeer.name)
        list.push({ name: _dmPeer.name, av: _dmPeer.av || '🧑' });
      // Help chat post owner
      if(typeof _curHelpPost !== 'undefined' && _curHelpPost && _curHelpPost.name)
        list.push({ name: _curHelpPost.name, av: _curHelpPost.emoji || '💙' });
      // Self (for group chats)
      var myName = (typeof safeLS === 'function' ? safeLS('get','velo_user_name') : localStorage.getItem('velo_user_name')) || '';
      if(myName) list.push({ name: myName, av: (typeof safeLS === 'function' ? safeLS('get','velo_user_av') : '') || '🧑' });
    }catch(e){}
    return list;
  }

  function _buildMentionDrop(){
    if(!_mentionDrop){
      _mentionDrop = document.createElement('div');
      _mentionDrop.className = 'velo-mention-drop';
      _mentionDrop.id = 'velMentionDrop';
      document.body.appendChild(_mentionDrop);
    }
    return _mentionDrop;
  }

  function _hideMentionDrop(){ if(_mentionDrop) _mentionDrop.style.display='none'; _mentionAt=-1; }

  function _showMentionDrop(ta, query){
    var drop = _buildMentionDrop();
    var candidates = _getMentionables().filter(function(m){
      return !query || m.name.toLowerCase().startsWith(query.toLowerCase());
    });
    if(!candidates.length){ _hideMentionDrop(); return; }
    drop.innerHTML = candidates.slice(0,5).map(function(m){
      return '<div class="velo-mention-item" data-name="'+_escHtmlSafe(m.name)+'">'
        +'<span style="font-size:18px">'+m.av+'</span>'
        +'@'+_escHtmlSafe(m.name)
        +'</div>';
    }).join('');
    // Click handler
    drop.querySelectorAll('.velo-mention-item').forEach(function(item){
      item.addEventListener('mousedown', function(e){
        e.preventDefault();
        var name = item.dataset.name;
        var val  = ta.value;
        // Replace from @ position to current cursor
        var before = val.slice(0, _mentionAt);
        var after  = val.slice(ta.selectionStart || ta.value.length);
        ta.value = before + '@' + name + ' ' + after;
        ta.selectionStart = ta.selectionEnd = before.length + name.length + 2;
        ta.focus();
        _hideMentionDrop();
      });
    });
    // Position drop above textarea
    var rect = ta.getBoundingClientRect();
    drop.style.display = 'block';
    var dropH = drop.offsetHeight || 120;
    drop.style.left = Math.max(8, rect.left) + 'px';
    drop.style.top  = (rect.top - dropH - 6) + 'px';
    drop.style.minWidth = Math.min(200, rect.width) + 'px';
  }

  function _escHtmlSafe(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  // Attach @mention listener to a textarea
  function _attachMentionListener(ta){
    if(!ta || ta._mentionBound) return;
    ta._mentionBound = true;
    ta.addEventListener('input', function(){
      var val = ta.value;
      var cur = ta.selectionStart || val.length;
      // Find last @ before cursor on the same line
      var segment = val.slice(0, cur);
      var atIdx = segment.lastIndexOf('@');
      if(atIdx < 0){ _hideMentionDrop(); return; }
      var after = segment.slice(atIdx+1);
      if(after.indexOf(' ') >= 0 || after.indexOf('\n') >= 0){ _hideMentionDrop(); return; }
      _mentionAt   = atIdx;
      _mentionInput = ta;
      _showMentionDrop(ta, after);
    });
    ta.addEventListener('keydown', function(e){
      if(e.key === 'Escape'){ _hideMentionDrop(); }
    });
    ta.addEventListener('blur', function(){
      setTimeout(_hideMentionDrop, 200);
    });
  }

  // ── 5. Inject extras into chat rooms ─────────────────────────────
  function _injectChatExtras(){
    // Guardian chat: add emoji panel + button
    var gcInput = document.getElementById('gcInput');
    if(gcInput && !document.getElementById('gcEmojiPanel')){
      // Panel
      var gcPanel = document.createElement('div');
      gcPanel.id = 'gcEmojiPanel';
      gcPanel.className = 'velo-emoji-panel';
      gcPanel.dataset.input = 'gcInput';
      gcInput.closest('.feed-input-area').parentNode.insertBefore(gcPanel, gcInput.closest('.feed-input-area'));
      // Emoji button in input area
      var gcEmojiBtn = document.createElement('button');
      gcEmojiBtn.type = 'button';
      gcEmojiBtn.className = 'velo-emoji-btn';
      gcEmojiBtn.title = 'Emojis';
      gcEmojiBtn.textContent = '😊';
      gcEmojiBtn.setAttribute('onclick','vChatToggleEmoji(\'gcEmojiPanel\',this)');
      gcInput.closest('.feed-input-area').insertBefore(gcEmojiBtn, gcInput);
    }
    if(gcInput) _attachMentionListener(gcInput);

    // DM chat: add emoji panel + button
    var dmInput = document.getElementById('dmInput');
    if(dmInput && !document.getElementById('dmEmojiPanel')){
      var dmInputRow = dmInput.closest('.feed-input-row') || dmInput.parentElement;
      var dmPanel = document.createElement('div');
      dmPanel.id = 'dmEmojiPanel';
      dmPanel.className = 'velo-emoji-panel';
      dmPanel.dataset.input = 'dmInput';
      dmInputRow.parentNode.insertBefore(dmPanel, dmInputRow);
      var dmEmojiBtn = document.createElement('button');
      dmEmojiBtn.type = 'button';
      dmEmojiBtn.className = 'velo-emoji-btn';
      dmEmojiBtn.title = 'Emojis';
      dmEmojiBtn.textContent = '😊';
      dmEmojiBtn.setAttribute('onclick','vChatToggleEmoji(\'dmEmojiPanel\',this)');
      dmInputRow.insertBefore(dmEmojiBtn, dmInput);
    }
    if(dmInput) _attachMentionListener(dmInput);

    // Help chat: attach @mention
    var hcInput = document.getElementById('helpChatInput');
    if(hcInput) _attachMentionListener(hcInput);

    // Feed/circles: attach @mention (emoji button already exists)
    var feedInput = document.getElementById('feedInput');
    if(feedInput) _attachMentionListener(feedInput);
  }

  // Run on DOMContentLoaded and also when navigating to chat pages
  document.addEventListener('DOMContentLoaded', function(){
    setTimeout(_injectChatExtras, 500);
  });

  // Also hook into pGoTo to inject when entering a chat page
  var _origPGoTo = window.pGoTo;
  if(typeof _origPGoTo === 'function'){
    window.pGoTo = function(page){
      _origPGoTo.apply(this, arguments);
      if(['guardian-chat','dm-chat','help-chat','feed'].indexOf(page) >= 0){
        setTimeout(_injectChatExtras, 300);
      }
    };
  }
})();
