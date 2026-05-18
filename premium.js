// ═══════════════════════════════════════════════════════════
//  VELO PREMIUM — App Logic
//  premium.js
// ═══════════════════════════════════════════════════════════

// ── GLOBAL ERROR HANDLER ────────────────────────────────────
(function(){
  window.addEventListener('error', function(e){
    console.error('[Velo Premium]', e.message, e.filename, e.lineno);
  });
  window.addEventListener('unhandledrejection', function(e){
    console.error('[Velo Premium] Promise:', e.reason);
  });
})();

// ── SUPABASE CONFIG ─────────────────────────────────────────
var SUPABASE_URL  = 'https://yuravtnjvvztsxdtggod.supabase.co';
var SUPABASE_ANON = 'sb_publishable_mBoqW2t3QoJvp5jFecEGgQ_1wrPiT9C';
var STRIPE_PK     = 'pk_live_51TXmCcV05dCjGGP2F9YnbPBIantFoxurCpISx86i0DFNFcmM2sovtp5LcV5tOVxI72V4AfgY8sK5GtJVTyYnnI1L00QwkGS6P4';
var PAYPAL_EMAIL  = 'wearevelo.app%40gmail.com';
var VELO_EMAIL    = 'contacto@velo.app';
var SUPABASE_FN   = SUPABASE_URL + '/functions/v1/stripe-checkout';

var _supabaseLib = (typeof window !== 'undefined') ? window.supabase : null;
var sbClient = null;

function _initSupabase(){
  if(sbClient) return;
  if(!_supabaseLib || !_supabaseLib.createClient){
    _supabaseLib = (typeof window !== 'undefined') ? window.supabase : null;
  }
  if(_supabaseLib && _supabaseLib.createClient){
    sbClient = _supabaseLib.createClient(SUPABASE_URL, SUPABASE_ANON);
  }
}

// ── LOCAL STORAGE WRAPPER ───────────────────────────────────
function safeLS(action, key, val){
  try{
    if(action==='get') return localStorage.getItem(key);
    if(action==='set') localStorage.setItem(key, val);
    if(action==='del') localStorage.removeItem(key);
  }catch(e){ return null; }
}

// ── TOAST ───────────────────────────────────────────────────
var _toastTimer = null;
function pToast(emoji, msg){
  var el = document.getElementById('pToast');
  var em = document.getElementById('pToastEmoji');
  var tx = document.getElementById('pToastMsg');
  if(!el) return;
  if(em) em.textContent = emoji || '✓';
  if(tx) tx.textContent = msg || '';
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function(){ el.classList.remove('show'); }, 2800);
}
// Alias for compatibility
var toast = pToast;

// ── NAVIGATION STATE ─────────────────────────────────────────
var _curPage    = 'landing';
var _prevPage   = 'landing';
var _authenticated = false;
var _userType   = 'user'; // 'user' | 'pro' | 'admin'

var P_NO_NAV = ['landing','login','register','register-type','onboarding',
                'pro-reg','pro-onboarding','admin-login','pro-pending'];
var P_DARK   = ['help','bottle','respira','vela'];
var P_FADE   = ['landing','onboarding','register-type','donation-exit',
                'post-chat','pro-pending','admin-login'];

// ── NAVIGATE ─────────────────────────────────────────────────
function pGoTo(id){
  if(!id) return;
  var inPage = document.getElementById('pg-'+id);
  if(!inPage){ console.warn('[Premium] page not found: pg-'+id); return; }

  // Deactivate current
  var outPage = document.getElementById('pg-'+_curPage);
  if(outPage){ outPage.classList.remove('active','fade-in'); }

  if(_curPage !== id) _prevPage = _curPage;
  _curPage = id;

  // Activate new page
  inPage.classList.add('active');
  if(P_FADE.indexOf(id) >= 0) inPage.classList.add('fade-in');

  // Scroll to top
  var scroll = inPage.querySelector('.p-page-scroll');
  if(scroll) scroll.scrollTop = 0;

  // Update nav active states
  var showNav = P_NO_NAV.indexOf(id) < 0 && _authenticated;
  _updateNavState(id, showNav);

  // Per-page init
  _onPageEnter(id);
}

function _updateNavState(id, showNav){
  // Sidebar
  var sidebar = document.getElementById('pSidebar');
  var topbar  = document.getElementById('pTopbar');
  var bottomnav = document.getElementById('pBottomnav');

  if(sidebar) sidebar.style.display = showNav ? '' : 'none';
  if(topbar)  topbar.style.display  = showNav ? '' : 'none';
  if(bottomnav) bottomnav.style.display = showNav ? '' : 'none';

  // Sidebar items
  document.querySelectorAll('.p-sn-item').forEach(function(item){
    item.classList.toggle('active', item.dataset.screen === id);
  });
  // Bottom nav items
  document.querySelectorAll('.p-bn-item').forEach(function(item){
    item.classList.toggle('active', item.dataset.screen === id);
  });
}

function goBack(){
  if(_prevPage) pGoTo(_prevPage);
}

// ── MOBILE MENU ──────────────────────────────────────────────
function toggleMobileMenu(){
  var menu = document.getElementById('pMobileMenu');
  if(!menu) return;
  if(menu.classList.contains('open')){
    menu.classList.remove('open');
  } else {
    menu.classList.add('open');
  }
}

// ── MODAL HELPERS ─────────────────────────────────────────────
function openModal(id){
  var el = document.getElementById(id);
  if(el) el.classList.add('show');
}
function closeModal(id){
  var el = document.getElementById(id);
  if(el) el.classList.remove('show');
}

// ── SUPABASE AUTH ─────────────────────────────────────────────
function _getSbPass(){
  var p = safeLS('get','velo_sb_pass');
  if(!p){
    p = 'velo_' + Date.now() + '_' + Math.random().toString(36).slice(2,10) + Math.random().toString(36).slice(2,10);
    safeLS('set','velo_sb_pass', p);
  }
  return p;
}

async function _ensureSbSession(){
  if(!sbClient) return false;
  try{
    var {data:sd} = await sbClient.auth.getSession();
    if(sd && sd.session) return true;
    var email = safeLS('get','velo_user_email');
    var pass  = safeLS('get','velo_sb_pass');
    if(!email || !pass) return false;
    var {error} = await sbClient.auth.signInWithPassword({email:email, password:pass});
    return !error;
  }catch(e){ return false; }
}

async function pSignUp(){
  var nameEl  = document.getElementById('regName');
  var emailEl = document.getElementById('regEmail');
  var passEl  = document.getElementById('regPass');
  var btn     = document.getElementById('regBtn');
  var btnTxt  = document.getElementById('regBtnTxt');
  if(!nameEl||!emailEl||!passEl) return;

  var name  = nameEl.value.trim();
  var email = emailEl.value.trim();
  var pass  = passEl.value;

  // Validate
  var ok = true;
  _clearFieldErr('regNameErr'); _clearFieldErr('regEmailErr'); _clearFieldErr('regPassErr');
  if(!name){ _showFieldErr('regNameErr'); ok=false; }
  if(!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ _showFieldErr('regEmailErr'); ok=false; }
  if(!pass || pass.length < 6){ _showFieldErr('regPassErr'); ok=false; }
  if(!ok) return;

  if(btn) btn.disabled = true;
  if(btnTxt) btnTxt.textContent = 'Creando cuenta…';

  try{
    _initSupabase();
    var result;
    if(sbClient){
      result = await sbClient.auth.signUp({ email:email, password:pass, options:{data:{nombre:name, role:'user'}} });
      if(!result.error && result.data && result.data.user){
        await sbClient.from('profiles').upsert({
          id: result.data.user.id, nombre: name, email: email,
          role: 'user', created_at: new Date().toISOString()
        });
      }
    } else {
      result = { error: null };
    }
    if(result.error){
      pToast('⚠️', result.error.message || 'Error al registrar');
    } else {
      safeLS('set','velo_user_email', email);
      safeLS('set','velo_sb_pass', pass);
      safeLS('set','velo_user_name', name);
      safeLS('set','velo_user_type','user');
      safeLS('set','velo_session','1');
      _authenticated = true;
      _recordTC(name, email);
      pToast('🎉','¡Bienvenido/a '+name+'! 🌿');
      _loginAndGo();
    }
  }catch(e){
    pToast('⚠️','Error de conexión');
  } finally {
    if(btn) btn.disabled = false;
    if(btnTxt) btnTxt.textContent = 'Crear mi cuenta ✨';
  }
}

async function pSignIn(){
  var emailEl = document.getElementById('loginEmail');
  var passEl  = document.getElementById('loginPass');
  var btn     = document.getElementById('loginBtn');
  var btnTxt  = document.getElementById('loginBtnTxt');
  if(!emailEl||!passEl) return;

  var email = emailEl.value.trim();
  var pass  = passEl.value;

  _clearFieldErr('loginEmailErr'); _clearFieldErr('loginPassErr');
  var ok = true;
  if(!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ _showFieldErr('loginEmailErr'); ok=false; }
  if(!pass){ _showFieldErr('loginPassErr'); ok=false; }
  if(!ok) return;

  if(btn) btn.disabled = true;
  if(btnTxt) btnTxt.textContent = 'Ingresando…';

  try{
    _initSupabase();
    var result;
    if(sbClient){
      result = await sbClient.auth.signInWithPassword({email:email, password:pass});
    } else {
      result = { error: null, data: { user: { email: email } } };
    }
    if(result.error){
      pToast('⚠️', result.error.message || 'Credenciales incorrectas');
    } else {
      safeLS('set','velo_user_email', email);
      safeLS('set','velo_sb_pass', pass);
      var storedName = safeLS('get','velo_user_name') || email.split('@')[0];
      safeLS('set','velo_user_name', storedName);
      safeLS('set','velo_session','1');
      _authenticated = true;
      pToast('💚','¡Bienvenido/a de vuelta! 🌿');
      _loginAndGo();
    }
  }catch(e){
    pToast('⚠️','Error de conexión');
  } finally {
    if(btn) btn.disabled = false;
    if(btnTxt) btnTxt.textContent = 'Ingresar';
  }
}

async function pSignOut(){
  if(sbClient){ try{ await sbClient.auth.signOut(); }catch(e){} }
  safeLS('del','velo_session');
  _authenticated = false;
  _userType = 'user';
  pToast('🌿','Sesión cerrada');
  pGoTo('landing');
  _updateNavState('landing', false);
}

function pShowForgot(){
  var email = document.getElementById('loginEmail');
  var val = email ? email.value.trim() : '';
  if(!val || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val)){
    pToast('📧','Ingresá tu correo primero');
    return;
  }
  if(sbClient){ sbClient.auth.resetPasswordForEmail(val, {redirectTo: window.location.origin+'/app-premium.html'}); }
  pToast('📧','Revisá tu correo para restablecer la contraseña');
}

function _loginAndGo(){
  var type = safeLS('get','velo_user_type') || 'user';
  _userType = type;
  if(type === 'admin'){
    pGoTo('admin');
  } else if(type === 'pro'){
    var approved = safeLS('get','velo_pro_approved');
    pGoTo(approved ? 'pro-panel' : 'pro-pending');
  } else {
    pGoTo('home');
    setTimeout(function(){
      _loadHomeData();
      _updateSidebarUser();
    }, 100);
  }
}

function pSetType(type){
  safeLS('set','velo_user_type', type);
  pGoTo('onboarding');
  _initOnboarding();
}

// ── FORM VALIDATION HELPERS ────────────────────────────────
function _showFieldErr(id){
  var el = document.getElementById(id);
  if(el){ el.classList.add('show'); var inp = el.previousElementSibling; if(inp) inp.classList.add('error'); }
}
function _clearFieldErr(id){
  var el = document.getElementById(id);
  if(el){ el.classList.remove('show'); var inp = el.previousElementSibling; if(inp) inp.classList.remove('error'); }
}

// ── TC RECORD ─────────────────────────────────────────────────
function _recordTC(name, email){
  var recs = []; try{ recs = JSON.parse(safeLS('get','velo_tc_records')||'[]'); }catch(e){}
  recs.unshift({ name:name, email:email, timestamp: new Date().toISOString() });
  safeLS('set','velo_tc_records', JSON.stringify(recs.slice(0,500)));
}

// ── ONBOARDING ─────────────────────────────────────────────────
var _obStep = 0;
var _obData = [
  { emoji:'🌱', title:'Bienvenido/a a Velo', sub:'Tu espacio seguro de apoyo emocional. Aquí nadie te juzga.' },
  { emoji:'🛡️', title:'Guardianes a tu lado', sub:'Personas entrenadas para escuchar y acompañar, disponibles 24/7.' },
  { emoji:'💚', title:'Comenzá tu camino', sub:'Diario, ánimo, calma y comunidad. Todo para tu bienestar.' }
];
function _initOnboarding(){ _obStep = 0; _renderOb(); }
function _renderOb(){
  var d = _obData[_obStep];
  if(!d) return;
  var em = document.getElementById('obEmoji');
  var ti = document.getElementById('obTitle');
  var su = document.getElementById('obSub');
  if(em) em.textContent = d.emoji;
  if(ti) ti.textContent = d.title;
  if(su) su.textContent = d.sub;
  var dots = document.querySelectorAll('#obDots .ob-dot');
  dots.forEach(function(dot, i){ dot.classList.toggle('active', i === _obStep); });
  var skip = document.getElementById('obSkip');
  var next = document.getElementById('obNext');
  if(_obStep === _obData.length - 1){
    if(next) next.textContent = 'Comenzar ✨';
    if(skip) skip.style.display = 'none';
  } else {
    if(next) next.textContent = 'Siguiente →';
    if(skip) skip.style.display = '';
  }
}
function pNextOnboarding(){
  if(_obStep < _obData.length - 1){ _obStep++; _renderOb(); }
  else { pFinishOnboarding(); }
}
function pFinishOnboarding(){
  _authenticated = true;
  safeLS('set','velo_session','1');
  pGoTo('home');
  setTimeout(function(){ _loadHomeData(); _updateSidebarUser(); }, 100);
}

// ── HOME DATA ──────────────────────────────────────────────────
function _loadHomeData(){
  var d = new Date();
  var h = d.getHours();
  var greet = h < 12 ? 'Buenos días 🌿' : h < 18 ? 'Buenas tardes 🌤️' : 'Buenas noches 🌙';
  var months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  var dateStr = d.getDate() + ' de ' + months[d.getMonth()];

  var gt = document.getElementById('homeGreetTxt');
  var dt = document.getElementById('homeDateTxt');
  if(gt) gt.textContent = greet;
  if(dt) dt.textContent = dateStr;

  var name = safeLS('get','velo_user_name') || 'Hola';
  var av = safeLS('get','velo_user_av') || '🧑';
  var un = document.getElementById('homeUserName');
  var ha = document.getElementById('homeAv');
  if(un) un.textContent = name;
  if(ha) ha.textContent = av;

  // Today's mood
  _loadTodayMoodHome();
  _updateSidebarUser();
}

function _loadTodayMoodHome(){
  var today = _dateKey();
  var stored = safeLS('get','velo_mood_'+today);
  var emoji = '🌤️';
  if(stored){ try{ var m = JSON.parse(stored); if(m.emoji) emoji = m.emoji; }catch(e){} }
  var me = document.getElementById('homeMoodEmoji');
  if(me) me.textContent = emoji;
}

function _updateSidebarUser(){
  var name = safeLS('get','velo_user_name') || 'Usuario';
  var av   = safeLS('get','velo_user_av') || '🧑';
  var plan = _isPremium() ? '⭐ Velo Plus' : 'Plan Gratuito';
  var sn = document.getElementById('sidebarUserName');
  var sa = document.getElementById('sidebarUserAv');
  var sp = document.getElementById('sidebarUserPlan');
  if(sn) sn.textContent = name;
  if(sa) sa.textContent = av;
  if(sp){ sp.textContent = plan; sp.className = 'p-user-plan' + (_isPremium() ? ' premium' : ''); }
}

function _isPremium(){
  var subs = []; try{ subs = JSON.parse(safeLS('get','velo_subscribers')||'[]'); }catch(e){}
  var email = safeLS('get','velo_user_email');
  return subs.some(function(s){ return s.email === email && s.status === 'active'; });
}

// ── DATE HELPERS ──────────────────────────────────────────────
function _dateKey(d){
  d = d || new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function _fmtDate(ts){
  var d = new Date(ts);
  var months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return d.getDate()+' '+months[d.getMonth()]+' '+d.getFullYear()+' · '+d.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'});
}

// ── GUARDIAN DATA ─────────────────────────────────────────────
var _proProfiles = [
  { id:'g1', name:'Ana Luz', av:'🌸', bio:'Paso por ansiedad y encontré el camino. Aquí para escucharte.', status:'on', recommend:142, sessions:89, rating:4.9, tags:['ansiedad','estrés','duelo'], review:{ txt:'Ana me ayudó a encontrar calma cuando más lo necesitaba.', auth:'Lucía M.' }, mood:'Disponible ahora' },
  { id:'g2', name:'Carlos R.', av:'🌊', bio:'Ex-terapeuta en proceso de recovery. Empatía y presencia.', status:'on', recommend:98, sessions:63, rating:4.8, tags:['depresión','soledad','cambios'], review:{ txt:'Con Carlos pude hablar de cosas que nunca había dicho en voz alta.', auth:'Martín P.' }, mood:'Tranquilo hoy' },
  { id:'g3', name:'Valentina S.', av:'🦋', bio:'Trabajo con familias y duelo. Cada historia merece ser escuchada.', status:'busy', recommend:215, sessions:134, rating:5.0, tags:['familia','pérdida','crianza'], review:{ txt:'Valentina tiene una capacidad enorme para sostener el dolor ajeno.', auth:'Ana G.' }, mood:'En sesión' },
  { id:'g4', name:'Tomás L.', av:'🌿', bio:'Meditación y mindfulness. Presente en cada momento.', status:'on', recommend:76, sessions:45, rating:4.7, tags:['mindfulness','burnout','trabajo'], review:{ txt:'Tomás me enseñó a respirar antes de reaccionar.', auth:'Diego F.' }, mood:'Abierto a charlar' },
  { id:'g5', name:'Sofía N.', av:'🌙', bio:'Noches difíciles, acompañadas. Especialmente disponible de noche.', status:'on', recommend:189, sessions:112, rating:4.9, tags:['insomnio','angustia','noche'], review:{ txt:'Encontrar a alguien disponible a las 3am fue un regalo.', auth:'Renata V.' }, mood:'Disponible de noche' },
  { id:'g6', name:'Emilio T.', av:'🏔️', bio:'Situaciones de crisis, trauma y resiliencia. Paso a paso.', status:'off', recommend:54, sessions:38, rating:4.6, tags:['trauma','crisis','resiliencia'], review:{ txt:'Emilio me ayudó a entender que lo que sentía era válido.', auth:'Camila H.' }, mood:'Descansando' }
];

var _curGuardian = null;
var _guardianFilter = 'all';

function pFilterGuardians(filter, btn){
  _guardianFilter = filter;
  document.querySelectorAll('.p-filter-chip').forEach(function(c){ c.classList.remove('active'); });
  if(btn) btn.classList.add('active');
  pRenderGuardians();
}

function pRenderGuardians(){
  var list = document.getElementById('guardianList');
  if(!list) return;
  var data = _proProfiles.filter(function(g){
    if(_guardianFilter === 'on') return g.status === 'on';
    if(_guardianFilter === 'busy') return g.status === 'busy';
    return true;
  });
  if(!data.length){
    list.innerHTML = '<div class="p-empty"><span class="p-empty-emoji">🔍</span><div class="p-empty-title">Sin resultados</div><div class="p-empty-sub">Probá otro filtro</div></div>';
    return;
  }
  list.innerHTML = data.map(function(g, i){
    var stClass = g.status === 'on' ? 'st-on' : g.status === 'busy' ? 'st-busy' : 'st-off';
    var stBg = g.status === 'on' ? 'rgba(58,158,96,.12)' : g.status === 'busy' ? 'rgba(212,128,32,.12)' : 'rgba(144,152,160,.1)';
    return '<div class="p-guardian-card" style="animation-delay:'+i*.06+'s" onclick="pOpenGuardian(\''+g.id+'\')">'
      +'<div class="gc-row">'
      +'<div class="gc-av" style="background:'+stBg+'">'
      +g.av
      +'<div class="gc-st-ring '+stClass+'"></div>'
      +'</div>'
      +'<div style="flex:1;min-width:0">'
      +'<div class="gc-name">'+g.name+'</div>'
      +'<div style="font-size:11px;color:var(--ink4)">'+g.mood+'</div>'
      +'</div>'
      +'<div style="text-align:right;flex-shrink:0">'
      +'<div style="font-size:11px;font-weight:700;color:var(--sage2);margin-bottom:3px">⭐ '+g.rating+'</div>'
      +'<div style="font-size:10px;color:var(--ink5)">'+g.recommend+' recomend.</div>'
      +'</div>'
      +'</div>'
      +'<div class="gc-review-box">'
      +'<span class="gc-rv-txt">"'+g.review.txt+'"</span>'
      +'<span class="gc-rv-auth">— '+g.review.auth+'</span>'
      +'</div>'
      +'<div class="gc-tags">'+g.tags.map(function(t){ return '<span class="p-tag">'+t+'</span>'; }).join('')+'</div>'
      +'<div class="gc-actions">'
      +'<button class="gc-btn-ask" onclick="event.stopPropagation();pOpenGuardian(\''+g.id+'\')">💬 Conectar</button>'
      +'<button class="gc-btn-view" onclick="event.stopPropagation();pOpenGuardian(\''+g.id+'\')">Ver perfil</button>'
      +'</div>'
      +'</div>';
  }).join('');
}

function pOpenGuardian(id){
  _curGuardian = _proProfiles.find(function(g){ return g.id === id; });
  if(!_curGuardian) return;
  var g = _curGuardian;
  _setEl('gdName', g.name);
  _setEl('gdNameBig', g.name);
  _setEl('gdAv', g.av);
  _setEl('gdBio', '"'+g.bio+'"');
  _setEl('gdDesc', g.bio);
  _setEl('gdRecommend', g.recommend);
  _setEl('gdSessions', g.sessions);
  _setEl('gdRating', g.rating);
  var stPill = document.getElementById('gdStatusPill');
  if(stPill){
    if(g.status === 'on'){
      stPill.innerHTML = '<span class="p-pill p-pill--live"><span class="p-ldot p-ldot--on"></span> Disponible</span>';
    } else if(g.status === 'busy'){
      stPill.innerHTML = '<span class="p-pill" style="background:rgba(212,128,32,.1);color:var(--st-busy);border:1px solid rgba(212,128,32,.2)">⏳ En sesión</span>';
    } else {
      stPill.innerHTML = '<span class="p-pill" style="background:rgba(144,152,160,.1);color:var(--st-off)">● Descansando</span>';
    }
  }
  var tagsEl = document.getElementById('gdMoodTags');
  if(tagsEl) tagsEl.innerHTML = g.tags.map(function(t){ return '<span class="p-tag">'+t+'</span>'; }).join('');
  var rvEl = document.getElementById('gdReviews');
  if(rvEl) rvEl.innerHTML = '<div class="p-review-card"><div class="p-row" style="margin-bottom:8px"><span style="font-size:14px">⭐⭐⭐⭐⭐</span></div><p class="p-rv-txt">"'+g.review.txt+'"</p><div style="font-size:11px;color:var(--ink5)">— '+g.review.auth+'</div></div>';
  pGoTo('guardian-detail');
}

function pAskGuardian(){
  if(!_curGuardian) return;
  if(_curGuardian.status === 'off'){ pToast('😴',_curGuardian.name+' está descansando ahora'); return; }
  pToast('💬','Conectando con '+_curGuardian.name+'… 🌿');
  setTimeout(function(){
    pGoTo('help');
  }, 1200);
}

// ── PROFESSIONALS ──────────────────────────────────────────────
var _proData = [
  { id:'p1', name:'Lic. Ana García', av:'👩‍⚕️', spec:'Psicología Clínica', rate:50, currency:'USD', rating:4.9, sessions:134, bio:'Especializada en ansiedad, depresión y relaciones. 8 años de experiencia.', tags:['ansiedad','depresión','pareja'] },
  { id:'p2', name:'Dr. Carlos Méndez', av:'👨‍⚕️', spec:'Psiquiatría', rate:65, currency:'USD', rating:4.8, sessions:89, bio:'Psiquiatra con enfoque integral. Medicación y psicoterapia combinada.', tags:['psiquiatría','TDAH','trastornos del sueño'] },
  { id:'p3', name:'Lic. Lucía Torres', av:'🌺', spec:'Terapia Gestalt', rate:35, currency:'USD', rating:5.0, sessions:201, bio:'Acompaño procesos de autoconocimiento y crecimiento personal.', tags:['autoestima','identidad','creatividad'] },
  { id:'p4', name:'Mg. Sofía Ramos', av:'🌙', spec:'Psicología Infantil', rate:30, currency:'USD', rating:4.9, sessions:156, bio:'Trabajo con niños, adolescentes y familias. Crianza con apego.', tags:['niños','adolescentes','familia'] }
];

function pRenderProfessionals(){
  var list = document.getElementById('proList');
  if(!list) return;
  list.innerHTML = _proData.map(function(p){
    return '<div class="p-pro-card" onclick="pOpenProSession(\''+p.id+'\')"><div style="display:flex;align-items:flex-start;gap:14px"><div style="font-size:44px;flex-shrink:0">'+p.av+'</div><div style="flex:1;min-width:0"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px"><span style="font-size:15px;font-weight:700;color:var(--ink)">'+p.name+'</span><span class="pro-rate">$'+p.rate+' <span style="font-size:13px;color:var(--ink4)">'+p.currency+'</span></span></div><div style="font-size:12px;color:var(--sage3);font-weight:600;margin-bottom:6px">'+p.spec+'</div><p style="font-size:12px;color:var(--ink4);line-height:1.5;margin-bottom:10px">'+p.bio+'</p><div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px">'+p.tags.map(function(t){ return '<span class="p-tag">'+t+'</span>'; }).join('')+'</div><div style="display:flex;align-items:center;justify-content:space-between"><span style="font-size:12px;color:var(--ink4)">⭐ '+p.rating+' · '+p.sessions+' sesiones</span><button class="p-btn p-btn--primary p-btn--sm" onclick="event.stopPropagation();pOpenProSession(\''+p.id+'\')">Reservar sesión</button></div></div></div></div>';
  }).join('');
}

var _curPro = null;
function pOpenProSession(id){
  _curPro = _proData.find(function(p){ return p.id === id; });
  if(!_curPro) return;
  var p = _curPro;
  _setEl('pSessionTitle', 'Sesión con '+p.name);
  var content = document.getElementById('pSessionContent');
  if(content){
    content.innerHTML = '<div class="p-card" style="padding:22px;margin-bottom:14px"><div style="display:flex;align-items:center;gap:14px;margin-bottom:16px"><div style="font-size:52px">'+p.av+'</div><div><div style="font-size:18px;font-weight:700;color:var(--ink)">'+p.name+'</div><div style="font-size:13px;color:var(--sage3);font-weight:600">'+p.spec+'</div><div style="font-size:13px;color:var(--ink4);margin-top:2px">⭐ '+p.rating+' · '+p.sessions+' sesiones</div></div></div><p style="font-size:13px;color:var(--ink3);line-height:1.6;margin-bottom:18px">'+p.bio+'</p><div class="p-divider-line"></div><div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0"><span style="font-size:14px;color:var(--ink3)">Precio por sesión</span><span style="font-family:\'Cormorant Garamond\',serif;font-size:28px;font-weight:700;color:var(--sage)">$'+p.rate+' '+p.currency+'</span></div><div class="p-divider-line"></div><div style="font-size:12px;color:var(--ink4);margin:12px 0">🔒 Pago seguro · Cancela hasta 24h antes · Videollamada privada</div><button class="p-btn p-btn--primary p-btn--xl p-btn--full" onclick="pStripeCheckout(\''+p.id+'\')">Reservar con Stripe 💳</button><div style="height:8px"></div><button class="p-btn p-btn--secondary p-btn--md p-btn--full" onclick="pGoTo(\'professionals\')">Volver</button></div>';
  }
  pGoTo('pro-session');
}

function pStripeCheckout(proId){
  var p = _proData.find(function(x){ return x.id === proId; });
  if(!p) return;
  pToast('💳','Preparando pago seguro…');
  var stripeAmount = Math.round(p.rate * 100);
  var proName = p.name;
  var proSpec = p.spec;
  safeLS('set','velo_stripe_pending', JSON.stringify({ proId:proId, name:proName, amount:p.rate, ts:Date.now() }));
  if(typeof Stripe !== 'undefined'){
    try{
      var stripe = Stripe(STRIPE_PK);
      fetch(SUPABASE_FN, {
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+SUPABASE_ANON},
        body:JSON.stringify({ amount:stripeAmount, currency:'usd', description:'Sesión con '+proName+' — '+proSpec, email: safeLS('get','velo_user_email')||'' })
      }).then(function(r){ return r.json(); }).then(function(data){
        if(data && data.sessionId){ stripe.redirectToCheckout({sessionId:data.sessionId}); }
        else { pToast('⚠️','Error al crear la sesión de pago'); }
      }).catch(function(){ pToast('⚠️','Error de conexión con el servidor de pagos'); });
    }catch(e){ pToast('⚠️','Error al iniciar Stripe: '+e.message); }
  } else {
    pToast('💳','Stripe no disponible — demo mode');
    setTimeout(function(){ pGoTo('post-chat'); }, 1500);
  }
}

// ── HELP ROOM ─────────────────────────────────────────────────
var _helpMockData = [
  { emoji:'😰', name:'Usuario Anónimo', time:'hace 2 min', preview:'No puedo dormir y no sé por qué me siento tan vacío/a…', urgent:false },
  { emoji:'😢', name:'Usuario Anónimo', time:'hace 5 min', preview:'Tuve una pelea muy fuerte hoy y me siento muy solo/a…', urgent:false },
  { emoji:'😔', name:'Usuario Anónimo', time:'hace 8 min', preview:'Llevo semanas sin poder levantarme de la cama.', urgent:false },
  { emoji:'😞', name:'Usuario Anónimo', time:'hace 15 min', preview:'No sé si lo que me pasa es normal pero me pesa mucho.', urgent:false }
];

function pRenderHelp(){
  var list = document.getElementById('helpList');
  if(!list) return;
  var count = document.getElementById('helpActiveCount');
  if(count) count.textContent = _helpMockData.length+' activos';
  list.innerHTML = _helpMockData.map(function(h, i){
    return '<div class="dark-seeker" style="animation-delay:'+i*.08+'s"><div style="display:flex;align-items:center;gap:11px"><div style="font-size:28px;flex-shrink:0">'+h.emoji+'</div><div style="flex:1;min-width:0"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px"><span style="font-size:12px;font-weight:600;color:rgba(255,255,255,.75)">'+h.name+'</span><span style="font-size:10px;color:rgba(255,255,255,.3)">'+h.time+'</span></div><div style="font-size:12px;color:rgba(255,255,255,.5);line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+h.preview+'</div></div><div style="width:7px;height:7px;border-radius:50%;background:var(--st-on);flex-shrink:0;box-shadow:0 0 4px var(--st-on)"></div></div></div>';
  }).join('');
}

function pOpenHelpForm(){ openModal('helpFormOv'); }

function pSendHelp(){
  var ta = document.getElementById('helpMsgTa');
  if(!ta || !ta.value.trim()){ pToast('✍️','Escribí tu mensaje antes de enviar'); return; }
  var msg = ta.value.trim();
  ta.value = '';
  closeModal('helpFormOv');
  pToast('💌','Mensaje enviado. Un guardián/a responderá pronto 💚');
  var ts = Date.now();
  var id = 'help-'+ts;
  var msgs = []; try{ msgs = JSON.parse(safeLS('get','velo_inbox')||'[]'); }catch(e){}
  msgs.unshift({ id:id, tipo:'sistema', icon:'💚', remitente:'Sala de Ayuda', asunto:'Recibimos tu mensaje', cuerpo:'Tu mensaje fue recibido y un guardián/a estará con vos pronto.\n\n"'+msg+'"', extracto:'Un guardián/a responderá pronto.', leido:false, prioritario:false, fecha:new Date().toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'}) });
  safeLS('set','velo_inbox', JSON.stringify(msgs.slice(0,100)));
  safeLS('set','velo_sos_clicks', String(parseInt(safeLS('get','velo_sos_clicks')||'0',10)+1));
}

function pOpenSOS(){ openModal('sosOv'); _renderSOSResources(); }

function _renderSOSResources(){
  var el = document.getElementById('sosResources');
  if(!el) return;
  el.innerHTML = [
    { country:'🌍 Internacional', line:'Befrienders Worldwide', url:'https://www.befrienders.org' },
    { country:'🇦🇷 Argentina', line:'Centro de Asistencia al Suicida: 135', url:'tel:135' },
    { country:'🇲🇽 México', line:'SAPTEL: 55 5259-8121', url:'tel:5552598121' },
    { country:'🇪🇸 España', line:'Teléfono de la Esperanza: 717 003 717', url:'tel:717003717' },
    { country:'🇺🇸 Todos los países', line:'Crisis Text Line: texto HOME a 741741', url:'sms:741741' }
  ].map(function(r){
    return '<a href="'+r.url+'" style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:rgba(192,48,40,.08);border:1px solid rgba(192,48,40,.18);border-radius:14px;margin-bottom:8px;text-decoration:none"><div><div style="font-size:11px;font-weight:700;color:rgba(255,255,255,.55);margin-bottom:2px">'+r.country+'</div><div style="font-size:13px;color:rgba(255,255,255,.85);font-weight:600">'+r.line+'</div></div><span style="font-size:18px">📞</span></a>';
  }).join('');
}

// ── BOTTLE WALL ────────────────────────────────────────────────
var _bottleMoods = ['😰','😢','😤','😔','🤗','💭','😊','🌊'];

function pRenderBottle(){
  var moodRow = document.getElementById('bottleMoodRow');
  if(moodRow) moodRow.innerHTML = _bottleMoods.map(function(m){
    return '<button style="font-size:22px;padding:7px;border:2px solid transparent;border-radius:10px;background:none;cursor:pointer;transition:all .15s" onclick="pSelBottleMood(this,\''+m+'\')" data-mood="'+m+'">'+m+'</button>';
  }).join('');

  var list = document.getElementById('bottleList');
  if(!list) return;
  var bottles = []; try{ bottles = JSON.parse(safeLS('get','velo_my_bottles')||'[]'); }catch(e){}
  var mockBottles = [
    { mood:'😔', text:'A veces el silencio duele más que las palabras.', time:'hace 3 min', responses:2, color:'rgba(116,198,157,.12)' },
    { mood:'💭', text:'¿Alguien más siente que no encaja en ningún lado?', time:'hace 8 min', responses:7, color:'rgba(200,165,100,.08)' },
    { mood:'😢', text:'Hoy recordé a alguien que ya no está. Lo extraño tanto.', time:'hace 15 min', responses:4, color:'rgba(196,181,232,.12)' },
    { mood:'🤗', text:'Para quien lo necesite: no estás solo/a. Esto también pasa.', time:'hace 22 min', responses:15, color:'rgba(116,198,157,.1)' }
  ];
  var allBottles = bottles.concat(mockBottles);
  if(!allBottles.length){
    list.innerHTML = '<div class="p-empty" style="color:rgba(255,255,255,.4)"><span class="p-empty-emoji">🌊</span><div class="p-empty-title" style="color:rgba(255,255,255,.6)">El mar está tranquilo</div><div class="p-empty-sub">Sé el primero en lanzar una botella</div></div>';
    return;
  }
  list.innerHTML = allBottles.map(function(b, i){
    return '<div class="dark-bottle" style="animation-delay:'+i*.08+'s;border-left:3px solid '+(b.color||'rgba(200,165,100,.3)').replace('rgba','rgba')+'"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px"><span style="font-size:20px">'+b.mood+'</span><span style="font-size:10px;color:rgba(255,255,255,.3)">'+b.time+'</span></div><p style="font-size:13px;color:rgba(255,255,255,.75);line-height:1.6;margin-bottom:10px;font-family:\'Cormorant Garamond\',serif;font-style:italic">"'+b.text+'"</p><div style="display:flex;align-items:center;justify-content:space-between"><span style="font-size:11px;color:rgba(200,165,100,.6)">💬 '+(b.responses||0)+' respuestas</span><button style="padding:5px 11px;background:rgba(200,165,100,.12);border:1px solid rgba(200,165,100,.22);border-radius:100px;color:#C8A560;font-size:11px;font-weight:700;cursor:pointer;font-family:\'Jost\',sans-serif" onclick="pToast(\'💬\',\'Respondiendo botella…\')">Responder</button></div></div>';
  }).join('');
}

var _selectedBottleMood = '💭';
function pSelBottleMood(el, mood){
  _selectedBottleMood = mood;
  var parent = document.getElementById('bottleMoodRow');
  if(parent) parent.querySelectorAll('button').forEach(function(b){
    b.style.borderColor = b.dataset.mood === mood ? 'rgba(200,165,100,.5)' : 'transparent';
    b.style.background = b.dataset.mood === mood ? 'rgba(200,165,100,.1)' : 'none';
  });
}

function pOpenBottleForm(){ openModal('bottleFormOv'); }

function pSendBottle(){
  var ta = document.getElementById('bottleMsgTa');
  if(!ta || !ta.value.trim()){ pToast('✍️','Escribí algo antes de lanzar'); return; }
  var text = ta.value.trim();
  ta.value = '';
  closeModal('bottleFormOv');
  var bottles = []; try{ bottles = JSON.parse(safeLS('get','velo_my_bottles')||'[]'); }catch(e){}
  bottles.unshift({ mood:_selectedBottleMood, text:text, time:'ahora mismo', responses:0, color:'rgba(116,198,157,.12)', ts:Date.now() });
  safeLS('set','velo_my_bottles', JSON.stringify(bottles.slice(0,50)));
  pToast('🌊','¡Botella lanzada al mar! 🌿');
  pRenderBottle();
}

// ── DIARY ──────────────────────────────────────────────────────
var _diaryEmojis = ['😊','😢','😰','😤','😴','🤔','💪','🌿','✨','💔'];

function pInitDiary(){
  var dateEl = document.getElementById('diaryDateLbl');
  if(dateEl){ var d = new Date(); dateEl.textContent = _fmtDate(d.getTime()).split('·')[0].trim(); }
  var row = document.getElementById('diaryEmojiRow');
  if(row) row.innerHTML = _diaryEmojis.map(function(e){
    return '<button class="diary-emoji-btn" onclick="pSelDiaryEmoji(this,\''+e+'\')" data-emoji="'+e+'">'+e+'</button>';
  }).join('');
  _loadDiaryEntries();
}

var _selectedDiaryEmoji = '';
function pSelDiaryEmoji(el, emoji){
  _selectedDiaryEmoji = _selectedDiaryEmoji === emoji ? '' : emoji;
  document.querySelectorAll('.diary-emoji-btn').forEach(function(b){
    b.classList.toggle('sel', b.dataset.emoji === _selectedDiaryEmoji);
  });
}

async function pSaveDiary(){
  var ta = document.getElementById('diaryTa');
  if(!ta || !ta.value.trim()){ pToast('✍️','Escribí algo primero'); return; }
  var text = (_selectedDiaryEmoji ? _selectedDiaryEmoji+' ' : '') + ta.value.trim();
  var ts = Date.now();
  var dateLabel = _fmtDate(ts);
  // Local storage
  var entries = []; try{ entries = JSON.parse(safeLS('get','velo_diary')||'[]'); }catch(e){}
  entries.unshift({ text:text, dateLabel:dateLabel, ts:ts });
  safeLS('set','velo_diary', JSON.stringify(entries.slice(0,200)));
  // Supabase
  sbSaveDiaryEntry(text, dateLabel, ts);
  ta.value = '';
  _selectedDiaryEmoji = '';
  document.querySelectorAll('.diary-emoji-btn').forEach(function(b){ b.classList.remove('sel'); });
  pToast('📔','Entrada guardada 💚');
  _loadDiaryEntries();
}

async function _loadDiaryEntries(){
  var el = document.getElementById('diaryEntries');
  if(!el) return;
  // Try Supabase first
  var sbEntries = await sbLoadDiaryEntries();
  var entries = sbEntries || [];
  if(!entries.length){
    var local = []; try{ local = JSON.parse(safeLS('get','velo_diary')||'[]'); }catch(e){}
    entries = local;
  }
  if(!entries.length){
    el.innerHTML = '<div class="p-empty"><span class="p-empty-emoji">📔</span><div class="p-empty-title">Aún no tenés entradas</div><div class="p-empty-sub">Este es tu espacio seguro. 🌙</div></div>';
    return;
  }
  el.innerHTML = entries.map(function(e, i){
    return '<div class="diary-entry" style="animation-delay:'+i*.05+'s"><div class="diary-entry-date">'+e.dateLabel+'</div><div class="diary-entry-text">'+_escHtml(e.text)+'</div><div style="margin-top:8px;text-align:right"><button style="font-size:11px;color:var(--sos);background:none;border:none;cursor:pointer;padding:3px 7px" onclick="pDeleteDiary('+e.ts+')">🗑️ Borrar</button></div></div>';
  }).join('');
}

async function pDeleteDiary(ts){
  var entries = []; try{ entries = JSON.parse(safeLS('get','velo_diary')||'[]'); }catch(e){}
  entries = entries.filter(function(e){ return e.ts !== ts; });
  safeLS('set','velo_diary', JSON.stringify(entries));
  sbDeleteDiaryEntry(ts);
  pToast('🗑️','Entrada eliminada');
  _loadDiaryEntries();
}

// ── MOOD ───────────────────────────────────────────────────────
var _moodOpts = [
  { emoji:'😄', label:'Excelente' }, { emoji:'😊', label:'Bien' }, { emoji:'😐', label:'Regular' },
  { emoji:'😔', label:'Triste' },   { emoji:'😰', label:'Ansioso/a' }, { emoji:'😤', label:'Enojado/a' },
  { emoji:'😴', label:'Agotado/a' }, { emoji:'🤔', label:'Confundido/a' }
];
var _selMood = null;

function pInitMood(){
  var orbs = document.getElementById('moodOrbs');
  if(!orbs) return;
  orbs.innerHTML = _moodOpts.map(function(m){
    return '<div class="mood-orb" onclick="pSelMood(this,\''+m.emoji+'\',\''+m.label+'\')" data-emoji="'+m.emoji+'"><span class="mood-orb-emoji">'+m.emoji+'</span><span class="mood-orb-lbl">'+m.label+'</span></div>';
  }).join('');
  // Load today's mood
  var today = _dateKey();
  var stored = safeLS('get','velo_mood_'+today);
  if(stored){ try{ var ms = JSON.parse(stored); if(ms.emoji){ var orb = orbs.querySelector('[data-emoji="'+ms.emoji+'"]'); if(orb) orb.classList.add('selected'); _selMood = ms; } }catch(e){} }
  // Load month calendar
  _loadMoodCalendar();
}

function pSelMood(el, emoji, label){
  _selMood = { emoji:emoji, label:label };
  document.querySelectorAll('.mood-orb').forEach(function(o){ o.classList.remove('selected'); });
  el.classList.add('selected');
}

async function pSaveMood(){
  if(!_selMood){ pToast('🌈','Seleccioná cómo te sentís'); return; }
  var note = document.getElementById('moodNote');
  var noteVal = note ? note.value.trim() : '';
  var today = _dateKey();
  var data = { emoji:_selMood.emoji, label:_selMood.label, note:noteVal, ts:Date.now() };
  safeLS('set','velo_mood_'+today, JSON.stringify(data));
  sbSaveMoodEntry(today, _selMood.emoji, _selMood.label, noteVal);
  pToast(_selMood.emoji, 'Estado de ánimo registrado 💚');
  if(note) note.value = '';
  _loadMoodCalendar();
  _loadTodayMoodHome();
}

async function _loadMoodCalendar(){
  var cal = document.getElementById('moodCalendar');
  var hist = document.getElementById('moodHistory');
  if(!cal) return;
  var now = new Date();
  var year = now.getFullYear();
  var month = now.getMonth() + 1;
  var daysInMonth = new Date(year, month, 0).getDate();
  var sbData = await sbLoadAllMoods(year, month);
  var moodMap = {};
  if(sbData){ sbData.forEach(function(e){ moodMap[e.date_key] = e; }); }
  // Fill from local too
  for(var d = 1; d <= daysInMonth; d++){
    var key = year+'-'+String(month).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    var local = safeLS('get','velo_mood_'+key);
    if(local && !moodMap[key]){ try{ var lo = JSON.parse(local); moodMap[key] = lo; }catch(e){} }
  }
  var html = '';
  for(var dd = 1; dd <= daysInMonth; dd++){
    var k = year+'-'+String(month).padStart(2,'0')+'-'+String(dd).padStart(2,'0');
    var entry = moodMap[k];
    html += '<div style="aspect-ratio:1;background:'+(entry?'rgba(116,198,157,.15)':'rgba(0,0,0,.04)')+';border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:'+(entry?'16px':'11px')+';color:var(--ink5)" title="'+k+'">'+(entry?entry.emoji:dd)+'</div>';
  }
  cal.innerHTML = html;
  // History list
  if(hist){
    var entries = Object.keys(moodMap).sort().reverse().slice(0,10);
    if(!entries.length){ hist.innerHTML = '<p class="p-sm p-muted">Sin registros este mes.</p>'; }
    else {
      hist.innerHTML = '<div class="p-label" style="margin-bottom:10px">Últimos registros</div>'+entries.map(function(k){
        var e = moodMap[k];
        return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)"><span style="font-size:20px">'+e.emoji+'</span><div><div style="font-size:13px;font-weight:600;color:var(--ink)">'+e.label+'</div><div style="font-size:11px;color:var(--ink5)">'+k+(e.note?' · '+e.note:'')+'</div></div></div>';
      }).join('');
    }
  }
}

// ── CALM SCREEN ────────────────────────────────────────────────
var _calmMsgs = [
  '🌿 Cada momento difícil también pasa. Sos más fuerte de lo que creés.',
  '💙 No tenés que tener todo bajo control. Está bien pedir ayuda.',
  '✨ Tu existencia tiene valor, incluso en los días grises.',
  '🌱 El crecimiento no siempre se ve, pero está pasando.',
  '🌙 Las noches difíciles terminan. Siempre sale el sol.',
  '💚 Cuidarte no es egoísmo, es necesidad.',
  '🦋 Estás en un proceso. Dale tiempo al tiempo.',
  '🌺 Sos bienvenido/a tal como sos.'
];
var _calmSongs = ['🎵 Weightless — Marconi Union','🎵 Claire de Lune — Debussy','🎵 River Flows in You — Yiruma','🎵 Experience — Ludovico Einaudi'];
var _calmBooks = ['📖 El Principito — Saint-Exupéry','📖 Cuando el cuerpo dice no — Maté','📖 Mindfulness para principiantes — Kabat-Zinn','📖 El arte de no amargarse la vida — Rafael Santandreu'];

function pCalmMsg(){ pToast(_calmMsgs[Math.floor(Math.random()*_calmMsgs.length)].charAt(0), _calmMsgs[Math.floor(Math.random()*_calmMsgs.length)].slice(2)); }
function pCalmSong(){ pToast('🎵', _calmSongs[Math.floor(Math.random()*_calmSongs.length)].slice(3)); }
function pCalmBook(){ pToast('📖', _calmBooks[Math.floor(Math.random()*_calmBooks.length)].slice(3)); }

// ── RESPIRA (Breathing) ────────────────────────────────────────
var _respiraRunning = false;
var _respiraTimer = null;
var _respiraPhases = [
  { name:'Inhala', color:'rgba(116,198,157,.8)', dur:4 },
  { name:'Sostén', color:'rgba(168,212,232,.7)', dur:7 },
  { name:'Exhala', color:'rgba(196,181,232,.7)', dur:8 }
];
var _respiraPhaseIdx = 0;
var _respiraCount = 0;

function pInitRespira(){
  var canvas = document.getElementById('respiraCanvas');
  if(!canvas) return;
  var ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(22,42,30,0.7)';
  ctx.beginPath();
  ctx.arc(130,130,120,0,Math.PI*2);
  ctx.fill();
  ctx.fillStyle = 'rgba(116,198,157,0.3)';
  ctx.beginPath();
  ctx.arc(130,130,80,0,Math.PI*2);
  ctx.fill();
  _setEl('respiraPhase','Prepárate');
  _setEl('respiraCount','');
  _setEl('respiraBtn','Comenzar');
  _respiraRunning = false;
}

function pStartRespira(){
  if(_respiraRunning){ _stopRespira(); return; }
  _respiraRunning = true;
  _setEl('respiraBtn','Detener');
  _respiraPhaseIdx = 0;
  _respiraCount = _respiraPhases[0].dur;
  _runRespiraPhase();
}

function _runRespiraPhase(){
  if(!_respiraRunning) return;
  var ph = _respiraPhases[_respiraPhaseIdx];
  _setEl('respiraPhase', ph.name);
  _setEl('respiraCount', ph.dur);
  _respiraCount = ph.dur;
  _drawRespiraCircle(ph.color, ph.dur);
  var elapsed = 0;
  clearInterval(_respiraTimer);
  _respiraTimer = setInterval(function(){
    elapsed++;
    var remaining = ph.dur - elapsed;
    _setEl('respiraCount', remaining > 0 ? remaining : '');
    _drawRespiraCircle(ph.color, 1 - elapsed/ph.dur);
    if(elapsed >= ph.dur){
      clearInterval(_respiraTimer);
      _respiraPhaseIdx = (_respiraPhaseIdx+1) % _respiraPhases.length;
      if(_respiraRunning) _runRespiraPhase();
    }
  }, 1000);
}

function _drawRespiraCircle(color, scale){
  var canvas = document.getElementById('respiraCanvas');
  if(!canvas) return;
  var ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,260,260);
  ctx.fillStyle = 'rgba(10,26,18,0.85)';
  ctx.beginPath();
  ctx.arc(130,130,128,0,Math.PI*2);
  ctx.fill();
  var s = 0.4 + (1-Math.max(0,Math.min(1,scale||1)))*0.6;
  ctx.fillStyle = color || 'rgba(116,198,157,0.5)';
  ctx.beginPath();
  ctx.arc(130,130,110*s,0,Math.PI*2);
  ctx.fill();
}

function _stopRespira(){
  _respiraRunning = false;
  clearInterval(_respiraTimer);
  _setEl('respiraBtn','Comenzar');
  _setEl('respiraPhase','Preparate');
  _setEl('respiraCount','');
}

// ── VELA ───────────────────────────────────────────────────────
var _velaQuotes = [
  '"La llama no ilumina su propia base, pero alumbra todo lo demás." — Proverbio',
  '"En el silencio está la mayor de las sabidurías." — Zen',
  '"Respira. Estás aquí. Eso es suficiente."',
  '"La calma es el refugio que llevamos adentro."',
  '"Cada exhalación es una liberación."'
];
function pInitVela(){
  var q = document.getElementById('velaQuote');
  if(q) q.textContent = _velaQuotes[Math.floor(Math.random()*_velaQuotes.length)];
}

// ── CIRCLES ────────────────────────────────────────────────────
var _circlesData = [
  { id:'c1', name:'Manejo de Ansiedad', emoji:'🌊', members:142, desc:'Estrategias y apoyo para el día a día con ansiedad.', active:true },
  { id:'c2', name:'Duelo y Pérdida', emoji:'🌙', members:89, desc:'Acompañamiento en procesos de duelo. Sin prisas.', active:false },
  { id:'c3', name:'Crianza Consciente', emoji:'🌱', members:203, desc:'Madres, padres y familias que crían con presencia.', active:false },
  { id:'c4', name:'Trastornos del Sueño', emoji:'😴', members:67, desc:'Cuando la noche no descansa. Juntos buscamos calma.', active:false },
  { id:'c5', name:'Autoestima', emoji:'✨', members:156, desc:'Reconstruir la confianza desde la raíz.', active:false }
];

function pRenderCircles(){
  var list = document.getElementById('circlesList');
  if(!list) return;
  list.innerHTML = _circlesData.map(function(c){
    return '<div class="p-card p-card--hover" style="padding:18px;margin-bottom:12px;cursor:pointer" onclick="pToast(\''+c.emoji+'\',\'Uniéndote a '+c.name+'…\')"><div style="display:flex;align-items:center;gap:13px"><div style="font-size:36px;width:54px;height:54px;border-radius:18px;background:var(--sage7);display:flex;align-items:center;justify-content:center;flex-shrink:0">'+c.emoji+'</div><div style="flex:1;min-width:0"><div style="font-size:15px;font-weight:700;color:var(--ink);margin-bottom:3px">'+c.name+'</div><div style="font-size:12px;color:var(--ink4);line-height:1.5;margin-bottom:7px">'+c.desc+'</div><div style="display:flex;align-items:center;gap:8px"><span class="p-pill p-pill--sage">'+c.members+' personas</span>'+(c.active?'<span class="p-pill p-pill--live"><span class="p-ldot p-ldot--on"></span> Activo</span>':'')+'</div></div><button class="p-btn p-btn--secondary p-btn--sm" onclick="event.stopPropagation();pToast(\''+c.emoji+'\',\'Uniéndote a '+c.name+'…\')">Unirse</button></div></div>';
  }).join('');
}

function pOpenCreateCircle(){
  pToast('⭕','Crear un círculo nuevo — próximamente 🌿');
}

// ── HAPPY WALL ─────────────────────────────────────────────────
var _happyMock = [
  { emoji:'🌻', text:'Hoy mi hijo me dijo "te quiero" sin que se lo pidiera.', av:'🌸', time:'hace 5 min', reactions:12 },
  { emoji:'🎉', text:'Conseguí el trabajo que tanto quería. ¡Un año de espera!', av:'🌊', time:'hace 12 min', reactions:34 },
  { emoji:'🌱', text:'Fui a terapia por primera vez. Me animé.', av:'🦋', time:'hace 20 min', reactions:28 },
  { emoji:'☀️', text:'Salí a caminar sin el celular. El mundo sigue siendo hermoso.', av:'🌿', time:'hace 35 min', reactions:19 }
];

function pRenderHappy(){
  var list = document.getElementById('happyList');
  if(!list) return;
  var happy = []; try{ happy = JSON.parse(safeLS('get','velo_happy')||'[]'); }catch(e){}
  var all = happy.concat(_happyMock);
  if(!all.length){
    list.innerHTML = '<div class="p-empty" style="grid-column:1/-1"><span class="p-empty-emoji">☀️</span><div class="p-empty-title">Aún no hay publicaciones</div><div class="p-empty-sub">Compartí un momento de alegría</div></div>';
    return;
  }
  list.innerHTML = all.map(function(h){
    return '<div class="happy-card"><div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><div style="font-size:28px;width:40px;height:40px;border-radius:13px;background:var(--sun3);display:flex;align-items:center;justify-content:center;flex-shrink:0">'+h.emoji+'</div><div style="flex:1"><div style="font-size:14px;font-weight:600;color:var(--ink)">'+(h.name||'Usuario Anónimo')+'</div><div style="font-size:11px;color:var(--ink5)">'+h.time+'</div></div></div><p style="font-size:13px;color:var(--ink3);line-height:1.6;margin-bottom:10px;font-family:\'Cormorant Garamond\',serif;font-style:italic">"'+h.text+'"</p><div style="display:flex;align-items:center;gap:8px"><button style="padding:5px 11px;background:rgba(255,224,102,.15);border:1px solid rgba(255,224,102,.3);border-radius:100px;font-size:12px;cursor:pointer;font-family:\'Jost\',sans-serif" onclick="pToast(\'💛\',\'¡Alegría compartida!\')">💛 '+(h.reactions||0)+'</button></div></div>';
  }).join('');
}

function pOpenHappyPost(){
  var text = prompt('Compartí un momento de alegría:');
  if(!text || !text.trim()) return;
  var happy = []; try{ happy = JSON.parse(safeLS('get','velo_happy')||'[]'); }catch(e){}
  happy.unshift({ emoji:'☀️', text:text.trim(), av:'🧑', time:'ahora mismo', reactions:0, ts:Date.now() });
  safeLS('set','velo_happy', JSON.stringify(happy.slice(0,50)));
  pToast('☀️','¡Momento compartido! 💛');
  pRenderHappy();
}

// ── PROFILE ────────────────────────────────────────────────────
function pLoadProfile(){
  var name  = safeLS('get','velo_user_name') || 'Usuario';
  var av    = safeLS('get','velo_user_av') || '🧑';
  var motto = safeLS('get','velo_user_motto') || 'Mi camino, mi ritmo.';
  _setEl('profileName', name);
  _setEl('profileAv', av);
  _setEl('profileMotto', motto);

  // Plan badge
  var planBadge = document.getElementById('profilePlanBadge');
  if(planBadge){
    planBadge.innerHTML = _isPremium()
      ? '<span class="p-pill p-pill--gold">⭐ Velo Plus</span>'
      : '<span class="p-pill p-pill--sage">🌱 Gratuito</span>';
  }

  // Stats
  var diary = []; try{ diary = JSON.parse(safeLS('get','velo_diary')||'[]'); }catch(e){}
  var daysReg = Math.ceil((Date.now() - (parseInt(safeLS('get','velo_registered_ts')||Date.now(),10))) / 86400000);
  _setEl('profileChats', diary.length);
  _setEl('profileDays', Math.max(1, daysReg));
  _setEl('profileBadges', _calcBadges());

  // Incognito toggle
  var inc = document.getElementById('incognitoTog');
  if(inc){ var isInc = safeLS('get','velo_incognito')==='true'; inc.classList.toggle('on', isInc); }

  // Edit form pre-fill
  var en = document.getElementById('editName');
  var em = document.getElementById('editMotto');
  if(en) en.value = name;
  if(em) em.value = motto;

  // Avatar grid
  var avatarList = ['🧑','👩','👨','🧑‍🦱','👩‍🦱','👩‍🦰','🧔','🧑‍🦳','🌸','🌊','🦋','🌿','🌙','⭐','🦁','🐺'];
  var avGrid = document.getElementById('editAvGrid');
  if(avGrid) avGrid.innerHTML = avatarList.map(function(a){
    return '<div class="p-av-opt'+(a===av?' selected':'')+'" onclick="pPickAv(this,\''+a+'\')">'+a+'</div>';
  }).join('');

  // Reviews tab
  var rvEl = document.getElementById('profileReviews');
  if(rvEl) rvEl.innerHTML = diary.length > 0
    ? '<div class="p-empty"><span class="p-empty-emoji">⭐</span><div class="p-empty-title">Aún no hay reseñas</div><div class="p-empty-sub">Las reseñas aparecerán después de tus sesiones</div></div>'
    : '<div class="p-empty"><span class="p-empty-emoji">⭐</span><div class="p-empty-title">Aún no hay reseñas</div><div class="p-empty-sub">Las reseñas aparecerán después de tus sesiones</div></div>';

  // Badges tab
  _renderBadgesGrid();

  // Config tab
  var cfg = document.getElementById('profileConfig');
  if(cfg) cfg.innerHTML = [
    { icon:'📧', label:'Correo', val: safeLS('get','velo_user_email')||'—' },
    { icon:'🔔', label:'Notificaciones', val:'Activadas' },
    { icon:'🌍', label:'Idioma', val:'Español' }
  ].map(function(r){
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border)"><div style="display:flex;align-items:center;gap:10px"><span style="font-size:18px">'+r.icon+'</span><span style="font-size:13px;font-weight:600;color:var(--ink)">'+r.label+'</span></div><span style="font-size:12px;color:var(--ink4)">'+r.val+'</span></div>';
  }).join('');

  // Donate tab
  var don = document.getElementById('profileDonate');
  if(don) don.innerHTML = '<div class="p-card" style="padding:22px"><div style="text-align:center;margin-bottom:18px"><div style="font-size:48px;margin-bottom:10px">💚</div><h3 class="p-title" style="font-size:20px;margin-bottom:8px">Apoyá a Velo</h3><p class="p-sm" style="max-width:340px;margin:auto">Ayudanos a mantener este espacio gratuito para quienes más lo necesitan.</p></div><button class="p-btn p-btn--primary p-btn--lg p-btn--full" onclick="pGoTo(\'donation-exit\')" style="margin-bottom:8px">Donar ahora 🌻</button><button class="p-btn p-btn--secondary p-btn--md p-btn--full" onclick="pOpenPayPalPlus()">⭐ Obtener Velo Plus ($2.99/mes)</button></div>';
}

function _calcBadges(){
  var b = 0;
  var diary = []; try{ diary = JSON.parse(safeLS('get','velo_diary')||'[]'); }catch(e){}
  if(diary.length >= 1) b++;
  if(diary.length >= 7) b++;
  if(diary.length >= 30) b++;
  return b;
}

function _renderBadgesGrid(){
  var el = document.getElementById('profileBadgesGrid');
  if(!el) return;
  var badges = [
    { icon:'🌱', name:'Primer Paso', desc:'Crear tu cuenta', done:true },
    { icon:'📔', name:'Escribiendo', desc:'Primera entrada en el diario', done:!!JSON.parse(safeLS('get','velo_diary')||'[]').length },
    { icon:'🌈', name:'En Movimiento', desc:'Registrar tu ánimo 7 días', done:false },
    { icon:'💙', name:'Corazón Abierto', desc:'Participar en Sala de Ayuda', done:false },
    { icon:'⭐', name:'Constancia', desc:'30 días consecutivos', done:false },
    { icon:'🦋', name:'Transformación', desc:'Completar onboarding', done:true }
  ];
  el.innerHTML = badges.map(function(b){
    return '<div class="p-badge-row" style="opacity:'+(b.done?1:.5)+'"><div class="p-badge-ic" style="background:'+(b.done?'var(--sage7)':'var(--cream2)')+'">'+b.icon+'</div><div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:700;color:var(--ink)">'+b.name+'</div><div style="font-size:11px;color:var(--ink4)">'+b.desc+'</div><div class="p-badge-prog-track"><div class="p-badge-prog-fill" style="width:'+(b.done?'100%':'25%')+';background:'+(b.done?'var(--sage2)':'var(--sage4)')+'"></div></div></div>'+(b.done?'<span style="font-size:16px">✅</span>':'<span style="font-size:14px;color:var(--ink5)">🔒</span>')+'</div>';
  }).join('');
}

function switchProfileTab(tab, btn){
  document.querySelectorAll('.p-tab').forEach(function(t){ t.classList.remove('active'); });
  document.querySelectorAll('.p-tab-content').forEach(function(c){ c.classList.remove('active'); });
  if(btn) btn.classList.add('active');
  var content = document.getElementById('tab-'+tab);
  if(content) content.classList.add('active');
}

var _selectedAv = null;
function pPickAv(el, av){
  _selectedAv = av;
  document.querySelectorAll('.p-av-opt').forEach(function(o){ o.classList.remove('selected'); });
  el.classList.add('selected');
}

function pOpenEditProfile(){ openModal('editProfileOv'); }

function pSaveProfile(){
  var nameEl  = document.getElementById('editName');
  var mottoEl = document.getElementById('editMotto');
  var name  = nameEl ? nameEl.value.trim() : '';
  var motto = mottoEl ? mottoEl.value.trim() : '';
  if(!name){ pToast('⚠️','Ingresá tu nombre'); return; }
  if(name) safeLS('set','velo_user_name', name);
  if(motto) safeLS('set','velo_user_motto', motto);
  if(_selectedAv) safeLS('set','velo_user_av', _selectedAv);
  closeModal('editProfileOv');
  pToast('✅','Perfil actualizado 💚');
  pLoadProfile();
  _updateSidebarUser();
}

function pToggleIncognito(){
  var tog = document.getElementById('incognitoTog');
  var isOn = tog && tog.classList.contains('on');
  safeLS('set','velo_incognito', isOn ? 'false' : 'true');
  if(tog) tog.classList.toggle('on');
  pToast(isOn ? '👁️' : '🕵️', isOn ? 'Modo incógnito desactivado' : 'Modo incógnito activado');
}

// ── INBOX ──────────────────────────────────────────────────────
function pRenderInbox(){
  var el = document.getElementById('inboxList');
  if(!el) return;
  var msgs = []; try{ msgs = JSON.parse(safeLS('get','velo_inbox')||'[]'); }catch(e){}
  var mockMsgs = [
    { id:'m1', tipo:'sistema', icon:'💚', remitente:'Equipo Velo', asunto:'¡Bienvenido/a!', extracto:'Gracias por unirte a Velo. Aquí encontrarás apoyo.', leido:false, fecha:'Ahora' },
    { id:'m2', tipo:'sistema', icon:'🌿', remitente:'Velo', asunto:'Consejo del día', extracto:'Recuerda: está bien no estar bien. El primer paso es reconocerlo.', leido:true, fecha:'Hoy' }
  ];
  var all = msgs.concat(mockMsgs);
  if(!all.length){
    el.innerHTML = '<div class="p-empty"><span class="p-empty-emoji">💌</span><div class="p-empty-title">Sin mensajes</div><div class="p-empty-sub">Tus notificaciones aparecerán aquí.</div></div>';
    return;
  }
  el.innerHTML = all.map(function(m){
    return '<div class="p-inbox-msg'+(m.leido?'':' unread')+'"><div style="display:flex;flex-shrink:0">'+(m.leido?'':'<div class="p-inbox-dot"></div>')+'</div><div class="p-inbox-ic" style="background:var(--sage7)">'+m.icon+'</div><div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:700;color:var(--ink);margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+m.asunto+'</div><div style="font-size:11px;color:var(--ink4);line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">'+m.extracto+'</div><div style="font-size:10px;color:var(--ink5);margin-top:4px">'+m.fecha+'</div></div></div>';
  }).join('');
}

// ── CONTACT ────────────────────────────────────────────────────
async function pSendContact(){
  var subject = document.getElementById('contactSubject');
  var msg     = document.getElementById('contactMsg');
  if(!subject||!msg||!msg.value.trim()){ pToast('✍️','Escribí tu mensaje'); return; }
  var text = msg.value.trim();
  var ts = Date.now();
  var msgs = []; try{ msgs = JSON.parse(safeLS('get','velo_admin_contacts')||'[]'); }catch(e){}
  msgs.unshift({ id:'c-'+ts, topic: subject.value||'General', mensaje:text, email:safeLS('get','velo_user_email')||'', fecha:new Date().toLocaleString('es'), leido:false });
  safeLS('set','velo_admin_contacts', JSON.stringify(msgs.slice(0,100)));
  if(sbClient){ sbEnviarReporte(text, subject.value||'General').catch(function(){}); }
  if(subject) subject.value = '';
  if(msg) msg.value = '';
  pToast('💌','Mensaje enviado. Te respondemos pronto 🌿');
}

// ── DONATION ───────────────────────────────────────────────────
var _selectedDonAmt = '10';

function pInitDonation(){
  var grid = document.getElementById('donationAmounts');
  if(!grid) return;
  var amts = ['5','10','15','25'];
  grid.innerHTML = amts.map(function(a){
    return '<div class="amt-opt'+(a==='10'?' selected':'')+'" onclick="pSelAmt(this,\''+a+'\')"><div style="font-family:\'Cormorant Garamond\',serif;font-size:28px;font-weight:700;color:var(--sage)">$'+a+'</div><div style="font-size:11px;color:var(--ink4)">USD</div></div>';
  }).join('');
}

function pSelAmt(el, amt){
  _selectedDonAmt = amt;
  document.querySelectorAll('.amt-opt').forEach(function(a){ a.classList.remove('selected'); });
  el.classList.add('selected');
}

function pDonate(){
  var amt = _selectedDonAmt || '10';
  pOpenPayPalDonate(amt, false, 'Donación Velo');
}

function pOpenPayPalDonate(amount, monthly, description){
  var baseURL = 'https://www.paypal.com/donate/?business='+PAYPAL_EMAIL;
  var params = '&currency_code=USD&amount='+amount;
  if(description) params += '&item_name='+encodeURIComponent(description);
  if(monthly) params += '&no_recurring=0';
  window.open(baseURL+params, '_blank');
}

function pOpenPayPalPlus(){
  var email = safeLS('get','velo_user_email');
  var baseURL = 'https://www.paypal.com/subscribe';
  var params = '?business='+PAYPAL_EMAIL+'&item_name='+encodeURIComponent('Velo Plus — Membresía Mensual')+'&currency_code=USD&a3=2.99&p3=1&t3=M&no_shipping=1';
  if(email) params += '&custom='+encodeURIComponent(email);
  window.open(baseURL+params, '_blank');
  safeLS('set','velo_pp_pending', JSON.stringify({ type:'plus', ts:Date.now() }));
  pToast('⭐','Completá el pago y volvé. ¡Tu cuenta Plus se activará! 🌿');
}

function pOpenPayPalPro(){
  var baseURL = 'https://www.paypal.com/subscribe';
  var params = '?business='+PAYPAL_EMAIL+'&item_name='+encodeURIComponent('Velo Profesional — Registro mensual')+'&currency_code=USD&a3=15&p3=1&t3=M&no_shipping=1';
  window.open(baseURL+params, '_blank');
  safeLS('set','velo_pp_pending', JSON.stringify({ type:'pro', ts:Date.now() }));
  pToast('🩺','Completá el pago y volvé para continuar tu registro 🌿');
}

// ── POST CHAT ───────────────────────────────────────────────────
function pInitPostChat(){
  var starsEl = document.getElementById('postChatStars');
  var tagsEl  = document.getElementById('postChatTags');
  if(starsEl){
    starsEl.innerHTML = [1,2,3,4,5].map(function(n){
      return '<button class="star-btn" onclick="pSelStar(this,'+n+')">⭐</button>';
    }).join('');
  }
  if(tagsEl){
    var tags = ['Me escucharon bien','Muy empático/a','Fue útil','Necesita mejorar','Volvería','Recomendaría'];
    tagsEl.innerHTML = tags.map(function(t){
      return '<div class="p-tag-chip" onclick="this.classList.toggle(\'on\')">'+t+'</div>';
    }).join('');
  }
}

function pSelStar(el, n){
  var stars = document.querySelectorAll('.star-btn');
  stars.forEach(function(s,i){ s.classList.toggle('on', i < n); });
  var labels = ['','Puede mejorar','Regular','Buena ayuda','Muy buena','¡Excelente!'];
  pToast('⭐', labels[n] || '');
}

function pSendPostChat(){
  pToast('💚','¡Gracias por tu reseña! 🌿');
  setTimeout(function(){ pGoTo('home'); }, 1200);
}

// ── PRO PANEL ──────────────────────────────────────────────────
function pInitProPanel(){
  _setEl('ppEarnings', '$'+Math.floor(Math.random()*500+200));
  _setEl('ppSessions', Math.floor(Math.random()*20+5));
  _setEl('ppRating', (4.7 + Math.random()*0.3).toFixed(1));
  _setEl('ppNextSessions', '<p class="p-sm p-muted">Sin sesiones programadas esta semana.</p>');
}

function switchProPanel(panel, btn){
  document.querySelectorAll('.pro-nav-item').forEach(function(i){ i.classList.remove('active'); });
  if(btn) btn.classList.add('active');
  var content = document.getElementById('proPanelContent');
  if(!content) return;
  var panels = {
    inicio: '<div class="metric-cards"><div class="metric-card"><div class="metric-n" id="ppEarnings">$0</div><div class="metric-l">Ingresos</div></div><div class="metric-card"><div class="metric-n" id="ppSessions">0</div><div class="metric-l">Sesiones</div></div><div class="metric-card"><div class="metric-n" id="ppRating">5.0</div><div class="metric-l">Rating</div></div></div><div class="p-card" style="padding:18px"><div class="p-label p-label-sage" style="margin-bottom:10px">Próximas sesiones</div><div id="ppNextSessions"><p class="p-sm p-muted">Sin sesiones programadas.</p></div></div>',
    agenda: '<div class="p-card" style="padding:18px"><div class="p-label p-label-sage" style="margin-bottom:12px">Disponibilidad semanal</div><div style="display:flex;gap:8px;flex-wrap:wrap">'+['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(function(d){ return '<div style="padding:9px 14px;border:1.5px solid var(--border2);border-radius:11px;font-size:13px;font-weight:600;color:var(--ink3);cursor:pointer;transition:all .15s" onclick="pTogDay(this)">'+d+'</div>'; }).join('')+'</div></div>',
    pacientes: '<div class="p-card" style="padding:18px"><div class="p-label p-label-sage" style="margin-bottom:12px">Mis pacientes</div><p class="p-sm p-muted">Sin pacientes activos aún.</p></div>',
    notas: '<div class="p-card" style="padding:18px"><div class="p-label p-label-sage" style="margin-bottom:12px">Notas de sesión</div><textarea class="p-textarea" rows="6" placeholder="Escribí notas de tu sesión más reciente..."></textarea><div style="height:10px"></div><button class="p-btn p-btn--primary p-btn--md" onclick="pToast(\'📝\',\'Nota guardada\')">Guardar nota</button></div>',
    finanzas: '<div class="metric-cards"><div class="metric-card"><div class="metric-n">$0</div><div class="metric-l">Pendiente</div></div><div class="metric-card"><div class="metric-n">$0</div><div class="metric-l">Total recibido</div></div><div class="metric-card"><div class="metric-n">0</div><div class="metric-l">Sesiones pagadas</div></div></div><div class="p-card" style="padding:18px;margin-top:14px"><p class="p-sm p-muted">Los pagos se procesan automáticamente por Stripe. Comisión Velo: 20%.</p></div>',
    perfil: '<div class="p-card" style="padding:18px"><div class="p-label p-label-sage" style="margin-bottom:12px">Mi perfil profesional</div><div class="p-field"><label class="p-field-label">Estado</label><div style="display:flex;gap:8px">'+[{v:'disponible',l:'🟢 Disponible'},{v:'ocupado',l:'🟡 Ocupado'},{v:'vacaciones',l:'🏖️ Vacaciones'}].map(function(s){ return '<button style="padding:7px 12px;border-radius:100px;border:1.5px solid var(--border2);background:rgba(255,255,255,.7);font-size:12px;font-weight:600;cursor:pointer;font-family:\'Jost\',sans-serif" onclick="pToast(\'✅\',\'Estado: '+s.l+'\')">'+s.l+'</button>'; }).join('')+'</div></div><button class="p-btn p-btn--secondary p-btn--md" onclick="pSignOut()">↩️ Cerrar sesión</button></div>'
  };
  content.innerHTML = panels[panel] || '<p class="p-sm p-muted">Sección en desarrollo 🌿</p>';
  if(panel === 'inicio') pInitProPanel();
}

function pTogDay(el){
  var on = el.style.borderColor.includes('sage') || el.style.background.includes('sage');
  if(on){ el.style.borderColor='var(--border2)'; el.style.background='rgba(255,255,255,.7)'; el.style.color='var(--ink3)'; }
  else{ el.style.borderColor='var(--sage2)'; el.style.background='var(--sage7)'; el.style.color='var(--sage)'; }
}

// ── PRO REG ────────────────────────────────────────────────────
function pProRegNext(){
  var name  = document.getElementById('prName');
  var spec  = document.getElementById('prSpec');
  var email = document.getElementById('prEmail');
  var pass  = document.getElementById('prPass');
  if(!name||!name.value.trim()){ pToast('⚠️','Ingresá tu nombre'); return; }
  if(!spec||!spec.value.trim()){ pToast('⚠️','Ingresá tu especialidad'); return; }
  if(!email||!email.value.trim()){ pToast('⚠️','Ingresá tu correo'); return; }
  if(!pass||!pass.value||pass.value.length<6){ pToast('⚠️','Contraseña mínima de 6 caracteres'); return; }
  safeLS('set','velo_pro_name', name.value.trim());
  safeLS('set','velo_pro_spec', spec.value.trim());
  safeLS('set','velo_user_email', email.value.trim());
  safeLS('set','velo_sb_pass', pass.value);
  safeLS('set','velo_user_type','pro');
  safeLS('set','velo_user_name', name.value.trim());
  pOpenPayPalPro();
  pGoTo('pro-pending');
}

// ── ADMIN ──────────────────────────────────────────────────────
function pAdminLogin(){
  var pass = document.getElementById('adminPass');
  if(!pass) return;
  if(pass.value === 'velo2025admin' || pass.value === 'admin'){
    safeLS('set','velo_user_type','admin');
    safeLS('set','velo_admin_session','1');
    _authenticated = true;
    pGoTo('admin');
    _renderAdmin();
    pass.value = '';
  } else {
    pToast('⚠️','Contraseña incorrecta');
  }
}

function pAdminLogout(){
  safeLS('del','velo_admin_session');
  safeLS('del','velo_session');
  _authenticated = false;
  pGoTo('landing');
  _updateNavState('landing', false);
}

function _renderAdmin(){
  var metrics = document.getElementById('adminMetrics');
  if(metrics){
    var tcRecs = []; try{ tcRecs = JSON.parse(safeLS('get','velo_tc_records')||'[]'); }catch(e){}
    var subs = []; try{ subs = JSON.parse(safeLS('get','velo_subscribers')||'[]'); }catch(e){}
    var diary = []; try{ diary = JSON.parse(safeLS('get','velo_diary')||'[]'); }catch(e){}
    var data = [
      { icon:'👥', label:'Usuarios', value:tcRecs.length||0, color:'var(--sage4)' },
      { icon:'💎', label:'Plus activos', value:subs.filter(function(s){ return s.status==='active'; }).length, color:'#c8a23e' },
      { icon:'📓', label:'Diarios', value:diary.length, color:'#9b8ecf' }
    ];
    metrics.innerHTML = data.map(function(d){
      return '<div class="a-card"><div style="font-size:22px;margin-bottom:4px">'+d.icon+'</div><div class="a-card-n" style="color:'+d.color+'">'+d.value+'</div><div class="a-card-l">'+d.label+'</div></div>';
    }).join('');
  }
  var content = document.getElementById('adminContent');
  if(content){
    var msgs = []; try{ msgs = JSON.parse(safeLS('get','velo_admin_contacts')||'[]'); }catch(e){}
    content.innerHTML = '<div style="font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(116,198,157,.6);margin-bottom:10px">MENSAJES DE CONTACTO</div>'
      +(msgs.length ? msgs.map(function(m){
        return '<div class="a-row"><div class="a-row-ic">💌</div><div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;color:rgba(255,255,255,.86)">'+m.topic+'</div><div style="font-size:11px;color:rgba(255,255,255,.38)">'+m.email+' · '+m.fecha+'</div></div>'+(m.leido?'<span class="a-badge-g">leído</span>':'<span class="a-badge-y">nuevo</span>')+'</div>';
      }).join('') : '<p style="font-size:12px;color:rgba(255,255,255,.3);padding:12px 0">Sin mensajes aún.</p>');
  }
}

// ── SUPABASE CLOUD FUNCTIONS (ported from velo.js) ────────────
async function sbSignUp(email, password, nombre){
  if(!sbClient) return {error:{message:'Supabase no inicializado'}};
  var {data, error} = await sbClient.auth.signUp({ email:email, password:password, options:{data:{nombre:nombre, role:'user'}} });
  if(!error && data.user){
    await sbClient.from('profiles').insert({ id:data.user.id, nombre:nombre, email:email, role:'user', created_at:new Date().toISOString() }).catch(function(){});
  }
  return {data, error};
}

async function sbSignIn(email, password){
  if(!sbClient) return {error:{message:'Supabase no inicializado'}};
  return await sbClient.auth.signInWithPassword({email, password});
}

async function sbSaveDiaryEntry(text, dateLabel, ts){
  if(!sbClient) return;
  try{
    var ok = await _ensureSbSession();
    if(!ok) return;
    var {data:ud} = await sbClient.auth.getUser();
    if(!ud || !ud.user) return;
    await sbClient.from('diary_entries').insert({ user_id:ud.user.id, text:text, date_label:dateLabel, ts:ts });
  }catch(e){}
}

async function sbDeleteDiaryEntry(ts){
  if(!sbClient) return;
  try{
    var ok = await _ensureSbSession();
    if(!ok) return;
    var {data:ud} = await sbClient.auth.getUser();
    if(!ud || !ud.user) return;
    await sbClient.from('diary_entries').delete().eq('user_id', ud.user.id).eq('ts', ts);
  }catch(e){}
}

async function sbLoadDiaryEntries(){
  if(!sbClient) return null;
  try{
    var ok = await _ensureSbSession();
    if(!ok) return null;
    var {data:ud} = await sbClient.auth.getUser();
    if(!ud || !ud.user) return null;
    var {data, error} = await sbClient.from('diary_entries').select('text,date_label,ts').eq('user_id', ud.user.id).order('ts',{ascending:false}).limit(200);
    return error ? null : data;
  }catch(e){ return null; }
}

async function sbSaveMoodEntry(dateKey, emoji, label, note){
  if(!sbClient) return;
  try{
    var ok = await _ensureSbSession();
    if(!ok) return;
    var {data:ud} = await sbClient.auth.getUser();
    if(!ud || !ud.user) return;
    await sbClient.from('mood_entries').upsert({ user_id:ud.user.id, date_key:dateKey, emoji:emoji, label:label, note:note||'' },{onConflict:'user_id,date_key'});
  }catch(e){}
}

async function sbLoadAllMoods(year, month){
  if(!sbClient) return null;
  try{
    var ok = await _ensureSbSession();
    if(!ok) return null;
    var {data:ud} = await sbClient.auth.getUser();
    if(!ud || !ud.user) return null;
    var prefix = year+'-'+String(month).padStart(2,'0');
    var {data, error} = await sbClient.from('mood_entries').select('emoji,label,note,date_key').eq('user_id', ud.user.id).like('date_key', prefix+'%').order('date_key',{ascending:true});
    return error ? null : data;
  }catch(e){ return null; }
}

async function sbEnviarReporte(mensaje, categoria){
  if(!sbClient) return;
  try{
    var user = await sbClient.auth.getUser();
    await sbClient.from('reportes').insert({ user_id:user&&user.data&&user.data.user?user.data.user.id:null, mensaje:mensaje, categoria:categoria||'contacto', estado:'abierto', created_at:new Date().toISOString() });
  }catch(e){}
}

// ── STRIPE RETURN CHECK ───────────────────────────────────────
function _checkStripeReturn(){
  var params = new URLSearchParams(window.location.search);
  var session = params.get('session_id') || params.get('stripe_session');
  if(session){
    var pending = null; try{ pending = JSON.parse(safeLS('get','velo_stripe_pending')||'null'); }catch(e){}
    if(pending){
      pToast('✅','¡Pago confirmado! Tu sesión ha sido reservada 💚');
      safeLS('del','velo_stripe_pending');
      setTimeout(function(){ pGoTo('post-chat'); }, 1000);
    }
  }
}

function _checkPayPalReturn(){
  var params = new URLSearchParams(window.location.search);
  var ppTok = params.get('token') || params.get('paymentId');
  if(ppTok){
    var pending = null; try{ pending = JSON.parse(safeLS('get','velo_pp_pending')||'null'); }catch(e){}
    if(pending && pending.type === 'plus'){
      var subs = []; try{ subs = JSON.parse(safeLS('get','velo_subscribers')||'[]'); }catch(e){}
      var email = safeLS('get','velo_user_email');
      if(email) subs.push({ email:email, status:'active', ts:Date.now() });
      safeLS('set','velo_subscribers', JSON.stringify(subs));
      safeLS('del','velo_pp_pending');
      pToast('⭐','¡Velo Plus activado! Bienvenido/a 🌿');
    } else if(pending && pending.type === 'pro'){
      safeLS('set','velo_pro_approved','true');
      safeLS('del','velo_pp_pending');
      pToast('🩺','¡Registro profesional completado! 💚');
      pGoTo('pro-panel');
    } else {
      pToast('💚','¡Donación recibida! Gracias por apoyar Velo 🌿');
      safeLS('del','velo_pp_pending');
    }
  }
}

// ── LIVE COUNTERS ─────────────────────────────────────────────
var _liveH = 36, _liveG = 34;
setInterval(function(){
  _liveH = Math.max(22, Math.min(52, _liveH + (Math.random() > .5 ? 1 : -1)));
  _liveG = Math.max(20, Math.min(50, _liveG + (Math.random() > .5 ? 1 : -1)));
  _setEl('homeHelpCount', _liveH);
  _setEl('homeGuardianCount', _liveG);
  _setEl('helpActiveCount', Math.floor(_liveH/8)+' activos');
}, 5000);

// ── SCROLL REVEAL (landing) ───────────────────────────────────
function _initReveal(){
  if(!window.IntersectionObserver) return;
  var obs = new IntersectionObserver(function(entries){
    entries.forEach(function(e){
      if(e.isIntersecting){
        e.target.classList.add('visible');
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.reveal').forEach(function(el){ obs.observe(el); });
}

// ── PER-PAGE INIT DISPATCHER ──────────────────────────────────
function _onPageEnter(id){
  switch(id){
    case 'landing':     _initReveal(); break;
    case 'home':        _loadHomeData(); break;
    case 'guardians':   pRenderGuardians(); break;
    case 'professionals': pRenderProfessionals(); break;
    case 'help':        pRenderHelp(); break;
    case 'bottle':      pRenderBottle(); break;
    case 'diary':       pInitDiary(); break;
    case 'mood':        pInitMood(); break;
    case 'respira':     pInitRespira(); break;
    case 'vela':        pInitVela(); break;
    case 'circles':     pRenderCircles(); break;
    case 'happy':       pRenderHappy(); break;
    case 'profile':     pLoadProfile(); break;
    case 'inbox':       pRenderInbox(); break;
    case 'donation-exit': pInitDonation(); break;
    case 'post-chat':   pInitPostChat(); break;
    case 'pro-panel':   switchProPanel('inicio', document.querySelector('.pro-nav-item')); break;
    case 'admin':       _renderAdmin(); break;
  }
}

// ── UTILITY ───────────────────────────────────────────────────
function _setEl(id, html){
  var el = document.getElementById(id);
  if(el) el.innerHTML = html;
}
function _escHtml(str){
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── INIT ON LOAD ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function(){
  _initSupabase();
});

window.addEventListener('load', function(){
  _initSupabase();
  _checkStripeReturn();
  _checkPayPalReturn();

  // Check auth state
  var session = safeLS('get','velo_session');
  var type = safeLS('get','velo_user_type') || 'user';
  _userType = type;

  if(session === '1'){
    _authenticated = true;
    if(type === 'admin' && safeLS('get','velo_admin_session') === '1'){
      pGoTo('admin');
    } else if(type === 'pro'){
      var approved = safeLS('get','velo_pro_approved');
      pGoTo(approved ? 'pro-panel' : 'pro-pending');
    } else {
      pGoTo('home');
      setTimeout(function(){ _loadHomeData(); _updateSidebarUser(); }, 100);
    }
  } else {
    pGoTo('landing');
    setTimeout(_initReveal, 100);
  }

  // Welcome toast after a moment
  setTimeout(function(){
    if(!_authenticated){ pToast('🌿', 'Bienvenido/a a Velo'); }
  }, 3000);

  // Register timestamp
  if(!safeLS('get','velo_registered_ts')){
    safeLS('set','velo_registered_ts', String(Date.now()));
  }
});
