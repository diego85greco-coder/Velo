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

// ── GEMINI AI CONFIG ────────────────────────────────────────
// Key kept as fallback for non-Vercel environments (e.g. local dev / GitHub Pages)
var GEMINI_KEY    = 'AIzaSyBilVllciOwMx-OsGiWiy_Q10NmDEzD9s8';
var GEMINI_URLS   = [
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=',
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key='
];
var GEMINI_PROXY      = '/api/gemini';     // Vercel serverless proxy (hides key)
var SEND_EMAIL_PROXY  = '/api/send-email'; // Vercel serverless proxy for thank-you emails
var _geminiUrlIdx = 0;

async function _geminiCallGrounded(prompt, cfg){
  // Try Vercel serverless proxy first, fall back to direct call
  var sources = [
    function(){ return fetch(GEMINI_PROXY, { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ type:'grounded', prompt:prompt, cfg:cfg||{} }) }); },
    function(){ return fetch(GEMINI_URLS[0] + GEMINI_KEY, { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ contents:[{ parts:[{ text:prompt }] }], tools:[{ google_search:{} }],
        generationConfig: Object.assign({ temperature:0.5, maxOutputTokens:1500 }, cfg||{}) }) }); }
  ];
  for(var i=0; i<sources.length; i++){
    try{
      var res = await sources[i]();
      if(!res.ok && i===0){ continue; }
      var json = await res.json();
      if(json.candidates && json.candidates[0]){
        var cand = json.candidates[0];
        var text = (cand.content && cand.content.parts && cand.content.parts[0]) ? cand.content.parts[0].text : null;
        var chunks = (cand.groundingMetadata && cand.groundingMetadata.groundingChunks) || [];
        var urls = chunks.map(function(c){ return c.web || null; }).filter(Boolean);
        return { text: text, urls: urls };
      }
    }catch(e){ continue; }
  }
  return { text: null, urls: [] };
}

async function _geminiCall(prompt, cfg){
  // Try Vercel serverless proxy first
  try{
    var pr = await fetch(GEMINI_PROXY, { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ type:'generate', prompt:prompt, cfg:cfg||{} }) });
    if(pr.ok){
      var pj = await pr.json();
      if(pj.candidates && pj.candidates[0] && pj.candidates[0].content &&
         pj.candidates[0].content.parts && pj.candidates[0].content.parts[0].text){
        return pj.candidates[0].content.parts[0].text;
      }
    }
  }catch(e){}
  // Fallback: direct call (non-Vercel environments)
  for(var attempt = 0; attempt < GEMINI_URLS.length; attempt++){
    var url = GEMINI_URLS[(_geminiUrlIdx + attempt) % GEMINI_URLS.length];
    try{
      var res = await fetch(url + GEMINI_KEY, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ contents:[{ parts:[{ text: prompt }] }],
          generationConfig: Object.assign({ temperature:0.7, maxOutputTokens:300 }, cfg||{}) })
      });
      var json = await res.json();
      if(json.candidates && json.candidates[0] && json.candidates[0].content &&
         json.candidates[0].content.parts && json.candidates[0].content.parts[0].text){
        _geminiUrlIdx = (_geminiUrlIdx + attempt) % GEMINI_URLS.length;
        return json.candidates[0].content.parts[0].text;
      }
      if(json.error){ continue; }
    }catch(e){ continue; }
  }
  return null;
}

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

// ── DAILY LIMITS ────────────────────────────────────────────
function _dailyKey(type){ return 'velo_daily_'+type+'_'+new Date().toISOString().slice(0,10); }
function _checkDailyLimit(type){
  var limits = { bottle:2, help:2, guardian:4 };
  var plan = safeLS('get','velo_plan') || 'free';
  if(plan === 'plus') return true;
  var used = parseInt(safeLS('get',_dailyKey(type))||'0',10);
  return used < (limits[type]||99);
}
function _incDailyLimit(type){
  var k = _dailyKey(type);
  safeLS('set',k, String(parseInt(safeLS('get',k)||'0',10)+1));
}

// ── PRO CALENDAR & BOOKING ─────────────────────────────────────
var _BOOKING_HOURS = ['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00'];
var _CAL_DAY_NAMES = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
var _CAL_DAY_NAMES_LONG = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
var _CAL_MONTH_SHORT = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
var _CAL_MONTH_LONG = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function _proAvailKey(id){ return 'velo_pro_avail_'+id; }
function _proBookingsKey(id){ return 'velo_pro_bookings_'+id; }
function _proAvailLoad(id){ try{ return JSON.parse(safeLS('get',_proAvailKey(id))||'{}'); }catch(e){ return {}; } }
function _proAvailSave(id,a){ safeLS('set',_proAvailKey(id),JSON.stringify(a)); }
function _proBookingsLoad(id){ try{ return JSON.parse(safeLS('get',_proBookingsKey(id))||'[]'); }catch(e){ return []; } }
function _proBookingsSave(id,b){ safeLS('set',_proBookingsKey(id),JSON.stringify(b)); }

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
                'pro-reg','pro-onboarding','admin-login','pro-pending','verify-email'];
var P_DARK   = ['help','bottle','respira'];
var P_FADE   = ['landing','onboarding','register-type','donation-exit',
                'session-room','post-chat','donate-cta','pro-pending','admin-login','calm-ai','guardian-chat','verify-email'];

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
  var tcEl    = document.getElementById('regTcCheck');
  var btn     = document.getElementById('regBtn');
  var btnTxt  = document.getElementById('regBtnTxt');
  if(!nameEl||!emailEl||!passEl) return;

  var name  = nameEl.value.trim();
  var email = emailEl.value.trim();
  var pass  = passEl.value;

  // Validate
  var ok = true;
  _clearFieldErr('regNameErr'); _clearFieldErr('regEmailErr'); _clearFieldErr('regPassErr');
  var tcErrEl = document.getElementById('regTcErr');
  if(tcErrEl) tcErrEl.style.display = 'none';
  if(!name){ _showFieldErr('regNameErr'); ok=false; }
  if(!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ _showFieldErr('regEmailErr'); ok=false; }
  if(!pass || pass.length < 6){ _showFieldErr('regPassErr'); ok=false; }
  if(tcEl && !tcEl.checked){ if(tcErrEl) tcErrEl.style.display='block'; ok=false; }
  if(!ok) return;

  if(btn) btn.disabled = true;
  if(btnTxt) btnTxt.textContent = 'Creando cuenta…';

  try{
    _initSupabase();
    var appURL = window.location.origin + window.location.pathname;
    var result;
    if(sbClient){
      result = await sbClient.auth.signUp({
        email:email, password:pass,
        options:{ data:{ nombre:name, role:'user' }, emailRedirectTo: appURL }
      });
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
      var errMsg = result.error.message || 'Error al registrar';
      if(/rate.limit/i.test(errMsg))           errMsg = 'Demasiados intentos. Esperá unos minutos o iniciá sesión si ya creaste la cuenta.';
      else if(/already.registered/i.test(errMsg)) errMsg = 'Este email ya tiene una cuenta. Usá "Iniciar sesión" 🔑';
      else if(/invalid.email/i.test(errMsg))   errMsg = 'El email no es válido.';
      else if(/password/i.test(errMsg))        errMsg = 'La contraseña debe tener al menos 6 caracteres.';
      pToast('⚠️', errMsg);
    } else {
      safeLS('set','velo_user_email', email);
      safeLS('set','velo_sb_pass', pass);
      safeLS('set','velo_user_name', name);
      safeLS('set','velo_user_type','user');
      _recordTC(name, email);
      var veEl = document.getElementById('verifyEmailAddr');
      if(veEl) veEl.textContent = email;
      pGoTo('verify-email');
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
      // Check provisional password created by admin
      var provKey = 'velo_prov_'+email.toLowerCase().replace(/[^a-z0-9]/g,'_');
      var provRaw = null; try{ provRaw = JSON.parse(localStorage.getItem(provKey)); }catch(e){}
      if(provRaw && provRaw.pass === pass && provRaw.expiry > Date.now()){
        safeLS('set','velo_user_email', email);
        safeLS('set','velo_user_name', safeLS('get','velo_user_name') || email.split('@')[0]);
        safeLS('set','velo_session','1');
        safeLS('set','velo_needs_pw_change','1');
        _authenticated = true;
        pToast('🔑','Ingresaste con contraseña provisional. Por favor cambiá tu contraseña.');
        setTimeout(function(){ pGoTo('change-password'); }, 900);
      } else {
        pToast('⚠️', result.error.message || 'Credenciales incorrectas. ¿Olvidaste tu contraseña?');
      }
    } else {
      safeLS('set','velo_user_email', email);
      safeLS('set','velo_sb_pass', pass);
      var storedName = safeLS('get','velo_user_name') || email.split('@')[0];
      safeLS('set','velo_user_name', storedName);
      safeLS('set','velo_session','1');
      _authenticated = true;
      _startGuardianHeartbeat();
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

function pShowTerms(){
  var ov = document.getElementById('termsOv');
  if(ov) ov.classList.add('show');
}
function pShowPrivacy(){
  var ov = document.getElementById('privacyOv');
  if(ov) ov.classList.add('show');
}

function pShowForgot(){
  var email = document.getElementById('loginEmail');
  var val   = email ? email.value.trim() : '';
  var ov    = document.getElementById('forgotPassOv');
  if(!ov) return;
  var fEmail  = document.getElementById('forgotEmail');
  var sentDiv = document.getElementById('forgotSent');
  var formDiv = document.getElementById('forgotForm');
  if(fEmail && val) fEmail.value = val;
  if(sentDiv) sentDiv.style.display = 'none';
  if(formDiv) formDiv.style.display = '';
  ov.classList.add('show');
}

async function pSendPassReset(){
  var emailEl = document.getElementById('forgotEmail');
  var val = emailEl ? emailEl.value.trim() : '';
  if(!val || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val)){
    pToast('📧','Ingresá un correo válido'); return;
  }
  _initSupabase();
  if(sbClient){
    try{ await sbClient.auth.resetPasswordForEmail(val, {redirectTo: window.location.href}); }catch(e){}
  }
  var sentDiv = document.getElementById('forgotSent');
  var formDiv = document.getElementById('forgotForm');
  if(formDiv) formDiv.style.display = 'none';
  if(sentDiv) sentDiv.style.display = '';
}

function pForgotToContact(){
  var emailEl = document.getElementById('forgotEmail');
  var val = emailEl ? emailEl.value.trim() : '';
  closeModal('forgotPassOv');
  pGoTo('contact');
  setTimeout(function(){
    var sub = document.getElementById('contactSubject');
    if(sub) sub.value = 'Problema con contraseña';
    var msg = document.getElementById('contactMsg');
    if(msg) msg.value = (val ? 'Mi correo es: '+val+'\n\n' : '')+'No recibí el correo de recuperación y necesito acceder a mi cuenta.';
  }, 150);
}

async function pChangePassword(){
  var newEl  = document.getElementById('newPassInput');
  var confEl = document.getElementById('confPassInput');
  if(!newEl || !confEl) return;
  var newPass  = newEl.value;
  var confPass = confEl.value;
  if(newPass.length < 8){ pToast('⚠️','Mínimo 8 caracteres'); return; }
  if(newPass !== confPass){ pToast('⚠️','Las contraseñas no coinciden'); return; }
  _initSupabase();
  var ok = false;
  if(sbClient){
    try{
      var res = await sbClient.auth.updateUser({password: newPass});
      if(!res.error) ok = true;
    }catch(e){}
  }
  if(!ok){
    // Demo fallback: update local only
    ok = true;
  }
  var email = safeLS('get','velo_user_email');
  if(email){
    try{ localStorage.removeItem('velo_prov_'+email.toLowerCase().replace(/[^a-z0-9]/g,'_')); }catch(e){}
  }
  safeLS('del','velo_needs_pw_change');
  safeLS('set','velo_sb_pass', newPass);
  pToast('✅','¡Contraseña actualizada! 🔒');
  setTimeout(function(){ _loginAndGo(); }, 1400);
}

function _loginAndGo(){
  if(safeLS('get','velo_needs_pw_change') === '1'){ pGoTo('change-password'); return; }
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
      _checkSurveyDue(); // Check if quarterly survey is due
    }, 100);
  }
}

function pSetType(type){
  safeLS('set','velo_user_type', type);
  pGoTo('onboarding');
  setTimeout(_initOnboarding, 60);
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
  var now = new Date();
  var recs = []; try{ recs = JSON.parse(safeLS('get','velo_tc_records')||'[]'); }catch(e){}
  recs.unshift({
    name:      name,
    email:     email,
    timestamp: now.toISOString(),           // full ISO with ms — e.g. 2026-05-18T14:32:07.451Z
    ts_ms:     now.getTime(),               // Unix ms — precise for legal audit
    ip:        '(client-side — ver Supabase logs)', // real IP available in Supabase auth logs
    ua:        navigator.userAgent.slice(0,120),
    version:   '1.0'
  });
  safeLS('set','velo_tc_records', JSON.stringify(recs.slice(0,500)));
  // Also save registration timestamp on user profile
  if(!safeLS('get','velo_registered_ts')){
    safeLS('set','velo_registered_ts', String(now.getTime()));
  }
}

// ── ONBOARDING ─────────────────────────────────────────────────
var _obStep = 0;
var _obDataUser = [
  { emoji:'🌿', title:'Bienvenido/a a Velo', sub:'Tu espacio de apoyo emocional. Personas reales que escuchan, sin juicios y sin costo.' },
  { emoji:'🛡️', title:'Guardianes a tu lado', sub:'Personas de la comunidad con experiencia vivida, disponibles para escucharte cuando más lo necesitás.' },
  { emoji:'📔', title:'Tus herramientas', sub:'Diario emocional, registro de ánimo, sesión de respiración y el Muro de la Felicidad — todo en un lugar.' },
  { emoji:'🤝', title:'Una comunidad real', sub:'Sala de Ayuda, Mensajes al Mar, Círculos de Paz. Nadie debería atravesarlo solo/a.' }
];
var _obDataPro = [
  { emoji:'🩺', title:'Bienvenido/a a Velo', sub:'Conectá tu expertise con personas que necesitan apoyo profesional. Seguro, simple y ético.' },
  { emoji:'📅', title:'Sesiones 1:1 integradas', sub:'Videollamada incorporada, agenda propia y honorarios que vos fijás. Sin intermediarios.' },
  { emoji:'💰', title:'Ingresos transparentes', sub:'El 80% de cada sesión es tuyo. Pagos vía Stripe. Retiro cuando quieras.' },
  { emoji:'🌍', title:'Impacto real', sub:'Tu trabajo ayuda a construir una comunidad de salud mental más accesible para todos.' },
  { emoji:'💙', title:'Programa Solidario', sub:'¿Querés donar 1 sesión gratuita por mes para acompañar a alguien que no puede pagarlo?\n\nLos usuarios en lista de espera te lo agradecen de corazón. Si aceptás, llevás la insignia 💙 Profesional Solidario/a.', solidarity: true }
];
var _obData = _obDataUser;
function _initOnboarding(){
  _obStep = 0;
  var type = safeLS('get','velo_user_type') || 'user';
  _obData = type === 'pro' ? _obDataPro : _obDataUser;
  var dotsEl = document.getElementById('obDots');
  if(dotsEl) dotsEl.innerHTML = _obData.map(function(_,i){ return '<div class="ob-dot'+(i===0?' active':'')+'"></div>'; }).join('');
  _renderOb();
}
function _renderOb(){
  var d = _obData[_obStep];
  if(!d) return;
  var em = document.getElementById('obEmoji');
  var ti = document.getElementById('obTitle');
  var su = document.getElementById('obSub');
  if(em) em.textContent = d.emoji;
  if(ti) ti.textContent = d.title;
  if(su) su.style.whiteSpace = 'pre-line';
  if(su) su.textContent = d.sub;
  var dots = document.querySelectorAll('#obDots .ob-dot');
  dots.forEach(function(dot, i){ dot.classList.toggle('active', i === _obStep); });
  var skip = document.getElementById('obSkip');
  var next = document.getElementById('obNext');
  var solBtns = document.getElementById('obSolidarityBtns');
  if(d.solidarity){
    // Solidarity slide: show YES/NO, hide normal navigation
    if(next) next.style.display = 'none';
    if(skip) skip.style.display = 'none';
    if(!solBtns){
      var btnWrap = document.createElement('div');
      btnWrap.id = 'obSolidarityBtns';
      btnWrap.style.cssText = 'display:flex;flex-direction:column;gap:10px;margin-top:8px;width:100%';
      btnWrap.innerHTML = '<button class="p-btn p-btn--dark-white p-btn--lg" style="width:100%" onclick="pSolidarityChoice(true)">💙 Sí, quiero participar</button>'
        +'<button class="p-btn p-btn--ghost p-btn--md" style="width:100%;color:rgba(255,255,255,.6)" onclick="pSolidarityChoice(false)">Ahora no, gracias</button>';
      if(next) next.parentNode.insertBefore(btnWrap, next);
    } else {
      solBtns.style.display = 'flex';
    }
  } else {
    if(solBtns) solBtns.style.display = 'none';
    if(_obStep === _obData.length - 1){
      if(next){ next.textContent = 'Siguiente →'; next.style.display = ''; }
      if(skip) skip.style.display = '';
    } else {
      if(next){ next.textContent = 'Siguiente →'; next.style.display = ''; }
      if(skip) skip.style.display = '';
    }
  }
}
function pNextOnboarding(){
  if(_obStep < _obData.length - 1){ _obStep++; _renderOb(); }
  else { pFinishOnboarding(); }
}
function pSolidarityChoice(yes){
  safeLS('set','velo_pro_solidarity', yes ? '1' : '0');
  if(yes) pToast('💙','¡Gracias! Llevás la insignia de Profesional Solidario/a');
  pFinishOnboarding();
}
function pFinishOnboarding(){
  var type = safeLS('get','velo_user_type') || 'user';
  pGoTo(type === 'pro' ? 'pro-reg' : 'register');
}

// ── HOME DATA ──────────────────────────────────────────────────
function _loadHomeData(){
  var d = new Date();
  var h = d.getHours();
  var greet = (h < 6 || h >= 20) ? 'Buenas noches 🌙' : h < 12 ? 'Buenos días 🌿' : 'Buenas tardes 🌤️';
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
  if(ha){ _renderAvatarEl('homeAv', av); }

  // Guardian button in home header
  var gWrap = document.getElementById('homeGuardianWrap');
  var gBtn  = document.getElementById('homeGuardianBtn');
  var isOn  = safeLS('get','velo_is_guardian') === 'true';
  if(gWrap) gWrap.style.display = 'flex';
  if(gBtn){
    gBtn.style.background   = isOn ? 'rgba(116,198,157,.2)' : 'var(--sage7)';
    gBtn.style.borderColor  = isOn ? 'rgba(116,198,157,.5)' : 'rgba(116,198,157,.25)';
    gBtn.style.color        = isOn ? 'var(--sage2)' : 'var(--ink4)';
    gBtn.textContent        = isOn ? '🟢 Guardián' : '🛡️ Guardián';
  }
  // Update label
  var gLabel = gWrap ? gWrap.querySelector('span') : null;
  if(gLabel) gLabel.textContent = isOn ? 'Activo' : 'Activarme';

  // Today's mood
  _loadTodayMoodHome();
  _updateHomeCurrentMoodLine();
  _updateSidebarUser();
  _renderPersonalizedSuggestions();
  _updateHomeBell();
  // Daily quote in home header (Gemini, cached per day)
  setTimeout(_loadDailyMotivationalQuote, 200);
  // Daily greeting — only once per day, with a slight delay so the page renders first
  setTimeout(_checkDailyGreeting, 900);
}

function _updateHomeBell(){
  var msgs = []; try{ msgs = JSON.parse(safeLS('get','velo_inbox')||'[]'); }catch(e){}
  var unread = msgs.filter(function(m){ return !m.leido; }).length;
  var label  = unread > 9 ? '9+' : String(unread);
  // Home bell badge
  var bell = document.getElementById('homeBellBadge');
  if(bell){ bell.style.display = unread > 0 ? 'block' : 'none'; bell.textContent = label; }
  // Home buzón card badge
  var buzón = document.getElementById('homeBuzónBadge');
  if(buzón){ buzón.style.display = unread > 0 ? 'block' : 'none'; buzón.textContent = label; }
  // Sidebar inbox badge
  var snBadge = document.getElementById('sn-inbox-badge');
  if(snBadge){ snBadge.textContent = unread > 0 ? '!' : ''; snBadge.classList.toggle('p-hidden', unread === 0); }
}

function _updateInboxDot(){
  _updateHomeBell();
}

function pTogglePassVis(id, btn){
  var inp = document.getElementById(id);
  if(!inp) return;
  var isPass = inp.type === 'password';
  inp.type = isPass ? 'text' : 'password';
  if(btn) btn.textContent = isPass ? '🙈' : '👁️';
}

function _loadTodayMoodHome(){
  var today = _dateKey();
  var stored = safeLS('get','velo_mood_'+today);
  var emoji = '🌤️';
  if(stored){ try{ var m = JSON.parse(stored); if(m.emoji) emoji = m.emoji; }catch(e){} }
  var me = document.getElementById('homeMoodEmoji');
  if(me) me.textContent = emoji;
}

// ── QUICK MOOD PICKER ─────────────────────────────────────────
var _selectedQuickMoodEmoji = '';

function pQuickMood(){
  var picker = document.getElementById('quickMoodPicker');
  if(!picker) return;
  var isOpen = picker.style.display !== 'none';
  if(isOpen){ pCloseQuickMood(); return; }
  picker.style.display = '';
  _selectedQuickMoodEmoji = '';
  var saveBtn = document.getElementById('quickMoodSaveBtn');
  if(saveBtn) saveBtn.disabled = true;
  document.querySelectorAll('.quick-mood-emoji').forEach(function(b){ b.style.background=''; b.style.transform=''; });
  var inp = document.getElementById('quickMoodPhrase');
  if(inp) inp.value = '';
}

function pCloseQuickMood(){
  var picker = document.getElementById('quickMoodPicker');
  if(picker) picker.style.display = 'none';
}

function pSelectQuickMood(el, emoji, label){
  _selectedQuickMoodEmoji = emoji;
  document.querySelectorAll('.quick-mood-emoji').forEach(function(b){
    b.style.background = '';
    b.style.transform = '';
    b.style.boxShadow = '';
  });
  el.style.background = 'rgba(45,106,79,.12)';
  el.style.transform = 'scale(1.25)';
  el.style.boxShadow = '0 0 0 2px var(--sage4)';
  var saveBtn = document.getElementById('quickMoodSaveBtn');
  if(saveBtn) saveBtn.disabled = false;
}

function pSaveQuickMood(){
  if(!_selectedQuickMoodEmoji) return;
  var phrase = (document.getElementById('quickMoodPhrase')||{}).value || '';
  var today = _dateKey();
  var labels = {'😄':'Muy bien','😊':'Bien','😐':'Regular','😞':'Mal','😢':'Muy mal'};
  var moodObj = { emoji: _selectedQuickMoodEmoji, label: labels[_selectedQuickMoodEmoji]||'', note: phrase.trim(), ts: Date.now() };
  safeLS('set','velo_mood_'+today, JSON.stringify(moodObj));
  // Update mood log for suggestions
  var log = []; try{ log = JSON.parse(safeLS('get','velo_mood_log')||'[]'); }catch(e){}
  log.unshift(moodObj); safeLS('set','velo_mood_log', JSON.stringify(log.slice(0,90)));
  // Update UI
  var moodLine = document.getElementById('homeCurrentMoodLine');
  if(moodLine) moodLine.textContent = _selectedQuickMoodEmoji + ' ' + (labels[_selectedQuickMoodEmoji]||'') + (phrase.trim() ? ' — ' + phrase.trim() : '');
  pCloseQuickMood();
  pToast(_selectedQuickMoodEmoji, 'Estado de ánimo guardado 💚');
}

// ── MI ESTADO VISIBLE ──────────────────────────────────────────
function pOpenMyStatus(){
  var music  = safeLS('get','velo_status_music')  || '';
  var book   = safeLS('get','velo_status_book')   || '';
  var phrase = safeLS('get','velo_status_phrase') || '';
  var m = document.getElementById('statusMusic');
  var b = document.getElementById('statusBook');
  var p = document.getElementById('statusPhrase');
  if(m) m.value = music;
  if(b) b.value = book;
  if(p) p.value = phrase;
  openModal('myStatusOv');
}

function pSaveMyStatus(){
  var music  = (document.getElementById('statusMusic')||{}).value  || '';
  var book   = (document.getElementById('statusBook')||{}).value   || '';
  var phrase = (document.getElementById('statusPhrase')||{}).value || '';
  safeLS('set','velo_status_music',  music.trim());
  safeLS('set','velo_status_book',   book.trim());
  safeLS('set','velo_status_phrase', phrase.trim());
  closeModal('myStatusOv');
  pToast('✨', 'Estado actualizado y visible en tu perfil 💚');
}

// ── DAILY MOTIVATIONAL QUOTE (home, below greeting) ────────────
var _dailyQuoteFallbacks = [
  'Hoy es un nuevo comienzo. Cada momento es una oportunidad para ser amable con vos mismo/a 🌱',
  'El coraje no es no tener miedo — es seguir adelante a pesar de él. Acá estamos con vos 💚',
  'Pequeños pasos también son pasos. Todo avance cuenta, sin importar el tamaño ✨',
  'Tu historia no terminó. Todavía quedan páginas hermosas por escribir 🌸',
  'Está bien no estar bien. Lo importante es que no estás solo/a 🫂',
  'La calma es una práctica, no un destino. Respirá, estás más cerca de lo que creés 🌿',
  'Hoy, un solo gesto de amabilidad hacia vos mismo/a puede cambiarlo todo 💙',
  'Las raíces más fuertes crecen en las tormentas. Confiá en tu proceso 🌳',
  'Mereces exactamente el mismo amor que le das a los demás 🌺',
  'Cada día que abrís los ojos es una nueva oportunidad. Ese es el regalo de hoy 🌅',
  'La vulnerabilidad no es debilidad — es el punto de partida del verdadero cambio 💫',
  'No tenés que tenerlo todo resuelto hoy. Solo el próximo paso 🌊',
  'Tu bienestar importa. Cuidarte no es egoísta — es necesario 🌱',
  'Hay fuerza en pedir ayuda. No lo olvidés 💚',
  'Este momento, con todo lo que trae, también va a pasar. Y vos vas a estar bien ✨'
];

async function _loadDailyMotivationalQuote(){
  var el = document.getElementById('homeDailyQuote');
  if(!el) return;
  var today = new Date().toISOString().slice(0,10);
  var cacheKey = 'velo_daily_quote_'+today;
  var cached = safeLS('get', cacheKey);
  if(cached){ el.textContent = cached; return; }
  // Generate with Gemini
  var d = new Date();
  var dias = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  var prompt = 'Escribí una frase corta, poética y motivadora para alguien que atraviesa un momento difícil. '
    +'Hoy es '+dias[d.getDay()]+'. '
    +'La frase debe ser genuina, cálida y esperanzadora — no un cliché. '
    +'Español rioplatense. Máximo 20 palabras. Podés terminar con un emoji suave. '
    +'Solo la frase, sin comillas.';
  var msg = await _geminiCall(prompt, { temperature:0.95, maxOutputTokens:60 });
  if(!msg || msg.length > 180){
    var fallbackIdx = (new Date().getDate() + new Date().getMonth()) % _dailyQuoteFallbacks.length;
    msg = _dailyQuoteFallbacks[fallbackIdx];
  }
  safeLS('set', cacheKey, msg);
  el.textContent = msg;
}

function _updateHomeCurrentMoodLine(){
  var el = document.getElementById('homeCurrentMoodLine');
  if(!el) return;
  var today = _dateKey();
  var stored = safeLS('get','velo_mood_'+today);
  if(stored){
    try{
      var m = JSON.parse(stored);
      var labels = {'😄':'Muy bien','😊':'Bien','😐':'Regular','😞':'Mal','😢':'Muy mal'};
      el.textContent = m.emoji + ' ' + (labels[m.emoji]||m.label||'') + (m.note ? ' — '+m.note : '');
      return;
    }catch(e){}
  }
  el.textContent = 'Tocá para registrar cómo te sentís ✨';
}

function _updateSidebarUser(){
  var name = safeLS('get','velo_user_name') || 'Usuario';
  var av   = safeLS('get','velo_user_av') || '🧑';
  var plan = _isPremium() ? '⭐ Velo Plus' : 'Plan Gratuito';
  var sn = document.getElementById('sidebarUserName');
  var sa = document.getElementById('sidebarUserAv');
  var sp = document.getElementById('sidebarUserPlan');
  if(sn) sn.textContent = name;
  if(sa){
    var isImg = av && (av.startsWith('data:') || av.startsWith('http'));
    if(isImg){
      sa.style.backgroundImage = 'url('+av+')';
      sa.style.backgroundSize  = 'cover';
      sa.style.backgroundPosition = 'center';
      sa.style.backgroundRepeat = 'no-repeat';
      sa.style.fontSize = '0';
      sa.textContent = '';
    } else {
      sa.style.backgroundImage = '';
      sa.style.fontSize = '';
      sa.textContent = av;
    }
  }
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
// Guardianes = usuarios de la comunidad que se ofrecen a acompañar a otros.
// No son profesionales. Su nivel (badge) sube con cada conversación completada.
function _getBadge(convs){
  if(convs >= 100) return { icon:'💎', name:'Diamante', color:'#7B68EE', next:null,   needed:0   };
  if(convs >= 40)  return { icon:'🥇', name:'Oro',      color:'#C8A200', next:'Diamante', needed:100-convs };
  if(convs >= 20)  return { icon:'🥈', name:'Plata',    color:'#8892A4', next:'Oro',      needed:40-convs  };
  if(convs >= 5)   return { icon:'🥉', name:'Bronce',   color:'#C07840', next:'Plata',    needed:20-convs  };
  return             { icon:'🌱', name:'Novato',   color:'var(--sage4)', next:'Bronce', needed:5-convs };
}

var _guardianProfiles = [
  { id:'g1', name:'Ana Luz',     av:'🌸', bio:'Pasé por momentos muy difíciles con la ansiedad y encontré el camino. Estoy aquí para escucharte sin juzgar, desde la experiencia propia.', status:'on',   convs:89,  recommend:142, rating:4.9, tags:['ansiedad','estrés','duelo'],
    reviews:[
      { txt:'Ana me ayudó a encontrar calma cuando más lo necesitaba. Nunca me sentí sola.', auth:'Lucía M.', stars:5 },
      { txt:'Escucha de verdad. No da consejos vacíos, simplemente está presente.', auth:'Valentina R.', stars:5 },
      { txt:'Hablé cosas que nunca dije en voz alta. Fue un alivio enorme.', auth:'Paula S.', stars:5 },
      { txt:'Muy empática y paciente. Me acompañó en un momento muy oscuro.', auth:'Marcela F.', stars:5 },
      { txt:'No sé qué hubiera hecho sin este espacio. Gracias Ana.', auth:'Usuario Anónimo', stars:5 }
    ], mood:'Disponible ahora' },
  { id:'g2', name:'Carlos R.',   av:'🌊', bio:'Sé lo que es sentirse solo en la oscuridad. Acompaño desde la empatía real, sin rodeos, sin apuro. Viví situaciones difíciles y quiero ayudarte.',      status:'on',   convs:63,  recommend:98,  rating:4.8, tags:['depresión','soledad','cambios'],
    reviews:[
      { txt:'Con Carlos pude hablar de cosas que nunca había dicho en voz alta.', auth:'Martín P.', stars:5 },
      { txt:'Me escuchó sin juzgar. Se notaba que entendía desde adentro.', auth:'Santiago G.', stars:5 },
      { txt:'Muy honesto y directo. Exactamente lo que necesitaba.', auth:'Rodrigo M.', stars:4 },
      { txt:'Gracias por estar disponible en ese momento tan duro.', auth:'Usuario Anónimo', stars:5 },
      { txt:'Me ayudó a ver las cosas desde otro ángulo sin presionarme.', auth:'Nicolás V.', stars:4 }
    ], mood:'Tranquilo hoy' },
  { id:'g3', name:'Valentina S.',av:'🦋', bio:'Viví de cerca el duelo y los cambios de familia. Cada historia merece ser escuchada con el tiempo que necesita, sin apuro.', status:'busy', convs:134, recommend:215, rating:5.0, tags:['familia','pérdida','crianza'],
    reviews:[
      { txt:'Valentina tiene una capacidad enorme para sostener el dolor ajeno.', auth:'Ana G.', stars:5 },
      { txt:'Hablar con ella fue como recibir un abrazo. Muy recomendada.', auth:'Florencia T.', stars:5 },
      { txt:'Entendió mi situación de familia sin que tuviera que explicar demasiado.', auth:'Carla N.', stars:5 },
      { txt:'Paciente, cálida y genuina. No puede pedir más en estos momentos.', auth:'Jimena L.', stars:5 },
      { txt:'Me acompañó en el duelo de una manera que nunca esperé encontrar online.', auth:'Usuario Anónimo', stars:5 }
    ], mood:'En conversación' },
  { id:'g4', name:'Tomás L.',    av:'🌿', bio:'Aprendí a parar la pelota con mindfulness cuando el burnout me desbordó. Te ayudo a respirar antes de reaccionar, desde lo que a mí me funcionó.', status:'on', convs:45, recommend:76, rating:4.7, tags:['mindfulness','burnout','trabajo'],
    reviews:[
      { txt:'Tomás me enseñó a respirar antes de reaccionar.', auth:'Diego F.', stars:5 },
      { txt:'Muy tranquilo y ordenado. Me ayudó a bajar la ansiedad laboral.', auth:'Facundo H.', stars:4 },
      { txt:'Práctico y concreto. Sin vueltas. Justo lo que necesitaba.', auth:'Ignacio B.', stars:5 },
      { txt:'Me dio herramientas reales que uso todos los días.', auth:'Usuario Anónimo', stars:4 },
      { txt:'Hablar con él fue como darle un descanso a mi cabeza.', auth:'Matías C.', stars:5 }
    ], mood:'Abierto a charlar' },
  { id:'g5', name:'Sofía N.',    av:'🌙', bio:'Las noches difíciles no deberían atravesarse solas. Estoy especialmente disponible cuando el mundo duerme, porque yo también conocí esos momentos.', status:'on',   convs:112, recommend:189, rating:4.9, tags:['insomnio','angustia','noche'],
    reviews:[
      { txt:'Encontrar a alguien disponible a las 3am fue un regalo.', auth:'Renata V.', stars:5 },
      { txt:'Sofía entiende lo que es la angustia nocturna. No hay que explicar mucho.', auth:'Agustina M.', stars:5 },
      { txt:'Me ayudó a calmarme en una noche muy difícil. Eternamente agradecida.', auth:'Usuario Anónimo', stars:5 },
      { txt:'Muy presente, muy cálida. Sabe cuándo hablar y cuándo simplemente escuchar.', auth:'Luciana P.', stars:5 },
      { txt:'Gracias por existir en este espacio. Te salvé a mi lista de favoritos.', auth:'Daniela R.', stars:4 }
    ], mood:'Disponible de noche' },
  { id:'g6', name:'Emilio T.',   av:'🏔️', bio:'Entiendo el peso del trauma y la crisis desde adentro. Acompaño sin prisa, paso a paso, porque sé lo que cuesta dar el primer paso.',  status:'off',  convs:38,  recommend:54,  rating:4.6, tags:['trauma','crisis','resiliencia'],
    reviews:[
      { txt:'Emilio me ayudó a entender que lo que sentía era válido.', auth:'Camila H.', stars:5 },
      { txt:'Muy serio y comprometido. Notás que lo hace de corazón.', auth:'Sebastián T.', stars:4 },
      { txt:'Me acompañó en un momento de crisis sin juzgarme. Gracias.', auth:'Usuario Anónimo', stars:5 },
      { txt:'Habla desde la experiencia propia. Eso hace toda la diferencia.', auth:'Gonzalo R.', stars:5 },
      { txt:'Pausado, tranquilo, sin apuro. Exactamente lo que necesitaba.', auth:'Tomás A.', stars:4 }
    ], mood:'Descansando' }
];

var _curGuardian = null;
var _guardianFilter = 'all';
var _myGuardianStatus = safeLS('get','velo_guardian_status') || 'disponible'; // disponible/ocupado/incognito
var _guardianHeartbeatTimer = null;

async function _updateGuardianPresence(status){
  if(safeLS('get','velo_is_guardian') !== 'true') return;
  _initSupabase();
  if(!sbClient) return;
  var uid  = _myUserId ? _myUserId() : (safeLS('get','velo_user_email')||'guest');
  var name = safeLS('get','velo_user_name') || 'Guardián';
  var av   = safeLS('get','velo_user_av')   || '💚';
  var bio  = safeLS('get','velo_guardian_bio') || '';
  var tagsRaw = safeLS('get','velo_guardian_tags') || '';
  var tags = tagsRaw ? tagsRaw.split(',').map(function(t){ return t.trim(); }).filter(Boolean) : [];
  var convs = parseInt(safeLS('get','velo_guardian_convs')||'0', 10);
  try{
    await sbClient.from('guardian_presence').upsert(
      { user_id: uid, name: name, avatar: av, bio: bio, tags: tags,
        status: status, last_seen: new Date().toISOString(), convs: convs, rating: 5.0 },
      { onConflict: 'user_id' }
    );
  }catch(e){}
}

function _startGuardianHeartbeat(){
  if(safeLS('get','velo_is_guardian') !== 'true') return;
  if(_guardianHeartbeatTimer) return;
  _updateGuardianPresence('disponible');
  _guardianHeartbeatTimer = setInterval(function(){ _updateGuardianPresence('disponible'); }, 60000);
}

function _stopGuardianHeartbeat(){
  if(_guardianHeartbeatTimer){ clearInterval(_guardianHeartbeatTimer); _guardianHeartbeatTimer = null; }
}

function pHomeToggleGuardian(){
  var wasOn = safeLS('get','velo_is_guardian') === 'true';
  if(!wasOn){
    // Turning ON — show profile setup modal if bio not filled yet
    var bio = safeLS('get','velo_guardian_bio') || '';
    if(!bio.trim()){
      pShowGuardianSetupModal();
      return;
    }
  }
  pToggleGuardianMode();
  setTimeout(function(){
    var isOn  = safeLS('get','velo_is_guardian') === 'true';
    var gBtn  = document.getElementById('homeGuardianBtn');
    var gWrap = document.getElementById('homeGuardianWrap');
    if(gBtn){
      gBtn.style.background  = isOn ? 'rgba(116,198,157,.2)' : 'var(--sage7)';
      gBtn.style.borderColor = isOn ? 'rgba(116,198,157,.5)' : 'rgba(116,198,157,.25)';
      gBtn.style.color       = isOn ? 'var(--sage2)' : 'var(--ink4)';
      gBtn.textContent       = isOn ? '🟢 Guardián' : '🛡️ Guardián';
    }
    var gLabel = gWrap ? gWrap.querySelector('span') : null;
    if(gLabel) gLabel.textContent = isOn ? 'Activo' : 'Activarme';
  }, 50);
}

function pShowGuardianSetupModal(){
  var existing = document.getElementById('guardianSetupOv');
  if(existing) existing.remove();
  var ov = document.createElement('div');
  ov.className = 'p-modal-ov show';
  ov.id = 'guardianSetupOv';
  var savedBio  = safeLS('get','velo_guardian_bio')  || '';
  var savedTags = safeLS('get','velo_guardian_tags') || '';
  ov.innerHTML = '<div class="p-sheet">'
    +'<div class="p-sheet-handle"></div>'
    +'<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">'
    +'<span style="font-size:26px">🛡️</span>'
    +'<div>'
    +'<div style="font-size:16px;font-weight:700;color:var(--ink)">Modo guardián</div>'
    +'<div style="font-size:12px;color:var(--ink4)">Aparecer disponible para acompañar</div>'
    +'</div>'
    +'</div>'
    +'<div style="font-size:10px;font-weight:700;color:var(--sage);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px">Tu mensaje de bienvenida</div>'
    +'<textarea id="guardianSetupBio" rows="4" placeholder="¿Desde qué experiencia querés acompañar?" style="width:100%;background:var(--cream2);border:1.5px solid var(--border2);border-radius:12px;padding:12px;font-size:13px;color:var(--ink);font-family:\'Jost\',sans-serif;resize:none;box-sizing:border-box;margin-bottom:14px">'+_escHtml(savedBio)+'</textarea>'
    +'<div style="font-size:10px;font-weight:700;color:var(--sage);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px">Temas (separados por coma)</div>'
    +'<input id="guardianSetupTags" type="text" placeholder="ej: ansiedad, duelo, soledad" value="'+_escHtml(savedTags)+'" style="width:100%;background:var(--cream2);border:1.5px solid var(--border2);border-radius:12px;padding:12px;font-size:13px;color:var(--ink);font-family:\'Jost\',sans-serif;box-sizing:border-box;margin-bottom:20px">'
    +'<button class="p-btn p-btn--primary p-btn--lg p-btn--full" onclick="pSaveGuardianSetup()" style="margin-bottom:10px">Guardar perfil de guardián</button>'
    +'<button class="p-btn p-btn--secondary p-btn--md p-btn--full" onclick="document.getElementById(\'guardianSetupOv\').remove()">Cancelar</button>'
    +'</div>';
  document.body.appendChild(ov);
  ov.addEventListener('click', function(e){ if(e.target===ov) ov.remove(); });
  setTimeout(function(){ var t = document.getElementById('guardianSetupBio'); if(t) t.focus(); }, 200);
}

function pSaveGuardianSetup(){
  var bio  = (document.getElementById('guardianSetupBio')  || {}).value || '';
  var tags = (document.getElementById('guardianSetupTags') || {}).value || '';
  safeLS('set','velo_guardian_bio',  bio.trim());
  safeLS('set','velo_guardian_tags', tags.trim());
  _updateGuardianPresence('disponible');
  var existing = document.getElementById('guardianSetupOv');
  if(existing) existing.remove();
  // Now actually activate guardian mode
  pToggleGuardianMode();
  setTimeout(function(){
    var isOn  = safeLS('get','velo_is_guardian') === 'true';
    var gBtn  = document.getElementById('homeGuardianBtn');
    var gWrap = document.getElementById('homeGuardianWrap');
    if(gBtn){
      gBtn.style.background  = isOn ? 'rgba(116,198,157,.2)' : 'var(--sage7)';
      gBtn.style.borderColor = isOn ? 'rgba(116,198,157,.5)' : 'rgba(116,198,157,.25)';
      gBtn.style.color       = isOn ? 'var(--sage2)' : 'var(--ink4)';
      gBtn.textContent       = isOn ? '🟢 Guardián' : '🛡️ Guardián';
    }
    var gLabel = gWrap ? gWrap.querySelector('span') : null;
    if(gLabel) gLabel.textContent = isOn ? 'Activo' : 'Activarme';
  }, 80);
  pToast('🛡️','Perfil guardado. ¡Aparecés como guardián disponible!');
}

function pToggleGuardianMode(){
  var isOn = safeLS('get','velo_is_guardian') === 'true';
  var next = !isOn;
  safeLS('set','velo_is_guardian', next ? 'true' : 'false');
  var tog = document.getElementById('guardianModeTog');
  if(tog) tog.classList.toggle('on', next);
  var details = document.getElementById('guardianModeDetails');
  if(details) details.style.display = next ? '' : 'none';
  if(next){
    _startGuardianHeartbeat();
    pToast('🛡️','¡Aparecés como guardián disponible!');
  } else {
    _updateGuardianPresence('offline');
    _stopGuardianHeartbeat();
    pToast('👤','Ya no aparecés en la lista de guardianes');
  }
}

function pSaveGuardianBio(){
  var bioEl  = document.getElementById('guardianBioInput');
  var tagsEl = document.getElementById('guardianTagsInput');
  if(bioEl)  safeLS('set','velo_guardian_bio',  bioEl.value.trim());
  if(tagsEl) safeLS('set','velo_guardian_tags', tagsEl.value.trim());
  _updateGuardianPresence('disponible');
  pToast('💚','Perfil de guardián actualizado');
}

function _initGuardianToggleUI(){
  var isOn = safeLS('get','velo_is_guardian') === 'true';
  var tog = document.getElementById('guardianModeTog');
  if(tog) tog.classList.toggle('on', isOn);
  var details = document.getElementById('guardianModeDetails');
  if(details) details.style.display = isOn ? '' : 'none';
  var bioEl  = document.getElementById('guardianBioInput');
  var tagsEl = document.getElementById('guardianTagsInput');
  if(bioEl)  bioEl.value  = safeLS('get','velo_guardian_bio')  || '';
  if(tagsEl) tagsEl.value = safeLS('get','velo_guardian_tags') || '';
}

function pSetMyGuardianStatus(status){
  _myGuardianStatus = status;
  safeLS('set','velo_guardian_status', status);
  pRenderGuardians();
  _renderMyStatusBar();
  pToast(status==='disponible'?'🟢':status==='ocupado'?'🟡':'👤', 'Estado: '+(status==='disponible'?'Disponible':status==='ocupado'?'Ocupado':'Anónimo'));
}

function _renderMyStatusBar(){
  var el = document.getElementById('myGuardianStatus');
  if(!el) return;
  var st = _myGuardianStatus;
  el.innerHTML = '<div style="background:rgba(255,255,255,.7);border:1.5px solid var(--border);border-radius:14px;padding:12px 16px;display:flex;align-items:center;gap:12px">'
    +'<div style="font-size:11px;font-weight:700;color:var(--ink4);letter-spacing:.5px">MI ESTADO</div>'
    +'<div style="display:flex;gap:6px;margin-left:auto">'
    +'<button onclick="pSetMyGuardianStatus(\'disponible\')" style="font-size:11px;padding:5px 10px;border-radius:100px;border:1.5px solid '+(st==='disponible'?'var(--sage2)':'var(--border2)')+';background:'+(st==='disponible'?'var(--sage7)':'none')+';color:'+(st==='disponible'?'var(--sage)':'var(--ink4)')+';cursor:pointer;font-family:\'Jost\',sans-serif;font-weight:700">🟢 Disponible</button>'
    +'<button onclick="pSetMyGuardianStatus(\'ocupado\')" style="font-size:11px;padding:5px 10px;border-radius:100px;border:1.5px solid '+(st==='ocupado'?'#C8A200':'var(--border2)')+';background:'+(st==='ocupado'?'rgba(200,162,0,.1)':'none')+';color:'+(st==='ocupado'?'#C8A200':'var(--ink4)')+';cursor:pointer;font-family:\'Jost\',sans-serif;font-weight:700">🟡 Ocupado</button>'
    +'<button onclick="pSetMyGuardianStatus(\'incognito\')" style="font-size:11px;padding:5px 10px;border-radius:100px;border:1.5px solid '+(st==='incognito'?'var(--ink3)':'var(--border2)')+';background:'+(st==='incognito'?'rgba(0,0,0,.06)':'none')+';color:'+(st==='incognito'?'var(--ink)':'var(--ink4)')+';cursor:pointer;font-family:\'Jost\',sans-serif;font-weight:700">👤 Anónimo</button>'
    +'</div>'
    +'</div>';
}

function pFilterGuardians(filter, btn){
  _guardianFilter = filter;
  document.querySelectorAll('#guardianStatusBar button').forEach(function(b){ b.classList.remove('guardian-status-active'); b.style.borderColor=''; b.style.background=''; });
  if(btn){ btn.style.borderColor='var(--sage2)'; btn.style.background='var(--sage7)'; }
  pRenderGuardians();
}

async function pRenderGuardians(){
  _renderMyStatusBar();
  var list = document.getElementById('guardiansList');
  if(!list) return;

  // Try to load live guardians from Supabase
  var liveGuardians = [];
  _initSupabase();
  if(sbClient){
    try{
      var cutoff = new Date(Date.now() - 3*60*1000).toISOString(); // active in last 3 min
      var { data } = await sbClient.from('guardian_presence')
        .select('*').neq('status','offline').gte('last_seen', cutoff);
      if(data && data.length){
        liveGuardians = data.map(function(r, i){
          return { id: 'live_'+i, name: r.name, av: r.avatar, bio: r.bio||'',
            tags: Array.isArray(r.tags)?r.tags:[], status: r.status,
            convs: r.convs||0, rating: r.rating||5.0, reviews:[], recommend: r.convs||0 };
        });
      }
    }catch(e){}
  }

  // Merge: live users first, then demo profiles not duplicated
  var combined = liveGuardians.length ? liveGuardians : _guardianProfiles;
  var filtered = combined.filter(function(g){
    if(_guardianFilter === 'disponible') return g.status === 'disponible';
    if(_guardianFilter === 'ocupado') return g.status === 'ocupado';
    return true;
  });
  if(!filtered.length){
    list.innerHTML = '<div class="p-empty"><span class="p-empty-emoji">🛡️</span><div class="p-empty-title">Sin guardianes en este estado</div><div class="p-empty-sub">Probá otro filtro</div></div>';
    return;
  }
  list.innerHTML = filtered.map(function(g){
    var badge = _getBadge(g.convs||0);
    var statusColor = g.status==='disponible'?'var(--st-on)':g.status==='ocupado'?'#C8A200':'rgba(150,150,150,.5)';
    var statusLabel = g.status==='disponible'?'Disponible':g.status==='ocupado'?'Ocupado':'Anónimo';
    var isAnon = g.status==='incognito';
    return '<div class="p-guardian-card" onclick="'+(isAnon?'pToast(\'👤\',\'Este guardián está en modo anónimo\')':'pOpenGuardian(\''+g.id+'\')')+'"><div style="display:flex;align-items:center;gap:14px"><div style="position:relative;font-size:38px;flex-shrink:0">'+(isAnon?'👤':g.av)+'<span style="position:absolute;bottom:-2px;right:-2px;width:12px;height:12px;border-radius:50%;background:'+statusColor+';border:2px solid #fff;box-shadow:0 0 4px '+statusColor+'"></span></div><div style="flex:1;min-width:0"><div style="display:flex;align-items:center;gap:8px;margin-bottom:3px"><span style="font-size:15px;font-weight:700;color:var(--ink)">'+(isAnon?'Guardián Anónimo':g.name)+'</span><span style="font-size:14px">'+badge.icon+'</span></div><div style="font-size:12px;color:var(--sage3);font-weight:600;margin-bottom:4px">'+statusLabel+' · '+g.convs+' conversaciones</div><p style="font-size:12px;color:var(--ink4);line-height:1.5;margin:0">'+(isAnon?'Disponible de forma anónima':g.bio)+'</p></div><button class="p-btn p-btn--primary p-btn--sm" onclick="event.stopPropagation();'+(g.status==='ocupado'?'pToast(\'🟡\',\''+g.name+' está ocupado/a ahora\')':'pOpenGuardian(\''+g.id+'\')')+'">'+(g.status==='ocupado'?'Ocupado/a':'Solicitar')+'</button></div></div>';
  }).join('');
}

function pOpenGuardian(id){
  _curGuardian = _guardianProfiles.find(function(g){ return g.id === id; });
  if(!_curGuardian) return;
  var g = _curGuardian;
  _setEl('gdName', g.name);
  _setEl('gdNameBig', g.name);
  _setEl('gdAv', g.av);
  _setEl('gdBio', '"'+g.bio+'"');
  _setEl('gdDesc', g.bio);
  _setEl('gdRecommend', g.recommend);
  _setEl('gdConvs', g.convs);
  _setEl('gdRating', g.rating);
  var badge = _getBadge(g.convs);
  var pct = badge.next ? Math.round(((g.convs - (g.convs >= 40 ? (g.convs >= 100 ? 100 : 40) : (g.convs >= 20 ? 20 : (g.convs >= 5 ? 5 : 0)))) / badge.needed) * 100) : 100;
  // simpler progress: show how far into current tier
  var tierBase = g.convs >= 100 ? 100 : g.convs >= 40 ? 40 : g.convs >= 20 ? 20 : g.convs >= 5 ? 5 : 0;
  var tierTop  = g.convs >= 100 ? 999 : g.convs >= 40 ? 100 : g.convs >= 20 ? 40 : g.convs >= 5 ? 20 : 5;
  var tierPct  = badge.next ? Math.min(100, Math.round((g.convs - tierBase) / (tierTop - tierBase) * 100)) : 100;
  var badgeHtml = '<div style="display:flex;align-items:center;gap:10px;background:rgba(255,255,255,.7);border:1px solid rgba(0,0,0,.07);border-radius:14px;padding:12px 16px;margin-bottom:14px">'
    +'<span style="font-size:28px">'+badge.icon+'</span>'
    +'<div style="flex:1;min-width:0">'
    +'<div style="font-size:13px;font-weight:700;color:var(--ink)">Guardián '+badge.name+'</div>'
    +'<div style="font-size:11px;color:var(--ink4);margin-bottom:6px">'+g.convs+' conversaciones completadas</div>'
    +'<div style="height:5px;background:var(--cream2);border-radius:99px;overflow:hidden">'
    +'<div style="height:100%;width:'+tierPct+'%;background:'+badge.color+';border-radius:99px;transition:width .6s"></div>'
    +'</div>'
    +(badge.next ? '<div style="font-size:10px;color:var(--ink5);margin-top:4px">'+badge.needed+' conversaciones para '+badge.next+'</div>' : '<div style="font-size:10px;color:var(--ink5);margin-top:4px">Nivel máximo ✨</div>')
    +'</div></div>';
  var badgeEl = document.getElementById('gdBadge');
  if(badgeEl) badgeEl.innerHTML = badgeHtml;
  var stPill = document.getElementById('gdStatusPill');
  if(stPill){
    if(g.status === 'on'){
      stPill.innerHTML = '<span class="p-pill p-pill--live"><span class="p-ldot p-ldot--on"></span> Disponible</span>';
    } else if(g.status === 'busy'){
      stPill.innerHTML = '<span class="p-pill" style="background:rgba(212,128,32,.1);color:var(--st-busy);border:1px solid rgba(212,128,32,.2)">⏳ En conversación</span>';
    } else {
      stPill.innerHTML = '<span class="p-pill" style="background:rgba(144,152,160,.1);color:var(--st-off)">● Descansando</span>';
    }
  }
  var tagsEl = document.getElementById('gdMoodTags');
  if(tagsEl) tagsEl.innerHTML = g.tags.map(function(t){ return '<span class="p-tag">'+t+'</span>'; }).join('');
  var askBtn = document.getElementById('gdAskBtn');
  if(askBtn){
    if(g.status === 'off'){
      askBtn.disabled = true;
      askBtn.textContent = '😴 No disponible ahora';
    } else if(g.status === 'busy'){
      askBtn.disabled = true;
      askBtn.textContent = '⏳ En conversación';
    } else {
      askBtn.disabled = false;
      askBtn.innerHTML = '💚 Pedir acompañamiento';
    }
  }
  var rvEl = document.getElementById('gdReviews');
  if(rvEl){
    var rvs = g.reviews || (g.review ? [g.review] : []);
    var maxShow = Math.min(rvs.length, 10);
    var starsMap = function(n){ return '⭐'.repeat(n||5); };
    rvEl.innerHTML = rvs.slice(0, maxShow).map(function(r){
      return '<div class="p-review-card" style="margin-bottom:12px"><div class="p-row" style="margin-bottom:6px"><span style="font-size:13px">'+starsMap(r.stars)+'</span></div><p class="p-rv-txt">&#8220;'+r.txt+'&#8221;</p><div style="font-size:11px;color:var(--ink5)">— '+r.auth+'</div></div>';
    }).join('') || '<p class="p-sm p-muted">Sin reseñas aún.</p>';
  }
  pGoTo('guardian-detail');
}

function pAskGuardian(){
  if(!_curGuardian) return;
  if(_curGuardian.status === 'off'){ pToast('😴',_curGuardian.name+' está descansando ahora'); return; }
  if(_curGuardian.status === 'busy'){ pToast('⏳',_curGuardian.name+' está en conversación'); return; }
  // Open the request modal
  var ov = document.getElementById('askGuardianOv');
  var lbl = document.getElementById('askGuardianName');
  if(lbl) lbl.textContent = _curGuardian.name;
  var ta = document.getElementById('askGuardianTa');
  if(ta) ta.value = '';
  if(ov) ov.classList.add('show');
}

function pConfirmAskGuardian(){
  if(!_checkDailyLimit('guardian')){
    var ov2 = document.getElementById('askGuardianOv');
    if(ov2) ov2.classList.remove('show');
    pToast('🛡️','Límite gratuito: 4 sesiones de guardián por día. ¡Upgrade a Plus!');
    setTimeout(pShowPlusModal, 1200);
    return;
  }
  _incDailyLimit('guardian');
  safeLS('set','velo_guardian_status','ocupado');
  var ov = document.getElementById('askGuardianOv');
  if(ov) ov.classList.remove('show');
  var guardian = _curGuardian;
  pToast('💚','Solicitud enviada a '+(guardian ? guardian.name : 'el guardián')+'…');
  setTimeout(function(){
    pToast('🌿',(guardian ? guardian.name : 'Tu guardián')+' aceptó acompañarte ✨');
    setTimeout(function(){
      _gcGuardian = guardian;
      pGoTo('guardian-chat');
    }, 600);
  }, 2200);
}

// ── GUARDIAN CHAT ROOM ─────────────────────────────────────────
var _gcMsgs = [];
var _gcGuardian = null;

function _gcInit(){
  _gcMsgs = [];
  var msgEl = document.getElementById('gcMessages');
  if(msgEl) msgEl.innerHTML = '';
  var g = _gcGuardian || { av:'🌿', name:'Tu Guardián/a', bio:'' };
  var gcAv   = document.getElementById('gcAv');
  var gcName = document.getElementById('gcName');
  if(gcAv)   gcAv.textContent   = g.av   || '🌿';
  if(gcName) gcName.textContent = g.name || 'Tu Guardián/a';
  setTimeout(function(){
    _gcAddMsg('¡Hola! Acá estoy, acepté tu solicitud. Estoy acá para escucharte, sin apuros. ¿Cómo te sentís?', false);
  }, 500);
}

function _gcAddMsg(text, isUser){
  _gcMsgs.push({ text:text, user:isUser });
  var msgEl = document.getElementById('gcMessages');
  if(!msgEl) return;
  var g   = _gcGuardian || { av:'🌿', name:'Guardián/a' };
  var div = document.createElement('div');
  div.innerHTML = _buildMsgBubble(text, isUser, g.av||'🌿', g.name, 'gcInput', 'gcReplyBar', '');
  var child = div.firstElementChild;
  if(child) msgEl.appendChild(child);
  msgEl.scrollTop = msgEl.scrollHeight;
}

async function pSendGuardianMsg(){
  var ta = document.getElementById('gcInput');
  if(!ta || !ta.value.trim()) return;
  var text = ta.value.trim();
  ta.value = ''; ta.style.height = '';
  var gcQuote = _getReplyQuote('gcReplyBar');
  pClearReplyBar('gcReplyBar');
  _gcMsgs.push({ text:text, user:true });
  var gcMsgEl = document.getElementById('gcMessages');
  var gcDiv = document.createElement('div');
  var gcG = _gcGuardian || { av:'🌿', name:'Guardián/a' };
  gcDiv.innerHTML = _buildMsgBubble(text, true, '', '', 'gcInput', 'gcReplyBar', gcQuote);
  var gcChild = gcDiv.firstElementChild; if(gcChild && gcMsgEl){ gcMsgEl.appendChild(gcChild); gcMsgEl.scrollTop = gcMsgEl.scrollHeight; }
  var msgEl  = document.getElementById('gcMessages');
  var typDiv = document.createElement('div');
  typDiv.id  = 'gcTyping';
  typDiv.className = 'feed-msg';
  var g = _gcGuardian || { av:'🌿', name:'Guardián/a' };
  typDiv.innerHTML = '<div class="feed-av" style="font-size:22px">'+_escHtml(g.av||'🌿')+'</div>'
    +'<div><div class="feed-sender" style="font-size:11px;color:var(--ink4)">'+_escHtml(g.name)+'</div>'
    +'<div class="feed-bubble" style="color:var(--ink4);font-style:italic">Escribiendo…</div></div>';
  if(msgEl){ msgEl.appendChild(typDiv); msgEl.scrollTop = msgEl.scrollHeight; }

  var sys = 'Sos '+g.name+', un usuario real de la comunidad Velo que acompañás a personas en momentos difíciles. '
    +'Tu bio: "'+( g.bio || 'Acompaño desde la empatía real, sin rodeos')+'". '
    +'Hablás desde la experiencia personal, NO como terapeuta. '
    +'Respondés en español rioplatense (vos, te, estás, querés). '
    +'Sos cálido/a, humano/a, honesto/a y nunca repetís frases genéricas. '
    +'Tus respuestas son breves (2-4 oraciones) y MUY específicas a lo que la persona dice. '
    +'Si mencionan crisis o autolesión, con mucho cuidado sugerís llamar al 135 (Argentina) o usar el SOS de Velo.';

  var reply = await _geminiChat(sys, _gcMsgs.slice(-12), { temperature:0.92, maxOutputTokens:200 });
  var typEl = document.getElementById('gcTyping');
  if(typEl) typEl.remove();
  _gcAddMsg(reply || 'Estoy acá, puede que haya un problema de conexión. ¿Seguimos? 🌿', false);
}

function pEndGuardianChat(){
  // Save conv stat
  var convs = parseInt(safeLS('get','velo_guardian_convs')||'0',10);
  safeLS('set','velo_guardian_convs', String(convs+1));
  safeLS('del','velo_guardian_status');
  // Record who we're reviewing
  safeLS('set','velo_postchat_guardian', _gcGuardian ? JSON.stringify({ id:_gcGuardian.id, name:_gcGuardian.name }) : '');
  pGoTo('post-chat');
}

// ── PROFESSIONALS ──────────────────────────────────────────────
var _proData = [
  // ── SALUD MENTAL CLÍNICA (profesionales licenciados) ──────────
  { id:'p1', type:'salud', name:'Lic. Ana García',  av:'👩‍⚕️', spec:'Psicología Clínica',   rate:50, currency:'USD', rating:4.9, sessions:134, solidarity:true,  bio:'Especializada en ansiedad, depresión y relaciones. 8 años de experiencia clínica.', tags:['ansiedad','depresión','pareja'] },
  { id:'p2', type:'salud', name:'Dr. Carlos Méndez',av:'👨‍⚕️', spec:'Psiquiatría',           rate:65, currency:'USD', rating:4.8, sessions:89,  solidarity:false, bio:'Psiquiatra con enfoque integral. Evaluación, medicación y psicoterapia combinada.', tags:['psiquiatría','TDAH','trastornos del sueño'] },
  { id:'p3', type:'salud', name:'Lic. Lucía Torres',av:'🌺',    spec:'Psicología · Gestalt',  rate:35, currency:'USD', rating:5.0, sessions:201, solidarity:true,  bio:'Psicóloga. Acompaño procesos de autoconocimiento y crecimiento personal con enfoque humanista.', tags:['autoestima','identidad','creatividad'] },
  { id:'p4', type:'salud', name:'Mg. Sofía Ramos',  av:'🌙',    spec:'Psicología Infantil',   rate:30, currency:'USD', rating:4.9, sessions:156, solidarity:false, bio:'Psicóloga especializada en niños, adolescentes y familias. Crianza con apego y vínculo temprano.', tags:['niños','adolescentes','familia'] },
  // ── BIENESTAR (no son profesionales de salud mental) ──────────
  { id:'b1', type:'bienestar', name:'Marcela V.',   av:'🌿',    spec:'Coach de Vida certificada', rate:20, currency:'USD', rating:4.8, sessions:98,  solidarity:true,  bio:'Acompaño procesos de cambio, metas personales y laborales. El coaching NO es psicoterapia.', tags:['metas','motivación','hábitos'] },
  { id:'b2', type:'bienestar', name:'Tomás F.',     av:'🧘',    spec:'Mindfulness y Meditación',  rate:15, currency:'USD', rating:4.9, sessions:142, solidarity:false, bio:'Instructor certificado de mindfulness y técnicas de reducción del estrés basadas en evidencia.', tags:['estrés','mindfulness','respiración'] },
  { id:'b3', type:'bienestar', name:'Valeria R.',   av:'🎨',    spec:'Arte-terapia facilitada',   rate:18, currency:'USD', rating:4.7, sessions:67,  solidarity:false, bio:'Facilitadora de arte-terapia. Técnica expresiva de bienestar — NO es tratamiento psicológico.', tags:['expresión','creatividad','bienestar'] }
];

function pRenderProfessionals(){
  var list = document.getElementById('proList');
  if(!list) return;

  function _proCard(p){
    var spec = p.spec || p.specialty || 'Especialista';
    var solidBadge = p.solidarity ? '<span style="font-size:10px;font-weight:700;color:#3a7bd5;background:rgba(58,123,213,.1);border:1px solid rgba(58,123,213,.25);border-radius:100px;padding:2px 8px;margin-left:6px">💙 Solidario/a</span>' : '';
    return '<div class="p-pro-card" onclick="pOpenProSession(\''+p.id+'\')"><div style="display:flex;align-items:flex-start;gap:14px"><div style="font-size:44px;flex-shrink:0">'+p.av+'</div><div style="flex:1;min-width:0"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px"><div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px"><span style="font-size:15px;font-weight:700;color:var(--ink)">'+p.name+'</span>'+solidBadge+'</div><span class="pro-rate">$'+p.rate+' <span style="font-size:13px;color:var(--ink4)">'+p.currency+'</span></span></div><div style="font-size:12px;font-weight:600;margin-bottom:6px;color:var(--sage3)">'+_escHtml(spec)+'</div><p style="font-size:12px;color:var(--ink4);line-height:1.5;margin-bottom:10px">'+p.bio+'</p><div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px">'+p.tags.map(function(t){ return '<span class="p-tag">'+t+'</span>'; }).join('')+'</div><div style="display:flex;align-items:center;justify-content:space-between"><span style="font-size:12px;color:var(--ink4)">⭐ '+p.rating+' · '+p.sessions+' sesiones</span><button class="p-btn p-btn--primary p-btn--sm" onclick="event.stopPropagation();pOpenBookPro(\''+p.id+'\')">📅 Reservar</button></div></div></div></div>';
  }

  // Waitlist CTA for users who can't afford sessions
  var waitlistBanner = '<div onclick="pJoinWaitlist()" style="display:flex;align-items:center;gap:12px;background:rgba(58,123,213,.07);border:1.5px solid rgba(58,123,213,.18);border-radius:14px;padding:13px 15px;margin-bottom:16px;cursor:pointer">'
    +'<div style="font-size:24px">💙</div>'
    +'<div style="flex:1"><div style="font-size:13px;font-weight:700;color:var(--ink)">¿No podés pagarlo ahora?</div>'
    +'<div style="font-size:11px;color:var(--ink4);margin-top:2px">Anotate en la lista de espera solidaria. Profesionales donan 1 sesión/mes para quienes más lo necesitan.</div></div>'
    +'<div style="color:var(--ink5);font-size:16px;flex-shrink:0">›</div>'
    +'</div>';

  list.innerHTML = waitlistBanner + _proData.map(_proCard).join('');
}
var _curPro = null;
function pOpenProSession(id){
  _curPro = _proData.find(function(p){ return p.id === id; });
  if(!_curPro) return;
  var p = _curPro;
  _setEl('pSessionTitle', 'Sesión con '+p.name);
  var content = document.getElementById('pSessionContent');
  if(content){
    content.innerHTML =
      // Anti-external-contact warning
      '<div style="background:rgba(192,48,40,.07);border:1.5px solid rgba(192,48,40,.18);border-radius:14px;padding:12px 16px;margin-bottom:14px;display:flex;gap:10px;align-items:flex-start">'
      +'<span style="font-size:18px;flex-shrink:0">⚠️</span>'
      +'<div style="font-size:12px;color:var(--ink3);line-height:1.6">'
      +'<strong>Política de protección de la plataforma:</strong> Queda estrictamente prohibido el intercambio de datos de contacto (teléfono, WhatsApp, Instagram, correo personal) entre usuarios y profesionales dentro de Velo. Todas las sesiones deben realizarse exclusivamente a través de la videollamada de Velo. El incumplimiento puede resultar en la suspensión de la cuenta.'
      +'</div></div>'
      // Pro info
      +'<div class="p-card" style="padding:22px;margin-bottom:14px"><div style="display:flex;align-items:center;gap:14px;margin-bottom:16px"><div style="font-size:52px">'+p.av+'</div><div><div style="font-size:18px;font-weight:700;color:var(--ink)">'+p.name+'</div><div style="font-size:13px;color:var(--sage3);font-weight:600">'+p.spec+'</div><div style="font-size:13px;color:var(--ink4);margin-top:2px">⭐ '+p.rating+' · '+p.sessions+' sesiones</div></div></div><p style="font-size:13px;color:var(--ink3);line-height:1.6;margin-bottom:18px">'+p.bio+'</p><div class="p-divider-line"></div><div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0"><span style="font-size:14px;color:var(--ink3)">Precio por sesión</span><span style="font-family:\'Cormorant Garamond\',serif;font-size:28px;font-weight:700;color:var(--sage)">$'+p.rate+' '+p.currency+'</span></div><div class="p-divider-line"></div><div style="font-size:12px;color:var(--ink4);margin:12px 0">🔒 Pago seguro vía Stripe · Videollamada privada en Velo · 80% al profesional</div><button class="p-btn p-btn--primary p-btn--xl p-btn--full" onclick="pStripeCheckout(\''+p.id+'\')">Reservar con Stripe 💳</button><div style="height:8px"></div><button class="p-btn p-btn--secondary p-btn--md p-btn--full" onclick="pGoTo(\'professionals\')">Volver</button></div>';
  }
  pGoTo('pro-session');
}

function pStripeCheckout(proId){
  var p = _proData.find(function(x){ return x.id === proId; });
  if(!p) return;
  pToast('💳','Preparando pago seguro…');
  var sessionData = { proId:proId, name:p.name, spec:p.spec, amount:p.rate, currency:p.currency, ts:Date.now() };
  safeLS('set','velo_stripe_pending', JSON.stringify(sessionData));
  var baseUrl = window.location.origin + window.location.pathname;
  fetch(SUPABASE_FN, {
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+SUPABASE_ANON},
    body:JSON.stringify({
      amount:      p.rate,       // dollars — edge function multiplies by 100
      proName:     p.name,
      sessionType: 'paid',
      returnUrl:   baseUrl+'?stripe=ok',
      cancelUrl:   baseUrl+'?stripe=cancel'
    })
  }).then(function(r){ return r.json(); }).then(function(data){
    if(data && data.url){
      window.location.href = data.url; // redirect to Stripe hosted checkout
    } else {
      pToast('⚠️','Error al crear la sesión de pago: '+(data && data.error ? data.error : 'intentá de nuevo'));
    }
  }).catch(function(){ pToast('⚠️','Error de conexión con el servidor de pagos'); });
}

// ── HELP ROOM ─────────────────────────────────────────────────
var _helpPosts = [];

// Mock posts live only in memory — taken state stored separately so they reset each session
var _helpMockData = [
  { id:'hm1', emoji:'😰', anon:true,  name:'Usuario Anónimo', time: 0, preview:'No puedo dormir y no sé por qué me siento tan vacío/a…' },
  { id:'hm2', emoji:'😢', anon:true,  name:'Usuario Anónimo', time: 0, preview:'Tuve una pelea muy fuerte hoy y me siento muy solo/a…' },
  { id:'hm3', emoji:'😔', anon:false, name:'Valentina S.',    time: 0, preview:'Llevo semanas sin poder levantarme de la cama.' },
  { id:'hm4', emoji:'😞', anon:true,  name:'Usuario Anónimo', time: 0, preview:'No sé si lo que me pasa es normal pero me pesa mucho.' }
];
// Set relative timestamps fresh each time the array is accessed
function _helpMockFresh(){
  var now = Date.now();
  return _helpMockData.map(function(m,i){ return Object.assign({},m,{time:now-(i+1)*3*60000, _mock:true}); });
}

function pRenderHelp(){
  var list = document.getElementById('helpList');
  if(!list) return;
  var realPosts = []; try{ realPosts = JSON.parse(safeLS('get','velo_help_posts')||'[]'); }catch(e){}
  var hidden = []; try{ hidden = JSON.parse(safeLS('get','velo_hidden_content')||'[]'); }catch(e){}
  var mockTaken = []; try{ mockTaken = JSON.parse(safeLS('get','velo_help_mock_taken')||'[]'); }catch(e){}

  var realAvail = realPosts.filter(function(h){ return !h.taken && hidden.indexOf('help-'+h.id)<0; });
  var mockAvail = _helpMockFresh().filter(function(m){ return mockTaken.indexOf(m.id)<0 && hidden.indexOf('help-'+m.id)<0; });

  var posts = realAvail.concat(mockAvail);
  _helpPosts = posts;
  var count = document.getElementById('helpActiveCount');
  if(count) count.textContent = posts.length+' esperando acompañamiento';

  if(!posts.length){
    list.innerHTML = '<div class="p-empty" style="color:rgba(255,255,255,.5)"><span class="p-empty-emoji">💚</span><div class="p-empty-title" style="color:rgba(255,255,255,.7)">Todo tranquilo por acá</div><div class="p-empty-sub">Nadie espera acompañamiento en este momento</div></div>';
    return;
  }
  list.innerHTML = posts.map(function(h,i){
    var elapsed = Math.floor((Date.now()-h.time)/60000);
    var timeStr = elapsed<1?'ahora mismo':elapsed===1?'hace 1 min':'hace '+elapsed+' min';
    return '<div class="dark-seeker" id="helppost-'+h.id+'" style="animation-delay:'+i*.08+'s">'
      +'<div style="display:flex;align-items:flex-start;gap:11px">'
      +'<div style="font-size:28px;flex-shrink:0">'+h.emoji+'</div>'
      +'<div style="flex:1;min-width:0">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px">'
      +'<span style="font-size:12px;font-weight:600;color:rgba(255,255,255,.75)">'+h.name+'</span>'
      +'<span style="font-size:10px;color:rgba(255,255,255,.3)">'+timeStr+'</span>'
      +(h.urgencia==='urgente'?'<span style="font-size:9px;background:rgba(220,50,50,.25);color:rgba(255,130,130,.9);border:1px solid rgba(220,50,50,.3);border-radius:6px;padding:1px 6px;margin-left:4px">🔴 Urgente</span>':h.urgencia==='media'?'<span style="font-size:9px;background:rgba(230,160,20,.2);color:rgba(255,200,80,.9);border:1px solid rgba(230,160,20,.25);border-radius:6px;padding:1px 6px;margin-left:4px">🟡 Media</span>':'')
      +'</div>'
      +'<div style="font-size:13px;color:rgba(255,255,255,.65);line-height:1.55;margin-bottom:10px;font-style:italic">'+_escHtml(h.preview)+'</div>'
      +'<div style="display:flex;gap:8px;align-items:center">'
      +'<button class="p-btn p-btn--primary p-btn--sm" onclick="pAccompanyHelp(\''+h.id+'\')">💚 Acompañar</button>'
      +'<button style="font-size:11px;color:rgba(192,48,40,.5);background:none;border:none;cursor:pointer;font-family:\'Jost\',sans-serif" onclick="pReportContent(\'help\',\''+h.id+'\')">⚠️ Reportar</button>'
      +'</div>'
      +'</div>'
      +'</div>'
      +'</div>';
  }).join('');
}

var _curHelpPost = null;
var _helpChatInactivityTimer = null;
// Auto-replies simulating the seeker (person who asked for help)
var _helpChatAutoMsgPool = [
  'Gracias por responder… no esperaba que alguien lo hiciera tan rápido 🙏',
  'Sí, acá estoy. No sé bien por dónde empezar.',
  'Me ayuda saber que alguien me está leyendo, de verdad.',
  'Es que es difícil explicarlo… hace tiempo que no se lo cuento a nadie.',
  'Estoy bien, o eso intento decirme. Pero no siempre funciona.',
  '¿Podemos hablar un poco? Necesito desahogarme.'
];

function pAccompanyHelp(postId){
  // Check real posts first, then mock
  var posts = []; try{ posts = JSON.parse(safeLS('get','velo_help_posts')||'[]'); }catch(e){}
  var post = posts.find(function(p){ return p.id===postId; });
  var isMock = false;
  if(!post){
    post = _helpMockFresh().find(function(m){ return m.id===postId; });
    isMock = true;
  }
  if(!post){ pToast('⚠️','Esta solicitud ya fue tomada'); return; }

  if(isMock){
    // Mark mock as taken via separate key
    var mockTaken = []; try{ mockTaken = JSON.parse(safeLS('get','velo_help_mock_taken')||'[]'); }catch(e){}
    if(mockTaken.indexOf(postId)<0){ mockTaken.push(postId); safeLS('set','velo_help_mock_taken',JSON.stringify(mockTaken)); }
  } else {
    // Mark real post as taken
    posts = posts.map(function(p){ return p.id===postId ? Object.assign({},p,{taken:true}) : p; });
    safeLS('set','velo_help_posts', JSON.stringify(posts));
  }
  _curHelpPost = post;
  // Start the help chat
  _openHelpChat(post);
  // Increment helped count
  safeLS('set','velo_helped_others', String(parseInt(safeLS('get','velo_helped_others')||'0',10)+1));
  safeLS('set','velo_helped_once','1');
}

function _openHelpChat(post){
  // Navigate to a help chat screen
  _setEl('helpChatTitle', post.name + ' · ' + post.emoji);
  _setEl('helpChatPreview', '"'+post.preview+'"');
  var msgEl = document.getElementById('helpChatMessages');
  if(msgEl){
    var t = new Date();
    var tStr = t.getHours()+':'+(t.getMinutes()<10?'0':'')+t.getMinutes();
    msgEl.innerHTML = '<div class="feed-system-msg">Chat de acompañamiento iniciado · '+ tStr +'</div>'
      +'<div class="feed-msg"><div class="feed-av">'+post.emoji+'</div><div><div class="feed-sender">'+post.name+'</div><div class="feed-bubble">'+_escHtml(post.preview)+'</div></div></div>';
    msgEl.scrollTop = msgEl.scrollHeight;
  }
  _updateGuardianPresence('ocupado');
  safeLS('set','velo_guardian_status','ocupado');
  pGoTo('help-chat');
  _resetHelpInactivity();
}

function _resetHelpInactivity(){
  if(_helpChatInactivityTimer) clearTimeout(_helpChatInactivityTimer);
  _helpChatInactivityTimer = setTimeout(function(){
    // 5 minutes of inactivity
    _closeHelpChatInactive();
  }, 5 * 60 * 1000);
}

function _closeHelpChatInactive(){
  var msgEl = document.getElementById('helpChatMessages');
  if(msgEl){
    var msg = document.createElement('div');
    msg.className = 'feed-system-msg';
    msg.textContent = 'Chat cerrado por inactividad (5 min). Podés enviar un mensaje al buzón.';
    msgEl.appendChild(msg);
    msgEl.scrollTop = msgEl.scrollHeight;
  }
  setTimeout(function(){
    pToast('⏱️','Chat cerrado por inactividad. ¿Querés enviarle un mensaje al buzón?');
    setTimeout(function(){ pGoTo('help'); }, 2000);
  }, 2000);
}

function pSendHelpChatMsg(){
  var ta = document.getElementById('helpChatInput');
  if(!ta || !ta.value.trim()) return;
  var text = ta.value.trim();
  ta.value = '';
  ta.style.height = '';
  _resetHelpInactivity();
  var msgEl = document.getElementById('helpChatMessages');
  if(!msgEl) return;
  var name = safeLS('get','velo_user_name')||'Vos';
  var t = new Date();
  var tStr = t.getHours()+':'+(t.getMinutes()<10?'0':'')+t.getMinutes();
  var div = document.createElement('div');
  var quote = _getReplyQuote('helpChatReplyBar');
  pClearReplyBar('helpChatReplyBar');
  div.innerHTML = _buildMsgBubble(text, true, '', '', 'helpChatInput', 'helpChatReplyBar', quote);
  var child = div.firstElementChild; if(child) msgEl.appendChild(child);
  msgEl.scrollTop = msgEl.scrollHeight;
  _geminiCrisisCheck(text);
  // Simulated reply after 8-15 seconds
  setTimeout(function(){
    _resetHelpInactivity();
    var reply = _helpChatAutoMsgPool[Math.floor(Math.random()*_helpChatAutoMsgPool.length)];
    var div2 = document.createElement('div');
    div2.innerHTML = _buildMsgBubble(reply, false, _curHelpPost?_curHelpPost.emoji:'💚', _curHelpPost?_curHelpPost.name:'Usuario', 'helpChatInput', 'helpChatReplyBar', '');
    var child2 = div2.firstElementChild; if(child2) msgEl.appendChild(child2);
    msgEl.scrollTop = msgEl.scrollHeight;
  }, 8000 + Math.random()*7000);
}

function pLeaveHelpChat(){
  if(_helpChatInactivityTimer){ clearTimeout(_helpChatInactivityTimer); _helpChatInactivityTimer = null; }
  _curHelpPost = null;
  _updateGuardianPresence('disponible');
  safeLS('set','velo_guardian_status','disponible');
  pGoTo('post-chat');
}

function pReportHelpChat(){
  pReportContent('chat', 'help-chat-'+Date.now(), 'Chat de acompañamiento');
}

function pOpenHelpForm(){ openModal('helpFormOv'); }

async function pSendHelp(){
  var ta = document.getElementById('helpMsgTa');
  if(!ta || !ta.value.trim()){ pToast('✍️','Escribí tu mensaje antes de enviar'); return; }
  if(!_checkDailyLimit('help')){
    closeModal('helpFormOv');
    pToast('💙','Límite gratuito: 2 pedidos de ayuda por día. ¡Upgrade a Plus!');
    setTimeout(pShowPlusModal, 1200);
    return;
  }
  _incDailyLimit('help');
  var msg = ta.value.trim();
  var anonEl = document.getElementById('helpAnonCheck');
  var isAnon = !anonEl || anonEl.checked;
  var name = isAnon ? 'Usuario Anónimo' : (safeLS('get','velo_user_name')||'Usuario');
  ta.value = '';
  closeModal('helpFormOv');
  pToast('💌','Mensaje publicado. Alguien te acompañará pronto 💚');
  var posts = []; try{ posts = JSON.parse(safeLS('get','velo_help_posts')||'[]'); }catch(e){}
  var ts = Date.now();
  posts.unshift({ id:'hu'+ts, emoji:'💙', anon:isAnon, name:name, time:ts, preview:msg, taken:false });
  safeLS('set','velo_help_posts', JSON.stringify(posts.slice(0,50)));
  safeLS('set','velo_helped_once','1');
  var inbox = []; try{ inbox = JSON.parse(safeLS('get','velo_inbox')||'[]'); }catch(e){}
  inbox.unshift({ id:'help-'+ts, tipo:'sistema', icon:'💚', remitente:'Sala de Ayuda', asunto:'Tu mensaje fue publicado', cuerpo:'Tu mensaje fue publicado en la Sala de Ayuda. Alguien te acompañará pronto.\n\n"'+msg+'"', extracto:'Alguien te acompañará pronto.', leido:false, prioritario:false, fecha:new Date().toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'}) });
  safeLS('set','velo_inbox', JSON.stringify(inbox.slice(0,100)));
  pRenderHelp();

  // Gemini crisis detection and urgency classification — run silently in background
  _geminiCrisisCheck(msg);
  _geminiClassifyUrgency(msg);
}

async function _geminiCrisisCheck(msg){
  var prompt = 'Sos el sistema de detección de crisis de una app de salud mental.\n'
    +'Analizá este mensaje de un usuario y determiná si hay señales de crisis suicida, autolesión o peligro inmediato.\n'
    +'Respondé SOLO con JSON: {"crisis": true/false, "nivel": "alto/medio/bajo/ninguno", "razon": "..."}\n\n'
    +'Mensaje: "'+msg.replace(/"/g,"'")+'"';
  var result = await _geminiCall(prompt);
  if(!result) return;
  try{
    var match = result.match(/\{[\s\S]*\}/);
    if(!match) return;
    var data = JSON.parse(match[0]);
    if(data.crisis && (data.nivel === 'alto' || data.nivel === 'medio')){

      // For high-level crisis: open SOS immediately, don't wait
      if(data.nivel === 'alto'){
        pOpenSOS();
        pToast('🆘','Por favor contactá una línea de crisis ahora. Estamos acá para vos 💙');
      } else {
        setTimeout(function(){
          pToast('💙','Recordá: no estás solo/a. El botón SOS siempre está disponible.');
          _updateInboxDot();
        }, 3000);
      }

      // Send to inbox
      var inbox2 = []; try{ inbox2 = JSON.parse(safeLS('get','velo_inbox')||'[]'); }catch(e){}
      inbox2.unshift({ id:'crisis-'+Date.now(), tipo:'sos', icon:'🆘',
        remitente:'Velo — Apoyo Urgente',
        asunto:'Estamos acá para vos 💙',
        extracto:'Detectamos que podrías estar pasando un momento muy difícil.',
        cuerpo:'Estamos acá para vos. Si sentís que no podés más, por favor contactá una línea de crisis.\n\nArgentina: Centro de Asistencia al Suicida 135 (gratuito, 24hs)\nUruguay: 0800 0767 (gratuito)\nChile: 800 104 024 (gratuito)\nEspaña: 024\n\nTambién podés tocar el botón SOS en la Sala de Ayuda.',
        leido:false, prioritario:true, fecha:new Date().toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'}) });
      safeLS('set','velo_inbox', JSON.stringify(inbox2.slice(0,100)));
      _updateInboxDot();

      // Log in local audit
      var ts = Date.now();
      var audit = []; try{ audit = JSON.parse(safeLS('get','velo_audit_log')||'[]'); }catch(e){}
      audit.unshift({ ts:ts, tipo:'crisis_detect', circle:'detectado-por-ia',
        nivel:data.nivel, motivo:data.razon, detail:msg.slice(0,80), resolved:false });
      safeLS('set','velo_audit_log', JSON.stringify(audit.slice(0,500)));

      // Persist to Supabase reportes so admin always sees it
      _sbSaveCrisisEvent(data.nivel, data.razon, msg.slice(0,200), ts);
    }
  }catch(e){}
}


async function _geminiClassifyUrgency(msg){
  var prompt = 'Sos el sistema de clasificación de urgencia de Velo, una app de salud mental.\n'
    +'Clasificá la urgencia de este mensaje:\n'
    +'- urgente: crisis inmediata, riesgo de autolesión o suicidio, emergencia\n'
    +'- media: situación difícil pero no emergencia inmediata\n'
    +'- baja: desahogo emocional, apoyo general\n'
    +'Respondé SOLO con JSON: {"urgencia": "urgente|media|baja"}\n\n'
    +'Mensaje: "'+msg.replace(/"/g,"'")+'"';
  var result = await _geminiCall(prompt);
  if(!result) return;
  try{
    var match = result.match(/\{[\s\S]*\}/);
    if(!match) return;
    var data = JSON.parse(match[0]);
    var urgencia = data.urgencia || 'baja';
    var posts = []; try{ posts = JSON.parse(safeLS('get','velo_help_posts')||'[]'); }catch(e){}
    if(posts.length){
      posts[0].urgencia = urgencia;
      safeLS('set','velo_help_posts', JSON.stringify(posts.slice(0,50)));
      pRenderHelp();
    }
  }catch(e){}
}

async function _geminiModerateContent(text, section){
  var prompt = 'Sos el sistema de moderación de Velo, una app de salud mental peer-to-peer.\n'
    +'Analizá este mensaje y detectá: acoso, agresión hacia otros o spam/publicidad.\n'
    +'NO marques como problemático: expresiones de dolor, tristeza, crisis personal o pedidos de ayuda.\n'
    +'Respondé SOLO con JSON: {"problema": true/false, "tipo": "acoso|spam|ninguno", "gravedad": "alta|baja"}\n\n'
    +'Mensaje: "'+text.replace(/"/g,"'")+'"';
  var result = await _geminiCall(prompt);
  if(!result) return;
  try{
    var match = result.match(/\{[\s\S]*\}/);
    if(!match) return;
    var data = JSON.parse(match[0]);
    if(data.problema && data.gravedad === 'alta'){
      var audit = []; try{ audit = JSON.parse(safeLS('get','velo_audit_log')||'[]'); }catch(e){}
      audit.unshift({ ts:Date.now(), tipo:'abuse_detect', circle:section,
        motivo:'Gemini — '+data.tipo+' detectado (tiempo real)', detail:text.slice(0,80) });
      safeLS('set','velo_audit_log', JSON.stringify(audit.slice(0,500)));
      pToast('⚠️','Tu mensaje fue marcado para revisión por el equipo de Velo.');
    }
  }catch(e){}
}

// ── BUENAS NOTICIAS ────────────────────────────────────────────
// ── SALUDO DIARIO IA ────────────────────────────────────────────
// 30 rotating themes — one per day of the month, guarantees variety
var _greetingTemas = [
  'la gratitud por las pequeñas cosas cotidianas',
  'el valor de pedir ayuda cuando uno lo necesita',
  'los momentos de pausa y descanso consciente',
  'la conexión genuina con otras personas',
  'el autocuidado sin culpa ni excusas',
  'la resiliencia y la fortaleza que no siempre se ve',
  'la naturaleza y la calma que transmite',
  'vivir el presente en vez de anticipar el futuro',
  'los pequeños logros que merecen celebrarse',
  'la importancia de escucharse a uno mismo',
  'el descanso como acto de valentía',
  'los vínculos que nos sostienen cuando flaquea la energía',
  'la curiosidad como forma de sanar',
  'cómo el cuerpo guarda las emociones',
  'la creatividad y la expresión emocional',
  'la esperanza aunque sea pequeña e incierta',
  'los rituales simples que ordenan el día',
  'la compasión hacia uno mismo',
  'lo que nos inspira y nos mueve',
  'la imperfección como parte hermosa de ser humano',
  'el humor suave como alivio y medicina',
  'los recuerdos buenos que dan fuerza hoy',
  'el silencio y lo que uno descubre en él',
  'los cambios como oportunidad disfrazada',
  'la energía de los comienzos y las nuevas páginas',
  'el acompañamiento mutuo en comunidad',
  'el coraje de mostrarse vulnerable',
  'soltar lo que no se puede controlar',
  'los abrazos como forma de decir "estoy acá"',
  'el significado único que cada persona le da a su vida'
];

var _greetingFallbacks = [
  'Cada día que abrís Velo es un paso hacia vos mismo/a. Ojalá hoy encuentres un momento de calma 🌿',
  'Qué bueno tenerte acá. Este espacio es tuyo — sin apuros, sin juicios 💚',
  'Hoy también cuenta, aunque sea un día difícil. Estamos acá siempre que lo necesités 🌱',
  'Respirá. Este momento es tuyo. Nadie te exige nada acá adentro ✨',
  'Bienvenido/a de vuelta. Espero que encuentres lo que necesitás hoy 🌸',
  'Acá estamos, siempre. ¿Cómo llegás hoy? Podés contarlo cuando quieras 💙',
  'Que este rato que le das a tu bienestar te haga bien de verdad. Te lo merecés 🌿',
  'Cada pequeño paso que das hacia tu bienestar importa más de lo que creés ✨',
  'No hace falta tener todo resuelto para estar acá. Solo llegar ya es suficiente 💚',
  'Tu bienestar merece tiempo y atención. Gracias por dártelo hoy 🌱',
  'Hoy tiene algo tuyo. Aprovechá aunque sea un minutito para vos 🌸',
  'Que el día de hoy te sorprenda con algo bueno, aunque sea pequeño 💙',
  'Cada vez que te cuidás, le enseñás a otros que también pueden hacerlo 🌿',
  'Estamos acá, acompañándote sin juzgar. Siempre 💚',
  'Lo que sentís hoy es válido. Todo es bienvenido acá ✨',
  'Un día a la vez. Eso es suficiente 🌱',
  'El hecho de que estés acá ya dice mucho de vos 🌸',
  'Que la jornada de hoy te traiga aunque sea un momento de alivio 💙',
  'No necesitás tener todo claro para avanzar. Solo seguir 🌿',
  'Gracias por darte este espacio. Te lo merecés siempre 💚',
  'Cada pequeña pausa cuenta. No lo subestimes ✨',
  'Hoy es un buen día para ser un poco más amable con vos mismo/a 🌱',
  'Lo mejor que podés hacer hoy es cuidarte. Empezá por acá 🌸',
  'La calma no siempre llega sola — a veces hay que buscarla 💙',
  'Que hoy encuentres algo que te recuerde por qué vale la pena 🌿',
  'No estás solo/a. Nunca 💚',
  'Tu presencia acá importa más de lo que creés ✨',
  'Hoy, como ayer, este espacio es completamente tuyo 🌱',
  'Que lo de hoy sea más liviano que lo de ayer 🌸',
  'Gracias por volver. Siempre es bueno verte por acá 💙'
];

async function _checkDailyGreeting(){
  var today = new Date().toISOString().slice(0,10);
  if(safeLS('get','velo_greeting_shown_'+today)) return;

  var d        = new Date();
  var h        = d.getHours();
  var momento  = (h < 6 || h >= 20) ? 'noche' : h < 12 ? 'mañana' : 'tarde';
  var saludoMap = { 'mañana':'¡Buenos días', 'tarde':'¡Buenas tardes', 'noche':'¡Buenas noches' };
  var name     = (safeLS('get','velo_user_name')||'').split(' ')[0];
  var saludo   = saludoMap[momento] + (name ? ', '+name : '') + '!';

  // Show card immediately with saludo + loading dots — no waiting
  _showDailyGreeting(saludo, null);

  // Now fetch Gemini message in background with 5s timeout
  var cached = safeLS('get','velo_greeting_'+today);
  var msg;
  if(cached){
    msg = cached;
  } else {
    var dias     = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
    var dia      = dias[d.getDay()];
    var meses    = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    var fechaFull = d.getDate()+' de '+meses[d.getMonth()]+' de '+d.getFullYear();
    var startOfYear = new Date(d.getFullYear(), 0, 0);
    var dayOfYear   = Math.floor((d - startOfYear) / 86400000);
    var tema        = _greetingTemas[dayOfYear % _greetingTemas.length];

    var prompt = 'Sos el acompañante de bienestar de Velo, una app de salud mental peer-to-peer.\n'
      +'Generá un mensaje de bienvenida breve y muy cálido. '
      +'Hoy es '+fechaFull+', '+momento+' del '+dia+'.\n'
      +'El mensaje de HOY debe girar alrededor del tema: "'+tema+'".\n'
      +'Reglas: 1-2 oraciones cortas. Genuino, empático, no exagerado. '
      +'Español rioplatense (vos, te). Terminá con un emoji suave (🌿 💚 ✨ 🌱 🌸 💙 🫂). '
      +'NO incluyas saludo ni nombre — solo el mensaje. Sin comillas ni explicaciones.';

    var timeoutP = new Promise(function(res){ setTimeout(function(){ res(null); }, 5000); });
    msg = await Promise.race([_geminiCall(prompt, { temperature:0.92, maxOutputTokens:80 }), timeoutP]);
    if(!msg || msg.length > 220){
      msg = _greetingFallbacks[d.getDate() % _greetingFallbacks.length];
    }
    safeLS('set','velo_greeting_'+today, msg);
  }

  // Inject message into already-visible card
  var msgEl = document.getElementById('veloGreetingGemini');
  if(msgEl){
    msgEl.style.transition = 'opacity .4s';
    msgEl.style.opacity = '0';
    setTimeout(function(){
      msgEl.textContent = msg;
      msgEl.style.opacity = '1';
    }, 150);
  }
}

function _showDailyGreeting(saludo, msg){
  var today = new Date().toISOString().slice(0,10);
  safeLS('set','velo_greeting_shown_'+today, '1');

  var card = document.createElement('div');
  card.id  = 'veloGreetingCard';
  card.style.cssText = [
    'position:fixed',
    'bottom:0',
    'left:50%',
    'transform:translateX(-50%) translateY(110%)',
    'width:min(400px,calc(100vw - 24px))',
    'z-index:9800',
    'transition:transform .45s cubic-bezier(.34,1.56,.64,1)'
  ].join(';');

  card.innerHTML = ''
    +'<div style="'
      +'background:linear-gradient(150deg,rgba(248,253,250,.97),rgba(238,250,244,.95));'
      +'backdrop-filter:blur(28px) saturate(1.5);'
      +'-webkit-backdrop-filter:blur(28px) saturate(1.5);'
      +'border:1.5px solid rgba(116,198,157,.32);'
      +'border-bottom:none;'
      +'border-radius:26px 26px 0 0;'
      +'padding:10px 20px 26px;'
      +'box-shadow:0 -10px 48px rgba(45,106,79,.14),0 -2px 12px rgba(45,106,79,.07),'
        +'inset 0 1px 0 rgba(255,255,255,.7);'
      +'position:relative'
    +'">'

    // drag handle
    +'<div style="'
      +'width:38px;height:4px;background:rgba(116,198,157,.35);border-radius:2px;'
      +'margin:0 auto 16px'
    +'"></div>'

    // content row
    +'<div style="display:flex;align-items:flex-start;gap:14px">'

      // avatar
      +'<div style="'
        +'width:54px;height:54px;border-radius:18px;flex-shrink:0;'
        +'background:linear-gradient(135deg,rgba(116,198,157,.25),rgba(168,212,232,.2));'
        +'border:2px solid rgba(116,198,157,.3);'
        +'box-shadow:0 4px 18px rgba(116,198,157,.2);'
        +'display:flex;align-items:center;justify-content:center;'
        +'font-size:30px;'
        +'animation:p-float 3.2s ease-in-out infinite'
      +'">🌿</div>'

      // text
      +'<div style="flex:1;min-width:0;padding-top:2px">'
        +'<div style="'
          +'font-size:10px;font-weight:700;letter-spacing:1.3px;text-transform:uppercase;'
          +'color:rgba(116,198,157,.75);margin-bottom:6px'
        +'">Acompañante Velo</div>'
        // Fixed greeting line (Buenos días / tardes / noches)
        +'<div style="'
          +'font-family:\'Cormorant Garamond\',serif;font-size:19px;'
          +'color:var(--sage);line-height:1.3;font-weight:600;letter-spacing:-.2px;margin-bottom:6px'
        +'">'+_escHtml(saludo)+'</div>'
        // Gemini message line — shows loading dots until ready
        +'<div id="veloGreetingGemini" style="'
          +'font-family:\'Cormorant Garamond\',serif;font-size:15.5px;'
          +'color:var(--ink3);line-height:1.58;font-weight:400;letter-spacing:-.1px'
        +'">'+( msg ? _escHtml(msg) : '…')+'</div>'
      +'</div>'

      // close
      +'<button onclick="pDismissGreeting()" style="'
        +'flex-shrink:0;width:30px;height:30px;border-radius:50%;'
        +'background:rgba(116,198,157,.1);border:1px solid rgba(116,198,157,.2);'
        +'color:var(--sage3);font-size:13px;cursor:pointer;'
        +'display:flex;align-items:center;justify-content:center;'
        +'font-family:\'Jost\',sans-serif;transition:all .15s;align-self:flex-start;margin-top:1px'
      +'">✕</button>'
    +'</div>'

    // progress bar
    +'<div style="margin-top:16px;height:3px;background:rgba(116,198,157,.12);border-radius:2px;overflow:hidden">'
      +'<div id="veloGreetingBar" style="'
        +'height:100%;width:100%;'
        +'background:linear-gradient(90deg,rgba(116,198,157,.5),rgba(116,198,157,.8));'
        +'border-radius:2px;transition:none'
      +'"></div>'
    +'</div>'
    +'</div>';

  document.body.appendChild(card);

  // Content already injected inline; veloGreetingGemini updated async by caller

  // Slide up into view
  requestAnimationFrame(function(){
    setTimeout(function(){
      card.style.transform = 'translateX(-50%) translateY(0)';
      // Start countdown bar after card settles
      setTimeout(function(){
        var bar = document.getElementById('veloGreetingBar');
        if(bar){
          bar.style.transition = 'width 7s linear';
          bar.style.width = '0%';
        }
      }, 500);
    }, 60);
  });

  // Auto-dismiss at 7.8s
  var _autoTimer = setTimeout(pDismissGreeting, 7800);
  card.dataset.timer = _autoTimer;

  // Drag to dismiss
  var startY = null;
  card.addEventListener('touchstart', function(e){ startY = e.touches[0].clientY; }, {passive:true});
  card.addEventListener('touchmove', function(e){
    if(startY === null) return;
    var dy = e.touches[0].clientY - startY;
    if(dy > 0) card.style.transform = 'translateX(-50%) translateY('+dy+'px)';
  }, {passive:true});
  card.addEventListener('touchend', function(e){
    var dy = e.changedTouches[0].clientY - (startY||0);
    if(dy > 60){ pDismissGreeting(); } else { card.style.transform = 'translateX(-50%) translateY(0)'; }
    startY = null;
  }, {passive:true});
}

function pDismissGreeting(){
  var card = document.getElementById('veloGreetingCard');
  if(!card) return;
  clearTimeout(parseInt(card.dataset.timer));
  card.style.transition = 'transform .32s cubic-bezier(.4,0,.6,1)';
  card.style.transform  = 'translateX(-50%) translateY(110%)';
  setTimeout(function(){ if(card.parentNode) card.parentNode.removeChild(card); }, 340);
}

async function pRenderNews(){
  var newsEl = document.getElementById('newsContainer');
  if(!newsEl) return;
  var today = new Date().toISOString().slice(0,10);
  var cacheKey = 'velo_goodnews_'+today;
  var cached = safeLS('get', cacheKey);
  if(cached){
    try{
      var cachedItems = JSON.parse(cached);
      // Skip static fallback cache — always re-fetch if we only have static content
      var isLive = cachedItems.some(function(it){ return it._src === 'g' || it._src === 'ai'; });
      if(isLive){ _renderNewsList(newsEl, cachedItems); return; }
    }catch(e){}
  }
  newsEl.innerHTML = '<div style="text-align:center;padding:40px;color:var(--ink4)">🌞 Buscando noticias positivas del mundo...</div>';

  var monthYear = ['enero','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][new Date().getMonth()]+' '+new Date().getFullYear();

  // Attempt 1: Grounded search (real web results)
  var gPrompt = 'Buscá 5 noticias positivas y reales publicadas recientemente ('+monthYear+'). '
    +'Temas: avances médicos, medio ambiente, solidaridad, ciencia, animales, innovación social. '
    +'Para cada noticia: título real tal como aparece en el medio, resumen en español rioplatense 2-3 oraciones, nombre del medio, URL real al artículo, reflexión breve de bienestar. '
    +'SOLO JSON sin markdown: [{"emoji":"...","titulo":"...","cuerpo":"...","reflexion":"...","sourceUrl":"https://...","sourceName":"..."}]';

  var result = await _geminiCallGrounded(gPrompt, { maxOutputTokens:1800 });
  var items = [];

  if(result.text){
    try{
      var raw = result.text.replace(/```json\n?|```/g,'').trim();
      var m = raw.match(/\[[\s\S]*\]/);
      if(m) items = JSON.parse(m[0]);
    }catch(e){}
    // Enrich missing URLs from grounding metadata
    if(result.urls && result.urls.length){
      var ui = 0;
      items.forEach(function(item){
        if(!item.sourceUrl || !item.sourceUrl.startsWith('http')){
          if(result.urls[ui]){ item.sourceUrl = result.urls[ui].uri; item.sourceName = item.sourceName || result.urls[ui].title || 'Fuente'; ui++; }
        }
      });
    }
    items.forEach(function(it){ it._src = 'g'; });
  }

  // Attempt 2: Regular Gemini fallback (no fake URLs)
  if(!items.length){
    var aiPrompt = 'Generá 5 noticias positivas e inspiradoras de bienestar, ciencia, naturaleza y solidaridad humana. '
      +'Sé específico y detallado, no genérico. No inventes URLs. '
      +'SOLO JSON: [{"emoji":"...","titulo":"...","cuerpo":"...","reflexion":"..."}]';
    var aiText = await _geminiCall(aiPrompt, { temperature:0.85, maxOutputTokens:1200 });
    if(aiText){
      try{
        var am = aiText.replace(/```json\n?|```/g,'').trim().match(/\[[\s\S]*\]/);
        if(am){ items = JSON.parse(am[0]); items.forEach(function(it){ it._src='ai'; }); }
      }catch(e){}
    }
  }

  if(!items.length){
    newsEl.innerHTML = '<div style="text-align:center;padding:32px;color:var(--ink4)"><div style="font-size:36px;margin-bottom:10px">🌐</div>No se pudieron cargar noticias. Verificá tu conexión e intentá de nuevo.<br><br><button class="p-btn p-btn--secondary p-btn--md" onclick="safeLS(\'del\',\'velo_goodnews_'+today+'\');pRenderNews()">Reintentar</button></div>';
    return;
  }

  safeLS('set', cacheKey, JSON.stringify(items));
  _renderNewsList(newsEl, items);
}

function _renderNewsList(el, items){
  _newsListCache = items;
  el.innerHTML = items.map(function(item, i){
    var hasLink = item.sourceUrl && item.sourceUrl.startsWith('http');
    return '<div class="p-card p-card--hover" style="margin-bottom:14px;padding:18px;cursor:pointer" onclick="pOpenNewsDetail('+i+')">'
      +'<div style="display:flex;align-items:flex-start;gap:14px">'
      +'<div style="font-size:36px;line-height:1;flex-shrink:0">'+item.emoji+'</div>'
      +'<div style="flex:1;min-width:0">'
      +'<div style="font-family:\'Cormorant Garamond\',serif;font-size:17px;color:var(--ink);margin-bottom:6px;font-weight:600">'+_escHtml(item.titulo)+'</div>'
      +'<div style="font-size:13px;color:var(--ink3);line-height:1.6">'+_escHtml(item.cuerpo)+'</div>'
      +'<div style="margin-top:10px;font-size:11px;display:flex;align-items:center;gap:4px">'
      +(hasLink ? '<span style="color:var(--sage);font-weight:700">'+_escHtml(item.sourceName||'Ver fuente')+'</span><span style="color:var(--ink5)"> · Actualizado hoy ›</span>'
                : '<span style="color:var(--ink5);font-style:italic">✨ Velo IA · Actualizado hoy ›</span>')
      +'</div>'
      +'</div>'
      +'</div>'
      +'</div>';
  }).join('');
}

var _newsListCache = [];
function pOpenNewsDetail(i){
  var item = _newsListCache[i];
  if(!item) return;
  var hasLink = item.sourceUrl && item.sourceUrl.startsWith('http');
  var ov = document.createElement('div');
  ov.className = 'p-modal-ov show';
  ov.id = 'newsDetailOv';
  ov.innerHTML = '<div class="p-sheet" style="max-height:85vh;overflow-y:auto">'
    +'<div class="p-sheet-handle"></div>'
    +'<div style="font-size:52px;text-align:center;margin-bottom:12px">'+item.emoji+'</div>'
    +'<h2 style="font-family:\'Cormorant Garamond\',serif;font-size:22px;color:var(--ink);margin-bottom:14px;line-height:1.3;text-align:center">'+_escHtml(item.titulo)+'</h2>'
    +'<p style="font-size:14px;color:var(--ink3);line-height:1.75;margin-bottom:20px">'+_escHtml(item.cuerpo)+'</p>'
    +'<div style="background:var(--sage7);border-radius:12px;padding:12px 14px;margin-bottom:20px">'
    +'<div style="font-size:11px;font-weight:700;color:var(--sage3);letter-spacing:.5px;margin-bottom:6px">✨ REFLEXIÓN VELO IA</div>'
    +'<p style="font-size:13px;color:var(--ink3);line-height:1.65;margin:0;font-style:italic">'+(item.reflexion||'Cada buena noticia nos recuerda que el mundo avanza con esperanza.')+'</p>'
    +'</div>'
    +(hasLink ? '<a href="'+item.sourceUrl+'" target="_blank" rel="noopener noreferrer" class="p-btn p-btn--secondary p-btn--lg p-btn--full" style="display:block;text-align:center;text-decoration:none;margin-bottom:10px">🔗 Leer artículo en '+_escHtml(item.sourceName||'la fuente')+'</a>' : '')
    +'<button class="p-btn p-btn--primary p-btn--lg p-btn--full" onclick="document.getElementById(\'newsDetailOv\').remove()">Cerrar</button>'
    +'</div>';
  document.body.appendChild(ov);
  ov.addEventListener('click', function(e){ if(e.target===ov) ov.remove(); });
}

// ── ACOMPAÑANTE VELO IA ──────────────────────────────────────────
var _calmAIMsgs = [];

function _initCalmAIPage(){
  _calmAIMsgs = [];
  var msgEl = document.getElementById('calmAIMessages');
  if(msgEl) msgEl.innerHTML = '';
  var ta = document.getElementById('calmAIInput');
  if(ta){ ta.value = ''; ta.style.height = ''; }
  setTimeout(function(){
    _calmAIAddMsg('Hola, estoy acá para acompañarte 🌿 ¿Cómo te sentís en este momento? Podés contarme lo que quieras, sin apuros.', false);
  }, 400);
}

function _calmAIAddMsg(text, isUser){
  _calmAIMsgs.push({text:text, user:isUser});
  var msgEl = document.getElementById('calmAIMessages');
  if(!msgEl) return;
  var div = document.createElement('div');
  div.innerHTML = _buildMsgBubble(text, isUser, '🌿', 'Acompañante Velo', 'calmAIInput', 'calmAIReplyBar', '');
  var child = div.firstElementChild;
  if(child) msgEl.appendChild(child);
  msgEl.scrollTop = msgEl.scrollHeight;
}

async function _geminiChat(systemPrompt, msgs, cfg){
  // Try Vercel serverless proxy first
  try{
    var pr = await fetch(GEMINI_PROXY, { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ type:'chat', systemPrompt:systemPrompt, msgs:msgs, cfg:cfg||{} }) });
    if(pr.ok){
      var pj = await pr.json();
      if(pj.candidates && pj.candidates[0] && pj.candidates[0].content &&
         pj.candidates[0].content.parts && pj.candidates[0].content.parts[0] &&
         pj.candidates[0].content.parts[0].text){
        return pj.candidates[0].content.parts[0].text.trim();
      }
    }
  }catch(e){}
  // Fallback: direct call
  var contents = msgs.map(function(m){
    return { role: m.user ? 'user' : 'model', parts: [{ text: m.text }] };
  });
  // Gemini requires first turn to be 'user' — strip any leading model turns
  while(contents.length && contents[0].role !== 'user') contents.shift();
  if(!contents.length) return null;
  for(var attempt = 0; attempt < GEMINI_URLS.length; attempt++){
    var url = GEMINI_URLS[(_geminiUrlIdx + attempt) % GEMINI_URLS.length];
    try{
      var res = await fetch(url + GEMINI_KEY, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: contents,
          generationConfig: Object.assign({ temperature:0.88, maxOutputTokens:200 }, cfg||{})
        })
      });
      var json = await res.json();
      if(json.candidates && json.candidates[0] && json.candidates[0].content &&
         json.candidates[0].content.parts && json.candidates[0].content.parts[0] &&
         json.candidates[0].content.parts[0].text){
        _geminiUrlIdx = (_geminiUrlIdx + attempt) % GEMINI_URLS.length;
        return json.candidates[0].content.parts[0].text.trim();
      }
      if(json.error){ console.warn('[Velo CalmAI]', json.error.message); continue; }
    }catch(e){ console.error('[Velo CalmAI]', e); continue; }
  }
  return null;
}

async function pSendCalmAIMsg(){
  var ta = document.getElementById('calmAIInput');
  if(!ta || !ta.value.trim()) return;
  var text = ta.value.trim();
  ta.value = '';
  ta.style.height = '';
  var calmQuote = _getReplyQuote('calmAIReplyBar');
  pClearReplyBar('calmAIReplyBar');
  _calmAIMsgs.push({text:text, user:true});
  var msgEl0 = document.getElementById('calmAIMessages');
  var div0 = document.createElement('div');
  div0.innerHTML = _buildMsgBubble(text, true, '', '', 'calmAIInput', 'calmAIReplyBar', calmQuote);
  var child0 = div0.firstElementChild; if(child0 && msgEl0){ msgEl0.appendChild(child0); msgEl0.scrollTop = msgEl0.scrollHeight; }
  var msgEl = document.getElementById('calmAIMessages');
  var typingDiv = document.createElement('div');
  typingDiv.id = 'calmAITyping';
  typingDiv.className = 'feed-msg';
  typingDiv.innerHTML = '<div class="feed-av">🌿</div><div><div class="feed-sender" style="font-size:11px;color:var(--ink4)">Acompañante Velo</div><div class="feed-bubble" style="color:var(--ink4);font-style:italic">Escribiendo…</div></div>';
  if(msgEl){ msgEl.appendChild(typingDiv); msgEl.scrollTop = msgEl.scrollHeight; }

  var systemPrompt = 'Sos Velo, un acompañante empático y cálido de una app de salud mental peer-to-peer. '
    +'Tu rol es escuchar activamente, validar emociones genuinamente y ofrecer apoyo real sin juzgar ni diagnosticar. '
    +'Respondés en español rioplatense (usás "vos", "te", "estás", "querés"). '
    +'Tus respuestas son breves (2-4 oraciones), naturales, cálidas y SIEMPRE específicas a lo que el usuario dice. '
    +'NUNCA repitas la misma frase. NUNCA des respuestas genéricas o de formulario. '
    +'Contextualizá siempre tu respuesta con lo que el usuario mencionó. '
    +'Si mencionan riesgo de autolesión o crisis, con calidez invitalos a la Sala de Ayuda o al 135 (Argentina). '
    +'No sos médico ni terapeuta. Sos un acompañante que escucha de verdad.';

  var reply = await _geminiChat(systemPrompt, _calmAIMsgs.slice(-12), { temperature:0.88, maxOutputTokens:200 });
  var typingEl = document.getElementById('calmAITyping');
  if(typingEl) typingEl.remove();
  if(!reply){
    _calmAIAddMsg('Hay un problema de conexión en este momento 🌿 ¿Podés intentarlo de nuevo en un instante? Estoy acá para vos.', false);
  } else {
    _calmAIAddMsg(reply, false);
  }
  _geminiCrisisCheck(text);
}

// ── SUGERENCIAS PERSONALIZADAS ──────────────────────────────────
async function _renderPersonalizedSuggestions(){
  var el = document.getElementById('homeSuggestions');
  if(!el) return;
  var moods = []; try{ moods = JSON.parse(safeLS('get','velo_mood_log')||'[]'); }catch(e){}
  if(moods.length < 3){ el.style.display='none'; return; }
  var emojiList = moods.slice(0,7).map(function(m){ return m.emoji; }).join(', ');
  var prompt = 'Sos el sistema de sugerencias de Velo, una app de salud mental peer-to-peer. '
    +'El usuario registró estos estados de ánimo recientes (del más reciente al más antiguo): '+emojiList+'. '
    +'Emojis: 😄=muy bien, 😊=bien, 😐=regular, 😞=mal, 😢=muy mal. '
    +'Secciones disponibles: guardianes=conectarse con personas que escuchan, help=Sala de Ayuda, circles=grupos temáticos, diary=escritura reflexiva, calm=respiración y meditación, bottle=mensajes anónimos al mar, news=buenas noticias del día. '
    +'Sugerí 2 secciones relevantes para este patrón de ánimo. Respondé en JSON: '
    +'[{"icon":"emoji","titulo":"nombre","razon":"una oración breve","page":"guardianes|help|circles|diary|calm|bottle|news"}] '
    +'Solo el array JSON.';
  var result = await _geminiCall(prompt);
  var sugs = [];
  if(result){
    try{ var match = result.match(/\[[\s\S]*\]/); if(match) sugs = JSON.parse(match[0]); }catch(e){}
  }
  if(!sugs.length){ el.style.display='none'; return; }
  el.style.display = '';
  el.innerHTML = '<div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--ink4);margin-bottom:10px">Sugerido para vos 💡</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
    +sugs.map(function(s){
      return '<div class="p-card p-card--hover" style="padding:14px;cursor:pointer" onclick="pGoTo(\''+_escHtml(s.page||'home')+'\')">'
        +'<div style="font-size:22px;margin-bottom:6px">'+s.icon+'</div>'
        +'<div style="font-family:\'Cormorant Garamond\',serif;font-size:15px;color:var(--ink);margin-bottom:4px">'+_escHtml(s.titulo)+'</div>'
        +'<div style="font-size:11px;color:var(--ink4);line-height:1.4">'+_escHtml(s.razon)+'</div>'
        +'</div>';
    }).join('')
    +'</div>';
}

function pOpenSOS(){
  openModal('sosOv');
  if(!_sosCountry){
    // Try to detect country by IP
    fetch('https://ipapi.co/json/')
      .then(function(r){ return r.json(); })
      .then(function(d){
        var countryCode = d.country_code || '';
        var codeMap = { AR:'🇦🇷 Argentina', UY:'🇺🇾 Uruguay', CL:'🇨🇱 Chile', CO:'🇨🇴 Colombia', MX:'🇲🇽 México', ES:'🇪🇸 España', PE:'🇵🇪 Perú', VE:'🇻🇪 Venezuela', BR:'🇧🇷 Brasil' };
        _sosCountry = codeMap[countryCode] || '🌍 Internacional';
        _renderSOSResources();
      })
      .catch(function(){ _renderSOSResources(); });
  } else {
    _renderSOSResources();
  }
}

var _sosData = {
  '🇦🇷 Argentina': [
    { label:'Policía',               num:'911',           url:'tel:911' },
    { label:'Ambulancia / SAME',     num:'107',           url:'tel:107' },
    { label:'Bomberos',              num:'100',           url:'tel:100' },
    { label:'Centro de Asistencia al Suicida', num:'135', url:'tel:135' },
    { label:'Línea 144 — Violencia de género', num:'144', url:'tel:144' },
    { label:'Ayuda LGBT+ (Buenos Aires)', num:'0800 333 IGUAL (44825)', url:'tel:08003334482' }
  ],
  '🇺🇾 Uruguay': [
    { label:'Policía',               num:'911',           url:'tel:911' },
    { label:'Ambulancia',            num:'105',           url:'tel:105' },
    { label:'Crisis emocional (INAU)', num:'0800 5050',   url:'tel:08005050' },
    { label:'Violencia doméstica',   num:'0800 4141',     url:'tel:08004141' }
  ],
  '🇨🇱 Chile': [
    { label:'Policía (Carabineros)', num:'133',           url:'tel:133' },
    { label:'Ambulancia (SAMU)',     num:'131',           url:'tel:131' },
    { label:'Bomberos',              num:'132',           url:'tel:132' },
    { label:'Fono Orientación — Salud Mental', num:'600 360 7777', url:'tel:6003607777' },
    { label:'Violencia de género (SernamEG)', num:'1455', url:'tel:1455' }
  ],
  '🇨🇴 Colombia': [
    { label:'Emergencias (todo)',    num:'123',           url:'tel:123' },
    { label:'Policía',              num:'112',           url:'tel:112' },
    { label:'Línea 106 — Salud Mental', num:'106',       url:'tel:106' },
    { label:'Violencia de género',  num:'155',           url:'tel:155' }
  ],
  '🇲🇽 México': [
    { label:'Emergencias',          num:'911',           url:'tel:911' },
    { label:'SAPTEL — Crisis emocional (24h)', num:'55 5259-8121', url:'tel:5552598121' },
    { label:'Violencia de género INMUJERES', num:'800 911 2000', url:'tel:8009112000' },
    { label:'Línea de la Vida',     num:'800 911 2000',  url:'tel:8009112000' }
  ],
  '🇪🇸 España': [
    { label:'Emergencias',          num:'112',           url:'tel:112' },
    { label:'Policía Nacional',     num:'091',           url:'tel:091' },
    { label:'Teléfono de la Esperanza', num:'717 003 717', url:'tel:717003717' },
    { label:'Violencia de género',  num:'016',           url:'tel:016' },
    { label:'Atención LGBT+',       num:'900 841 322',   url:'tel:900841322' }
  ],
  '🇵🇪 Perú': [
    { label:'Emergencias',          num:'911',           url:'tel:911' },
    { label:'Policía',              num:'105',           url:'tel:105' },
    { label:'Ambulancia (SAMU)',    num:'106',           url:'tel:106' },
    { label:'Línea 100 — Violencia', num:'100',          url:'tel:100' }
  ],
  '🇻🇪 Venezuela': [
    { label:'Emergencias',          num:'911',           url:'tel:911' },
    { label:'Defensa Civil',        num:'212',           url:'tel:212' }
  ],
  '🇧🇷 Brasil': [
    { label:'Emergencias',          num:'190',           url:'tel:190' },
    { label:'Ambulancia (SAMU)',    num:'192',           url:'tel:192' },
    { label:'CVV — Crisis emocional', num:'188',         url:'tel:188' },
    { label:'Violencia de género',  num:'180',           url:'tel:180' }
  ],
  '🌍 Internacional': [
    { label:'Befrienders Worldwide', num:'befrienders.org', url:'https://www.befrienders.org' },
    { label:'Crisis Text Line (EN)', num:'Texto HOME → 741741', url:'sms:741741' }
  ]
};

var _sosCountry = null;

function _renderSOSResources(){
  var el = document.getElementById('sosResources');
  if(!el) return;

  var countries = Object.keys(_sosData);
  var selectedCountry = _sosCountry || countries[0];

  var selectorHtml = '<div style="margin-bottom:14px">'
    +'<label style="font-size:11px;font-weight:700;color:rgba(255,255,255,.45);letter-spacing:1px;display:block;margin-bottom:6px">SELECCIONÁ TU PAÍS</label>'
    +'<select id="sosCountrySel" onchange="pSosCountry(this.value)" style="width:100%;padding:10px 14px;background:rgba(255,255,255,.08);border:1.5px solid rgba(255,255,255,.15);border-radius:12px;color:#fff;font-size:13px;font-weight:600;font-family:\'Jost\',sans-serif;cursor:pointer">'
    +countries.map(function(c){
      return '<option value="'+c+'" style="background:#0B1810;color:#fff"'+(c===selectedCountry?' selected':'')+'>'+c+'</option>';
    }).join('')
    +'</select>'
    +'</div>';

  var lines = _sosData[selectedCountry] || [];
  var linesHtml = lines.map(function(r){
    var isUrl = r.url.startsWith('http');
    return '<a href="'+r.url+'" '+(isUrl?'target="_blank" rel="noopener"':'')+' style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:rgba(192,48,40,.08);border:1px solid rgba(192,48,40,.18);border-radius:14px;margin-bottom:8px;text-decoration:none">'
      +'<div><div style="font-size:11px;font-weight:700;color:rgba(255,255,255,.45);margin-bottom:2px">'+r.label+'</div><div style="font-size:15px;color:#fff;font-weight:700">'+r.num+'</div></div>'
      +'<span style="font-size:20px">'+(isUrl?'🌐':'📞')+'</span>'
      +'</a>';
  }).join('');

  el.innerHTML = selectorHtml + linesHtml
    +'<div style="margin-top:14px;padding:12px;background:rgba(116,198,157,.06);border:1px solid rgba(116,198,157,.12);border-radius:12px;text-align:center">'
    +'<p style="font-size:11px;color:rgba(255,255,255,.4);line-height:1.5;margin:0">Esta información es de carácter informativo y se actualiza periódicamente. En caso de emergencia, contactá siempre al número de emergencias de tu país.</p>'
    +'</div>';
}

function pSosCountry(country){
  _sosCountry = country;
  _renderSOSResources();
}

// ── BOTTLE WALL ────────────────────────────────────────────────
var _bottleMoods = ['😰','😢','😤','😔','🤗','💭','😊','🌊'];

function pBottleTab(tab, btn){
  document.querySelectorAll('.bottle-tab').forEach(function(b){ b.classList.remove('active'); });
  if(btn) btn.classList.add('active');
  var listEl = document.getElementById('bottleList');
  var respEl = document.getElementById('bottleRespList');
  if(tab === 'mar'){
    if(listEl) listEl.style.display = '';
    if(respEl) respEl.style.display = 'none';
  } else {
    if(listEl) listEl.style.display = 'none';
    if(respEl){
      respEl.style.display = '';
      pRenderBottleResponses();
    }
  }
}

function pRenderBottleResponses(){
  var el = document.getElementById('bottleRespList');
  if(!el) return;
  var mockResps = [
    { myMood:'😔', myText:'A veces el silencio duele más que las palabras.', resp:'No estás solo/a en eso. Yo también lo sentí mucho tiempo. Un abrazo desde la distancia.', respTime:'hace 2 horas', respMood:'🤗' },
    { myMood:'💭', myText:'¿Alguien más siente que no encaja en ningún lado?', resp:'Sí. Muchas veces. Pero encontré que encajar no es tan importante como sentirse en paz con uno mismo. Ánimo.', respTime:'ayer', respMood:'🌿' }
  ];
  if(!mockResps.length){
    el.innerHTML = '<div class="p-empty" style="color:rgba(255,255,255,.4)"><span class="p-empty-emoji">💌</span><div class="p-empty-title" style="color:rgba(255,255,255,.6)">Sin respuestas aún</div><div class="p-empty-sub">Cuando alguien responda tu mensaje, aparecerá aquí</div></div>';
    return;
  }
  el.innerHTML = mockResps.map(function(r){
    return '<div class="dark-bottle" style="border-left:3px solid rgba(116,198,157,.3);margin-bottom:12px">'
      +'<div style="font-size:11px;color:rgba(200,165,100,.6);margin-bottom:6px">Tu mensaje ' + r.myMood + '</div>'
      +'<p style="font-size:12px;color:rgba(255,255,255,.4);font-style:italic;margin-bottom:10px;font-family:\'Cormorant Garamond\',serif">"'+r.myText+'"</p>'
      +'<div style="background:rgba(116,198,157,.06);border:1px solid rgba(116,198,157,.12);border-radius:12px;padding:12px">'
      +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span style="font-size:18px">'+r.respMood+'</span><span style="font-size:10px;color:rgba(255,255,255,.3)">'+r.respTime+'</span></div>'
      +'<p style="font-size:13px;color:rgba(255,255,255,.8);line-height:1.6;margin:0;font-family:\'Cormorant Garamond\',serif;font-style:italic">"'+r.resp+'"</p>'
      +'</div></div>';
  }).join('');
}

function pRenderBottle(){
  var moodRow = document.getElementById('bottleMoodRow');
  if(moodRow) moodRow.innerHTML = _bottleMoods.map(function(m){
    return '<button style="font-size:22px;padding:7px;border:2px solid transparent;border-radius:10px;background:none;cursor:pointer;transition:all .15s" onclick="pSelBottleMood(this,\''+m+'\')" data-mood="'+m+'">'+m+'</button>';
  }).join('');

  var list = document.getElementById('bottleList');
  if(!list) return;

  var bottles = []; try{ bottles = JSON.parse(safeLS('get','velo_my_bottles')||'[]'); }catch(e){}
  // Each bottle from the wall (not the user's own) gets a stable id for removal
  var mockBottles = [
    { id:'mb1', mood:'😔', text:'A veces el silencio duele más que las palabras.',            color:'rgba(116,198,157,.12)',   ts: Date.now()-3*60000   },
    { id:'mb2', mood:'💭', text:'¿Alguien más siente que no encaja en ningún lado?',           color:'rgba(200,165,100,.08)',   ts: Date.now()-8*60000   },
    { id:'mb3', mood:'😢', text:'Hoy recordé a alguien que ya no está. Lo extraño tanto.',     color:'rgba(196,181,232,.12)',   ts: Date.now()-15*60000  },
    { id:'mb4', mood:'🤗', text:'Para quien lo necesite: no estás solo/a. Esto también pasa.', color:'rgba(116,198,157,.1)',    ts: Date.now()-22*60000  }
  ];

  // Filter out mock bottles the user already responded to
  var responded = []; try{ responded = JSON.parse(safeLS('get','velo_bottle_responded')||'[]'); }catch(e){}
  var filteredMock = mockBottles.filter(function(b){ return responded.indexOf(b.id) < 0; });
  var allBottles = bottles.concat(filteredMock);

  if(!allBottles.length){
    list.innerHTML = '<div class="p-empty" style="color:rgba(255,255,255,.4)"><span class="p-empty-emoji">🌊</span><div class="p-empty-title" style="color:rgba(255,255,255,.6)">El mar está tranquilo</div><div class="p-empty-sub">Sé el primero en lanzar un mensaje</div></div>';
    return;
  }

  list.innerHTML = allBottles.map(function(b, i){
    var relTime = b.ts ? (function(){
      var d = Date.now()-b.ts;
      if(d<60000) return 'ahora mismo';
      if(d<3600000) return 'hace '+Math.floor(d/60000)+' min';
      return 'hace '+Math.floor(d/3600000)+'h';
    })() : 'hace unos minutos';
    return '<div class="dark-bottle" id="bottle-'+b.id+'" style="animation-delay:'+i*.08+'s;border-left:3px solid '+(b.color||'rgba(200,165,100,.3)')+'">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px"><span style="font-size:20px">'+b.mood+'</span><span style="font-size:10px;color:rgba(255,255,255,.3)">'+relTime+'</span></div>'
      +'<p style="font-size:13px;color:rgba(255,255,255,.75);line-height:1.6;margin-bottom:10px;font-family:\'Cormorant Garamond\',serif;font-style:italic">"'+b.text+'"</p>'
      +'<div style="display:flex;align-items:center;justify-content:flex-end">'
      +'<div style="display:flex;gap:7px;align-items:center">'
      +'<button style="padding:5px 11px;background:rgba(255,100,100,.08);border:1px solid rgba(255,100,100,.2);border-radius:100px;color:rgba(255,130,130,.75);font-size:11px;font-weight:700;cursor:pointer;font-family:\'Jost\',sans-serif" onclick="pReportBottle(\''+b.id+'\')">🚩 Reportar</button>'
      +'<button style="padding:5px 11px;background:rgba(200,165,100,.12);border:1px solid rgba(200,165,100,.22);border-radius:100px;color:#C8A560;font-size:11px;font-weight:700;cursor:pointer;font-family:\'Jost\',sans-serif" onclick="pOpenBottleReply(\''+b.id+'\',\''+b.text.substring(0,40).replace(/'/g,'\\\'').replace(/"/g,'&quot;')+'...\')">💌 Responder</button>'
      +'</div></div></div>';
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
  if(!_checkDailyLimit('bottle')){
    closeModal('bottleFormOv');
    pToast('🌊','Límite gratuito: 2 mensajes al Mar por día. ¡Upgrade a Plus para ilimitado!');
    setTimeout(pShowPlusModal, 1200);
    return;
  }
  var text = ta.value.trim();
  ta.value = '';
  closeModal('bottleFormOv');
  _incDailyLimit('bottle');
  var bottles = []; try{ bottles = JSON.parse(safeLS('get','velo_my_bottles')||'[]'); }catch(e){}
  var id = 'ub'+Date.now();
  bottles.unshift({ id:id, mood:_selectedBottleMood, text:text, responses:0, color:'rgba(116,198,157,.12)', ts:Date.now() });
  safeLS('set','velo_my_bottles', JSON.stringify(bottles.slice(0,50)));
  pToast('🌊','¡Mensaje lanzado al mar! 🌿');
  _geminiModerateContent(text, 'mensajes-al-mar');
  pRenderBottle();
}

var _curBottleReplyId   = null;
var _curBottleReplyText = '';

function pOpenBottleReply(bottleId, bottlePreview){
  _curBottleReplyId   = bottleId;
  _curBottleReplyText = bottlePreview;
  var preview = document.getElementById('bottleReplyPreview');
  if(preview) preview.textContent = '"'+bottlePreview+'"';
  var ta = document.getElementById('bottleReplyTa');
  if(ta) ta.value = '';
  openModal('bottleReplyOv');
}

function pSendBottleReply(){
  var ta = document.getElementById('bottleReplyTa');
  if(!ta || !ta.value.trim()){ pToast('✍️','Escribí tu respuesta antes de enviar'); return; }
  if(ta.value.trim().length < 10){ pToast('✍️','Escribí al menos 10 caracteres'); return; }
  var replyText = ta.value.trim();
  closeModal('bottleReplyOv');

  // 1. Mark bottle as responded (remove from wall)
  var responded = []; try{ responded = JSON.parse(safeLS('get','velo_bottle_responded')||'[]'); }catch(e){}
  if(_curBottleReplyId && responded.indexOf(_curBottleReplyId) < 0){
    responded.push(_curBottleReplyId);
    safeLS('set','velo_bottle_responded', JSON.stringify(responded));
  }

  // 2. Send inbox notification to "the bottle author" (simulated: goes to own inbox as demo)
  var inbox = []; try{ inbox = JSON.parse(safeLS('get','velo_inbox')||'[]'); }catch(e){}
  inbox.unshift({
    id: 'br-'+Date.now(),
    tipo: 'botella',
    icon: '🌊',
    remitente: 'Velo — Mensajes al Mar',
    asunto: '¡Tu mensaje recibió una respuesta!',
    extracto: replyText,
    cuerpo: 'Alguien encontró tu mensaje en el mar y te dejó estas palabras:\n\n"'+replyText+'"',
    leido: false,
    fecha: new Date().toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})
  });
  safeLS('set','velo_inbox', JSON.stringify(inbox.slice(0,100)));

  // 3. Animate out and re-render
  var card = document.getElementById('bottle-'+_curBottleReplyId);
  if(card){ card.style.transition = 'opacity .4s,transform .4s'; card.style.opacity='0'; card.style.transform='translateX(40px)'; }
  setTimeout(function(){
    pToast('💌','¡Respuesta enviada! El mensaje desapareció del mar 🌊');
    setTimeout(function(){ pToast('📬','El autor recibió tu respuesta en su buzón Velo'); }, 1200);
    pRenderBottle();
  }, 450);
}

function pReportBottle(bottleId){
  safeLS('set','velo_reported_bottle_'+bottleId,'1');
  var responded = []; try{ responded = JSON.parse(safeLS('get','velo_bottle_responded')||'[]'); }catch(e){}
  if(responded.indexOf(bottleId) < 0){ responded.push(bottleId); safeLS('set','velo_bottle_responded', JSON.stringify(responded)); }
  var card = document.getElementById('bottle-'+bottleId);
  if(card){ card.style.transition='opacity .35s'; card.style.opacity='0'; setTimeout(function(){ pRenderBottle(); }, 380); }
  pToast('🚩','Reporte enviado. Gracias por mantener el espacio seguro.');
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

function pClearAllDiary(){
  if(!confirm('¿Borrar todo el diario? Esta acción no se puede deshacer.')) return;
  safeLS('del','velo_diary');
  pToast('🗑️','Diario eliminado');
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
  // Load daily status fields
  pInitDailyStatus();
}

function pSelMood(el, emoji, label){
  _selMood = { emoji:emoji, label:label };
  document.querySelectorAll('.mood-orb').forEach(function(o){ o.classList.remove('selected'); });
  el.classList.add('selected');
}

// Personalized messages per mood (varied, never repeating the same in a row)
var _moodMessages = {
  '😄': [
    '¡Qué alegría! Guardá este momento en tu memoria. 🌟',
    'La energía que sentís hoy es un regalo. ¡Aprovechala!',
    'Días así son los que nos recuerdan por qué vale la pena. ✨',
    '¡Excelente! Tu bienestar irradia a todos/as a tu alrededor. 🌻'
  ],
  '😊': [
    'Un buen día. ¡Merecido! 🌱',
    'Sentirse bien es el punto de partida para todo. Seguís por buen camino.',
    'La calma y el bienestar se construyen día a día. Hoy sumas. 💚',
    '¡Bien! Cada momento tranquilo es un paso adelante. 🌿'
  ],
  '😐': [
    'Los días regulares también son válidos. Aquí estamos. 🤍',
    'No todo tiene que ser intenso. La neutralidad también es paz.',
    'Está bien no estar ni arriba ni abajo. El equilibrio se construye. 🌿',
    'Un día normal también es un día ganado. Seguí adelante. 💙'
  ],
  '😔': [
    'Gracias por registrar cómo te sentís. Eso ya es valentía. 💙',
    'Los días tristes también pasan. No estás solo/a en esto. 🤍',
    'La tristeza a veces nos dice algo importante. Escuchate.',
    'Hoy puede ser difícil, pero mañana es una página nueva. 🌱'
  ],
  '😰': [
    'La ansiedad es difícil, pero podés con esto. Respirá. 🌬️',
    '¿Probaste el ejercicio de respiración? Te lo recomendamos. 💆',
    'Paso a paso. Un momento a la vez. Estás más fuerte de lo que creés. 🌿',
    'La ansiedad miente. Sos capaz. Hoy también vas a poder. ✨'
  ],
  '😤': [
    'El enojo también es válido. Solo respirá antes de actuar. 🌬️',
    'Reconocer que estás enojado/a es el primer paso. Bien. 💪',
    'Hoy puede ser un buen día para la respiración 4-7-8. 🌊',
    'Tus emociones son válidas. Cuidate mientras las procesás. 🤍'
  ],
  '😴': [
    'El cansancio merece descanso. ¿Te das ese permiso hoy? 🌙',
    'Cuando el cuerpo pide parar, escuchalo. Es sabiduría. 💤',
    'El agotamiento es una señal. Hoy podés ir más despacio. 🌿',
    'Descansá sin culpa. Tu bienestar lo vale. 🤍'
  ],
  '🤔': [
    'La confusión a veces es el preludio de la claridad. ✨',
    'No saber también está bien. La respuesta viene cuando menos se busca. 🌱',
    'Escribir en el diario a veces ayuda a ordenar los pensamientos. 📔',
    'La incertidumbre es parte del camino. No tenés que tenerlo todo claro. 💙'
  ]
};
var _lastMoodMsgIdx = -1;

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

  // Show personalized message
  var msgs = _moodMessages[_selMood.emoji] || _moodMessages['😐'];
  var idx;
  do { idx = Math.floor(Math.random()*msgs.length); } while(idx === _lastMoodMsgIdx && msgs.length > 1);
  _lastMoodMsgIdx = idx;
  var msgEl = document.getElementById('moodSaveMsg');
  if(!msgEl){
    msgEl = document.createElement('div');
    msgEl.id = 'moodSaveMsg';
    msgEl.className = 'mood-save-msg';
    var card = document.querySelector('#pg-mood .p-card');
    if(card) card.appendChild(msgEl);
  }
  msgEl.textContent = msgs[idx];
  msgEl.style.display = 'block';
  setTimeout(function(){ if(msgEl) msgEl.style.display = 'none'; }, 6000);

  _loadMoodCalendar();
  _loadTodayMoodHome();

  // Check if 1st of month — send monthly analysis
  _checkMonthlyMoodReport();
}

// ── SATISFACTION SURVEY (every 90 days) ──────────────────────
var SURVEY_INTERVAL = 90 * 24 * 60 * 60 * 1000; // 90 days in ms
var _surveyScores   = { general: 0, utilidad: 0, recomendaria: 0 };
var _surveyFuncion  = '';

function _checkSurveyDue(){
  // Only for regular users (not admin, not pro)
  if(safeLS('get','velo_user_type') === 'admin') return;
  if(safeLS('get','velo_user_type') === 'pro') return;
  var last = parseInt(safeLS('get','velo_last_survey')||'0', 10);
  if(Date.now() - last < SURVEY_INTERVAL) return;
  // Don't send twice in the same session
  if(safeLS('get','velo_survey_sent_session') === '1') return;
  safeLS('set','velo_survey_sent_session','1');
  // Add inbox notification
  var inbox = []; try{ inbox = JSON.parse(safeLS('get','velo_inbox')||'[]'); }catch(e){}
  if(inbox.some(function(m){ return m.tipo === 'encuesta' && !m.leido; })) return; // already pending
  inbox.unshift({
    id: 'survey-'+Date.now(),
    tipo: 'encuesta',
    icon: '📊',
    remitente: 'Velo — Encuesta trimestral',
    asunto: '¿Cómo ves a Velo? Tu opinión nos importa 🌿',
    extracto: 'Tomá 2 minutos para contarnos qué tal te parece la app. Tu feedback es clave para mejorar.',
    cuerpo: '',
    accion: 'pOpenSurvey()',
    leido: false,
    fecha: new Date().toLocaleDateString('es',{day:'2-digit',month:'short'})
  });
  safeLS('set','velo_inbox', JSON.stringify(inbox.slice(0,100)));
  _updateInboxDot();
  setTimeout(function(){
    pToast('📊','¡Tenemos una encuesta para vos! Revisá tu buzón 🌿');
  }, 4000);
}

function pOpenSurvey(){
  _surveyScores = { general: 0, utilidad: 0, recomendaria: 0 };
  _surveyFuncion = '';
  var ov = document.getElementById('surveyOv');
  if(!ov) return;
  // Reset UI
  ov.querySelectorAll('.survey-btn').forEach(function(b){ b.classList.remove('selected'); });
  var ta = ov.querySelector('#surveyTa');
  if(ta) ta.value = '';
  ov.querySelectorAll('.survey-func-btn').forEach(function(b){ b.classList.remove('selected'); });
  ov.classList.add('show');
}

function pSurveyRate(q, val, el){
  _surveyScores[q] = val;
  var group = el.closest('.survey-score-group');
  if(group) group.querySelectorAll('.survey-btn').forEach(function(b){ b.classList.remove('selected'); });
  el.classList.add('selected');
}

function pSurveyFuncion(val, el){
  _surveyFuncion = val;
  var group = el.closest('.survey-func-row');
  if(group) group.querySelectorAll('.survey-func-btn').forEach(function(b){ b.classList.remove('selected'); });
  el.classList.add('selected');
}

function pSubmitSurvey(){
  if(!_surveyScores.general){ pToast('⚠️','Calificá tu experiencia general (1-10)'); return; }
  if(!_surveyScores.utilidad){ pToast('⚠️','Calificá qué tan útil te parece (1-10)'); return; }
  if(!_surveyScores.recomendaria){ pToast('⚠️','¿Con qué probabilidad la recomendarías? (1-10)'); return; }
  var ta = document.getElementById('surveyTa');
  var sugerencia = ta ? ta.value.trim() : '';
  var response = {
    ts: Date.now(),
    scores: { general: _surveyScores.general, utilidad: _surveyScores.utilidad, recomendaria: _surveyScores.recomendaria },
    funcion: _surveyFuncion || 'No indicado',
    sugerencia: sugerencia // stored generically, shown without attribution
  };
  var responses = []; try{ responses = JSON.parse(safeLS('get','velo_survey_responses')||'[]'); }catch(e){}
  responses.unshift(response);
  safeLS('set','velo_survey_responses', JSON.stringify(responses.slice(0,500)));
  safeLS('set','velo_last_survey', String(Date.now()));
  safeLS('del','velo_survey_sent_session');
  // Mark inbox message as read
  var inbox = []; try{ inbox = JSON.parse(safeLS('get','velo_inbox')||'[]'); }catch(e){}
  inbox = inbox.map(function(m){ return m.tipo==='encuesta' ? Object.assign({},m,{leido:true}) : m; });
  safeLS('set','velo_inbox', JSON.stringify(inbox));
  closeModal('surveyOv');
  pToast('💚','¡Gracias por tu opinión! Nos ayudás a mejorar Velo 🌿');
}

function _renderSurveyResults(){
  var responses = []; try{ responses = JSON.parse(safeLS('get','velo_survey_responses')||'[]'); }catch(e){}
  if(!responses.length){
    return '<p style="font-size:12px;color:rgba(255,255,255,.3);padding:12px 0">Sin respuestas aún.</p>';
  }
  var total = responses.length;
  var avgGeneral    = (responses.reduce(function(s,r){ return s + (r.scores.general||0); }, 0) / total).toFixed(1);
  var avgUtilidad   = (responses.reduce(function(s,r){ return s + (r.scores.utilidad||0); }, 0) / total).toFixed(1);
  var avgRecomend   = (responses.reduce(function(s,r){ return s + (r.scores.recomendaria||0); }, 0) / total).toFixed(1);
  // Most used feature
  var funcCount = {};
  responses.forEach(function(r){ if(r.funcion) funcCount[r.funcion] = (funcCount[r.funcion]||0)+1; });
  var topFunc = Object.keys(funcCount).sort(function(a,b){ return funcCount[b]-funcCount[a]; })[0] || '—';
  // Suggestions (generic, no attribution)
  var sugs = responses.filter(function(r){ return r.sugerencia && r.sugerencia.length > 3; }).slice(0,10);

  function scoreBar(val){
    var pct = Math.round((parseFloat(val)/10)*100);
    var color = pct >= 70 ? 'rgba(116,198,157,.8)' : pct >= 40 ? 'rgba(200,162,0,.8)' : 'rgba(220,80,80,.8)';
    return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'
      +'<div style="flex:1;height:7px;background:rgba(255,255,255,.08);border-radius:99px;overflow:hidden">'
      +'<div style="height:100%;width:'+pct+'%;background:'+color+';border-radius:99px;transition:width .5s"></div></div>'
      +'<span style="font-size:13px;font-weight:800;color:'+color+';min-width:28px;text-align:right">'+val+'</span>'
      +'</div>';
  }

  return '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:14px">'
    +'<div style="background:rgba(116,198,157,.07);border:1px solid rgba(116,198,157,.15);border-radius:12px;padding:12px;text-align:center">'
    +'<div style="font-size:11px;color:rgba(255,255,255,.4);margin-bottom:6px">Satisfacción general</div>'
    +scoreBar(avgGeneral)+'</div>'
    +'<div style="background:rgba(116,198,157,.07);border:1px solid rgba(116,198,157,.15);border-radius:12px;padding:12px;text-align:center">'
    +'<div style="font-size:11px;color:rgba(255,255,255,.4);margin-bottom:6px">Utilidad</div>'
    +scoreBar(avgUtilidad)+'</div>'
    +'<div style="background:rgba(116,198,157,.07);border:1px solid rgba(116,198,157,.15);border-radius:12px;padding:12px;text-align:center">'
    +'<div style="font-size:11px;color:rgba(255,255,255,.4);margin-bottom:6px">Recomendaría (NPS)</div>'
    +scoreBar(avgRecomend)+'</div>'
    +'</div>'
    +'<div style="display:flex;gap:10px;margin-bottom:14px">'
    +'<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:10px 14px;flex:1">'
    +'<span style="font-size:10px;color:rgba(255,255,255,.35);letter-spacing:1px">FUNCIÓN MÁS USADA</span>'
    +'<div style="font-size:15px;font-weight:700;color:rgba(255,255,255,.8);margin-top:4px">'+_escHtml(topFunc)+'</div></div>'
    +'<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:10px 14px;flex:1">'
    +'<span style="font-size:10px;color:rgba(255,255,255,.35);letter-spacing:1px">RESPUESTAS TOTALES</span>'
    +'<div style="font-size:15px;font-weight:700;color:rgba(255,255,255,.8);margin-top:4px">'+total+'</div></div>'
    +'</div>'
    +(sugs.length ? '<div style="font-size:10px;font-weight:700;color:rgba(255,255,255,.3);letter-spacing:1px;margin-bottom:8px">SUGERENCIAS (anónimas)</div>'
      + sugs.map(function(r){
          return '<div style="background:rgba(255,255,255,.04);border-left:3px solid rgba(116,198,157,.4);border-radius:0 8px 8px 0;padding:8px 10px;margin-bottom:6px;font-size:12px;color:rgba(255,255,255,.6);line-height:1.5">'+_escHtml(r.sugerencia)+'</div>';
        }).join('')
    : '');
}

async function _checkMonthlyMoodReport(){
  var today = new Date();
  if(today.getDate() !== 1) return;
  var reportKey = 'velo_mood_report_'+today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0');
  if(safeLS('get',reportKey) === '1') return;
  safeLS('set', reportKey, '1');

  var prev = new Date(today.getFullYear(), today.getMonth()-1, 1);
  var prevYear = prev.getFullYear();
  var prevMonth = prev.getMonth()+1;
  var daysInPrev = new Date(prevYear, prevMonth, 0).getDate();
  var moodCounts = {}; var totalDays = 0;
  var firstHalf = {}; var secondHalf = {};
  for(var d = 1; d <= daysInPrev; d++){
    var k = prevYear+'-'+String(prevMonth).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    var stored = safeLS('get','velo_mood_'+k);
    if(stored){ try{ var ms = JSON.parse(stored); if(ms.emoji){
      moodCounts[ms.emoji]=(moodCounts[ms.emoji]||0)+1; totalDays++;
      if(d <= 15){ firstHalf[ms.emoji]=(firstHalf[ms.emoji]||0)+1; }
      else { secondHalf[ms.emoji]=(secondHalf[ms.emoji]||0)+1; }
    }}catch(e){} }
  }

  var monthNames = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  var monthName = monthNames[prevMonth];
  var positives = (moodCounts['😄']||0) + (moodCounts['😊']||0);
  var topEmoji = totalDays ? Object.keys(moodCounts).sort(function(a,b){ return moodCounts[b]-moodCounts[a]; })[0] : null;
  var summary = totalDays ? 'Registraste '+totalDays+' días en '+monthName+'. Tu ánimo más frecuente: '+topEmoji : 'Sin registros en '+monthName;

  // Happy wall stats
  var happyStats = _happyStatsGet(prev);
  var happyLine = '';
  if(happyStats.posts || happyStats.reactionsReceived || happyStats.commentsReceived){
    var parts = [];
    if(happyStats.posts) parts.push((happyStats.posts===1?'1 momento de alegría':happyStats.posts+' momentos de alegría')+' en el Muro 🌻');
    if(happyStats.reactionsReceived) parts.push(happyStats.reactionsReceived+(happyStats.reactionsReceived===1?' reacción':' reacciones')+' recibidas 💛');
    if(happyStats.commentsReceived) parts.push(happyStats.commentsReceived+(happyStats.commentsReceived===1?' comentario':' comentarios')+' en tus publicaciones 💬');
    if(parts.length) happyLine = '\n\nEn el Muro de la Felicidad: '+parts.join(', ')+'.';
  }

  // Community activity stats
  var helpedOthers = parseInt(safeLS('get','velo_helped_others')||'0',10);
  var myBottles = []; try{ myBottles = JSON.parse(safeLS('get','velo_my_bottles')||'[]'); }catch(e){}
  var bottleCount = myBottles.filter(function(b){ var d=new Date(b.ts); return b.ts && d.getFullYear()===prevYear && (d.getMonth()+1)===prevMonth; }).length;
  var guardianConvs = parseInt(safeLS('get','velo_guardian_convs')||'0',10);

  // Detect unused sections for invitation
  var diaryArr = []; try{ diaryArr = JSON.parse(safeLS('get','velo_diary')||'[]'); }catch(e){}
  var happyArr = []; try{ happyArr = JSON.parse(safeLS('get','velo_happy_posts')||'[]'); }catch(e){}
  var unusedSections = [];
  if(!diaryArr.length) unusedSections.push('el Diario Emocional 📔');
  if(!happyArr.length) unusedSections.push('el Muro de la Felicidad 🌻');
  if(!myBottles.length) unusedSections.push('Mensajes al Mar 🌊');

  var analysis;
  if(!totalDays){
    analysis = 'No registraste tu ánimo en '+monthName+'. Recordá que el seguimiento diario te ayuda a conocerte mejor. ¡Este mes es una nueva oportunidad! 🌱';
  } else {
    // Build Gemini prompt with real data
    var moodList = Object.entries(moodCounts).map(function(e){ return e[0]+' ('+e[1]+' días)'; }).join(', ');
    var topFirst  = Object.keys(firstHalf).sort(function(a,b){ return (firstHalf[b]||0)-(firstHalf[a]||0); })[0]||'variado';
    var topSecond = Object.keys(secondHalf).sort(function(a,b){ return (secondHalf[b]||0)-(secondHalf[a]||0); })[0]||'variado';
    var pct = Math.round(positives/totalDays*100);
    var prompt = 'Sos un asistente empático de bienestar emocional de la app Velo.\n'
      +'Analizá los registros de ánimo del usuario en '+monthName+' y escribí un mensaje personalizado, cálido y esperanzador en español rioplatense (usá "vos/te").\n\n'
      +'Datos reales del mes:\n'
      +'- Días registrados: '+totalDays+' de '+daysInPrev+' posibles\n'
      +'- Distribución: '+moodList+'\n'
      +'- Primera quincena: predominó '+topFirst+'\n'
      +'- Segunda quincena: predominó '+topSecond+'\n'
      +'- Días con ánimo positivo: '+pct+'%\n'
      +(happyStats.posts?'- Publicó '+happyStats.posts+' momentos en el Muro de la Felicidad\n':'')
      +(happyStats.reactionsReceived?'- Recibió '+happyStats.reactionsReceived+' reacciones en el Muro\n':'')
      +(helpedOthers?'- Acompañó a '+helpedOthers+' persona(s) como guardián/a\n':'')
      +(bottleCount?'- Envió '+bottleCount+' mensaje(s) al Mar\n':'')
      +(guardianConvs?'- Total de conversaciones como guardián: '+guardianConvs+'\n':'')
      +'\nEscribí 3-4 oraciones que:\n'
      +'1. Reconozcan cómo fue el mes con honestidad\n'
      +'2. Destaquen algún patrón o tendencia real de los datos\n'
      +'3. Terminen con un mensaje motivador sin ser cursi\n'
      +'Sin asteriscos, sin markdown, sin listas. Solo texto corrido. Máximo 90 palabras.';

    var aiText = await _geminiCall(prompt);
    analysis = aiText || (pct >= 60
      ? '¡'+monthName+' fue un mes mayormente positivo para vos! '+pct+'% de tus días registraste bienestar. Seguí construyendo ese espacio de cuidado. 🌻'
      : pct >= 35
        ? monthName+' tuvo sus altibajos. Lo importante es que seguís registrando y avanzando. 💙'
        : 'Parece que '+monthName+' fue un mes desafiante. Gracias por seguir registrando incluso en los días difíciles. 🌿');
  }

  // Build rich message body
  var extraLines = '';
  if(helpedOthers > 0) extraLines += '\n\n💙 Acompañaste a '+helpedOthers+' persona'+(helpedOthers>1?'s':'')+' este mes. Eso importa más de lo que imaginás.';
  if(bottleCount > 0) extraLines += '\n\n🌊 Lanzaste '+bottleCount+' mensaje'+(bottleCount>1?'s':'')+' al Mar. Esas palabras llegaron a alguien que las necesitaba.';
  if(unusedSections.length > 0 && unusedSections.length <= 2) extraLines += '\n\n✨ ¿Todavía no exploraste '+unusedSections.join(' ni ')+'? Este mes es un buen momento para descubrirlos.';
  extraLines += '\n\n🌻 Si Velo te está siendo útil, considerá apoyar con una donación. Cada aporte ayuda a mantener este espacio gratuito para más personas.';

  var inbox = []; try{ inbox = JSON.parse(safeLS('get','velo_inbox')||'[]'); }catch(e){}
  inbox.unshift({
    id: 'mood-report-'+Date.now(), tipo:'reporte', icon:'📊',
    remitente:'Velo — Análisis de Bienestar ✨',
    asunto:'Tu resumen emocional de '+monthName+' 🌿',
    extracto: summary,
    cuerpo: analysis + happyLine + extraLines,
    leido:false,
    fecha: new Date().toLocaleDateString('es',{day:'2-digit',month:'short'})
  });
  safeLS('set','velo_inbox', JSON.stringify(inbox.slice(0,100)));
  _updateInboxDot();
  setTimeout(function(){ pToast('📊','Recibiste tu análisis de '+monthName+' en el buzón 💚'); }, 3000);
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
        return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">'
          +'<span style="font-size:20px">'+e.emoji+'</span>'
          +'<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;color:var(--ink)">'+e.label+'</div>'
          +'<div style="font-size:11px;color:var(--ink5)">'+k+(e.note?' · '+e.note:'')+'</div></div>'
          +'<button onclick="pDeleteMood(\''+k+'\')" style="font-size:14px;background:none;border:none;cursor:pointer;color:var(--ink5);padding:4px 6px;border-radius:6px;flex-shrink:0" title="Eliminar registro">🗑️</button>'
          +'</div>';
      }).join('');
    }
  }
}

function pClearAllMoods(){
  if(!confirm('¿Borrar todo el historial de ánimo? Esta acción no se puede deshacer.')) return;
  // Remove all velo_mood_* and velo_daily_status_* keys
  var toRemove = [];
  for(var i = 0; i < localStorage.length; i++){
    var k = localStorage.key(i);
    if(k && (k.startsWith('velo_mood_') || k.startsWith('velo_daily_status_'))) toRemove.push(k);
  }
  toRemove.forEach(function(k){ localStorage.removeItem(k); });
  pToast('🗑️','Historial de ánimo eliminado');
  pInitMood();
}

function pDeleteMood(dateKey){
  if(!confirm('¿Eliminar el registro del '+dateKey+'?')) return;
  localStorage.removeItem('velo_mood_'+dateKey);
  localStorage.removeItem('velo_daily_status_'+dateKey);
  pToast('🗑️','Registro eliminado');
  _loadMoodCalendar();
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
  safeLS('set','velo_breathed_once','1');
}

// ── VELA ───────────────────────────────────────────────────────
// Vela por ti — programa solidario que conecta usuarios con profesionales licenciados
// en sesiones gratuitas o subsidiadas, financiado por donaciones de la comunidad.
function pInitVela(){
  // Nothing to init — static form
}

function pSendVela(){
  var tipo = document.getElementById('velaTipo');
  var espec = document.getElementById('velaEspec');
  var urgencia = document.querySelector('input[name="velaUrgencia"]:checked');
  var desc = document.getElementById('velaDesc');
  if(!tipo || !tipo.value){ pToast('⚠️','Elegí el tipo de profesional'); return; }
  if(!espec || !espec.value){ pToast('⚠️','Elegí la especialización'); return; }
  if(!urgencia){ pToast('⚠️','Indicá el nivel de urgencia'); return; }
  pToast('🕯️','Solicitud enviada. Te contactaremos en 7-14 días 💚');
  if(tipo) tipo.value = '';
  if(espec) espec.value = '';
  if(desc) desc.value = '';
  document.querySelectorAll('input[name="velaUrgencia"]').forEach(function(r){ r.checked = false; });
  document.querySelectorAll('input[name="velaHorario"]').forEach(function(r){ r.checked = false; });
  setTimeout(function(){ pGoTo('home'); }, 1800);
}

// ── CIRCLES ────────────────────────────────────────────────────
var _circlesData = [
  { id:'c1', name:'Manejo de Ansiedad', emoji:'🌊', members:28, maxMembers:30, desc:'Estrategias y apoyo para el día a día con ansiedad.', active:true, official:true },
  { id:'c2', name:'Duelo y Pérdida', emoji:'🌙', members:19, maxMembers:30, desc:'Acompañamiento en procesos de duelo. Sin prisas.', active:false, official:true },
  { id:'c3', name:'Crianza Consciente', emoji:'🌱', members:24, maxMembers:30, desc:'Madres, padres y familias que crían con presencia.', active:false, official:true },
  { id:'c4', name:'Trastornos del Sueño', emoji:'😴', members:17, maxMembers:30, desc:'Cuando la noche no descansa. Juntos buscamos calma.', active:false, official:true },
  { id:'c5', name:'Autoestima', emoji:'✨', members:22, maxMembers:30, desc:'Reconstruir la confianza desde la raíz.', active:false, official:true }
];

var _curCircle = null;
var _circleAutoMsgTimer = null;

// Mock messages per circle (stored in localStorage)
var _circleMockUsers = [
  { name:'Ana Luz', av:'🌸', badge:'🥇' },
  { name:'Carlos R.', av:'🌊', badge:'🥇' },
  { name:'Valentina S.', av:'🦋', badge:'💎' },
  { name:'Tomás L.', av:'🌿', badge:'🥇' },
  { name:'Sofía N.', av:'🌙', badge:'💎' }
];

var _circleMockMsgPool = [
  'Gracias por compartir eso. Me identifico mucho.',
  'Un abrazo virtual para quien lo necesite 💚',
  '¿Alguien tiene alguna técnica que le haya servido para el día a día?',
  'Hoy fue un día difícil, pero estoy acá.',
  'Recordá: está bien no estar bien. Paso a paso.',
  'Esto es exactamente lo que necesitaba hoy, gracias.',
  'Llevan razón. El apoyo de la comunidad hace una diferencia enorme.',
  'Yo también pasé por eso. Se puede salir.',
  '🌿 Respiremos juntos un momento.',
  'No están solos/as acá. Todos estamos en algún proceso.'
];

function pRenderCircles(){
  var list = document.getElementById('circlesList');
  if(!list) return;

  var userConvs = parseInt(safeLS('get','velo_guardian_convs')||'0', 10);
  var canCreate = userConvs >= 40 || _isPremium();
  var badge = _getBadge(userConvs);

  // Update create button state
  var createBtn = document.getElementById('circleCreateBtn');
  if(createBtn){
    if(canCreate){
      createBtn.disabled = false;
      createBtn.textContent = '+ Crear círculo';
      createBtn.title = '';
    } else {
      createBtn.disabled = true;
      createBtn.textContent = '🔒 Crear círculo';
      createBtn.title = 'Necesitás ser Guardián Oro (40 conversaciones) o Velo Plus';
    }
  }

  // Restriction notice
  var notice = document.getElementById('circleCreateNotice');
  if(notice){
    if(!canCreate){
      var convsFalta = 40 - userConvs;
      notice.innerHTML = '<div style="font-size:12px;color:var(--ink4);background:var(--sage7);border:1px solid var(--border);border-radius:12px;padding:10px 14px;margin-bottom:14px;line-height:1.5">'
        +'🛡️ Los Círculos los crean <strong>Guardianes Oro</strong> (40+ conversaciones). '
        +'Te faltan <strong>'+convsFalta+' conversaciones</strong> para llegar a Oro, o podés activar <strong>Velo Plus</strong> para crearlo ahora.'
        +'</div>';
    } else {
      notice.innerHTML = '';
    }
  }

  // Render user-created circles
  var userCircles = []; try{ userCircles = JSON.parse(safeLS('get','velo_circles')||'[]'); }catch(e){}
  var allCircles  = userCircles.concat(_circlesData);

  list.innerHTML = allCircles.map(function(c){
    var msgs = []; try{ msgs = JSON.parse(safeLS('get','velo_circle_'+c.id)||'[]'); }catch(e){}
    var lastMsg = msgs.length ? msgs[msgs.length-1] : null;
    var maxM = c.maxMembers || 30;
    var capPct = Math.min(100, Math.round((c.members||0)/maxM*100));
    var isFull = (c.members||0) >= maxM;
    return '<div class="circle-card'+(c.official?' circle-card--official':'')+'" onclick="pOpenCircle(\''+c.id+'\')">'
      +'<div style="display:flex;align-items:center;gap:13px">'
      +'<div style="font-size:34px;width:52px;height:52px;border-radius:18px;background:var(--sage7);display:flex;align-items:center;justify-content:center;flex-shrink:0;position:relative">'
      +c.emoji
      +(c.official ? '<span style="position:absolute;bottom:-4px;right:-4px;font-size:12px;background:#fff;border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,.15)" title="Sala oficial Velo">🛡️</span>' : '')
      +'</div>'
      +'<div style="flex:1;min-width:0">'
      +'<div style="font-size:15px;font-weight:700;color:var(--ink);margin-bottom:2px">'+c.name+'</div>'
      +'<div style="font-size:12px;color:var(--ink4);margin-bottom:5px">'+c.desc+'</div>'
      +(lastMsg
        ? '<div style="font-size:11px;color:var(--ink5);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:5px">'+lastMsg.av+' '+lastMsg.name+': '+lastMsg.text+'</div>'
        : '<div style="height:5px"></div>')
      +'<div style="display:flex;align-items:center;gap:6px">'
      +'<div style="flex:1;height:4px;background:var(--cream2);border-radius:100px;overflow:hidden"><div style="height:100%;width:'+capPct+'%;background:'+(isFull?'var(--sos)':'var(--sage3)')+';border-radius:100px"></div></div>'
      +'<span style="font-size:10px;color:var(--ink5)">'+c.members+'/'+maxM+'</span>'
      +(isFull ? '<span style="font-size:10px;color:var(--sos);font-weight:700">Lleno</span>' : '')
      +'</div>'
      +'</div>'
      +'<div style="text-align:right;flex-shrink:0;margin-left:6px">'
      +(c.active ? '<span class="p-pill p-pill--live" style="font-size:10px"><span class="p-ldot p-ldot--on"></span> Activo</span><br>' : '')
      +(c.official ? '<span style="font-size:10px;color:var(--sage);font-weight:700">Oficial</span>' : '')
      +'</div>'
      +'</div>'
      +'</div>';
  }).join('');
}

function pOpenCircle(id, circleData){
  _curCircle = typeof circleData === 'string' ? JSON.parse(circleData) : circleData;
  if(!_curCircle){ _curCircle = _circlesData.find(function(c){ return c.id===id; }); }

  // Populate feed header
  _setEl('feedCircleName',  _curCircle ? _curCircle.name  : 'Círculo');
  _setEl('feedCircleEmoji', _curCircle ? _curCircle.emoji : '⭕');
  _setEl('feedCircleMembers', _curCircle ? _curCircle.members+' personas' : '');
  var rulesEl = document.getElementById('feedCircleRules');
  if(rulesEl) rulesEl.innerHTML = '🤝 Sin juicios · Sin agresión · Sin consejo no solicitado';

  pGoTo('feed');
  setTimeout(function(){ _renderCircleMessages(); _startCircleAutoMsg(); }, 100);
}

function _renderCircleMessages(){
  var el = document.getElementById('feedMessages');
  if(!el || !_curCircle) return;
  var msgs = []; try{ msgs = JSON.parse(safeLS('get','velo_circle_'+_curCircle.id)||'[]'); }catch(e){}

  // Seed with mock messages on first open
  if(!msgs.length){
    var now = Date.now();
    msgs = [
      { id:'cm0', av:'💎', name:'Valentina S. 💎', text:'¡Bienvenidos/as al círculo! Recuerden las reglas: este es un espacio seguro.', ts: now-28*60000, own:false },
      { id:'cm1', av:'🌸', name:'Ana Luz 🥇',      text:'Hola a todos/as. Hoy me siento un poco mejor que ayer 🌱', ts: now-15*60000, own:false },
      { id:'cm2', av:'🌿', name:'Tomás L. 🥇',      text:'Qué bueno escuchar eso Ana. El progreso a veces es pequeño pero siempre cuenta.', ts: now-10*60000, own:false }
    ];
    safeLS('set','velo_circle_'+_curCircle.id, JSON.stringify(msgs));
  }

  el.innerHTML = msgs.map(function(m){
    var t = new Date(m.ts);
    var tStr = t.getHours()+':'+(t.getMinutes()<10?'0':'')+t.getMinutes();
    return _buildMsgBubble(m.text, !!m.own, m.av, m.name, 'feedInput', 'feedReplyBar', '');
  }).join('');
  el.scrollTop = el.scrollHeight;
}

function pSendCircleMsg(){
  var ta = document.getElementById('feedInput');
  if(!ta || !ta.value.trim() || !_curCircle) return;
  var text = ta.value.trim();
  ta.value = '';
  ta.style.height = '';

  var msgs = []; try{ msgs = JSON.parse(safeLS('get','velo_circle_'+_curCircle.id)||'[]'); }catch(e){}
  var name = safeLS('get','velo_user_name') || 'Vos';
  var av   = safeLS('get','velo_user_av')   || '🧑';
  var userConvs = parseInt(safeLS('get','velo_guardian_convs')||'0', 10);
  var badge = _getBadge(userConvs);
  msgs.push({ id:'m'+Date.now(), av:av, name:name+' '+badge.icon, text:text, ts:Date.now(), own:true });
  safeLS('set','velo_circle_'+_curCircle.id, JSON.stringify(msgs.slice(-100)));
  _geminiModerateContent(text, 'circulo-'+_curCircle.id);
  _renderCircleMessages();

  // Simulated reply after 4-9 seconds
  var delay = 4000 + Math.random()*5000;
  setTimeout(function(){
    if(!_curCircle) return;
    var user = _circleMockUsers[Math.floor(Math.random()*_circleMockUsers.length)];
    var reply = _circleMockMsgPool[Math.floor(Math.random()*_circleMockMsgPool.length)];
    var msgs2 = []; try{ msgs2 = JSON.parse(safeLS('get','velo_circle_'+_curCircle.id)||'[]'); }catch(e){}
    msgs2.push({ id:'mr'+Date.now(), av:user.av, name:user.name+' '+user.badge, text:reply, ts:Date.now(), own:false });
    safeLS('set','velo_circle_'+_curCircle.id, JSON.stringify(msgs2.slice(-100)));
    _renderCircleMessages();
  }, delay);
}

function _startCircleAutoMsg(){
  if(_circleAutoMsgTimer) clearInterval(_circleAutoMsgTimer);
  _circleAutoMsgTimer = setInterval(function(){
    if(!_curCircle) return;
    var user = _circleMockUsers[Math.floor(Math.random()*_circleMockUsers.length)];
    var text = _circleMockMsgPool[Math.floor(Math.random()*_circleMockMsgPool.length)];
    var msgs = []; try{ msgs = JSON.parse(safeLS('get','velo_circle_'+_curCircle.id)||'[]'); }catch(e){}
    msgs.push({ id:'ma'+Date.now(), av:user.av, name:user.name+' '+user.badge, text:text, ts:Date.now(), own:false });
    safeLS('set','velo_circle_'+_curCircle.id, JSON.stringify(msgs.slice(-100)));
    _renderCircleMessages();
  }, 45000 + Math.random()*30000); // every 45-75 seconds
}

function pLeaveCircle(){
  if(_circleAutoMsgTimer){ clearInterval(_circleAutoMsgTimer); _circleAutoMsgTimer = null; }
  _curCircle = null;
  pGoTo('circles');
}

function pOpenCreateCircle(){
  var userConvs = parseInt(safeLS('get','velo_guardian_convs')||'0', 10);
  var canCreate = userConvs >= 40 || _isPremium();
  if(!canCreate){
    var falta = 40 - userConvs;
    pToast('🔒','Necesitás Guardián Oro (te faltan '+falta+' conversaciones) o Velo Plus');
    return;
  }
  var ov = document.getElementById('createCircleOv');
  if(ov) ov.classList.add('show');
}

function pSubmitCreateCircle(){
  var nameEl  = document.getElementById('newCircleName');
  var descEl  = document.getElementById('newCircleDesc');
  var emoji   = _selectedCircleEmoji || '⭕';
  if(!nameEl || !nameEl.value.trim()){ pToast('⚠️','Poné un nombre al círculo'); return; }
  var c = {
    id: 'uc'+Date.now(),
    name: nameEl.value.trim(),
    desc: descEl ? descEl.value.trim() : '',
    emoji: emoji,
    members: 1,
    active: true
  };
  var circles = []; try{ circles = JSON.parse(safeLS('get','velo_circles')||'[]'); }catch(e){}
  circles.unshift(c);
  safeLS('set','velo_circles', JSON.stringify(circles.slice(0,20)));
  closeModal('createCircleOv');
  pToast('⭕','¡Círculo "'+c.name+'" creado! 🌿');
  pRenderCircles();
}

var _selectedCircleEmoji = '⭕';
var _circleEmojiOptions = ['⭕','🌊','🌙','🌱','✨','🌈','🦋','🌸','🏔️','💙','🌿','☀️'];
function pOpenCircleEmojiPicker(){
  var row = document.getElementById('newCircleEmojiRow');
  if(!row) return;
  row.innerHTML = _circleEmojiOptions.map(function(e){
    return '<button style="font-size:24px;padding:6px;border:2px solid '+(_selectedCircleEmoji===e?'var(--sage3)':'transparent')+';border-radius:10px;background:none;cursor:pointer" onclick="pSelCircleEmoji(this,\''+e+'\')">'+e+'</button>';
  }).join('');
}

function pSelCircleEmoji(btn, emoji){
  _selectedCircleEmoji = emoji;
  var preview = document.getElementById('newCircleEmojiPreview');
  if(preview) preview.textContent = emoji;
  document.querySelectorAll('#newCircleEmojiRow button').forEach(function(b){
    b.style.borderColor = b.textContent === emoji ? 'var(--sage3)' : 'transparent';
  });
}

function pReportCircle(){
  var circleName = _curCircle ? _curCircle.name : 'este círculo';
  var ov = document.createElement('div');
  ov.className = 'p-modal-ov show';
  ov.innerHTML = '<div class="p-sheet">'
    +'<div class="p-sheet-handle"></div>'
    +'<div style="font-family:\'Cormorant Garamond\',serif;font-size:20px;color:var(--ink);margin-bottom:8px">⚠️ Reportar comportamiento</div>'
    +'<p style="font-size:12px;color:var(--ink4);margin-bottom:14px;line-height:1.5">¿Qué está pasando en "'+_escHtml(circleName)+'"?</p>'
    +'<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px">'
    +['Mensaje agresivo o hiriente','Discurso de odio','Spam o autopromoción','Consejo médico inapropiado','Otro'].map(function(r){
      return '<label style="display:flex;align-items:center;gap:10px;font-size:13px;color:var(--ink3);cursor:pointer"><input type="radio" name="rpt" value="'+r+'" style="accent-color:var(--sage2)"> '+r+'</label>';
    }).join('')
    +'</div>'
    +'<textarea class="p-textarea" id="rptDetail" rows="2" placeholder="Detalles adicionales (opcional)" style="margin-bottom:12px"></textarea>'
    +'<div style="display:flex;gap:8px">'
    +'<button class="p-btn p-btn--primary p-btn--md p-btn--full" style="background:var(--sos);border-color:var(--sos)" onclick="pSubmitCircleReport(this.closest(\'.p-modal-ov\'))">Enviar reporte</button>'
    +'<button class="p-btn p-btn--secondary p-btn--md p-btn--full" onclick="this.closest(\'.p-modal-ov\').remove()">Cancelar</button>'
    +'</div>'
    +'</div>';
  document.body.appendChild(ov);
}

function pSubmitCircleReport(ov){
  var checked = document.querySelector('input[name="rpt"]:checked');
  if(!checked){ pToast('⚠️','Seleccioná un motivo'); return; }
  if(ov) ov.remove();
  pToast('✅','Reporte enviado. El equipo de Velo lo revisará en 24h 🙏');
  // Log to audit trail
  var audit = []; try{ audit = JSON.parse(safeLS('get','velo_audit_log')||'[]'); }catch(e){}
  audit.unshift({ ts: Date.now(), tipo:'report_circle', circle: _curCircle ? _curCircle.id : '?', motivo: checked.value });
  safeLS('set','velo_audit_log', JSON.stringify(audit.slice(0,500)));
}

// ── HAPPY WALL ─────────────────────────────────────────────────
// ── MURO — STATS MENSUALES ────────────────────────────────────
function _happyStatsKey(d){
  d = d || new Date();
  return 'velo_happy_stats_'+d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
}
function _happyStatIncr(field){
  var key = _happyStatsKey();
  var s = {}; try{ s = JSON.parse(safeLS('get',key)||'{}'); }catch(e){}
  s[field] = (s[field]||0) + 1;
  safeLS('set', key, JSON.stringify(s));
}
function _happyStatsGet(monthDate){
  var key = _happyStatsKey(monthDate);
  try{ return JSON.parse(safeLS('get',key)||'{}'); }catch(e){ return {}; }
}

// ── MURO DE LA FELICIDAD ──────────────────────────────────────
var HAPPY_TTL       = 24 * 60 * 60 * 1000; // 24 horas
var HAPPY_MAX       = 50;                   // máximo de posts en el muro global
var _happyEmojis    = ['☀️','🌻','🎉','🌈','💚','🌸','✨','🌱','🎵','🙌','🦋','💛'];
var _happyReactEmojis = ['💛','🌸','🤗','🌿','✨'];
var _selectedHappyEmoji = '☀️';
var _happyActiveTab = 'all'; // 'all' | 'mine' | 'history'

function pToggleHappyInfo(){
  var panel = document.getElementById('happyInfoPanel');
  if(!panel) return;
  panel.style.display = panel.style.display === 'none' ? '' : 'none';
}

function _myUserId(){
  return safeLS('get','velo_user_email') || 'guest-'+(safeLS('get','velo_user_name')||'user');
}

// Demo posts — richer structure
var _happyMock = (function(){
  var now = Date.now();
  return [
    { id:'hm1', userId:'demo', emoji:'🌻', text:'Hoy mi hijo me dijo "te quiero" sin que se lo pidiera. El día se convirtió en el mejor del año.', name:'Lara M.', ts: now-5*60*1000,   reactions:{'💛':12,'🌸':4,'🤗':3,'🌿':1,'✨':2}, comments:[{name:'Sofía',text:'¡Eso es todo! 💛',ts:now-3*60*1000}] },
    { id:'hm2', userId:'demo', emoji:'🎉', text:'Conseguí el trabajo que tanto quería después de un año de intentos. ¡Nunca me rendí!',          name:'Martín P.', ts: now-12*60*1000, reactions:{'💛':34,'🌸':8,'🤗':15,'🌿':5,'✨':10}, comments:[{name:'Ana',text:'¡Felicitaciones! 🎉',ts:now-10*60*1000},{name:'Tomás',text:'Te lo merecés 💪',ts:now-8*60*1000}] },
    { id:'hm3', userId:'demo', emoji:'🌱', text:'Fui a terapia por primera vez. Me costó meses decidirme. Valió la pena dar ese paso.',           name:'Valentina S.', ts: now-20*60*1000, reactions:{'💛':28,'🌸':12,'🤗':9,'🌿':6,'✨':7}, comments:[] },
    { id:'hm4', userId:'demo', emoji:'☀️', text:'Salí a caminar sin el celular. El mundo sigue siendo hermoso cuando lo mirás de verdad.',        name:'Emilio T.', ts: now-35*60*1000, reactions:{'💛':19,'🌸':3,'🤗':2,'🌿':8,'✨':5}, comments:[{name:'Lucía',text:'Necesito hacer eso también 🌿',ts:now-30*60*1000}] }
  ];
})();

function _happyTimeLeft(ts){
  var ms = (ts + HAPPY_TTL) - Date.now();
  if(ms <= 0) return null;
  var h = Math.floor(ms / 3600000);
  var m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? 'Expira en '+h+'h '+m+'m' : 'Expira en '+m+' min';
}

function _happyRelTime(ts){
  var diff = Date.now() - ts;
  if(diff < 60000)   return 'ahora mismo';
  if(diff < 3600000) return 'hace '+Math.floor(diff/60000)+' min';
  return 'hace '+Math.floor(diff/3600000)+'h';
}

function _happyLoad(){
  var posts = []; try{ posts = JSON.parse(safeLS('get','velo_happy')||'[]'); }catch(e){}
  return posts;
}
function _happySave(posts){
  safeLS('set','velo_happy', JSON.stringify(posts));
}
function _happyQueueLoad(){
  var q = []; try{ q = JSON.parse(safeLS('get','velo_happy_queue')||'[]'); }catch(e){}
  return q;
}
function _happyQueueSave(q){
  safeLS('set','velo_happy_queue', JSON.stringify(q));
}

// Called on every render: expire old posts and promote queue
function _processHappyQueue(){
  var now    = Date.now();
  var posts  = _happyLoad();
  var before = posts.length;
  posts = posts.filter(function(p){ return (p.ts + HAPPY_TTL) > now; });
  var freed  = before - posts.length;

  var queue  = _happyQueueLoad();
  var notified = [];
  for(var i = 0; i < freed && queue.length > 0; i++){
    var next = queue.shift();
    next.ts = now;  // publish now
    posts.unshift(next);
    notified.push(next);
  }
  _happySave(posts);
  _happyQueueSave(queue);

  // Notify users whose posts just published
  notified.forEach(function(p){
    if(p.userId === _myUserId()){
      pToast('☀️','¡Tu publicación se publicó en el Muro! 💛');
      var inbox = []; try{ inbox = JSON.parse(safeLS('get','velo_inbox')||'[]'); }catch(e){}
      inbox.unshift({ id:'hpub-'+Date.now(), tipo:'muro', icon:'☀️', remitente:'Muro de la Felicidad',
        asunto:'¡Tu publicación ya está en el Muro! ☀️',
        extracto:'Se liberó un lugar y tu momento de alegría ya es visible para toda la comunidad.',
        leido:false, fecha:new Date().toLocaleDateString('es',{day:'2-digit',month:'short'}) });
      safeLS('set','velo_inbox', JSON.stringify(inbox.slice(0,100)));
      _updateInboxDot();
    }
  });

  return posts;
}

function pRenderHappy(){
  var list = document.getElementById('happyList');
  if(!list) return;
  pOpenHappyPost(); // initialize emoji row in inline form
  var posts = _processHappyQueue();
  var queue = _happyQueueLoad();
  var myId  = _myUserId();

  // Queue notice
  var queueNote = document.getElementById('happyQueueNote');
  var myQueued  = queue.find(function(p){ return p.userId === myId; });
  if(queueNote){
    if(myQueued){
      var pos = queue.indexOf(myQueued) + 1;
      queueNote.style.display = '';
      queueNote.innerHTML = '⏳ Tu publicación está en lista de espera (posición '+pos+' de '+queue.length+'). Se publicará automáticamente cuando se libere un lugar en el muro.';
    } else {
      queueNote.style.display = 'none';
    }
  }

  // Counter
  var counter = document.getElementById('happyCounter');
  if(counter) counter.textContent = posts.length+'/'+HAPPY_MAX+' publicaciones activas';

  if(_happyActiveTab === 'mine'){
    _renderMyHappy(list, posts, queue, myId);
  } else if(_happyActiveTab === 'history'){
    _renderHappyHistory(list);
  } else {
    _renderAllHappy(list, posts);
  }
}

function _renderAllHappy(list, posts){
  var all = posts.concat(_happyMock);
  if(!all.length){
    list.innerHTML = '<div class="p-empty" style="grid-column:1/-1"><span class="p-empty-emoji">☀️</span><div class="p-empty-title">El muro está vacío</div><div class="p-empty-sub">¡Sé el primero en compartir un momento de alegría!</div></div>';
    return;
  }
  list.innerHTML = all.map(function(h){ return _happyPostCard(h, false); }).join('');
}

function _renderMyHappy(list, posts, queue, myId){
  var mine = posts.filter(function(p){ return p.userId === myId; });
  var myQueued = queue.filter(function(p){ return p.userId === myId; });

  if(!mine.length && !myQueued.length){
    list.innerHTML = '<div class="p-empty" style="grid-column:1/-1"><span class="p-empty-emoji">🌸</span>'
      +'<div class="p-empty-title">Todavía no publicaste</div>'
      +'<div class="p-empty-sub">Compartí un momento de alegría con la comunidad ☀️</div></div>';
    return;
  }

  var html = '';
  // Pending posts
  myQueued.forEach(function(p){
    html += '<div class="happy-card" style="border:1.5px dashed rgba(255,200,50,.4);opacity:.8">'
      +'<div style="font-size:11px;font-weight:700;color:rgba(255,180,30,.8);margin-bottom:8px;display:flex;align-items:center;gap:6px">⏳ En lista de espera</div>'
      +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">'
      +'<div style="font-size:26px;width:42px;height:42px;border-radius:13px;background:var(--sun3);display:flex;align-items:center;justify-content:center">'+p.emoji+'</div>'
      +'<div><div style="font-size:13px;font-weight:600;color:var(--ink)">'+_escHtml(p.name)+'</div>'
      +'<div style="font-size:10px;color:var(--ink5)">Enviado '+_happyRelTime(p.ts)+'</div></div></div>'
      +'<p style="font-size:13px;color:var(--ink3);line-height:1.6;font-family:\'Cormorant Garamond\',serif;font-style:italic">"'+_escHtml(p.text)+'"</p>'
      +'</div>';
  });
  // Published mine
  mine.forEach(function(h){ html += _happyPostCard(h, true); });
  list.innerHTML = html;
}

function _renderHappyHistory(list){
  var history = []; try{ history = JSON.parse(safeLS('get','velo_happy_history')||'[]'); }catch(e){}
  if(!history.length){
    list.innerHTML = '<div class="p-empty" style="grid-column:1/-1"><span class="p-empty-emoji">📅</span>'
      +'<div class="p-empty-title">Tu historial está vacío</div>'
      +'<div class="p-empty-sub">Cuando publiques algo en el Muro, quedará guardado aquí para siempre 🌟</div></div>';
    return;
  }
  list.innerHTML = history.map(function(h, i){
    var date = new Date(h.ts);
    var dateStr = date.toLocaleDateString('es', { day:'2-digit', month:'short', year:'numeric' });
    var timeStr = date.toLocaleTimeString('es', { hour:'2-digit', minute:'2-digit' });
    return '<div class="happy-card" style="position:relative">'
      +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">'
      +'<div style="font-size:24px;width:40px;height:40px;border-radius:12px;background:var(--sun3);display:flex;align-items:center;justify-content:center;flex-shrink:0">'+h.emoji+'</div>'
      +'<div style="flex:1;min-width:0">'
      +'<div style="font-size:11px;font-weight:700;color:var(--sage)">Mi publicación</div>'
      +'<div style="font-size:10px;color:var(--ink5)">'+dateStr+' · '+timeStr+'</div>'
      +'</div>'
      +(i===0 ? '<span style="font-size:10px;background:var(--sage7);color:var(--sage);border-radius:100px;padding:2px 8px;font-weight:700;white-space:nowrap">Más reciente</span>' : '')
      +'</div>'
      +(h.photo ? '<img src="'+h.photo+'" style="width:100%;max-height:180px;object-fit:cover;border-radius:10px;display:block;margin-bottom:10px">' : '')
      +(h.text ? '<p style="font-size:13px;color:var(--ink3);line-height:1.6;margin:0;font-family:\'Cormorant Garamond\',serif;font-style:italic">"'+_escHtml(h.text)+'"</p>' : '')
      +'</div>';
  }).join('');
}

function _happyPostCard(h, isOwn){
  var timeLeft = _happyTimeLeft(h.ts);
  var relTime  = _happyRelTime(h.ts);
  var expColor = timeLeft && timeLeft.toLowerCase().indexOf('min') > -1 ? 'var(--rose)' : 'var(--ink5)';
  var myReacted = safeLS('get','velo_happy_rx_'+h.id) || '';

  // Reaction bar
  var rxBar = _happyReactEmojis.map(function(e){
    var cnt = (h.reactions && h.reactions[e]) || 0;
    var active = myReacted === e;
    return '<button onclick="pHappyReact(\''+h.id+'\',\''+e+'\')" style="padding:4px 9px;background:'+(active?'rgba(255,224,102,.35)':'rgba(255,255,255,.6)')+';border:1px solid '+(active?'rgba(255,200,50,.5)':'var(--border2)')+';border-radius:100px;font-size:12px;cursor:pointer;font-family:\'Jost\',sans-serif;font-weight:600;transition:all .15s">'+e+(cnt?' '+cnt:'')+'</button>';
  }).join('');

  // Comments
  var comments = h.comments || [];
  var commHtml = comments.slice(0,3).map(function(c){
    return '<div style="display:flex;gap:7px;align-items:flex-start;margin-bottom:6px">'
      +'<div style="font-size:14px;width:24px;height:24px;border-radius:50%;background:var(--sage7);display:flex;align-items:center;justify-content:center;flex-shrink:0">🌿</div>'
      +'<div style="background:var(--cream2);border-radius:0 10px 10px 10px;padding:6px 10px;flex:1">'
      +'<div style="font-size:11px;font-weight:700;color:var(--ink2);margin-bottom:2px">'+_escHtml(c.name)+'</div>'
      +'<div style="font-size:12px;color:var(--ink3);line-height:1.4">'+_escHtml(c.text)+'</div>'
      +'</div></div>';
  }).join('');
  var moreComments = comments.length > 3 ? '<div style="font-size:11px;color:var(--sage);cursor:pointer;margin-bottom:8px">+ '+(comments.length-3)+' comentarios más</div>' : '';

  // Avatar: profile photo if available, else mood emoji
  var hasPhoto = h.av && (h.av.startsWith('data:') || h.av.startsWith('http'));
  var avatarHtml = hasPhoto
    ? '<div style="position:relative;width:40px;height:40px;flex-shrink:0">'
      +'<img src="'+_escHtml(h.av)+'" style="width:40px;height:40px;border-radius:12px;object-fit:cover;display:block">'
      +'<span style="position:absolute;bottom:-3px;right:-3px;font-size:14px;line-height:1">'+h.emoji+'</span>'
      +'</div>'
    : '<div style="font-size:24px;width:40px;height:40px;border-radius:12px;background:var(--sun3);display:flex;align-items:center;justify-content:center;flex-shrink:0">'+h.emoji+'</div>';

  return '<div class="happy-card">'
    // header
    +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">'
    + avatarHtml
    +'<div style="flex:1;min-width:0">'
    +'<div style="font-size:13px;font-weight:600;color:var(--ink)">'+_escHtml(h.name||'Usuario Anónimo')+'</div>'
    +'<div style="font-size:10px;color:var(--ink5)">'+relTime+(isOwn?' · <strong style="color:var(--sage)">Tuya</strong>':'')+'</div>'
    +'</div>'
    +(timeLeft ? '<span style="font-size:10px;color:'+expColor+';font-weight:600;white-space:nowrap">⏳ '+timeLeft+'</span>' : '')
    +'</div>'
    // photo
    +(h.photo ? '<img src="'+h.photo+'" style="width:100%;max-height:220px;object-fit:cover;border-radius:10px;display:block;margin-bottom:10px">' : '')
    // text
    +(h.text ? '<p style="font-size:13px;color:var(--ink3);line-height:1.6;margin-bottom:12px;font-family:\'Cormorant Garamond\',serif;font-style:italic">"'+_escHtml(h.text)+'"</p>' : '')
    // reactions
    +'<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px">'+rxBar+'</div>'
    // comments
    +(commHtml ? '<div style="margin-bottom:8px">'+commHtml+moreComments+'</div>' : '')
    // comment input
    +'<div style="display:flex;gap:6px;align-items:center">'
    +'<input id="cmt-'+h.id+'" class="p-input" style="flex:1;font-size:12px;padding:6px 10px;height:auto" placeholder="Agregar comentario…" maxlength="120" onkeydown="if(event.key===\'Enter\')pHappyComment(\''+h.id+'\')">'
    +'<button onclick="pHappyComment(\''+h.id+'\')" style="padding:6px 10px;background:var(--sage7);border:1.5px solid var(--sage4);border-radius:8px;font-size:12px;cursor:pointer;color:var(--sage);font-family:\'Jost\',sans-serif;font-weight:700">💬</button>'
    +'</div>'
    +'</div>';
}

function pHappyTab(tab, el){
  _happyActiveTab = tab;
  document.querySelectorAll('.happy-tab').forEach(function(b){ b.classList.remove('active'); });
  if(el) el.classList.add('active');
  pRenderHappy();
}

function pHappyReact(postId, emoji){
  var myReacted = safeLS('get','velo_happy_rx_'+postId);
  if(myReacted === emoji){ pToast('💛','Ya reaccionaste con '+emoji); return; }
  var posts = _happyLoad();
  var post  = posts.find(function(p){ return p.id === postId; });
  var isMock = false;
  if(!post){
    post = _happyMock.find(function(p){ return p.id === postId; });
    isMock = true;
  }
  if(!post) return;
  if(!post.reactions) post.reactions = {};
  if(myReacted && post.reactions[myReacted] > 0) post.reactions[myReacted]--;
  post.reactions[emoji] = (post.reactions[emoji] || 0) + 1;
  if(!isMock){
    _happySave(posts);
    if(post.userId === _myUserId()) _happyStatIncr('reactionsReceived');
  }
  safeLS('set','velo_happy_rx_'+postId, emoji);
  pToast(emoji,'¡Alegría compartida!');
  pRenderHappy();
}

function pHappyComment(postId){
  var inp = document.getElementById('cmt-'+postId);
  if(!inp || !inp.value.trim()) return;
  var text = inp.value.trim();
  var posts = _happyLoad();
  var post  = posts.find(function(p){ return p.id === postId; });
  var isMock = false;
  if(!post){
    post = _happyMock.find(function(p){ return p.id === postId; });
    isMock = true;
  }
  if(!post) return;
  if(!post.comments) post.comments = [];
  var myName = safeLS('get','velo_user_name') || 'Vos';
  post.comments.push({ name: myName, text: text, ts: Date.now() });
  if(!isMock){
    _happySave(posts);
    if(post.userId === _myUserId()) _happyStatIncr('commentsReceived');
  }
  inp.value = '';
  pToast('💬','Comentario enviado 🌿');
  pRenderHappy();
}

var _happySelectedPhoto = null;

function pOpenHappyPost(){
  _selectedHappyEmoji = '☀️';
  _happySelectedPhoto = null;
  var ta = document.getElementById('happyPostTa');
  if(ta) ta.value = '';
  var emojiRow = document.getElementById('happyEmojiRow');
  if(emojiRow){
    emojiRow.innerHTML = _happyEmojis.map(function(e){
      return '<button style="font-size:18px;padding:3px 4px;border:2px solid '+(e==='☀️'?'rgba(255,200,50,.6)':'transparent')+';border-radius:8px;background:none;cursor:pointer;transition:border-color .15s;flex-shrink:0" onclick="pSelHappyEmoji(this,\''+e+'\')">'+e+'</button>';
    }).join('');
    emojiRow.style.cssText += ';-webkit-overflow-scrolling:touch';
  }
  var preview = document.getElementById('happyPhotoPreview');
  if(preview) preview.style.display = 'none';
}

function pSelHappyEmoji(el, emoji){
  _selectedHappyEmoji = emoji;
  var row = document.getElementById('happyEmojiRow');
  if(row) row.querySelectorAll('button').forEach(function(b){
    b.style.borderColor = b.textContent.trim() === emoji ? 'rgba(255,200,50,.6)' : 'transparent';
  });
}

function _compressImg(dataURL, cb){
  var image = new Image();
  image.onload = function(){
    var maxPx = 900, w = image.width, h = image.height;
    if(w > maxPx || h > maxPx){ var r = Math.min(maxPx/w, maxPx/h); w = Math.round(w*r); h = Math.round(h*r); }
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(image, 0, 0, w, h);
    cb(c.toDataURL('image/jpeg', 0.72));
  };
  image.onerror = function(){ cb(dataURL); };
  image.src = dataURL;
}

function pHappyPickMedia(inp){
  if(!inp || !inp.files || !inp.files[0]) return;
  var file = inp.files[0];
  if(file.type.startsWith('video/')){ pToast('⚠️','Solo imágenes en el Muro.'); inp.value=''; return; }
  if(file.size > 8 * 1024 * 1024){ pToast('⚠️','La imagen es muy grande (máx 8MB).'); inp.value=''; return; }
  var reader = new FileReader();
  reader.onload = function(e){
    _compressImg(e.target.result, function(compressed){
      _happySelectedPhoto = compressed;
      var preview = document.getElementById('happyPhotoPreview');
      var img = document.getElementById('happyPhotoImg');
      if(preview && img){ img.src = compressed; preview.style.display = 'block'; }
    });
  };
  reader.readAsDataURL(file);
  inp.value = '';
}

function pClearHappyPhoto(){
  _happySelectedPhoto = null;
  var preview = document.getElementById('happyPhotoPreview');
  var img = document.getElementById('happyPhotoImg');
  if(preview) preview.style.display = 'none';
  if(img) img.src = '';
}

function pSubmitHappyPost(){
  var ta = document.getElementById('happyPostTa');
  var hasText = ta && ta.value.trim();
  var hasPhoto = !!_happySelectedPhoto;
  if(!hasText && !hasPhoto){ pToast('✍️','Escribí algo o adjuntá una foto antes de publicar'); return; }
  var myId  = _myUserId();
  var name  = safeLS('get','velo_user_name') || 'Usuario Anónimo';
  var posts = _processHappyQueue();
  var isAnon = safeLS('get','velo_incognito') === 'true';
  var userAv = isAnon ? '' : (safeLS('get','velo_user_av') || '');
  var post  = {
    id: 'h'+Date.now(), userId: myId,
    emoji: _selectedHappyEmoji,
    av: userAv,
    text: ta ? ta.value.trim() : '',
    name: isAnon ? 'Usuario Anónimo' : name,
    ts: Date.now(), reactions: {'💛':0,'🌸':0,'🤗':0,'🌿':0,'✨':0}, comments: [],
    photo: _happySelectedPhoto || null
  };

  if(posts.length < HAPPY_MAX){
    posts.unshift(post);
    _happySave(posts);
    _happyStatIncr('posts');
    pToast('☀️','¡Publicado en el Muro! Desaparece en 24h 💛');
  } else {
    var queue = _happyQueueLoad();
    queue.push(post);
    _happyQueueSave(queue);
    _happyStatIncr('posts');
    pToast('⏳','El muro está lleno ('+HAPPY_MAX+'/'+HAPPY_MAX+'). Tu publicación queda en lista de espera 🌿');
    var inbox = []; try{ inbox = JSON.parse(safeLS('get','velo_inbox')||'[]'); }catch(e){}
    inbox.unshift({ id:'hqueue-'+Date.now(), tipo:'muro', icon:'⏳', remitente:'Muro de la Felicidad',
      asunto:'Tu publicación está en lista de espera ⏳',
      extracto:'El muro está lleno. Cuando expire una publicación de 24hs, la tuya se publicará automáticamente.',
      leido:false, fecha:new Date().toLocaleDateString('es',{day:'2-digit',month:'short'}) });
    safeLS('set','velo_inbox', JSON.stringify(inbox.slice(0,100)));
    _updateInboxDot();
  }
  // Save to persistent history (never expires)
  var hist = []; try{ hist = JSON.parse(safeLS('get','velo_happy_history')||'[]'); }catch(e){}
  hist.unshift({ id:post.id, emoji:post.emoji, text:post.text, photo:post.photo, ts:post.ts, name:post.name });
  safeLS('set','velo_happy_history', JSON.stringify(hist.slice(0,200)));

  // Reset form
  pClearHappyPhoto();
  if(ta) ta.value = '';
  pRenderHappy();
}

function _renderUserDashboard(){
  var el = document.getElementById('userMiniDashboard');
  if(!el) return;
  var helped = parseInt(safeLS('get','velo_helped_others')||'0',10);
  var helpedMe = parseInt(safeLS('get','velo_help_received')||'0',10);
  var convs = parseInt(safeLS('get','velo_guardian_convs')||'0',10);
  var badge = _getBadge(convs);
  var reviews = []; try{ reviews = JSON.parse(safeLS('get','velo_my_reviews')||'[]'); }catch(e){}
  el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">'
    +'<div class="mini-dash-card" onclick="switchProfileTab(\'logros\',document.querySelector(\'[onclick*=logros]\'))">' 
    +'<div style="font-size:28px;margin-bottom:4px">'+badge.icon+'</div>'
    +'<div style="font-size:11px;font-weight:800;color:var(--ink)">'+badge.name+'</div>'
    +'<div style="font-size:10px;color:var(--ink4)">Nivel</div>'
    +'</div>'
    +'<div class="mini-dash-card"><div style="font-size:24px;font-weight:800;color:var(--sage);margin-bottom:2px">'+helped+'</div><div style="font-size:11px;color:var(--ink3)">Ayudé</div></div>'
    +'<div class="mini-dash-card"><div style="font-size:24px;font-weight:800;color:var(--sage);margin-bottom:2px">'+helpedMe+'</div><div style="font-size:11px;color:var(--ink3)">Me ayudaron</div></div>'
    +'<div class="mini-dash-card" onclick="switchProfileTab(\'reseñas\',document.querySelector(\'[onclick*=reseñas]\'))">' 
    +'<div style="font-size:24px;font-weight:800;color:var(--sage);margin-bottom:2px">'+reviews.length+'</div>'
    +'<div style="font-size:11px;color:var(--ink3)">Reseñas</div>'
    +'</div>'
    +'</div>';
}

// ── PROFILE ────────────────────────────────────────────────────
function _renderAvatarEl(elId, av){
  var el = document.getElementById(elId);
  if(!el) return;
  var isImg = av && (av.startsWith('data:') || av.startsWith('http'));
  // Preserve child elements (status dot, etc.)
  var children = Array.from(el.children);
  if(isImg){
    el.style.backgroundImage = 'url('+av+')';
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = 'center';
    el.style.fontSize = '0';
    el.style.backgroundRepeat = 'no-repeat';
    el.textContent = '';
  } else {
    el.style.backgroundImage = '';
    el.style.fontSize = '';
    el.style.backgroundSize = '';
    el.textContent = av || '🧑';
  }
  children.forEach(function(c){ el.appendChild(c); });
}

function _avInline(av, px){
  if(!av) return '🌿';
  var s = (px||40)+'px';
  if(av.startsWith('data:') || av.startsWith('http'))
    return '<img src="'+_escHtml(av)+'" style="width:'+s+';height:'+s+';object-fit:cover;border-radius:50%;display:block;margin:0 auto;flex-shrink:0" alt="">';
  return av;
}

function pShowAvatarPicker(){
  var ov = document.getElementById('avatarPickerOv');
  if(ov) ov.classList.add('show');
}

function pSetAvatar(emoji){
  safeLS('set','velo_user_av', emoji);
  pToast('✅','Avatar actualizado');
  closeModal('avatarPickerOv');
  pLoadProfile();
  _updateSidebarUser();
}

function pSetAvatarFromFile(input){
  if(!input.files || !input.files[0]) return;
  var file = input.files[0];
  if(file.size > 2*1024*1024){ pToast('⚠️','Imagen demasiado grande (máx 2MB)'); return; }
  var reader = new FileReader();
  reader.onload = function(e){
    var dataUrl = e.target.result;
    safeLS('set','velo_user_av', dataUrl);
    pToast('✅','Foto de perfil actualizada 🌿');
    closeModal('avatarPickerOv');
    pLoadProfile();
    _updateSidebarUser();
  };
  reader.readAsDataURL(file);
}

function pLoadProfile(){
  var name  = safeLS('get','velo_user_name') || 'Usuario';
  var av    = safeLS('get','velo_user_av') || '🧑';
  var motto = safeLS('get','velo_user_motto') || 'Mi camino, mi ritmo.';
  _setEl('profileName', name);
  _renderAvatarEl('profileAv', av);
  _setEl('profileMotto', motto);

  // Plan badge
  var planBadge = document.getElementById('profilePlanBadge');
  if(planBadge){
    planBadge.innerHTML = _isPremium()
      ? '<span class="p-pill p-pill--gold">⭐ Velo Plus</span>'
      : '<span class="p-pill p-pill--sage">🌱 Gratuito</span>';
  }

  // Email
  _setEl('profileEmail', safeLS('get','velo_user_email') || '—');

  // Stats
  var diary = []; try{ diary = JSON.parse(safeLS('get','velo_diary')||'[]'); }catch(e){}
  var daysReg = Math.ceil((Date.now() - (parseInt(safeLS('get','velo_registered_ts')||Date.now(),10))) / 86400000);
  _setEl('profileDays', Math.max(1, daysReg));
  _setEl('profileChats', diary.length);
  _setEl('profileHelped', parseInt(safeLS('get','velo_helped_others')||'0', 10));
  _setEl('profileReceived', parseInt(safeLS('get','velo_guardian_convs')||'0', 10));

  // Mi estado inputs — pre-fill from saved values
  var msEl = document.getElementById('profStatusMusic');
  var mbEl = document.getElementById('profStatusBook');
  var mpEl = document.getElementById('profStatusPhrase');
  if(msEl) msEl.value = safeLS('get','velo_status_music')  || '';
  if(mbEl) mbEl.value = safeLS('get','velo_status_book')   || '';
  if(mpEl) mpEl.value = safeLS('get','velo_status_phrase') || '';

  // Sub status display
  var subEl = document.getElementById('subStatusDisplay');
  if(subEl){
    subEl.textContent = _isPremium() ? '✅ Velo Plus activo' : 'Sin suscripción activa';
    subEl.style.color = _isPremium() ? 'var(--sage)' : 'var(--ink4)';
  }

  // Incognito toggle
  var inc = document.getElementById('incognitoTog');
  if(inc){ var isInc = safeLS('get','velo_incognito')==='true'; inc.classList.toggle('on', isInc); }
  _initGuardianToggleUI();

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

  // Reviews
  var rvEl = document.getElementById('profileReviews');
  if(rvEl) rvEl.innerHTML = '<div class="p-empty"><span class="p-empty-emoji">⭐</span><div class="p-empty-title">Aún no hay reseñas</div><div class="p-empty-sub">Las reseñas aparecerán después de tus sesiones</div></div>';

  // Badges
  _renderBadgesGrid();
}

function pSaveProfileStatus(){
  var music  = (document.getElementById('profStatusMusic')||{}).value  || '';
  var book   = (document.getElementById('profStatusBook')||{}).value   || '';
  var phrase = (document.getElementById('profStatusPhrase')||{}).value || '';
  safeLS('set','velo_status_music',  music.trim());
  safeLS('set','velo_status_book',   book.trim());
  safeLS('set','velo_status_phrase', phrase.trim());
  pToast('✨', 'Estado actualizado y visible en tu perfil 💚');
}

function pShowPublicProfile(){
  var name   = safeLS('get','velo_user_name')    || 'Usuario';
  var av     = safeLS('get','velo_user_av')      || '🧑';
  var motto  = safeLS('get','velo_user_motto')   || 'Mi camino, mi ritmo.';
  var music  = safeLS('get','velo_status_music') || '';
  var book   = safeLS('get','velo_status_book')  || '';
  var phrase = safeLS('get','velo_status_phrase')|| '';
  var isInc  = safeLS('get','velo_incognito') === 'true';
  var convs  = parseInt(safeLS('get','velo_guardian_convs')||'0', 10);
  var badge  = _getBadge(convs);
  var displayName = isInc ? 'Anónimo/a 🎭' : _escHtml(name);
  var displayAv   = isInc ? '🎭' : av;
  var statusHtml  = '';
  if(!isInc && (music || book || phrase)){
    statusHtml = '<div style="background:var(--sage7);border-radius:12px;padding:12px;margin-top:12px;font-size:13px;color:var(--ink3);line-height:1.7">';
    if(music)  statusHtml += '<div>🎵 '+_escHtml(music)+'</div>';
    if(book)   statusHtml += '<div>📚 '+_escHtml(book)+'</div>';
    if(phrase) statusHtml += '<div style="font-style:italic;margin-top:4px;color:var(--sage2)">✨ "'+_escHtml(phrase)+'"</div>';
    statusHtml += '</div>';
  }
  var existing = document.getElementById('publicProfileOv');
  if(existing) existing.remove();
  var ov = document.createElement('div');
  ov.className = 'p-modal-ov show';
  ov.id = 'publicProfileOv';
  ov.innerHTML = '<div class="p-sheet">'
    +'<div class="p-sheet-handle"></div>'
    +'<div style="text-align:center;padding:8px 0 16px">'
    +'<div style="font-size:64px;margin-bottom:10px;display:flex;justify-content:center">'+_avInline(displayAv,72)+'</div>'
    +'<div style="font-family:\'Cormorant Garamond\',serif;font-size:22px;color:var(--ink);margin-bottom:4px">'+displayName+'</div>'
    +'<div style="font-size:13px;color:var(--ink4);font-style:italic;margin-bottom:10px">'+_escHtml(motto)+'</div>'
    +'<span style="font-size:22px">'+badge.icon+'</span> <span style="font-size:12px;color:var(--ink4)">Guardián '+badge.name+'</span>'
    +statusHtml
    +(isInc ? '<div style="margin-top:12px;font-size:12px;color:var(--ink4);background:var(--cream2);border-radius:10px;padding:10px">🎭 Modo incógnito · tu nombre y avatar están ocultos</div>' : '')
    +'</div>'
    +'<button class="p-btn p-btn--secondary p-btn--md p-btn--full" onclick="document.getElementById(\'publicProfileOv\').remove()">Cerrar</button>'
    +'</div>';
  document.body.appendChild(ov);
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

  // Guardian badge section at top
  var convs = parseInt(safeLS('get','velo_guardian_convs')||'0', 10);
  var badge = _getBadge(convs);
  var progPct = badge.next ? Math.round((convs - (_getBadge(convs-1).needed !== badge.needed ? 0 : 0)) / (convs + badge.needed) * 100) : 100;
  // Simpler progress: based on range
  var ranges = {Novato:[0,5],Bronce:[5,20],Plata:[20,40],Oro:[40,100],Diamante:[100,100]};
  var r = ranges[badge.name] || [0,5];
  var progFill = badge.next ? Math.min(100, Math.round((convs - r[0]) / (r[1] - r[0]) * 100)) : 100;

  var tiers = [
    { name:'Novato',   icon:'🌱', min:0,   max:5,   color:'var(--sage4)', unlock:'Podés pedir acompañamiento a otros guardianes' },
    { name:'Bronce',   icon:'🥉', min:5,   max:20,  color:'#C07840',      unlock:'Aparecés en el listado de guardianes disponibles' },
    { name:'Plata',    icon:'🥈', min:20,  max:40,  color:'#8892A4',      unlock:'Insignia verificada en tu perfil público' },
    { name:'Oro',      icon:'🥇', min:40,  max:100, color:'#C8A200',      unlock:'Podés crear Círculos de Paz ⭕ + prioridad en el listado' },
    { name:'Diamante', icon:'💎', min:100, max:100, color:'#7B68EE',      unlock:'Estado top de la comunidad + descuento en Velo Plus ✨' }
  ];
  var tierRows = tiers.map(function(t){
    var reached = convs >= t.min;
    var isCurrent = badge.name === t.name;
    return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border2)">'
      +'<span style="font-size:22px;opacity:'+(reached?1:.35)+'">'+(reached?t.icon:'⬜')+'</span>'
      +'<div style="flex:1;min-width:0">'
      +'<div style="font-size:12px;font-weight:700;color:'+(reached?'var(--ink)':'var(--ink5)')+'">'+t.name
      +(isCurrent?' <span style="font-size:10px;background:var(--sage6);color:var(--sage);border-radius:100px;padding:1px 7px;margin-left:4px">Actual</span>':'')
      +(t.min>0?'  <span style="font-size:10px;color:var(--ink5)">'+t.min+' conv.</span>':'')+'</div>'
      +'<div style="font-size:11px;color:'+(reached?'var(--sage)':'var(--ink5)')+'">'+t.unlock+'</div>'
      +'</div>'
      +(reached?'<span style="font-size:14px;color:var(--sage)">✅</span>':'<span style="font-size:12px;color:var(--ink5)">🔒</span>')
      +'</div>';
  }).join('');

  var guardianSection = '<div class="guardian-badge-card" style="margin-bottom:16px">'
    +'<div style="font-size:12px;font-weight:700;color:var(--sage);text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">Mi nivel de Guardián</div>'
    +'<div style="display:flex;align-items:center;gap:14px;margin-bottom:12px">'
    +'<span style="font-size:44px">'+badge.icon+'</span>'
    +'<div style="flex:1">'
    +'<div style="font-size:18px;font-weight:800;color:var(--ink);margin-bottom:2px">Guardián '+badge.name+'</div>'
    +'<div style="font-size:12px;color:var(--ink4);margin-bottom:8px">'+convs+' conversaciones completadas</div>'
    +'<div class="guardian-badge-prog"><div class="guardian-badge-prog-fill" style="width:'+progFill+'%"></div></div>'
    +(badge.next
      ? '<div style="font-size:11px;color:var(--ink5);margin-top:4px">'+badge.needed+' más para <strong style="color:var(--sage2)">'+badge.next+'</strong></div>'
      : '<div style="font-size:11px;color:var(--sage);margin-top:4px">✨ Nivel máximo alcanzado</div>')
    +'</div>'
    +'</div>'
    +'<div style="font-size:11px;font-weight:700;color:var(--ink4);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Qué desbloquea cada nivel</div>'
    +tierRows
    +'</div>';

  var diary = []; try{ diary = JSON.parse(safeLS('get','velo_diary')||'[]'); }catch(e){}
  var happyPosts = []; try{ happyPosts = JSON.parse(safeLS('get','velo_happy_posts')||'[]'); }catch(e){}
  var daysActive = Math.ceil((Date.now()-(parseInt(safeLS('get','velo_registered_ts')||Date.now(),10)))/86400000);
  var badges = [
    { icon:'🌱', name:'Primer Paso',      desc:'Crear tu cuenta',                              done:true },
    { icon:'📔', name:'Escribiendo',       desc:'Primera entrada en el diario',                 done:!!diary.length },
    { icon:'🌈', name:'En Movimiento',     desc:'Registrar tu ánimo 7 días',                   done:false },
    { icon:'💙', name:'Corazón Abierto',   desc:'Participar en Sala de Ayuda',                 done:!!safeLS('get','velo_helped_once') },
    { icon:'⭐', name:'Constancia',        desc:'30 días en la comunidad',                     done:daysActive>=30 },
    { icon:'🦋', name:'Transformación',    desc:'Completar onboarding',                        done:true },
    { icon:'🌊', name:'Mensaje al Mar',    desc:'Enviar tu primer mensaje al Mar',             done:parseInt(safeLS('get','velo_bottle_count')||safeLS('get','velo_total_bottles')||'0',10)>0 || JSON.parse(safeLS('get','velo_my_bottles')||'[]').length>0 },
    { icon:'🤝', name:'Primer Apoyo',      desc:'Acompañar a alguien en Sala de Ayuda',       done:!!safeLS('get','velo_helped_once') && parseInt(safeLS('get','velo_helped_others')||'0',10)>0 },
    { icon:'🌻', name:'Muro en Flor',      desc:'Primera publicación en el Muro',              done:happyPosts.length>0 },
    { icon:'💬', name:'Conversador/a',     desc:'Enviar 10 mensajes en chats',                 done:parseInt(safeLS('get','velo_total_msgs')||'0',10)>=10 },
    { icon:'🧘', name:'Momento de Calma', desc:'Completar la sesión de respiración',          done:!!safeLS('get','velo_breathed_once') },
    { icon:'🌟', name:'Velo Plus',         desc:'Suscribirse a Velo Plus',                     done:safeLS('get','velo_plan')==='plus' },
    { icon:'🏡', name:'En Comunidad',      desc:'7 días activo en la app',                     done:daysActive>=7 },
    { icon:'🗓️', name:'Semana Completa',   desc:'Registrar ánimo 7 días seguidos',             done:false }
  ];
  el.innerHTML = guardianSection + badges.map(function(b){
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
  // Load Supabase broadcasts async and prepend them
  var userType = safeLS('get','velo_user_type') || 'user';
  sbLoadBroadcasts(userType === 'pro' ? 'pros' : 'users').then(function(bcs){
    if(!bcs || !bcs.length) return;
    var el2 = document.getElementById('inboxList');
    if(!el2) return;
    // Filter out ones already shown (by id in localStorage inbox)
    var localIds = msgs.map(function(m){ return m.id; });
    var newBcs = bcs.filter(function(b){ return localIds.indexOf(b.id) < 0; });
    if(!newBcs.length) return;
    var bcMsgs = newBcs.map(function(b){
      var readKey = 'velo_bcast_read_'+b.id;
      var fecha = b.sent_at ? new Date(b.sent_at).toLocaleDateString('es',{day:'2-digit',month:'short'}) : '';
      return '<div class="p-inbox-msg'+(safeLS('get',readKey)?'':' unread')+'" onclick="safeLS(\'set\',\''+readKey+'\',\'1\');this.classList.remove(\'unread\');this.querySelector(\'.p-inbox-dot\')&&this.querySelector(\'.p-inbox-dot\').remove()">'
        +'<div style="display:flex;flex-shrink:0">'+(safeLS('get',readKey)?'':'<div class="p-inbox-dot"></div>')+'</div>'
        +'<div class="p-inbox-ic">'+_escHtml(b.icon||'📢')+'</div>'
        +'<div style="flex:1;min-width:0">'
        +'<div style="font-size:13px;font-weight:700;color:var(--ink);margin-bottom:2px">'+_escHtml(b.subject)+'</div>'
        +'<div style="font-size:11px;color:var(--ink4);line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">'+_escHtml(b.body||'')+'</div>'
        +'<div style="font-size:10px;color:var(--ink5);margin-top:4px">'+fecha+'</div>'
        +'</div></div>';
    }).join('');
    // Prepend broadcasts before existing inbox items, after contact banner
    var banner = el2.querySelector('div[onclick*="contact"]');
    if(banner){ banner.insertAdjacentHTML('afterend', bcMsgs); }
    else { el2.innerHTML = bcMsgs + el2.innerHTML; }
    _updateInboxDot();
  });
  if(!all.length){
    el.innerHTML = '<div class="p-empty"><span class="p-empty-emoji">💌</span><div class="p-empty-title">Sin mensajes</div><div class="p-empty-sub">Tus notificaciones aparecerán aquí.</div></div>';
    return;
  }
  var contactBanner = '<div onclick="pGoTo(\'contact\')" style="display:flex;align-items:center;gap:12px;background:rgba(116,198,157,.07);border:1.5px solid rgba(116,198,157,.18);border-radius:14px;padding:12px 14px;margin-bottom:12px;cursor:pointer">'
    +'<div style="font-size:22px">✉️</div>'
    +'<div><div style="font-size:13px;font-weight:700;color:var(--ink)">Escribinos a Velo</div>'
    +'<div style="font-size:11px;color:var(--ink4)">Sugerencias, consultas o reportar un problema</div></div>'
    +'<div style="margin-left:auto;color:var(--ink5);font-size:16px">›</div>'
    +'</div>';

  el.innerHTML = contactBanner + all.map(function(m){
    var actionBtn = '';
    if(m.accion && !m.leido){
      actionBtn = '<button onclick="event.stopPropagation();'+m.accion+'" style="margin-top:6px;font-size:11px;padding:4px 10px;background:var(--sage7);border:1.5px solid var(--sage4);border-radius:100px;color:var(--sage);font-family:\'Jost\',sans-serif;font-weight:700;cursor:pointer">Completar encuesta →</button>';
    }
    var hasCuerpo = !!(m.cuerpo);
    var readKey = 'velo_read_'+m.id;
    var isRead = m.leido || !!safeLS('get', readKey);
    return '<div class="p-inbox-msg'+(isRead?'':' unread')+'" style="cursor:'+(hasCuerpo?'pointer':'default')+'"'
      +(hasCuerpo ? ' onclick="pOpenInboxMsg(\''+m.id+'\',this)"' : '')+'>'
      +'<div style="display:flex;flex-shrink:0">'+(isRead?'':'<div class="p-inbox-dot"></div>')+'</div>'
      +'<div class="p-inbox-ic" style="background:'+(m.tipo==='encuesta'?'rgba(116,198,157,.12)':'var(--sage7)')+'">'+m.icon+'</div>'
      +'<div style="flex:1;min-width:0">'
      +'<div style="font-size:13px;font-weight:700;color:var(--ink);margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+m.asunto+'</div>'
      +'<div style="font-size:11px;color:var(--ink4);line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">'+m.extracto+'</div>'
      +'<div style="font-size:10px;color:var(--ink5);margin-top:4px">'+m.fecha+'</div>'
      +(hasCuerpo&&!isRead?'<div style="font-size:10px;color:var(--sage);margin-top:4px">Toca para leer →</div>':'')
      +actionBtn
      +'</div></div>';
  }).join('');
}

function pOpenInboxMsg(msgId, rowEl){
  var msgs = []; try{ msgs = JSON.parse(safeLS('get','velo_inbox')||'[]'); }catch(e){}
  var mockMsgs = [
    { id:'m1', icon:'💚', remitente:'Equipo Velo', asunto:'¡Bienvenido/a a Velo!', cuerpo:'Gracias por unirte a nuestra comunidad. Aquí encontrarás apoyo, personas que escuchan y herramientas de bienestar.\n\nSi en algún momento sentís que necesitás hablar, accedé a la Sala de Guardianes o la Sala de Ayuda. Estamos acá para vos. 🌿', fecha:'Hoy' },
    { id:'m2', icon:'🌿', remitente:'Velo', asunto:'Consejo del día', cuerpo:'Está bien no estar bien. El primer paso es reconocerlo. Cuidarte a vos mismo/a no es egoísmo, es necesidad. 💙', fecha:'Hoy' }
  ];
  var all = msgs.concat(mockMsgs);
  var msg = all.find(function(m){ return m.id === msgId; });
  if(!msg) return;
  // Mark as read
  safeLS('set','velo_read_'+msgId,'1');
  var localMsgs = msgs.map(function(m){ return m.id === msgId ? Object.assign({},m,{leido:true}) : m; });
  safeLS('set','velo_inbox', JSON.stringify(localMsgs));
  if(rowEl){ rowEl.classList.remove('unread'); var dot = rowEl.querySelector('.p-inbox-dot'); if(dot) dot.remove(); }
  _updateHomeBell();
  // Show full message modal
  var existing = document.getElementById('inboxMsgOv');
  if(existing) existing.remove();
  var ov = document.createElement('div');
  ov.className = 'p-modal-ov show';
  ov.id = 'inboxMsgOv';
  ov.innerHTML = '<div class="p-sheet" style="max-height:88vh;overflow-y:auto">'
    +'<div class="p-sheet-handle"></div>'
    +'<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">'
    +'<div style="font-size:30px;width:46px;height:46px;border-radius:14px;background:var(--sage7);display:flex;align-items:center;justify-content:center;flex-shrink:0">'+msg.icon+'</div>'
    +'<div><div style="font-size:12px;font-weight:700;color:var(--sage)">'+_escHtml(msg.remitente||'Velo')+'</div>'
    +'<div style="font-size:11px;color:var(--ink5)">'+_escHtml(msg.fecha||'')+'</div></div>'
    +'</div>'
    +'<h2 style="font-family:\'Cormorant Garamond\',serif;font-size:21px;color:var(--ink);margin-bottom:16px;line-height:1.3">'+_escHtml(msg.asunto)+'</h2>'
    +(msg.cuerpo ? '<div style="font-size:14px;color:var(--ink3);line-height:1.85;white-space:pre-line;background:var(--cream2);border-radius:12px;padding:16px;margin-bottom:20px">'+_escHtml(msg.cuerpo)+'</div>' : '')
    +(msg.tipo==='pro-msg' && msg.proId ? '<button class="p-btn p-btn--primary p-btn--lg p-btn--full" style="margin-bottom:8px" onclick="document.getElementById(\'inboxMsgOv\').remove();pReplyToProMsg(\''+_escHtml(msg.proId)+'\',\''+_escHtml(msg.proName||msg.remitente||'Pro')+'\',\''+_escHtml(msg.remitente||'Pro')+'\')">💬 Responder</button>' : '')
    +'<button class="p-btn p-btn--secondary p-btn--md p-btn--full" onclick="document.getElementById(\'inboxMsgOv\').remove()">Cerrar</button>'
    +'</div>';
  document.body.appendChild(ov);
  ov.addEventListener('click', function(e){ if(e.target===ov) ov.remove(); });
}

function pQuickProfile(name, av, bio, guardianId){
  var convs  = 0;
  var badge  = _getBadge(convs);
  if(guardianId){
    var g = _guardianProfiles.find(function(x){ return x.id === guardianId; });
    if(g){ convs = g.convs; badge = _getBadge(g.convs); bio = bio || g.bio; }
  }
  var isAnon = !name || name === 'Usuario Anónimo' || name === 'Anónimo';
  var existing = document.getElementById('quickProfileOv');
  if(existing) existing.remove();
  var ov = document.createElement('div');
  ov.className = 'p-modal-ov show';
  ov.id = 'quickProfileOv';
  ov.innerHTML = '<div class="p-sheet">'
    +'<div class="p-sheet-handle"></div>'
    +'<div style="text-align:center;padding:8px 0 16px">'
    +'<div style="font-size:60px;margin-bottom:10px;display:flex;justify-content:center">'+_avInline(isAnon?'👤':(av||'🧑'),68)+'</div>'
    +'<div style="font-family:\'Cormorant Garamond\',serif;font-size:22px;color:var(--ink);margin-bottom:4px">'+(isAnon?'Usuario Anónimo':_escHtml(name||'Usuario'))+'</div>'
    +(badge&&!isAnon ? '<div style="font-size:14px;color:var(--ink4);margin-bottom:8px">'+badge.icon+' Guardián '+badge.name+'</div>' : '')
    +(bio&&!isAnon ? '<p style="font-size:13px;color:var(--ink3);line-height:1.65;font-style:italic;margin:0 0 12px">"'+_escHtml(bio)+'"</p>' : '')
    +'</div>'
    +(guardianId&&!isAnon ? '<button class="p-btn p-btn--primary p-btn--lg p-btn--full" onclick="this.closest(\'.p-modal-ov\').remove();pOpenGuardian(\''+guardianId+'\')">Solicitar acompañamiento 💚</button><div style="height:8px"></div>' : '')
    +'<button class="p-btn p-btn--secondary p-btn--md p-btn--full" onclick="this.closest(\'.p-modal-ov\').remove()">Cerrar</button>'
    +'</div>';
  document.body.appendChild(ov);
  ov.addEventListener('click', function(e){ if(e.target===ov) ov.remove(); });
}

// ── CONTACT ────────────────────────────────────────────────────
async function pSendContact(){
  var subject = document.getElementById('contactSubject');
  var msg     = document.getElementById('contactMsg');
  if(!subject||!msg||!msg.value.trim()){ pToast('✍️','Escribí tu mensaje'); return; }
  var text    = msg.value.trim();
  var topic   = subject ? subject.value||'General' : 'General';
  var email   = safeLS('get','velo_user_email') || 'anónimo';

  // Save to Supabase (primary) with localStorage fallback
  var saved = await sbSaveContact(topic, text, email);
  if(!saved){
    var msgs = []; try{ msgs = JSON.parse(safeLS('get','velo_admin_contacts')||'[]'); }catch(e){}
    msgs.unshift({ id:'c-'+Date.now(), topic:topic, mensaje:text, email:email, fecha:new Date().toLocaleString('es'), leido:false });
    safeLS('set','velo_admin_contacts', JSON.stringify(msgs.slice(0,100)));
  }

  if(subject) subject.value = 'General';
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

function pSetDonateAmt(n){
  var inp = document.getElementById('donateCustomAmt');
  if(inp) inp.value = n;
  var errEl = document.getElementById('donateAmtErr');
  if(errEl) errEl.style.display = 'none';
  document.querySelectorAll('.p-donate-amt').forEach(function(b){ b.classList.remove('selected'); });
  var btns = document.querySelectorAll('.p-donate-amt');
  btns.forEach(function(b){ if(b.textContent.replace('$','').trim() == n) b.classList.add('selected'); });
}

function pDonateCTA(){
  var inp = document.getElementById('donateCustomAmt');
  var errEl = document.getElementById('donateAmtErr');
  var amt = inp ? parseFloat(inp.value) : 0;
  if(inp && inp.value.trim() !== ''){
    if(isNaN(amt) || amt < 5){
      if(errEl) errEl.style.display = 'block';
      if(inp) inp.focus();
      return;
    }
    if(errEl) errEl.style.display = 'none';
    pOpenPayPalDonate(amt.toFixed(2), false, 'Donación Velo');
  } else {
    pOpenPayPalDonate('10', false, 'Donación Velo');
  }
}

function pOpenPayPalDonate(amount, monthly, description){
  var returnUrl = window.location.origin + window.location.pathname + '?pp=donation';
  var baseURL = 'https://www.paypal.com/donate/?business='+PAYPAL_EMAIL;
  var params = '&currency_code=USD&amount='+amount;
  params += '&return='+encodeURIComponent(returnUrl);
  if(description) params += '&item_name='+encodeURIComponent(description);
  if(monthly) params += '&no_recurring=0';
  safeLS('set','velo_pp_pending', JSON.stringify({ type:'donation', amount:amount, ts:Date.now() }));
  window.open(baseURL+params, '_blank');
}

function pShowPlusModal(){
  var existing = document.getElementById('plusCompareOv');
  if(existing) existing.remove();
  var ov = document.createElement('div');
  ov.className = 'p-modal-ov show';
  ov.id = 'plusCompareOv';
  ov.innerHTML = '<div class="p-sheet" style="max-height:92vh;overflow-y:auto">'
    +'<div class="p-sheet-handle"></div>'
    +'<div style="text-align:center;margin-bottom:18px">'
    +'<div style="font-size:36px;margin-bottom:8px">⭐</div>'
    +'<div style="font-family:\'Cormorant Garamond\',serif;font-size:24px;color:var(--ink);margin-bottom:6px">Suscripción a Velo Plus</div>'
    +'<div style="font-size:13px;color:var(--ink4);line-height:1.5">Al suscribirte recibís acceso completo a todo Velo por <strong>$2.99 USD/mes</strong>.<br>El pago se procesa por PayPal. Cancelá cuando quieras.</div>'
    +'</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">'
    +'<div style="background:var(--cream2);border-radius:14px;padding:13px;border:1.5px solid var(--border2)">'
    +'<div style="font-size:11px;font-weight:700;color:var(--ink4);margin-bottom:10px;letter-spacing:.5px">ACTUAL · GRATUITO</div>'
    +'<ul style="font-size:12px;color:var(--ink3);line-height:2;list-style:none;padding:0;margin:0">'
    +'<li>✅ Diario emocional</li>'
    +'<li>✅ Muro de la Felicidad</li>'
    +'<li>✅ 2 mensajes al Mar/día</li>'
    +'<li>✅ 2 pedidos de ayuda/día</li>'
    +'<li>✅ 4 sesiones guardián/día</li>'
    +'<li style="color:var(--ink5)">❌ Círculos de Paz</li>'
    +'<li style="color:var(--ink5)">❌ Sesiones profesionales</li>'
    +'<li style="color:var(--ink5)">❌ Insignia dorada</li>'
    +'</ul></div>'
    +'<div style="background:linear-gradient(135deg,rgba(200,165,100,.18),rgba(200,165,100,.08));border-radius:14px;padding:13px;border:1.5px solid rgba(200,165,100,.4)">'
    +'<div style="font-size:11px;font-weight:700;color:#C8A560;margin-bottom:10px;letter-spacing:.5px">CON PLUS · $2.99/mes</div>'
    +'<ul style="font-size:12px;color:var(--ink3);line-height:2;list-style:none;padding:0;margin:0">'
    +'<li>✅ Todo lo gratuito</li>'
    +'<li>✅ Ilimitado en todo</li>'
    +'<li>✅ Círculos de Paz</li>'
    +'<li>✅ Sesiones profesionales</li>'
    +'<li style="color:#C8A560">✅ Insignia dorada ✨</li>'
    +'<li>✅ Guardianes prioritarios ∞</li>'
    +'<li style="color:var(--sage2)">✅ Apoyás la comunidad 💚</li>'
    +'</ul></div>'
    +'</div>'
    +'<div style="background:var(--sage7);border-radius:12px;padding:12px 14px;margin-bottom:18px;border:1px solid var(--border2)">'
    +'<p style="font-size:12px;color:var(--ink4);margin:0;line-height:1.6">💳 <strong>Pago seguro vía PayPal</strong> · $2.99 USD/mes · Se renueva automáticamente. Tu suscripción ayuda a mantener Velo gratuito y subsidia sesiones solidarias para quienes más lo necesitan.</p>'
    +'</div>'
    +'<button class="p-btn p-btn--primary p-btn--lg p-btn--full" onclick="document.getElementById(\'plusCompareOv\').remove();pOpenPayPalPlus()" style="background:linear-gradient(135deg,#C8A560,#A07840);margin-bottom:10px">⭐ Suscribirme por $2.99/mes · PayPal</button>'
    +'<button class="p-btn p-btn--secondary p-btn--md p-btn--full" onclick="document.getElementById(\'plusCompareOv\').remove()">Ahora no</button>'
    +'</div>';
  document.body.appendChild(ov);
  ov.addEventListener('click', function(e){ if(e.target===ov) ov.remove(); });
}

function pOpenPayPalPlus(){
  var email = safeLS('get','velo_user_email');
  var returnUrl = window.location.origin + window.location.pathname + '?pp=plus';
  var cancelUrl = window.location.origin + window.location.pathname + '?pp=cancel';
  var baseURL = 'https://www.paypal.com/subscribe';
  var params = '?business='+PAYPAL_EMAIL+'&item_name='+encodeURIComponent('Velo Plus — Membresía Mensual')+'&currency_code=USD&a3=2.99&p3=1&t3=M&no_shipping=1';
  if(email) params += '&custom='+encodeURIComponent(email);
  params += '&return='+encodeURIComponent(returnUrl);
  params += '&cancel_return='+encodeURIComponent(cancelUrl);
  safeLS('set','velo_pp_pending', JSON.stringify({ type:'plus', ts:Date.now() }));
  window.open(baseURL+params, '_blank');
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
  // Increment guardian conversation count for the user
  var prevConvs = parseInt(safeLS('get','velo_guardian_convs')||'0', 10);
  var newConvs  = prevConvs + 1;
  safeLS('set','velo_guardian_convs', String(newConvs));

  var prevBadge = _getBadge(prevConvs);
  var newBadge  = _getBadge(newConvs);

  pToast('💚','¡Gracias por tu reseña! 🌿');

  // Show donation prompt if not premium
  if(!_isPremium()){
    setTimeout(function(){
      pToast('💚','¿Querés donar para ayudar a la comunidad? 🌻');
    }, 3000);
  }

  // Badge upgrade notification
  if(newBadge.name !== prevBadge.name){
    setTimeout(function(){
      pToast(newBadge.icon, '¡Subiste a Guardián '+newBadge.name+'! '+newBadge.icon);
      if(newBadge.name === 'Oro'){
        setTimeout(function(){ pToast('⭕','Ahora podés crear Círculos de Paz 🎉'); }, 1500);
      }
    }, 1400);
  } else {
    setTimeout(function(){
      var badge = _getBadge(newConvs);
      if(badge.next) pToast('📈', newConvs+' conversaciones · '+badge.needed+' más para '+badge.next);
    }, 1400);
  }
  setTimeout(function(){ pGoTo('donate-cta'); }, 2200);
}

// ── PRO PANEL ──────────────────────────────────────────────────
function pInitProPanel(){
  _setEl('ppEarnings', '$'+Math.floor(Math.random()*500+200));
  _setEl('ppSessions', Math.floor(Math.random()*20+5));
  _setEl('ppRating', (4.7 + Math.random()*0.3).toFixed(1));
  _setEl('ppNextSessions', '<p class="p-sm p-muted">Sin sesiones programadas esta semana.</p>');
}

var _proAvailEditing = {};

function pRenderProAgenda(){
  var proId = safeLS('get','velo_pro_id') || safeLS('get','velo_user_email') || 'demo-pro';
  var avail  = _proAvailLoad(proId);
  _proAvailEditing = JSON.parse(JSON.stringify(avail));
  var bookings = _proBookingsLoad(proId);
  var now = Date.now();
  var upcoming = bookings.filter(function(b){
    return new Date(b.date+'T'+b.time+':00').getTime() > now && b.status !== 'cancelled';
  }).sort(function(a,b){ return (a.date+a.time).localeCompare(b.date+b.time); });

  var html = '<div class="p-card" style="padding:18px;margin-bottom:14px">'
    +'<div class="p-label p-label-sage" style="margin-bottom:4px">Disponibilidad semanal</div>'
    +'<p style="font-size:12px;color:var(--ink5);margin-bottom:14px;line-height:1.5">Seleccioná los días y horarios disponibles. Los usuarios los verán al reservar.</p>'
    +'<div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:16px">'
    +[0,1,2,3,4,5,6].map(function(d){
      var active = _proAvailEditing[d] && _proAvailEditing[d].length > 0;
      return '<button id="proDay-'+d+'" onclick="pTogProDay('+d+',this)" style="padding:8px 13px;border-radius:100px;border:2px solid '+(active?'var(--sage2)':'var(--border2)')+';background:'+(active?'var(--sage7)':'rgba(255,255,255,.7)')+';color:'+(active?'var(--sage)':'var(--ink4)')+';font-size:12px;font-weight:700;cursor:pointer;font-family:\'Jost\',sans-serif;transition:all .15s">'+_CAL_DAY_NAMES[d]+'</button>';
    }).join('')
    +'</div>'
    +'<div id="proSlotEditor">'+_buildProSlotEditor()+'</div>'
    +'<button class="p-btn p-btn--primary p-btn--md" style="margin-top:14px" onclick="pSaveProAvail()">💾 Guardar disponibilidad</button>'
    +'</div>'
    +'<div class="p-card" style="padding:18px"><div class="p-label p-label-sage" style="margin-bottom:12px">Próximas reservas</div>';

  if(!upcoming.length){
    html += '<p class="p-sm p-muted">No hay reservas próximas. Las reservas confirmadas aparecerán aquí.</p>';
  } else {
    html += upcoming.slice(0,10).map(function(b){
      var d = new Date(b.date+'T00:00:00');
      return '<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">'
        +'<div style="width:44px;height:44px;background:var(--sage7);border-radius:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0">'
        +'<div style="font-size:18px;font-weight:800;color:var(--sage);line-height:1">'+d.getDate()+'</div>'
        +'<div style="font-size:9px;color:var(--sage3);font-weight:700;text-transform:uppercase">'+_CAL_MONTH_SHORT[d.getMonth()]+'</div>'
        +'</div>'
        +'<div style="flex:1;min-width:0">'
        +'<div style="font-size:13px;font-weight:700;color:var(--ink)">'+_escHtml(b.userName||'Usuario')+'</div>'
        +'<div style="font-size:11px;color:var(--ink4)">'+_CAL_DAY_NAMES_LONG[d.getDay()]+' · '+b.time+' hs</div>'
        +'</div>'
        +'<button onclick="pCancelProBooking(\''+b.id+'\',\''+proId+'\')" style="padding:5px 10px;background:rgba(220,50,50,.08);border:1px solid rgba(220,50,50,.2);border-radius:8px;font-size:11px;color:rgba(200,60,60,.9);cursor:pointer;font-family:\'Jost\',sans-serif;font-weight:600">Cancelar</button>'
        +'</div>';
    }).join('');
  }
  html += '</div>';
  return html;
}

function _buildProSlotEditor(){
  var activeDays = [0,1,2,3,4,5,6].filter(function(d){ return _proAvailEditing[d] && _proAvailEditing[d].length > 0; });
  if(!activeDays.length) return '<p style="font-size:12px;color:var(--ink5);font-style:italic">Seleccioná al menos un día para elegir los horarios.</p>';
  return activeDays.map(function(d){
    var slots = _proAvailEditing[d] || [];
    return '<div style="margin-bottom:12px">'
      +'<div style="font-size:12px;font-weight:700;color:var(--ink3);margin-bottom:7px">'+_CAL_DAY_NAMES_LONG[d]+'</div>'
      +'<div style="display:flex;gap:6px;flex-wrap:wrap">'
      +_BOOKING_HOURS.map(function(h){
        var active = slots.indexOf(h) > -1;
        return '<button id="slot-'+d+'-'+h.replace(':','')+'" onclick="pTogProSlot('+d+',\''+h+'\',this)" style="padding:5px 11px;border-radius:8px;border:1.5px solid '+(active?'var(--sage2)':'var(--border2)')+';background:'+(active?'var(--sage7)':'rgba(255,255,255,.7)')+';color:'+(active?'var(--sage)':'var(--ink4)')+';font-size:12px;font-weight:600;cursor:pointer;font-family:\'Jost\',sans-serif;transition:all .15s">'+h+'</button>';
      }).join('')
      +'</div></div>';
  }).join('');
}

function pTogProDay(dayNum, btn){
  if(_proAvailEditing[dayNum] && _proAvailEditing[dayNum].length > 0){
    delete _proAvailEditing[dayNum];
    if(btn){ btn.style.borderColor='var(--border2)'; btn.style.background='rgba(255,255,255,.7)'; btn.style.color='var(--ink4)'; }
  } else {
    _proAvailEditing[dayNum] = ['09:00','10:00','11:00','14:00','15:00','16:00'];
    if(btn){ btn.style.borderColor='var(--sage2)'; btn.style.background='var(--sage7)'; btn.style.color='var(--sage)'; }
  }
  var ed = document.getElementById('proSlotEditor');
  if(ed) ed.innerHTML = _buildProSlotEditor();
}

function pTogProSlot(dayNum, time, btn){
  if(!_proAvailEditing[dayNum]) _proAvailEditing[dayNum] = [];
  var idx = _proAvailEditing[dayNum].indexOf(time);
  if(idx > -1){
    _proAvailEditing[dayNum].splice(idx, 1);
    if(btn){ btn.style.borderColor='var(--border2)'; btn.style.background='rgba(255,255,255,.7)'; btn.style.color='var(--ink4)'; }
  } else {
    _proAvailEditing[dayNum].push(time);
    _proAvailEditing[dayNum].sort();
    if(btn){ btn.style.borderColor='var(--sage2)'; btn.style.background='var(--sage7)'; btn.style.color='var(--sage)'; }
  }
}

function pSaveProAvail(){
  var proId = safeLS('get','velo_pro_id') || safeLS('get','velo_user_email') || 'demo-pro';
  _proAvailSave(proId, _proAvailEditing);
  pToast('💾','Disponibilidad guardada ✅');
}

function pCancelProBooking(bookingId, proId){
  if(!confirm('¿Cancelar esta reserva?')) return;
  var bks = _proBookingsLoad(proId);
  bks = bks.map(function(b){ return b.id===bookingId ? Object.assign({},b,{status:'cancelled'}) : b; });
  _proBookingsSave(proId, bks);
  pToast('❌','Reserva cancelada');
  var content = document.getElementById('proPanelContent');
  if(content) content.innerHTML = pRenderProAgenda();
}

var _bookingProId = null;
var _bookingDateStr = null;
var _bookingSlotTime = null;
var _bookingDays = [];

function pOpenBookPro(proId){
  _bookingProId = proId;
  _bookingDateStr = null;
  _bookingSlotTime = null;
  var pro = _proData.find(function(p){ return p.id === proId; });
  if(!pro){ pToast('⚠️','Profesional no encontrado'); return; }

  var avail = _proAvailLoad(proId);
  if(!Object.keys(avail).length){
    avail = {1:['09:00','10:00','11:00','14:00','15:00','16:00','17:00'],
             2:['09:00','10:00','11:00','14:00','15:00','16:00','17:00'],
             3:['09:00','10:00','11:00','14:00','15:00','16:00','17:00'],
             4:['09:00','10:00','11:00','14:00','15:00','16:00','17:00'],
             5:['09:00','10:00','11:00','14:00','15:00','16:00']};
  }
  var bookings = _proBookingsLoad(proId);

  _bookingDays = [];
  var today = new Date(); today.setHours(0,0,0,0);
  for(var i = 1; i <= 21; i++){
    var d = new Date(today.getTime()+i*86400000);
    var dow = d.getDay();
    var dateStr = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    var slots = avail[dow] || [];
    var bookedTimes = bookings.filter(function(b){ return b.date===dateStr && b.status!=='cancelled'; }).map(function(b){ return b.time; });
    var freeSlots = slots.filter(function(s){ return bookedTimes.indexOf(s)<0; });
    _bookingDays.push({d:d, dateStr:dateStr, dow:dow, freeSlots:freeSlots, hasAvail:freeSlots.length>0});
  }

  var modal = document.getElementById('proBookModal');
  if(!modal) return;
  var body  = document.getElementById('proBookModalBody');
  if(!body) return;

  var calStrip = _bookingDays.map(function(dy){
    var a = dy.hasAvail;
    return '<div id="bkday-'+dy.dateStr+'" onclick="'+(a?'pSelectBookDate(\''+dy.dateStr+'\')':'')+'" '
      +'style="flex-shrink:0;width:54px;text-align:center;padding:10px 6px;border-radius:14px;border:1.5px solid '+(a?'var(--border2)':'var(--border)')+';background:rgba(255,255,255,'+(a?'.9':'.4')+');cursor:'+(a?'pointer':'default')+';opacity:'+(a?'1':'.45')+';transition:all .15s">'
      +'<div style="font-size:10px;font-weight:600;color:var(--ink5);text-transform:uppercase;margin-bottom:4px">'+_CAL_DAY_NAMES[dy.dow]+'</div>'
      +'<div style="font-size:18px;font-weight:800;color:'+(a?'var(--ink)':'var(--ink5)')+'">'+dy.d.getDate()+'</div>'
      +'<div style="font-size:9px;color:var(--ink5);margin-top:2px">'+_CAL_MONTH_SHORT[dy.d.getMonth()]+'</div>'
      +(a?'<div style="width:6px;height:6px;border-radius:50%;background:var(--sage2);margin:4px auto 0"></div>':'')
      +'</div>';
  }).join('');

  body.innerHTML = '<div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--border)">'
    +'<div style="font-size:44px;flex-shrink:0">'+pro.av+'</div>'
    +'<div><div style="font-size:16px;font-weight:700;color:var(--ink)">'+_escHtml(pro.name)+'</div>'
    +'<div style="font-size:12px;color:var(--sage3);font-weight:600">'+_escHtml(pro.spec)+'</div>'
    +'<div style="font-size:12px;color:var(--ink4);margin-top:2px">$'+pro.rate+' '+pro.currency+' · sesión 1h</div></div></div>'
    +'<div class="p-label p-label-sage" style="margin-bottom:10px">Elegí un día disponible</div>'
    +'<div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:10px;margin-bottom:20px;-webkit-overflow-scrolling:touch">'+calStrip+'</div>'
    +'<div id="proBookSlots"><p style="font-size:13px;color:var(--ink4);text-align:center;padding:16px 0;font-style:italic">↑ Seleccioná un día para ver los horarios</p></div>'
    +'<div id="proBookConfirmArea" style="display:none;margin-top:16px">'
    +'<button class="p-btn p-btn--primary p-btn--lg p-btn--full" onclick="pConfirmBookSlot()">Confirmar reserva ✅</button>'
    +'</div>';

  modal.classList.add('show');
  document.body.style.overflow = 'hidden';
}

function pCloseBookModal(){
  var modal = document.getElementById('proBookModal');
  if(modal) modal.classList.remove('show');
  document.body.style.overflow = '';
}

function pSelectBookDate(dateStr){
  _bookingDateStr = dateStr;
  _bookingSlotTime = null;
  document.querySelectorAll('[id^="bkday-"]').forEach(function(el){
    el.style.background='rgba(255,255,255,.9)'; el.style.borderColor='var(--border2)';
  });
  var selEl = document.getElementById('bkday-'+dateStr);
  if(selEl){ selEl.style.background='var(--sage7)'; selEl.style.borderColor='var(--sage2)'; }
  var dy = _bookingDays.find(function(x){ return x.dateStr===dateStr; });
  var slotsEl = document.getElementById('proBookSlots');
  if(!slotsEl) return;
  if(!dy || !dy.freeSlots.length){
    slotsEl.innerHTML='<p style="font-size:13px;color:var(--ink4);text-align:center;padding:16px 0">No hay horarios disponibles este día</p>';
    return;
  }
  var dateLabel = _CAL_DAY_NAMES_LONG[dy.d.getDay()]+' '+dy.d.getDate()+' de '+_CAL_MONTH_LONG[dy.d.getMonth()];
  slotsEl.innerHTML = '<div style="font-size:11px;font-weight:600;color:var(--ink4);margin-bottom:10px;text-transform:uppercase;letter-spacing:.04em">'+dateLabel+'</div>'
    +'<div style="display:flex;gap:8px;flex-wrap:wrap">'
    +dy.freeSlots.map(function(s){
      return '<button id="bkslot-'+s.replace(':','')+'" onclick="pSelectBookSlot(\''+s+'\')" style="padding:9px 15px;border-radius:10px;border:1.5px solid var(--border2);background:rgba(255,255,255,.9);color:var(--ink);font-size:13px;font-weight:600;cursor:pointer;font-family:\'Jost\',sans-serif;transition:all .15s">'+s+'</button>';
    }).join('')
    +'</div>';
  var ca = document.getElementById('proBookConfirmArea');
  if(ca) ca.style.display='none';
}

function pSelectBookSlot(time){
  _bookingSlotTime = time;
  document.querySelectorAll('[id^="bkslot-"]').forEach(function(el){
    el.style.background='rgba(255,255,255,.9)'; el.style.borderColor='var(--border2)'; el.style.color='var(--ink)';
  });
  var s = document.getElementById('bkslot-'+time.replace(':',''));
  if(s){ s.style.background='var(--sage7)'; s.style.borderColor='var(--sage2)'; s.style.color='var(--sage)'; }
  var ca = document.getElementById('proBookConfirmArea');
  if(ca) ca.style.display='block';
}

function pConfirmBookSlot(){
  if(!_bookingProId||!_bookingDateStr||!_bookingSlotTime){ pToast('⚠️','Elegí un día y horario'); return; }
  var pro = _proData.find(function(p){ return p.id===_bookingProId; });
  if(!pro) return;
  var userName = safeLS('get','velo_user_name') || 'Usuario';
  var userId   = safeLS('get','velo_user_email') || 'guest';
  var bkId = 'bk-'+Date.now();
  var bk = { id:bkId, proId:_bookingProId, proName:pro.name, date:_bookingDateStr, time:_bookingSlotTime, userId:userId, userName:userName, status:'confirmed', ts:Date.now() };
  var bks = _proBookingsLoad(_bookingProId);
  bks.push(bk);
  _proBookingsSave(_bookingProId, bks);
  var myBks = []; try{ myBks = JSON.parse(safeLS('get','velo_my_bookings')||'[]'); }catch(e){}
  myBks.unshift({ id:bkId, proId:_bookingProId, proName:pro.name, proAv:pro.av, date:_bookingDateStr, time:_bookingSlotTime, status:'confirmed' });
  safeLS('set','velo_my_bookings', JSON.stringify(myBks.slice(0,100)));
  var d = new Date(_bookingDateStr+'T00:00:00');
  var dl = _CAL_DAY_NAMES_LONG[d.getDay()]+' '+d.getDate()+'/'+String(d.getMonth()+1).padStart(2,'0');
  var inbox=[]; try{ inbox=JSON.parse(safeLS('get','velo_inbox')||'[]'); }catch(e){}
  inbox.unshift({id:'bk-n-'+Date.now(),tipo:'sesion',icon:'📅',remitente:'Velo Sesiones',
    asunto:'Sesión reservada con '+pro.name,
    extracto:'Confirmada para el '+dl+' a las '+_bookingSlotTime+' hs.',
    leido:false,fecha:new Date().toLocaleDateString('es',{day:'2-digit',month:'short'})});
  safeLS('set','velo_inbox',JSON.stringify(inbox.slice(0,100)));
  _updateInboxDot();
  pCloseBookModal();
  pToast('📅','¡Reserva confirmada! '+dl+' · '+_bookingSlotTime+' ✅');
}

function switchProPanel(panel, btn){
  document.querySelectorAll('.pro-nav-item').forEach(function(i){ i.classList.remove('active'); });
  if(btn) btn.classList.add('active');
  var content = document.getElementById('proPanelContent');
  if(!content) return;
  var panels = {
    inicio: '<div class="metric-cards"><div class="metric-card"><div class="metric-n" id="ppEarnings">$0</div><div class="metric-l">Ingresos</div></div><div class="metric-card"><div class="metric-n" id="ppSessions">0</div><div class="metric-l">Sesiones</div></div><div class="metric-card"><div class="metric-n" id="ppRating">5.0</div><div class="metric-l">Rating</div></div></div><div class="p-card" style="padding:18px"><div class="p-label p-label-sage" style="margin-bottom:10px">Próximas sesiones</div><div id="ppNextSessions"><p class="p-sm p-muted">Sin sesiones programadas.</p></div></div>',
    agenda: pRenderProAgenda(),
    pacientes: _renderPatientList(),
    notas: '<div class="p-card" style="padding:18px"><div class="p-label p-label-sage" style="margin-bottom:12px">Notas de sesión</div><textarea class="p-textarea" rows="6" placeholder="Escribí notas de tu sesión más reciente..."></textarea><div style="height:10px"></div><button class="p-btn p-btn--primary p-btn--md" onclick="pToast(\'📝\',\'Nota guardada\')">Guardar nota</button></div>',
    finanzas: '<div class="metric-cards"><div class="metric-card"><div class="metric-n">$0</div><div class="metric-l">Pendiente</div></div><div class="metric-card"><div class="metric-n">$0</div><div class="metric-l">Total recibido</div></div><div class="metric-card"><div class="metric-n">0</div><div class="metric-l">Sesiones pagadas</div></div></div><div class="p-card" style="padding:18px;margin-top:14px"><p class="p-sm p-muted">Los pagos se procesan automáticamente por Stripe. Comisión Velo: 20%.</p></div>',
    mensajes: _renderProMessages(),
    solidario: _renderProSolidarity(),
    perfil: '<div class="p-card" style="padding:18px"><div class="p-label p-label-sage" style="margin-bottom:12px">Mi perfil profesional</div><div class="p-field"><label class="p-field-label">Estado</label><div style="display:flex;gap:8px">'+[{v:'disponible',l:'🟢 Disponible'},{v:'ocupado',l:'🟡 Ocupado'},{v:'vacaciones',l:'🏖️ Vacaciones'}].map(function(s){ return '<button style="padding:7px 12px;border-radius:100px;border:1.5px solid var(--border2);background:rgba(255,255,255,.7);font-size:12px;font-weight:600;cursor:pointer;font-family:\'Jost\',sans-serif" onclick="pToast(\'✅\',\'Estado: '+s.l+'\')">'+s.l+'</button>'; }).join('')+'</div></div><button class="p-btn p-btn--secondary p-btn--md" onclick="pSignOut()">↩️ Cerrar sesión</button></div>'
  };
  content.innerHTML = panels[panel] || '<p class="p-sm p-muted">Sección en desarrollo 🌿</p>';
  if(panel === 'inicio') pInitProPanel();
}

function _renderPatientList(){
  var proId = safeLS('get','velo_pro_id') || safeLS('get','velo_user_email') || 'pro';
  var transfers = []; try{ transfers = JSON.parse(safeLS('get','velo_pending_transfers')||'[]'); }catch(e){}
  // Group by user — last session per user
  var byUser = {};
  transfers.forEach(function(t){
    if(!byUser[t.userId] || t.ts > byUser[t.userId].ts) byUser[t.userId] = t;
  });
  var patients = Object.values(byUser);
  if(!patients.length){
    return '<div class="p-card" style="padding:18px"><div class="p-label p-label-sage" style="margin-bottom:12px">Mis pacientes</div>'
      +'<p class="p-sm p-muted">Aún no tuviste sesiones. Cuando un usuario reserve una sesión aparecerá aquí.</p></div>';
  }
  var rows = patients.map(function(t){
    var notesKey = 'velo_pro_notes_'+proId+'_'+t.userId;
    var notes = []; try{ notes = JSON.parse(safeLS('get',notesKey)||'[]'); }catch(e){}
    return '<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);cursor:pointer" onclick="pOpenPatientNotes(\''+t.userId+'\',\''+_escHtml(t.userName || 'Usuario')+'\')">'
      +'<div style="font-size:30px">🧑</div>'
      +'<div style="flex:1;min-width:0"><div style="font-weight:700;color:var(--ink);font-size:14px">'+(t.userName||'Usuario')+'</div>'
      +'<div style="font-size:11px;color:var(--ink5)">Última sesión · '+new Date(t.ts).toLocaleDateString('es')+'</div>'
      +'<div style="font-size:11px;color:var(--sage3);margin-top:2px">'+notes.length+' nota'+(notes.length!==1?'s':'')+'</div></div>'
      +'<div style="font-size:11px;font-weight:700;color:var(--sage3);white-space:nowrap">Ver notas →</div></div>';
  }).join('');
  return '<div class="p-card" style="padding:18px"><div class="p-label p-label-sage" style="margin-bottom:12px">Mis pacientes</div>'
    + rows
    + '</div><div id="patientNotePanel" style="display:none;margin-top:12px"></div>';
}

function pOpenPatientNotes(userId, userName){
  var proId = safeLS('get','velo_pro_id') || safeLS('get','velo_user_email') || 'pro';
  var notesKey = 'velo_pro_notes_'+proId+'_'+userId;
  var notes = []; try{ notes = JSON.parse(safeLS('get',notesKey)||'[]'); }catch(e){}
  var panel = document.getElementById('patientNotePanel');
  if(!panel) return;
  panel.style.display = 'block';
  panel.innerHTML = '<div class="p-card" style="padding:18px">'
    +'<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">'
    +'<button style="font-size:18px;background:none;border:none;cursor:pointer" onclick="document.getElementById(\'patientNotePanel\').style.display=\'none\'">←</button>'
    +'<div class="p-label p-label-sage" style="margin:0">Notas privadas · '+(userName||userId)+'</div></div>'
    +'<p style="font-size:11px;color:var(--ink5);margin-bottom:14px;line-height:1.5">🔒 Solo vos podés ver estas notas. No son visibles para el usuario ni para Velo.</p>'
    +'<textarea class="p-textarea" id="patientNoteTa" rows="4" placeholder="Escribí una nota clínica o de seguimiento para este paciente…"></textarea>'
    +'<div style="height:10px"></div>'
    +'<button class="p-btn p-btn--primary p-btn--md" onclick="pSavePatientNote(\''+userId+'\',\''+_escHtml(userName || 'Usuario')+'\')">💾 Guardar nota</button>'
    +'<div style="margin-top:16px" id="patientNotesList">'
    +(notes.length ? notes.map(function(n,i){
        return '<div style="background:var(--cream2);border-radius:10px;padding:10px 12px;margin-bottom:8px;font-size:13px;color:var(--ink2);line-height:1.5;position:relative">'
          +'<div style="font-size:10px;color:var(--ink5);margin-bottom:4px">'+new Date(n.ts).toLocaleDateString('es',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})+'</div>'
          +_escHtml(n.text)
          +'<button onclick="pDeletePatientNote(\''+userId+'\',\''+_escHtml(userName||'Usuario')+'\','+i+')" style="position:absolute;top:8px;right:8px;background:none;border:none;font-size:14px;cursor:pointer;color:var(--ink5)" title="Eliminar">🗑️</button>'
          +'</div>';
      }).join('')
    : '<p class="p-sm p-muted">Sin notas para este paciente aún.</p>')
    +'</div></div>';
}

function pSavePatientNote(userId, userName){
  var ta = document.getElementById('patientNoteTa');
  if(!ta || !ta.value.trim()){ pToast('⚠️','Escribí algo antes de guardar'); return; }
  var proId = safeLS('get','velo_pro_id') || safeLS('get','velo_user_email') || 'pro';
  var notesKey = 'velo_pro_notes_'+proId+'_'+userId;
  var notes = []; try{ notes = JSON.parse(safeLS('get',notesKey)||'[]'); }catch(e){}
  notes.unshift({ text: ta.value.trim(), ts: Date.now() });
  safeLS('set', notesKey, JSON.stringify(notes.slice(0,200)));
  pToast('💾','Nota guardada de forma privada');
  pOpenPatientNotes(userId, userName);
}

function pDeletePatientNote(userId, userName, idx){
  if(!confirm('¿Eliminar esta nota?')) return;
  var proId = safeLS('get','velo_pro_id') || safeLS('get','velo_user_email') || 'pro';
  var notesKey = 'velo_pro_notes_'+proId+'_'+userId;
  var notes = []; try{ notes = JSON.parse(safeLS('get',notesKey)||'[]'); }catch(e){}
  notes.splice(idx, 1);
  safeLS('set', notesKey, JSON.stringify(notes));
  pToast('🗑️','Nota eliminada');
  pOpenPatientNotes(userId, userName);
}

// ── PRO MESSAGES ────────────────────────────────────────────
function _renderProMessages(){
  var proId   = safeLS('get','velo_pro_id') || safeLS('get','velo_user_email') || 'pro';
  var proName = safeLS('get','velo_user_name') || 'Profesional';
  var replies = []; try{ replies = JSON.parse(safeLS('get','velo_pro_inbox_'+proId)||'[]'); }catch(e){}

  var transfers = []; try{ transfers = JSON.parse(safeLS('get','velo_pending_transfers')||'[]'); }catch(e){}
  var byUser = {};
  transfers.forEach(function(t){ if(!byUser[t.userId]) byUser[t.userId] = t; });
  var patients = Object.values(byUser);

  var composeSection = '<div class="p-card" style="padding:18px;margin-bottom:14px">'
    +'<div class="p-label p-label-sage" style="margin-bottom:12px">Nuevo mensaje a paciente</div>'
    +(patients.length
      ? '<div style="display:flex;flex-direction:column;gap:8px">'
        + patients.map(function(t){
          return '<button style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--cream2);border:1.5px solid var(--border2);border-radius:12px;cursor:pointer;text-align:left;font-family:\'Jost\',sans-serif" onclick="pProComposeMsg(\''+_escHtml(t.userId)+'\',\''+_escHtml(t.userName||'Usuario')+'\')">'
            +'<span style="font-size:22px">🧑</span>'
            +'<div style="flex:1"><div style="font-size:13px;font-weight:700;color:var(--ink)">'+(t.userName||'Usuario')+'</div>'
            +'<div style="font-size:11px;color:var(--ink5)">Enviar mensaje interno</div></div>'
            +'<span style="color:var(--sage3);font-size:16px">✉️</span></button>';
        }).join('')
        +'</div>'
      : '<p class="p-sm p-muted">Cuando tengas pacientes podrás enviarles mensajes internos directamente desde aquí.</p>')
    +'</div>';

  var replySection = '<div class="p-card" style="padding:18px">'
    +'<div class="p-label p-label-sage" style="margin-bottom:12px">Respuestas recibidas</div>'
    +(replies.length
      ? replies.map(function(r){
          var readCls = r.leido ? '' : ' unread';
          return '<div class="p-inbox-msg'+readCls+'" style="cursor:default">'
            +'<div class="p-inbox-ic">💬</div>'
            +'<div style="flex:1;min-width:0">'
            +'<div style="font-size:13px;font-weight:700;color:var(--ink);margin-bottom:2px">'+(r.userName||'Paciente')+'</div>'
            +'<div style="font-size:12px;color:var(--ink3);line-height:1.5;white-space:pre-line">'+_escHtml(r.texto)+'</div>'
            +'<div style="font-size:10px;color:var(--ink5);margin-top:4px">'+r.fecha+'</div>'
            +'</div></div>';
        }).join('')
      : '<p class="p-sm p-muted">Las respuestas de tus pacientes aparecerán aquí.</p>')
    +'</div>';

  return composeSection + replySection;
}

function pProComposeMsg(userId, userName){
  var ov = document.createElement('div');
  ov.className = 'p-modal-ov show';
  ov.id = 'proComposeMsgOv';
  ov.innerHTML = '<div class="p-sheet">'
    +'<div class="p-sheet-handle"></div>'
    +'<div style="font-family:\'Cormorant Garamond\',serif;font-size:20px;color:var(--ink);margin-bottom:4px">Mensaje para '+_escHtml(userName)+'</div>'
    +'<p style="font-size:12px;color:var(--ink4);margin-bottom:14px">El usuario lo recibirá en su buzón de Velo y podrá responderle.</p>'
    +'<textarea class="p-textarea" id="proComposeTa" rows="5" placeholder="Escribí tu mensaje..."></textarea>'
    +'<div style="height:12px"></div>'
    +'<button class="p-btn p-btn--primary p-btn--lg p-btn--full" onclick="pProSendMsg(\''+_escHtml(userId)+'\',\''+_escHtml(userName)+'\')">Enviar mensaje 💌</button>'
    +'<div style="height:8px"></div>'
    +'<button class="p-btn p-btn--secondary p-btn--md p-btn--full" onclick="document.getElementById(\'proComposeMsgOv\').remove()">Cancelar</button>'
    +'</div>';
  document.body.appendChild(ov);
  ov.addEventListener('click', function(e){ if(e.target===ov) ov.remove(); });
}

function pProSendMsg(userId, userName){
  var ta = document.getElementById('proComposeTa');
  if(!ta || !ta.value.trim()){ pToast('✍️','Escribí tu mensaje antes de enviar'); return; }
  var texto = ta.value.trim();
  var proId   = safeLS('get','velo_pro_id') || safeLS('get','velo_user_email') || 'pro';
  var proName = safeLS('get','velo_user_name') || 'Tu profesional';
  var proAv   = safeLS('get','velo_user_av') || '🩺';
  var fecha   = new Date().toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'});

  // Deliver to user inbox
  var inbox = []; try{ inbox = JSON.parse(safeLS('get','velo_inbox')||'[]'); }catch(e){}
  var msgId = 'pm-'+Date.now();
  inbox.unshift({
    id: msgId, tipo:'pro-msg', icon:'🩺',
    remitente: proName, proId: proId, proName: proName, proAv: proAv,
    asunto: 'Mensaje de tu profesional '+proName,
    extracto: texto.substring(0,80)+(texto.length>80?'…':''),
    cuerpo: texto, leido: false, fecha: fecha
  });
  safeLS('set','velo_inbox', JSON.stringify(inbox.slice(0,100)));
  _updateHomeBell();

  var existing = document.getElementById('proComposeMsgOv');
  if(existing) existing.remove();
  pToast('💌','Mensaje enviado a '+userName);
}

function pReplyToProMsg(proId, proName, userName){
  var ov = document.createElement('div');
  ov.className = 'p-modal-ov show';
  ov.id = 'proReplyMsgOv';
  ov.innerHTML = '<div class="p-sheet">'
    +'<div class="p-sheet-handle"></div>'
    +'<div style="font-family:\'Cormorant Garamond\',serif;font-size:20px;color:var(--ink);margin-bottom:4px">Responder a '+_escHtml(proName)+'</div>'
    +'<p style="font-size:12px;color:var(--ink4);margin-bottom:14px">Tu respuesta llegará al buzón del profesional.</p>'
    +'<textarea class="p-textarea" id="proReplyTa" rows="4" placeholder="Escribí tu respuesta..."></textarea>'
    +'<div style="height:12px"></div>'
    +'<button class="p-btn p-btn--primary p-btn--lg p-btn--full" onclick="pSendProReply(\''+_escHtml(proId)+'\',\''+_escHtml(proName)+'\')">Enviar respuesta 💌</button>'
    +'<div style="height:8px"></div>'
    +'<button class="p-btn p-btn--secondary p-btn--md p-btn--full" onclick="document.getElementById(\'proReplyMsgOv\').remove()">Cancelar</button>'
    +'</div>';
  document.body.appendChild(ov);
  ov.addEventListener('click', function(e){ if(e.target===ov) ov.remove(); });
}

function pSendProReply(proId, proName){
  var ta = document.getElementById('proReplyTa');
  if(!ta || !ta.value.trim()){ pToast('✍️','Escribí tu respuesta antes de enviar'); return; }
  var texto = ta.value.trim();
  var myName = safeLS('get','velo_user_name') || 'Paciente';
  var fecha  = new Date().toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'});

  // Store reply in pro's inbox
  var key = 'velo_pro_inbox_'+proId;
  var replies = []; try{ replies = JSON.parse(safeLS('get',key)||'[]'); }catch(e){}
  replies.unshift({ id:'rp-'+Date.now(), userName: myName, texto: texto, fecha: fecha, leido: false });
  safeLS('set', key, JSON.stringify(replies.slice(0,100)));

  var existing = document.getElementById('proReplyMsgOv');
  if(existing) existing.remove();
  // Also close any open inbox message sheet
  var inboxOv = document.getElementById('inboxMsgOv');
  if(inboxOv) inboxOv.remove();
  pToast('💌','Respuesta enviada a '+proName);
}

// ── SOLIDARITY WAITLIST ─────────────────────────────────────
function pJoinWaitlist(){
  // Check if already on waitlist
  if(safeLS('get','velo_on_waitlist') === '1'){
    pToast('💙','Ya estás en la lista de espera. Te avisaremos por buzón cuando haya un lugar.');
    return;
  }
  var ov = document.createElement('div');
  ov.className = 'p-modal-ov show';
  ov.id = 'waitlistOv';
  ov.innerHTML = '<div class="p-sheet">'
    +'<div class="p-sheet-handle"></div>'
    +'<div style="text-align:center;margin-bottom:16px">'
    +'<div style="font-size:44px;margin-bottom:8px">💙</div>'
    +'<div style="font-family:\'Cormorant Garamond\',serif;font-size:22px;color:var(--ink);margin-bottom:6px">Lista de espera solidaria</div>'
    +'<p style="font-size:13px;color:var(--ink4);line-height:1.6">Profesionales Solidarios/as donan 1 sesión gratuita por mes. Te avisaremos por buzón cuando haya un lugar disponible para vos.</p>'
    +'</div>'
    +'<div class="p-field"><label class="p-field-label">¿En qué área necesitás ayuda? (opcional)</label>'
    +'<input id="waitlistArea" class="p-input" type="text" placeholder="Ej: ansiedad, estrés laboral, duelo..."></div>'
    +'<div style="height:14px"></div>'
    +'<button class="p-btn p-btn--primary p-btn--lg p-btn--full" onclick="pConfirmWaitlist()">💙 Anotarme en la lista</button>'
    +'<div style="height:8px"></div>'
    +'<button class="p-btn p-btn--secondary p-btn--md p-btn--full" onclick="document.getElementById(\'waitlistOv\').remove()">Cancelar</button>'
    +'</div>';
  document.body.appendChild(ov);
  ov.addEventListener('click', function(e){ if(e.target===ov) ov.remove(); });
}

function pConfirmWaitlist(){
  var areaEl = document.getElementById('waitlistArea');
  var area = areaEl ? areaEl.value.trim() : '';
  var userName = safeLS('get','velo_user_name') || 'Usuario';
  var ts = Date.now();
  var waitlist = []; try{ waitlist = JSON.parse(safeLS('get','velo_waitlist')||'[]'); }catch(e){}
  var pos = waitlist.length + 1;
  waitlist.push({ id:'wl-'+ts, userName:userName, area:area, ts:ts });
  safeLS('set','velo_waitlist', JSON.stringify(waitlist));
  safeLS('set','velo_on_waitlist','1');
  // Inbox confirmation
  var inbox = []; try{ inbox = JSON.parse(safeLS('get','velo_inbox')||'[]'); }catch(e){}
  inbox.unshift({ id:'wl-conf-'+ts, tipo:'sistema', icon:'💙', remitente:'Programa Solidario',
    asunto:'Estás en la lista de espera 💙',
    extracto:'Posición '+pos+' en lista. Te avisaremos cuando un profesional esté disponible.',
    cuerpo:'Hola '+userName+',\n\nTe anotamos en la lista de espera del Programa Solidario. Estás en la posición '+pos+'.\n\nCuando un Profesional Solidario/a tenga una sesión disponible, te avisaremos por este buzón y podrás confirmar la reserva.\n\nGracias por confiar en Velo 💙',
    leido:false, fecha:new Date().toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'}) });
  safeLS('set','velo_inbox', JSON.stringify(inbox.slice(0,100)));
  _updateHomeBell();
  var ov = document.getElementById('waitlistOv');
  if(ov) ov.remove();
  pToast('💙','¡Anotado/a! Te avisaremos cuando haya un lugar disponible 🌿');
}

function _renderProSolidarity(){
  var proId = safeLS('get','velo_pro_id') || safeLS('get','velo_user_email') || 'pro';
  var solidarity = safeLS('get','velo_pro_solidarity') === '1';
  if(!solidarity){
    return '<div class="p-card" style="padding:18px">'
      +'<div class="p-label p-label-sage" style="margin-bottom:12px">Programa Solidario</div>'
      +'<p style="font-size:13px;color:var(--ink4);line-height:1.6;margin-bottom:14px">¿Querés donar 1 sesión gratuita por mes para alguien que lo necesita? Obtenés la insignia 💙 Profesional Solidario/a.</p>'
      +'<button class="p-btn p-btn--primary p-btn--md p-btn--full" onclick="pTogProSolidarity(true)">💙 Unirme al programa solidario</button>'
      +'</div>';
  }
  var waitlist = []; try{ waitlist = JSON.parse(safeLS('get','velo_waitlist')||'[]'); }catch(e){}
  var assigned = waitlist[0];
  return '<div class="p-card" style="padding:18px">'
    +'<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">'
    +'<span style="font-size:11px;font-weight:700;color:#3a7bd5;background:rgba(58,123,213,.1);border:1px solid rgba(58,123,213,.2);border-radius:100px;padding:4px 12px">💙 Profesional Solidario/a</span>'
    +'<button style="margin-left:auto;font-size:11px;color:var(--ink5);background:none;border:none;cursor:pointer" onclick="pTogProSolidarity(false)">Salir del programa</button>'
    +'</div>'
    +(assigned
      ? '<div style="background:rgba(58,123,213,.07);border:1.5px solid rgba(58,123,213,.2);border-radius:12px;padding:14px;margin-bottom:14px">'
        +'<div style="font-size:12px;font-weight:700;color:var(--ink);margin-bottom:4px">👤 '+_escHtml(assigned.userName)+'</div>'
        +(assigned.area ? '<div style="font-size:12px;color:var(--ink4);margin-bottom:10px">Área: '+_escHtml(assigned.area)+'</div>' : '<div style="height:6px"></div>')
        +'<div style="font-size:11px;color:var(--ink5);margin-bottom:10px">En lista desde '+new Date(assigned.ts).toLocaleDateString('es',{day:'2-digit',month:'short'})+'</div>'
        +'<button class="p-btn p-btn--primary p-btn--sm" onclick="pAssignSolidarity(\''+assigned.id+'\',\''+_escHtml(assigned.userName)+'\')">💙 Contactar y asignar sesión</button>'
        +'</div>'
      : '<p class="p-sm p-muted">No hay usuarios en lista de espera en este momento.</p>')
    +'<p style="font-size:11px;color:var(--ink5);line-height:1.5">La sesión solidaria se asigna manualmente. Velo coordina el contacto por buzón interno.</p>'
    +'</div>';
}

function pTogProSolidarity(on){
  safeLS('set','velo_pro_solidarity', on ? '1' : '0');
  pToast(on ? '💙' : '✅', on ? '¡Bienvenido/a al programa solidario!' : 'Saliste del programa solidario');
  switchProPanel('solidario', null);
}

function pAssignSolidarity(waitlistId, userName){
  // Mark as assigned — remove from waitlist
  var waitlist = []; try{ waitlist = JSON.parse(safeLS('get','velo_waitlist')||'[]'); }catch(e){}
  var user = waitlist.find(function(w){ return w.id === waitlistId; });
  waitlist = waitlist.filter(function(w){ return w.id !== waitlistId; });
  safeLS('set','velo_waitlist', JSON.stringify(waitlist));

  // Send notification to user inbox
  var inbox = []; try{ inbox = JSON.parse(safeLS('get','velo_inbox')||'[]'); }catch(e){}
  var proName = safeLS('get','velo_user_name') || 'Profesional';
  var proId   = safeLS('get','velo_pro_id') || safeLS('get','velo_user_email') || 'pro';
  var ts = Date.now();
  inbox.unshift({ id:'wl-assign-'+ts, tipo:'pro-msg', icon:'💙', remitente:proName,
    proId:proId, proName:proName,
    asunto:'¡Conseguiste una sesión solidaria! 💙',
    extracto:'Un/a Profesional Solidario/a aceptó acompañarte. Respondé para coordinar.',
    cuerpo:'Hola,\n\nSoy '+proName+' y me gustaría acompañarte en tu sesión solidaria gratuita.\n\nRespondé este mensaje para coordinar el día y horario que mejor te venga. Estoy acá para vos 💙',
    leido:false, fecha:new Date().toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'}) });
  safeLS('set','velo_inbox', JSON.stringify(inbox.slice(0,100)));
  safeLS('set','velo_on_waitlist','0');
  _updateHomeBell();

  pToast('💙','Sesión asignada a '+userName+'. Le llegó una notificación en su buzón.');
  switchProPanel('solidario', null);
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
  var tcEl  = document.getElementById('proTcCheck');
  var tcErrEl = document.getElementById('proTcErr');
  if(!name||!name.value.trim()){ pToast('⚠️','Ingresá tu nombre'); return; }
  if(!spec||!spec.value.trim()){ pToast('⚠️','Ingresá tu especialidad'); return; }
  if(!email||!email.value.trim()){ pToast('⚠️','Ingresá tu correo'); return; }
  if(!pass||!pass.value||pass.value.length<6){ pToast('⚠️','Contraseña mínima de 6 caracteres'); return; }
  if(tcEl && !tcEl.checked){ if(tcErrEl) tcErrEl.style.display='block'; return; }
  if(tcErrEl) tcErrEl.style.display='none';
  safeLS('set','velo_pro_name', name.value.trim());
  safeLS('set','velo_pro_spec', spec.value.trim());
  safeLS('set','velo_user_email', email.value.trim());
  safeLS('set','velo_sb_pass', pass.value);
  safeLS('set','velo_user_type','pro');
  safeLS('set','velo_user_name', name.value.trim());
  _recordTC(name.value.trim(), email.value.trim());
  pOpenPayPalPro();
  pGoTo('pro-pending');
}

// ── ADMIN ──────────────────────────────────────────────────────
var _ADMIN_EMAIL = 'wearevelo.app@gmail.com';

async function pAdminLogin(){
  var emailEl = document.getElementById('adminEmail');
  var passEl  = document.getElementById('adminPass');
  var btn     = document.getElementById('adminLoginBtn');
  var email   = emailEl ? emailEl.value.trim().toLowerCase() : '';
  var pass    = passEl  ? passEl.value : '';
  if(!email){ pToast('⚠️','Ingresá tu correo'); return; }
  if(!pass){  pToast('⚠️','Ingresá tu contraseña'); return; }
  if(btn){ btn.disabled = true; btn.textContent = 'Verificando…'; }

  _initSupabase();
  var granted = false;
  var authError = '';

  if(sbClient){
    try{
      var resp = await sbClient.auth.signInWithPassword({ email: email, password: pass });
      var data = resp.data; var error = resp.error;
      if(!error && data && data.user){
        if(data.user.email.toLowerCase() === _ADMIN_EMAIL){
          granted = true;
        } else {
          authError = 'Tu cuenta no tiene acceso de administrador';
        }
      } else if(error){
        var em = error.message || '';
        if(/email.*not.*confirm/i.test(em) || /not confirmed/i.test(em))
          authError = 'El correo admin no está confirmado. Confirmá el email en ' + _ADMIN_EMAIL + ' primero.';
        else if(/invalid.*credentials/i.test(em) || /invalid login/i.test(em))
          authError = 'Credenciales incorrectas. Verificá el correo y la contraseña.';
        else
          authError = 'Error: ' + em;
      }
    }catch(e){
      authError = 'Error de red · Verificá tu conexión';
    }
  } else {
    authError = 'Error al conectar con el servidor · Recargá la página';
  }

  if(granted){
    safeLS('set','velo_user_type','admin');
    safeLS('set','velo_admin_session','1');
    safeLS('set','velo_session','1');
    _authenticated = true;
    _userType = 'admin';
    if(passEl) passEl.value = '';
    if(emailEl) emailEl.value = '';
    pGoTo('admin');
    _renderAdmin();
    pToast('🌿','Bienvenido/a al panel admin');
  } else {
    pToast('⚠️', authError || 'Credenciales incorrectas');
  }

  if(btn){ btn.disabled = false; btn.textContent = 'Acceder al panel'; }
}

function pAdminLogout(){
  safeLS('del','velo_admin_session');
  safeLS('del','velo_session');
  _authenticated = false;
  pGoTo('landing');
  _updateNavState('landing', false);
}

async function _renderAdmin(){
  var metrics = document.getElementById('adminMetrics');

  // Show loading skeleton while Supabase queries run
  if(metrics) metrics.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:18px;font-size:12px;color:rgba(255,255,255,.35)">Cargando datos en tiempo real…</div>';

  // ── Live Supabase queries ──────────────────────────────────
  _initSupabase();
  var totalUsers = 0, totalPros = 0, totalPlus = 0, recentReg = [];
  var openReports = 0, crisisOpen = 0;

  if(sbClient){
    // Profiles: real registration count
    try{
      var profRes = await sbClient.from('profiles').select('role,created_at,nombre,email').order('created_at',{ascending:false}).limit(500);
      if(!profRes.error && profRes.data){
        var profiles = profRes.data;
        totalPros  = profiles.filter(function(p){ return p.role==='pro'; }).length;
        totalPlus  = profiles.filter(function(p){ return p.role==='plus'; }).length;
        totalUsers = profiles.length - totalPros; // users includes plus users
        recentReg  = profiles.slice(0,10);
      }
    }catch(e){}

    // Reportes: open reports and crisis
    try{
      var repRes = await sbClient.from('reportes').select('estado,categoria').eq('estado','abierto');
      if(!repRes.error && repRes.data){
        openReports = repRes.data.length;
        crisisOpen  = repRes.data.filter(function(r){ return r.categoria==='crisis'; }).length;
      }
    }catch(e){}
  }

  // ── Fallback to localStorage estimates for community stats ──
  var audit = []; try{ audit = JSON.parse(safeLS('get','velo_audit_log')||'[]'); }catch(e){}
  if(!openReports) openReports = audit.filter(function(a){ return !a.resolved; }).length;
  if(!crisisOpen)  crisisOpen  = audit.filter(function(a){ return a.tipo==='crisis_detect'&&!a.resolved; }).length;

  var bottlesSent     = parseInt(safeLS('get','velo_bottle_count')||'0',10) || (function(){ try{ return JSON.parse(safeLS('get','velo_my_bottles')||'[]').length; }catch(e){ return 0; } })();
  var bottlesReplied  = (function(){ try{ return JSON.parse(safeLS('get','velo_bottle_responded')||'[]').length; }catch(e){ return 0; } })();
  var helpedOthers    = parseInt(safeLS('get','velo_helped_others')||'0',10);
  var helpRequests    = (function(){ try{ return JSON.parse(safeLS('get','velo_help_posts')||'[]').filter(function(p){ return !p._mock; }).length; }catch(e){ return 0; } })();
  var circlesCount    = (function(){ try{ return JSON.parse(safeLS('get','velo_circles')||'[]').length; }catch(e){ return 0; } })();
  var waitlistCount   = (function(){ try{ return JSON.parse(safeLS('get','velo_waitlist')||'[]').length; }catch(e){ return 0; } })();
  var tcRecs = []; try{ tcRecs = JSON.parse(safeLS('get','velo_tc_records')||'[]'); }catch(e){}

  // If Supabase returned 0 users, fall back to T&C records as minimum estimate
  if(totalUsers === 0 && tcRecs.length) totalUsers = tcRecs.length;

  // ── Render metrics grid ────────────────────────────────────
  if(metrics){
    var data = [
      { icon:'👥', label:'Usuarios registrados', value: totalUsers,    color:'var(--sage4)',      note:'Supabase' },
      { icon:'🩺', label:'Profesionales',         value: totalPros,     color:'rgba(116,198,200,.8)', note:'Supabase' },
      { icon:'⭐', label:'Velo Plus / Insignia dorada', value: totalPlus, color:'#c8a23e',        note:'Supabase' },
      { icon:'💙', label:'Lista espera solidaria', value: waitlistCount, color:'rgba(58,123,213,.9)', note:'local' },
      { icon:'🌊', label:'Mensajes al Mar lanzados', value: bottlesSent, color:'rgba(100,170,230,.8)', note:'local' },
      { icon:'💌', label:'Botellas respondidas',   value: bottlesReplied, color:'rgba(116,198,157,.8)', note:'local' },
      { icon:'🤝', label:'Personas acompañadas',   value: helpedOthers,  color:'var(--sage4)',     note:'local' },
      { icon:'💬', label:'Pedidos de ayuda publicados', value: helpRequests, color:'rgba(180,140,220,.8)', note:'local' },
      { icon:'🕊️', label:'Círculos de Paz creados', value: circlesCount, color:'rgba(200,165,100,.8)', note:'local' },
      { icon:'🚨', label:'Reportes pendientes',    value: openReports,   color: openReports>0?'#e05252':'var(--sage4)', note:'Supabase' },
      { icon:'🆘', label:'Crisis activas',          value: crisisOpen,    color: crisisOpen>0?'#ff4444':'var(--sage4)', note:'Supabase' }
    ];
    metrics.style.cssText = 'display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:14px';
    metrics.innerHTML = data.map(function(d){
      return '<div class="a-card" style="position:relative">'
        +'<div style="font-size:20px;margin-bottom:2px">'+d.icon+'</div>'
        +'<div class="a-card-n" style="color:'+d.color+';font-size:22px">'+d.value+'</div>'
        +'<div class="a-card-l" style="font-size:10px;line-height:1.3">'+d.label+'</div>'
        +'<div style="position:absolute;top:6px;right:8px;font-size:8px;color:rgba(255,255,255,.2);font-weight:600">'+d.note+'</div>'
        +'</div>';
    }).join('');

    // Recent registrations
    if(recentReg.length){
      metrics.insertAdjacentHTML('afterend',
        '<div style="background:rgba(116,198,157,.06);border:1px solid rgba(116,198,157,.12);border-radius:12px;padding:12px 14px;margin-bottom:14px">'
        +'<div style="font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(116,198,157,.6);margin-bottom:10px">🆕 ÚLTIMOS REGISTROS (TIEMPO REAL)</div>'
        + recentReg.map(function(p){
            var fecha = p.created_at ? new Date(p.created_at).toLocaleString('es',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '—';
            var roleBadge = p.role==='pro' ? '<span style="font-size:9px;color:#74c6d0;border:1px solid rgba(116,198,210,.3);border-radius:4px;padding:1px 5px">PRO</span>'
                          : p.role==='plus' ? '<span style="font-size:9px;color:#c8a23e;border:1px solid rgba(200,162,62,.3);border-radius:4px;padding:1px 5px">PLUS</span>'
                          : '<span style="font-size:9px;color:rgba(255,255,255,.25);border:1px solid rgba(255,255,255,.1);border-radius:4px;padding:1px 5px">USER</span>';
            return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.05)">'
              +'<div style="flex:1;min-width:0">'
              +'<div style="font-size:12px;font-weight:600;color:rgba(255,255,255,.7);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+(p.nombre||p.email||'Usuario')+'</div>'
              +'<div style="font-size:10px;color:rgba(255,255,255,.3)">'+_escHtml(p.email||'')+'</div>'
              +'</div>'
              +roleBadge
              +'<div style="font-size:10px;color:rgba(255,255,255,.25);white-space:nowrap">'+fecha+'</div>'
              +'</div>';
          }).join('')
        +'</div>'
      );
    }
  }

  // ── Admin content panels ───────────────────────────────────
  if(content){
    var msgs = []; try{ msgs = JSON.parse(safeLS('get','velo_admin_contacts')||'[]'); }catch(e){}
    audit = audit.length ? audit : (function(){ try{ return JSON.parse(safeLS('get','velo_audit_log')||'[]'); }catch(e){ return []; } })();

    // Provisional password section
    var provHtml = '<div style="font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(200,162,0,.7);margin-bottom:10px">🔑 CONTRASEÑAS PROVISIONALES</div>'
      +'<div style="background:rgba(200,162,0,.06);border:1px solid rgba(200,162,0,.18);border-radius:12px;padding:14px;margin-bottom:8px">'
      +'<p style="font-size:11px;color:rgba(255,255,255,.4);margin-bottom:10px;line-height:1.5">Creá una contraseña temporal para un usuario que no puede recuperar su cuenta. Válida 72 horas.</p>'
      +'<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">'
      +'<input class="p-input" id="adminProvEmail" type="email" placeholder="correo@usuario.com" style="flex:1;background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.15);color:#fff" />'
      +'<button onclick="pCreateProvisionalPass()" style="padding:8px 14px;background:rgba(200,162,0,.2);border:1px solid rgba(200,162,0,.35);color:rgba(200,162,0,.9);border-radius:8px;cursor:pointer;font-family:\'Jost\',sans-serif;font-size:12px;font-weight:700;white-space:nowrap">Crear contraseña</button>'
      +'</div>'
      +'<div id="adminProvResult" style="font-size:12px;color:rgba(116,198,157,.8)"></div>'
      +'</div>';

    var contactsHtml = provHtml
      +'<div style="font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(116,198,157,.6);margin-bottom:10px;margin-top:8px">💌 MENSAJES DE CONTACTO</div>'
      +'<div id="adminContactsList"><p style="font-size:12px;color:rgba(255,255,255,.3);padding:12px 0">Cargando mensajes…</p></div>'

    // T&C acceptance log (legal audit)
      +'<div style="margin-top:20px;font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(116,198,157,.6);margin-bottom:8px">📜 ACEPTACIÓN DE TÉRMINOS (AUDITORÍA LEGAL)</div>'
      +'<div style="font-size:10px;color:rgba(255,255,255,.35);margin-bottom:10px;line-height:1.5">Registro completo con fecha, hora y milisegundos para uso judicial.</div>'
      +(tcRecs.length
        ? tcRecs.slice(0,20).map(function(r){
            var d = r.timestamp ? new Date(r.timestamp) : new Date(r.ts_ms||0);
            var dateStr = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')
              +' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')+':'+String(d.getSeconds()).padStart(2,'0')
              +'.'+String(d.getMilliseconds()).padStart(3,'0')+' UTC';
            return '<div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:10px 12px;margin-bottom:6px">'
              +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">'
              +'<span style="font-size:12px;font-weight:700;color:rgba(255,255,255,.75)">'+_escHtml(r.name||'—')+'</span>'
              +'<span style="font-size:10px;color:rgba(116,198,157,.7);font-weight:700">✓ Aceptado</span>'
              +'</div>'
              +'<div style="font-size:11px;color:rgba(255,255,255,.4);margin-bottom:2px">'+_escHtml(r.email||'—')+'</div>'
              +'<div style="font-size:10px;color:rgba(255,255,255,.25);font-family:monospace">'+dateStr+'</div>'
              +(r.ts_ms ? '<div style="font-size:9px;color:rgba(255,255,255,.18);font-family:monospace">Unix ms: '+r.ts_ms+'</div>' : '')
              +'</div>';
          }).join('')
        : '<p style="font-size:12px;color:rgba(255,255,255,.3);padding:8px 0">Sin registros aún.</p>');

    var crisisEvents = audit.filter(function(a){ return a.tipo === 'crisis_detect'; });
    var crisisHtml = '<div style="margin-top:20px;font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(255,80,80,.85);margin-bottom:10px">🆘 ALERTAS DE CRISIS</div>'
      +'<div id="adminCrisisSupabase"><p style="font-size:11px;color:rgba(255,255,255,.3)">Cargando desde servidor...</p></div>'
      +(crisisEvents.length
        ? crisisEvents.slice(0,10).map(function(a,i){
            var date = new Date(a.ts);
            var dateStr = date.toLocaleDateString('es',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
            var nivelColor = a.nivel==='alto' ? '#ff4444' : '#ffbb33';
            var nivelLabel = a.nivel==='alto' ? '🔴 ALTO' : '🟡 MEDIO';
            return '<div style="background:rgba(220,50,50,.08);border:1px solid rgba(220,50,50,.25);border-radius:10px;padding:12px;margin-bottom:8px">'
              +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">'
              +'<span style="font-size:11px;font-weight:700;color:'+nivelColor+'">'+nivelLabel+'</span>'
              +'<span style="font-size:10px;color:rgba(255,255,255,.3)">'+dateStr+'</span>'
              +'</div>'
              +(a.motivo ? '<div style="font-size:11px;color:rgba(255,255,255,.55);margin-bottom:4px">'+_escHtml(a.motivo)+'</div>' : '')
              +(a.detail ? '<div style="font-size:11px;color:rgba(255,255,255,.35);font-style:italic;margin-bottom:8px">"'+_escHtml(a.detail)+'"</div>' : '')
              +(a.resolved
                ? '<span style="font-size:10px;color:rgba(116,198,157,.7);font-weight:700">✓ Atendida</span>'
                : '<button onclick="pResolveCrisis('+i+')" style="font-size:10px;padding:4px 10px;background:rgba(116,198,157,.15);border:1px solid rgba(116,198,157,.3);color:rgba(116,198,157,.85);border-radius:6px;cursor:pointer;font-family:\'Jost\',sans-serif">Marcar como atendida</button>')
              +'</div>';
          }).join('')
        : '<p style="font-size:12px;color:rgba(255,255,255,.3);padding:8px 0">Sin alertas de crisis. 🌿</p>');

    var auditHtml = '<div style="margin-top:20px;font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(220,80,80,.7);margin-bottom:10px">🛡️ AUDITORÍA IA — CONTROL DE ABUSOS</div>'
      +'<div style="font-size:11px;color:rgba(255,255,255,.4);margin-bottom:10px;line-height:1.5">Reportes de usuarios, comportamientos detectados y acciones moderadas.</div>'
      +(audit.length
        ? audit.slice(0,30).map(function(a,i){
            var date = new Date(a.ts);
            var dateStr = date.toLocaleDateString('es',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
            var typeLabel = { report_circle:'Reporte en círculo', ban_user:'Usuario baneado', abuse_detect:'Detección IA', flag_bottle:'Botella reportada', flag_help:'Ayuda reportada' }[a.tipo] || a.tipo;
            var color = a.resolved ? 'rgba(116,198,157,.5)' : '#e05252';
            return '<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.06)">'
              +'<div style="font-size:18px;flex-shrink:0">'+(a.tipo==='report_circle'?'⚠️':a.tipo==='abuse_detect'?'🤖':'🚩')+'</div>'
              +'<div style="flex:1;min-width:0">'
              +'<div style="font-size:12px;font-weight:700;color:rgba(255,255,255,.82)">'+typeLabel+'</div>'
              +(a.circle ? '<div style="font-size:11px;color:rgba(255,255,255,.38)">Círculo: '+a.circle+'</div>' : '')
              +(a.motivo ? '<div style="font-size:11px;color:rgba(255,255,255,.38)">Motivo: '+a.motivo+'</div>' : '')
              +(a.detail ? '<div style="font-size:11px;color:rgba(255,255,255,.3);font-style:italic">'+a.detail+'</div>' : '')
              +'<div style="font-size:10px;color:rgba(255,255,255,.28)">'+dateStr+'</div>'
              +'</div>'
              +'<div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">'
              +(a.resolved
                ? '<span style="font-size:10px;color:rgba(116,198,157,.7);font-weight:700">✓ Resuelto</span>'
                : '<button onclick="pResolveAudit('+i+')" style="font-size:10px;padding:3px 8px;background:rgba(116,198,157,.15);border:1px solid rgba(116,198,157,.3);color:rgba(116,198,157,.8);border-radius:6px;cursor:pointer;font-family:\'Jost\',sans-serif">Resolver</button>')
              +'</div>'
              +'</div>';
          }).join('')
        : '<p style="font-size:12px;color:rgba(255,255,255,.3);padding:12px 0">Sin eventos de auditoría.</p>');

    // Pending transfers
    var transfers = []; try{ transfers = JSON.parse(safeLS('get','velo_pending_transfers')||'[]'); }catch(e){}
    var transferHtml = '<div style="margin-top:20px;font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(200,162,0,.7);margin-bottom:10px">💳 TRANSFERENCIAS PENDIENTES</div>'
      +'<div style="font-size:11px;color:rgba(255,255,255,.4);margin-bottom:10px">80% al profesional · 20% Velo. El botón se habilita solo cuando el profesional marcó la sesión como finalizada.</div>'
      +(transfers.filter(function(t){ return t.ended && !t.paid; }).length
        ? transfers.filter(function(t){ return t.ended && !t.paid; }).map(function(t,i){
            var pro = _proData.find(function(p){ return p.id===t.proId; });
            var proAmount = Math.round((t.amount||0)*0.8*100)/100;
            var veloAmount = Math.round((t.amount||0)*0.2*100)/100;
            return '<div style="background:rgba(200,162,0,.07);border:1px solid rgba(200,162,0,.2);border-radius:12px;padding:14px;margin-bottom:8px">'
              +'<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">'
              +'<div style="font-size:22px">'+(pro?pro.av:'🩺')+'</div>'
              +'<div style="flex:1"><div style="font-size:13px;font-weight:700;color:rgba(255,255,255,.82)">'+(pro?pro.name:'Profesional')+'</div>'
              +'<div style="font-size:11px;color:rgba(255,255,255,.4)">Sesión '+new Date(t.ts).toLocaleDateString('es',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})+'</div></div>'
              +'<div style="text-align:right"><div style="font-size:16px;font-weight:800;color:rgba(200,162,0,.9)">$'+t.amount+' '+(t.currency||'USD')+'</div>'
              +'<div style="font-size:10px;color:rgba(255,255,255,.3)">Pro: $'+proAmount+' · Velo: $'+veloAmount+'</div></div>'
              +'</div>'
              +'<button onclick="pApproveTransfer('+i+')" style="width:100%;padding:8px;background:rgba(200,162,0,.2);border:1px solid rgba(200,162,0,.35);color:rgba(200,162,0,.9);border-radius:8px;cursor:pointer;font-family:\'Jost\',sans-serif;font-size:12px;font-weight:700">✅ Aprobar transferencia al profesional</button>'
              +'</div>';
          }).join('')
        : '<p style="font-size:12px;color:rgba(255,255,255,.3);padding:8px 0">Sin transferencias pendientes.</p>');

    var aiModHtml = '<div style="margin-top:20px;font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(180,140,220,.7);margin-bottom:10px">🤖 ASISTENTE IA — MODERACIÓN Y ANÁLISIS</div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">'
      +'<div style="background:rgba(116,198,157,.06);border:1px solid rgba(116,198,157,.15);border-radius:12px;padding:12px">'
      +'<div style="font-size:20px;margin-bottom:4px">🔍</div>'
      +'<div style="font-size:12px;font-weight:700;color:rgba(255,255,255,.7);margin-bottom:4px">Escaneo de contenido</div>'
      +'<div style="font-size:11px;color:rgba(255,255,255,.35);margin-bottom:10px">Analiza círculos, botellas y sala de ayuda.</div>'
      +'<button onclick="pRunAiScan()" style="font-size:11px;padding:5px 10px;background:rgba(116,198,157,.15);border:1px solid rgba(116,198,157,.25);color:rgba(116,198,157,.8);border-radius:8px;cursor:pointer;font-family:\'Jost\',sans-serif;width:100%">Ejecutar escaneo</button>'
      +'</div>'
      +'<div style="background:rgba(200,150,80,.06);border:1px solid rgba(200,150,80,.15);border-radius:12px;padding:12px">'
      +'<div style="font-size:20px;margin-bottom:4px">📊</div>'
      +'<div style="font-size:12px;font-weight:700;color:rgba(255,255,255,.7);margin-bottom:4px">Patrones de uso</div>'
      +'<div style="font-size:11px;color:rgba(255,255,255,.35);margin-bottom:10px">Ciclo saludable. Sin anomalías.</div>'
      +'<button onclick="pViewPatterns()" style="font-size:11px;padding:5px 10px;background:rgba(200,150,80,.12);border:1px solid rgba(200,150,80,.2);color:rgba(200,150,80,.8);border-radius:8px;cursor:pointer;font-family:\'Jost\',sans-serif;width:100%">Ver patrones</button>'
      +'</div>'
      +'</div>'
      // ── Situation analysis card ──
      +'<div style="background:rgba(180,140,220,.07);border:1px solid rgba(180,140,220,.2);border-radius:12px;padding:14px">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">'
      +'<div>'
      +'<div style="font-size:13px;font-weight:700;color:rgba(255,255,255,.75)">🧠 Análisis de situación</div>'
      +'<div style="font-size:11px;color:rgba(255,255,255,.35)">Gemini lee el log y genera un resumen con recomendaciones.</div>'
      +'</div>'
      +'<button id="adminSituationBtn" onclick="pAdminAiSituationAnalysis()" style="flex-shrink:0;padding:7px 13px;background:rgba(180,140,220,.2);border:1px solid rgba(180,140,220,.35);border-radius:9px;color:rgba(180,140,220,.95);font-size:11px;font-weight:700;font-family:\'Jost\',sans-serif;cursor:pointer;white-space:nowrap">Analizar situación</button>'
      +'</div>'
      +'<div id="adminSituationResult"></div>'
      +'</div>';

    // Mass messaging section
    var broadcasts = []; try{ broadcasts = JSON.parse(safeLS('get','velo_broadcasts')||'[]'); }catch(e){}
    var massHtml = '<div style="margin-top:20px;font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(116,198,157,.6);margin-bottom:10px">📢 MENSAJES MASIVOS</div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">'
      +'<button onclick="pAdminMassMessage(\'users\')" style="padding:14px;background:rgba(116,198,157,.1);border:1.5px solid rgba(116,198,157,.25);border-radius:14px;color:rgba(116,198,157,.9);font-family:\'Jost\',sans-serif;font-size:13px;font-weight:700;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px"><span style="font-size:24px">👥</span>Mensaje a usuarios</button>'
      +'<button onclick="pAdminMassMessage(\'pros\')" style="padding:14px;background:rgba(200,162,0,.08);border:1.5px solid rgba(200,162,0,.2);border-radius:14px;color:rgba(200,162,0,.9);font-family:\'Jost\',sans-serif;font-size:13px;font-weight:700;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px"><span style="font-size:24px">🩺</span>Mensaje a profesionales</button>'
      +'</div>'
      +(broadcasts.length
        ? '<div style="font-size:10px;font-weight:700;color:rgba(255,255,255,.3);letter-spacing:1px;margin-bottom:8px">HISTORIAL DE ENVÍOS</div>'
          + broadcasts.slice(0,5).map(function(b){
              var d = new Date(b.ts);
              var ds = d.toLocaleDateString('es',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
              var icon = b.target==='pros'?'🩺':'👥';
              return '<div style="display:flex;align-items:flex-start;gap:8px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05)">'
                +'<span style="font-size:16px;flex-shrink:0">'+icon+'</span>'
                +'<div style="flex:1;min-width:0">'
                +'<div style="font-size:12px;font-weight:600;color:rgba(255,255,255,.75);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+b.subject+'</div>'
                +'<div style="font-size:10px;color:rgba(255,255,255,.3)">'+ds+' · '+(b.target==='pros'?'Profesionales':'Usuarios')+'</div>'
                +'</div>'
                +'</div>';
            }).join('')
        : '');

    // Survey results section
    var surveyHtml = '<div style="margin-top:20px;font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(116,198,157,.6);margin-bottom:10px">📊 ENCUESTAS DE SATISFACCIÓN</div>'
      +'<div style="font-size:11px;color:rgba(255,255,255,.4);margin-bottom:12px;line-height:1.5">Resultados de encuestas trimestrales — escala 0 a 10. Las sugerencias se muestran de forma anónima.</div>'
      + _renderSurveyResults();

    // AI pending tasks section (filled async)
    var tasksHtml = '<div style="margin-bottom:20px;font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(116,198,157,.6);margin-bottom:10px">📋 TAREAS PENDIENTES</div>'
      +'<div id="adminAITasks"><div style="font-size:12px;color:rgba(255,255,255,.3);padding:10px 0">Gemini está revisando las tareas...</div></div>';

    content.innerHTML = tasksHtml + contactsHtml + surveyHtml + massHtml + transferHtml + crisisHtml + auditHtml + aiModHtml;

    // Load contacts async: try Supabase first, fallback to localStorage
    sbLoadContacts().then(function(sbMsgs){
      if(sbMsgs){
        _renderAdminContactsList(sbMsgs);
      } else {
        var local = []; try{ local = JSON.parse(safeLS('get','velo_admin_contacts')||'[]'); }catch(e){}
        _renderAdminContactsList(local);
      }
    });
    // Load crisis events from Supabase async
    _loadAdminCrisisFromSupabase();
    // Generate AI task list async
    _renderAdminAITasks();
  }
}

function pCreateProvisionalPass(){
  var emailEl = document.getElementById('adminProvEmail');
  if(!emailEl || !emailEl.value.trim()){ pToast('⚠️','Ingresá el correo del usuario'); return; }
  var email = emailEl.value.trim().toLowerCase();
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  var pass  = '';
  for(var i = 0; i < 10; i++) pass += chars[Math.floor(Math.random()*chars.length)];
  var expiry = Date.now() + 72*3600*1000;
  var key = 'velo_prov_'+email.replace(/[^a-z0-9]/g,'_');
  try{ localStorage.setItem(key, JSON.stringify({pass:pass, expiry:expiry})); }catch(e){}
  var resEl = document.getElementById('adminProvResult');
  if(resEl) resEl.innerHTML = '✅ Contraseña provisional: <code style="background:rgba(255,255,255,.12);padding:2px 8px;border-radius:4px;font-family:monospace;letter-spacing:1px">'+pass+'</code><br><span style="color:rgba(255,255,255,.4);font-size:10px">Válida 72 horas · Compartila de forma segura con el usuario</span>';
  pToast('🔑','Contraseña provisional creada');
}

function _renderAdminContactsList(msgs){
  var el = document.getElementById('adminContactsList');
  if(!el) return;
  if(!msgs || !msgs.length){
    el.innerHTML = '<p style="font-size:12px;color:rgba(255,255,255,.3);padding:12px 0">Sin mensajes aún.</p>';
    return;
  }
  el.innerHTML = msgs.map(function(m){
    var texto = m.mensaje || m.msg || '';
    var mid   = m.id || '';
    var fecha = m.fecha ? new Date(m.fecha).toLocaleString('es',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '';
    return '<div class="a-row" style="flex-direction:column;align-items:flex-start;gap:6px">'
      +'<div style="display:flex;width:100%;align-items:center;gap:10px">'
      +'<div class="a-row-ic">💌</div>'
      +'<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;color:rgba(255,255,255,.86)">'+_escHtml(m.topic||'Consulta')+'</div>'
      +'<div style="font-size:11px;color:rgba(255,255,255,.38)">'+_escHtml(m.user_email||m.email||'anónimo')+' · '+fecha+'</div></div>'
      +(m.leido?'<span class="a-badge-g">leído</span>':'<span class="a-badge-y">nuevo</span>')
      +'</div>'
      +(texto ? '<div style="font-size:12px;color:rgba(255,255,255,.55);line-height:1.5;padding:8px 10px;background:rgba(255,255,255,.04);border-radius:8px;width:100%;box-sizing:border-box">'+_escHtml(texto)+'</div>' : '')
      +'<div style="display:flex;gap:8px">'
      +(!m.leido ? '<button onclick="pAdminMarkContactRead(\''+mid+'\')" style="font-size:10px;padding:3px 8px;background:rgba(116,198,157,.12);border:1px solid rgba(116,198,157,.25);color:rgba(116,198,157,.7);border-radius:6px;cursor:pointer;font-family:\'Jost\',sans-serif">Marcar leído</button>' : '<span style="font-size:10px;color:rgba(116,198,157,.5)">✓ Leído</span>')
      +((m.user_email||m.email) && (m.user_email||m.email) !== 'anónimo' ? '<a href="mailto:'+_escHtml(m.user_email||m.email)+'?subject=Re: '+_escHtml(m.topic||'Consulta')+'" style="font-size:10px;padding:3px 8px;background:rgba(200,162,0,.1);border:1px solid rgba(200,162,0,.2);color:rgba(200,162,0,.8);border-radius:6px;text-decoration:none;font-family:\'Jost\',sans-serif;font-weight:600">📧 Responder</a>' : '')
      +'</div>'
      +'</div>';
  }).join('');
}

async function pAdminMarkContactRead(id){
  // Try Supabase first
  await sbMarkContactRead(id);
  // Reload contacts
  var sbMsgs = await sbLoadContacts();
  if(sbMsgs){ _renderAdminContactsList(sbMsgs); return; }
  // Fallback: localStorage
  var msgs = []; try{ msgs = JSON.parse(safeLS('get','velo_admin_contacts')||'[]'); }catch(e){}
  var m = msgs.find(function(x){ return x.id === id; });
  if(m) m.leido = true;
  safeLS('set','velo_admin_contacts', JSON.stringify(msgs));
  _renderAdminContactsList(msgs);
}

function pApproveTransfer(idx){
  var all = []; try{ all = JSON.parse(safeLS('get','velo_pending_transfers')||'[]'); }catch(e){}
  var pending = all.filter(function(t){ return t.ended && !t.paid; });
  if(!pending[idx]) return;
  var t = pending[idx];
  t.paid = true; t.paidAt = Date.now();
  var updated = all.map(function(x){ return x.ts===t.ts ? t : x; });
  safeLS('set','velo_pending_transfers', JSON.stringify(updated));
  var pro = _proData.find(function(p){ return p.id===t.proId; });
  var proAmt = Math.round((t.amount||0)*0.8*100)/100;
  pToast('💸','Transferencia $'+proAmt+' aprobada para '+(pro?pro.name:'el profesional')+' ✅');
  var inbox = []; try{ inbox = JSON.parse(safeLS('get','velo_inbox')||'[]'); }catch(e){}
  inbox.unshift({ id:'tr-'+Date.now(), tipo:'pago', icon:'💸', remitente:'Velo Admin', asunto:'Transferencia aprobada — $'+proAmt, extracto:'Tu pago de $'+proAmt+' fue aprobado.', cuerpo:'El pago por tu sesión del '+new Date(t.ts).toLocaleDateString('es')+' fue aprobado. Recibirás $'+proAmt+' '+(t.currency||'USD')+' en tu cuenta registrada.', leido:false, fecha:new Date().toLocaleDateString('es',{day:'2-digit',month:'short'}) });
  safeLS('set','velo_inbox', JSON.stringify(inbox.slice(0,100)));
  _updateInboxDot();
  _renderAdmin();
}

function pResolveAudit(idx){
  var audit = []; try{ audit = JSON.parse(safeLS('get','velo_audit_log')||'[]'); }catch(e){}
  if(audit[idx]){ audit[idx].resolved = true; audit[idx].resolvedAt = Date.now(); }
  safeLS('set','velo_audit_log', JSON.stringify(audit));
  pToast('✅','Evento resuelto');
  _renderAdmin();
}

function pResolveCrisis(localIdx){
  var audit = []; try{ audit = JSON.parse(safeLS('get','velo_audit_log')||'[]'); }catch(e){}
  var crisisEvents = audit.filter(function(a){ return a.tipo === 'crisis_detect'; });
  var target = crisisEvents[localIdx];
  if(target){
    var globalIdx = audit.indexOf(target);
    if(globalIdx >= 0){ audit[globalIdx].resolved = true; audit[globalIdx].resolvedAt = Date.now(); }
    safeLS('set','velo_audit_log', JSON.stringify(audit));
  }
  // Also try to update in Supabase
  if(sbClient && target){
    sbClient.from('reportes').update({estado:'resuelto'})
      .like('categoria','crisis%')
      .eq('created_at', new Date(target.ts).toISOString())
      .then(function(){}).catch(function(){});
  }
  pToast('✅','Crisis marcada como atendida');
  _renderAdmin();
}

async function _loadAdminCrisisFromSupabase(){
  var el = document.getElementById('adminCrisisSupabase');
  if(!el) return;
  var events = await sbLoadCrisisEvents();
  if(!events || !events.length){
    el.innerHTML = '';
    return;
  }
  el.innerHTML = '<div style="font-size:10px;color:rgba(255,180,80,.7);margin-bottom:8px;font-weight:600">📡 Desde servidor (todas las sesiones):</div>'
    + events.map(function(e){
        var date = new Date(e.created_at);
        var dateStr = date.toLocaleDateString('es',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
        var isOpen = e.estado === 'abierto';
        return '<div style="background:rgba(220,50,50,.06);border:1px solid rgba(220,50,50,.2);border-radius:8px;padding:10px;margin-bottom:6px">'
          +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">'
          +'<span style="font-size:10px;font-weight:700;color:'+(e.categoria==='crisis_alto'?'#ff4444':'#ffbb33')+'">'+e.categoria.replace('_',' ').toUpperCase()+'</span>'
          +'<span style="font-size:10px;color:rgba(255,255,255,.3)">'+dateStr+'</span>'
          +'</div>'
          +'<div style="font-size:11px;color:rgba(255,255,255,.5);line-height:1.45">'+_escHtml((e.mensaje||'').slice(0,150))+'</div>'
          +(isOpen ? '<button onclick="pSbResolveCrisis(\''+e.id+'\')" style="margin-top:8px;font-size:10px;padding:3px 10px;background:rgba(116,198,157,.15);border:1px solid rgba(116,198,157,.3);color:rgba(116,198,157,.85);border-radius:6px;cursor:pointer;font-family:\'Jost\',sans-serif">Marcar atendida</button>'
            : '<span style="font-size:10px;color:rgba(116,198,157,.7);font-weight:700;display:block;margin-top:6px">✓ Atendida</span>')
          +'</div>';
      }).join('');
}

async function pSbResolveCrisis(id){
  if(!sbClient) return;
  try{
    await sbClient.from('reportes').update({estado:'resuelto'}).eq('id', id);
    pToast('✅','Crisis atendida y registrada');
    _loadAdminCrisisFromSupabase();
  }catch(e){ pToast('⚠️','Error al actualizar'); }
}

async function pRunAiScan(){
  pToast('🤖','Gemini analizando contenido...');
  var allCircleIds = ['c1','c2','c3','c4','c5'];
  var userCircles = []; try{ userCircles = JSON.parse(safeLS('get','velo_circles')||'[]'); }catch(e){}
  var allIds = allCircleIds.concat(userCircles.map(function(c){ return c.id; }));

  // Collect recent messages
  var samples = [];
  allIds.forEach(function(cid){
    var msgs = []; try{ msgs = JSON.parse(safeLS('get','velo_circle_'+cid)||'[]'); }catch(e){}
    msgs.slice(0,20).forEach(function(m){
      if(m.text && m.text.trim()) samples.push({ cid:cid, text:m.text.slice(0,200) });
    });
  });
  // Also scan help chat messages
  var helpMsgs = []; try{ helpMsgs = JSON.parse(safeLS('get','velo_help_msgs')||'[]'); }catch(e){}
  helpMsgs.slice(0,20).forEach(function(m){
    if(m.text) samples.push({ cid:'sala-ayuda', text:m.text.slice(0,200) });
  });
  // Also scan bottle messages (Mensajes al Mar)
  var bottles = []; try{ bottles = JSON.parse(safeLS('get','velo_my_bottles')||'[]'); }catch(e){}
  bottles.slice(0,20).forEach(function(b){
    if(b.text) samples.push({ cid:'mensajes-al-mar', text:b.text.slice(0,200) });
  });
  // Also scan help posts
  var helpPosts = []; try{ helpPosts = JSON.parse(safeLS('get','velo_help_posts')||'[]'); }catch(e){}
  helpPosts.slice(0,20).forEach(function(p){
    if(p.preview) samples.push({ cid:'sala-ayuda-posts', text:p.preview.slice(0,200) });
  });

  if(!samples.length){ pToast('✅','Sin mensajes para analizar.'); _renderAdmin(); return; }

  var prompt = 'Sos el sistema de moderación de Velo, una app de salud mental peer-to-peer.\n'
    +'Analizá estos mensajes de usuarios y detectá: (1) crisis suicidas o autolesiones, (2) acoso o agresión, (3) contenido inapropiado.\n'
    +'Para cada mensaje problemático respondé en formato JSON array:\n'
    +'[{"idx": N, "tipo": "crisis|acoso|inapropiado", "gravedad": "alta|media|baja", "razon": "...breve..."}]\n'
    +'Si no hay problemas respondé: []\n\n'
    +'Mensajes (índice | sala | texto):\n'
    + samples.map(function(s,i){ return i+'|'+s.cid+'|'+s.text; }).join('\n');

  var aiResult = await _geminiCall(prompt);
  var flagged = [];
  if(aiResult){
    try{
      var match = aiResult.match(/\[[\s\S]*\]/);
      if(match){ flagged = JSON.parse(match[0]); }
    }catch(e){}
  }

  if(flagged.length){
    var audit = []; try{ audit = JSON.parse(safeLS('get','velo_audit_log')||'[]'); }catch(e){}
    flagged.forEach(function(f){
      var sample = samples[f.idx] || {};
      audit.unshift({ ts:Date.now(), tipo:'abuse_detect', circle:sample.cid||'?',
        motivo:'Gemini IA — '+f.tipo+' (gravedad: '+f.gravedad+'): '+f.razon,
        detail:(sample.text||'').slice(0,80) });
    });
    safeLS('set','velo_audit_log', JSON.stringify(audit.slice(0,500)));
    pToast('⚠️','Gemini detectó '+flagged.length+' evento(s). Ver auditoría.');
  } else {
    pToast('✅','Gemini: contenido limpio. Sin alertas.');
  }
  _renderAdmin();
}

function pViewPatterns(){
  var audit = []; try{ audit = JSON.parse(safeLS('get','velo_audit_log')||'[]'); }catch(e){}
  var circles = 0;
  ['c1','c2','c3','c4','c5'].forEach(function(cid){
    var msgs = []; try{ msgs = JSON.parse(safeLS('get','velo_circle_'+cid)||'[]'); }catch(e){}
    circles += msgs.length;
  });
  pToast('📊','Círculos: '+circles+' mensajes · Reportes: '+audit.length+'. Patrón saludable. 🌿');
}

// ── ADMIN MASS MESSAGING ───────────────────────────────────────
function pAdminMassMessage(target){
  var label = target === 'pros' ? 'profesionales' : 'usuarios';
  var icon  = target === 'pros' ? '🩺' : '👥';
  var ov = document.createElement('div');
  ov.className = 'p-modal-ov show';
  ov.id = 'massMessageOv';
  ov.style.zIndex = '9999';
  ov.innerHTML = '<div class="p-sheet" style="background:#0F2016;border:1px solid rgba(116,198,157,.2);overflow-y:auto;max-height:90vh">'
    +'<div class="p-sheet-handle" style="background:rgba(116,198,157,.3)"></div>'
    +'<div style="font-size:28px;margin-bottom:8px">'+icon+'</div>'
    +'<div style="font-family:\'Cormorant Garamond\',serif;font-size:20px;color:#fff;margin-bottom:6px">Mensaje masivo — '+label+'</div>'
    +'<p style="font-size:12px;color:rgba(255,255,255,.45);margin-bottom:16px;line-height:1.5">Este mensaje llegará al buzón interno de todos los '+label+' registrados.</p>'
    // ── AI generator block ──
    +'<div style="background:rgba(180,140,220,.07);border:1px solid rgba(180,140,220,.2);border-radius:14px;padding:14px;margin-bottom:16px">'
    +'<div style="font-size:11px;font-weight:700;color:rgba(180,140,220,.85);letter-spacing:.5px;margin-bottom:8px">✨ GENERAR CON GEMINI IA</div>'
    +'<input type="text" id="massAiDesc" placeholder="Describí en una línea lo que querés comunicar…" maxlength="200" style="width:100%;padding:9px 12px;background:rgba(255,255,255,.07);border:1px solid rgba(180,140,220,.25);border-radius:10px;color:#fff;font-size:12px;font-family:\'Jost\',sans-serif;box-sizing:border-box;margin-bottom:8px">'
    +'<button id="massAiBtn" onclick="pAdminGenerateMassMessage(\''+target+'\')" style="width:100%;padding:9px;background:rgba(180,140,220,.18);border:1px solid rgba(180,140,220,.3);border-radius:10px;color:rgba(180,140,220,.95);font-size:12px;font-weight:700;font-family:\'Jost\',sans-serif;cursor:pointer">✨ Generar asunto + mensaje con IA</button>'
    +'</div>'
    // ── Manual fields ──
    +'<div style="margin-bottom:10px">'
    +'<label style="font-size:11px;font-weight:700;color:rgba(255,255,255,.5);letter-spacing:.5px;display:block;margin-bottom:6px">ASUNTO</label>'
    +'<input type="text" id="massSubject" placeholder="Asunto del mensaje…" maxlength="80" style="width:100%;padding:10px 14px;background:rgba(255,255,255,.07);border:1.5px solid rgba(255,255,255,.12);border-radius:12px;color:#fff;font-size:13px;font-family:\'Jost\',sans-serif;box-sizing:border-box">'
    +'</div>'
    +'<div style="margin-bottom:14px">'
    +'<label style="font-size:11px;font-weight:700;color:rgba(255,255,255,.5);letter-spacing:.5px;display:block;margin-bottom:6px">MENSAJE</label>'
    +'<textarea id="massBody" rows="5" placeholder="Escribí tu mensaje aquí…" maxlength="2000" style="width:100%;padding:10px 14px;background:rgba(255,255,255,.07);border:1.5px solid rgba(255,255,255,.12);border-radius:12px;color:#fff;font-size:13px;font-family:\'Jost\',sans-serif;resize:vertical;box-sizing:border-box"></textarea>'
    +'</div>'
    +'<div style="display:flex;gap:8px">'
    +'<button onclick="pSendMassMessage(\''+target+'\')" style="flex:1;padding:11px;background:var(--sage2);border:none;border-radius:14px;color:#fff;font-size:13px;font-weight:700;font-family:\'Jost\',sans-serif;cursor:pointer">📤 Enviar a todos los '+label+'</button>'
    +'<button onclick="document.getElementById(\'massMessageOv\').remove()" style="padding:11px 16px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);border-radius:14px;color:rgba(255,255,255,.6);font-size:13px;font-family:\'Jost\',sans-serif;cursor:pointer">Cancelar</button>'
    +'</div>'
    +'</div>';
  document.body.appendChild(ov);
  setTimeout(function(){ var el=document.getElementById('massAiDesc'); if(el) el.focus(); }, 100);
}

async function pAdminAiSituationAnalysis(){
  var btn = document.getElementById('adminSituationBtn');
  var resultEl = document.getElementById('adminSituationResult');
  if(btn){ btn.disabled = true; btn.textContent = '🧠 Analizando…'; }
  if(resultEl) resultEl.innerHTML = '<p style="font-size:11px;color:rgba(255,255,255,.4);padding:6px 0;font-style:italic">Gemini está revisando la situación de la plataforma…</p>';

  var audit = []; try{ audit = JSON.parse(safeLS('get','velo_audit_log')||'[]'); }catch(e){}
  var contacts = []; try{ contacts = JSON.parse(safeLS('get','velo_admin_contacts')||'[]'); }catch(e){}

  var openCrisis  = audit.filter(function(a){ return a.tipo === 'crisis_detect' && !a.resolved; });
  var openAbuse   = audit.filter(function(a){ return a.tipo === 'abuse_detect'  && !a.resolved; });
  var unread      = contacts.filter(function(c){ return !c.leido; });

  var context = 'Resumen del estado de la plataforma Velo:\n'
    +'- Alertas de crisis sin atender: '+openCrisis.length+'\n'
    +'- Reportes de abuso/acoso sin resolver: '+openAbuse.length+'\n'
    +'- Mensajes de contacto sin leer: '+unread.length+'\n'
    +'- Total de eventos en auditoría: '+audit.length+'\n\n';

  if(audit.length){
    context += 'Últimos 6 eventos:\n';
    audit.slice(0,6).forEach(function(a,i){
      var d = new Date(a.ts).toLocaleDateString('es',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
      context += (i+1)+'. ['+a.tipo+(a.nivel?' nivel '+a.nivel:'')+'] '+(a.motivo||'')+' — '+d+(a.resolved?' (resuelto)':' (PENDIENTE)')+'\n';
    });
  }

  var prompt = 'Sos el asistente de moderación de Velo, una app de salud mental peer-to-peer.\n'
    +'Analizá el estado de la plataforma y generá:\n'
    +'1. Un resumen ejecutivo en 2-3 oraciones.\n'
    +'2. Las 3 situaciones más urgentes, con prioridad (🔴 urgente, 🟡 atención, 🟢 ok).\n'
    +'3. Una recomendación concreta para cada situación.\n'
    +'Español rioplatense, directo y conciso. Sin títulos ni encabezados.\n\n'
    +context;

  var result = await _geminiCall(prompt);
  if(btn){ btn.disabled = false; btn.textContent = 'Analizar situación'; }

  if(resultEl){
    resultEl.innerHTML = result
      ? '<div style="font-size:12px;color:rgba(255,255,255,.75);line-height:1.7;padding:12px;background:rgba(180,140,220,.06);border:1px solid rgba(180,140,220,.18);border-radius:10px;margin-top:8px;white-space:pre-line">'+_escHtml(result)+'</div>'
      : '<p style="font-size:11px;color:rgba(255,100,100,.6);padding:6px 0">No se pudo conectar con Gemini. Revisá tu conexión.</p>';
  }
}

async function _renderAdminAITasks(){
  var el = document.getElementById('adminAITasks');
  if(!el) return;

  var audit      = []; try{ audit      = JSON.parse(safeLS('get','velo_audit_log')||'[]');   }catch(e){}
  var contacts   = []; try{ contacts   = JSON.parse(safeLS('get','velo_admin_contacts')||'[]'); }catch(e){}
  var broadcasts = []; try{ broadcasts = JSON.parse(safeLS('get','velo_broadcasts')||'[]');  }catch(e){}
  var happy      = []; try{ happy      = JSON.parse(safeLS('get','velo_happy_queue')||'[]'); }catch(e){}

  var openCrisis  = audit.filter(function(a){ return a.tipo === 'crisis_detect' && !a.resolved; });
  var openAbuse   = audit.filter(function(a){ return a.tipo === 'abuse_detect'  && !a.resolved; });
  var unread      = contacts.filter(function(c){ return !c.leido; });
  var pendingPost = happy.filter(function(p){ return !p.approved; });
  var recentBcast = broadcasts.filter(function(b){ return Date.now()-b.ts < 30*24*3600000; });

  // Oldest unread contact
  var oldestHours = 0;
  unread.forEach(function(c){
    var h = Math.floor((Date.now()-new Date(c.fecha))/3600000);
    if(h > oldestHours) oldestHours = h;
  });

  var context = 'Estado actual de la plataforma Velo:\n'
    +'- Alertas de crisis sin atender: '+openCrisis.length+'\n'
    +'- Reportes de abuso sin resolver: '+openAbuse.length+'\n'
    +'- Contactos sin responder: '+unread.length+(oldestHours>24?' (el más antiguo tiene '+Math.floor(oldestHours/24)+'d '+Math.floor(oldestHours%24)+'h sin respuesta)':'')+'\n'
    +'- Posts de Muro Feliz por aprobar: '+pendingPost.length+'\n'
    +'- Mensajes masivos enviados este mes: '+recentBcast.length+'\n';

  var prompt = 'Sos el asistente de administración de Velo, una app de salud mental.\n'
    +'Generá una lista de tareas pendientes priorizadas para el admin. Máximo 6 ítems.\n'
    +'Usá: 🔴 urgente (requiere acción inmediata), 🟡 atención (esta semana), 🟢 ok (sin acción necesaria).\n'
    +'Una sola línea por ítem, español rioplatense, muy directo.\n'
    +'Respondé SOLO con la lista de ítems, sin texto adicional, sin encabezados.\n\n'
    +context;

  var result = await _geminiCall(prompt);

  if(!result){
    var fallback = [];
    if(openCrisis.length)  fallback.push('🔴 '+openCrisis.length+' alerta'+(openCrisis.length>1?'s':'')+' de crisis sin atender');
    if(openAbuse.length)   fallback.push('🔴 '+openAbuse.length+' reporte'+(openAbuse.length>1?'s':'')+' de abuso sin resolver');
    if(unread.length)      fallback.push((oldestHours>48?'🔴':'🟡')+' '+unread.length+' mensaje'+(unread.length>1?'s':'')+' de contacto sin responder'+(oldestHours>48?' (+'+Math.floor(oldestHours/24)+'d de espera)':''));
    if(pendingPost.length) fallback.push('🟡 '+pendingPost.length+' post'+(pendingPost.length>1?'s':'')+' del Muro Feliz esperando aprobación');
    if(!fallback.length)   fallback.push('🟢 Todo al día. Sin tareas urgentes. ✅');
    result = fallback.join('\n');
  }

  var lines = result.split('\n').filter(function(l){ return l.trim(); });
  el.innerHTML = lines.map(function(line){
    var bg     = line.startsWith('🔴') ? 'rgba(220,50,50,.12)'     : line.startsWith('🟡') ? 'rgba(230,160,20,.1)'   : 'rgba(116,198,157,.08)';
    var border = line.startsWith('🔴') ? 'rgba(220,50,50,.3)'      : line.startsWith('🟡') ? 'rgba(230,160,20,.22)'  : 'rgba(116,198,157,.18)';
    return '<div style="background:'+bg+';border:1px solid '+border+';border-radius:9px;padding:10px 13px;margin-bottom:7px;font-size:13px;color:rgba(255,255,255,.85);line-height:1.45">'+_escHtml(line)+'</div>';
  }).join('');
}

async function pAdminGenerateMassMessage(target){
  var descEl = document.getElementById('massAiDesc');
  if(!descEl || !descEl.value.trim()){ pToast('✍️','Describí qué querés comunicar antes de generar'); return; }
  var desc = descEl.value.trim();
  var audience = target === 'pros' ? 'profesionales de salud mental que acompañan usuarios en la app' : 'usuarios de una app de salud mental peer-to-peer';
  var btn = document.getElementById('massAiBtn');
  if(btn){ btn.disabled = true; btn.textContent = '✨ Generando…'; }

  var prompt = 'Sos el sistema de comunicación de Velo, una app de salud mental peer-to-peer.\n'
    +'Redactá un mensaje institucional para enviar a '+audience+'.\n'
    +'El admin quiere comunicar: "'+desc.replace(/"/g,"'")+'".\n'
    +'El tono debe ser empático, cálido y profesional, en español rioplatense.\n'
    +'El mensaje debe tener 2-4 párrafos cortos. Sin saludos genéricos tipo "Estimados".\n'
    +'Respondé SOLO con JSON: {"asunto": "una línea", "cuerpo": "texto completo"}\n'
    +'Sin texto adicional fuera del JSON.';

  var result = await _geminiCall(prompt);
  if(btn){ btn.disabled = false; btn.textContent = '✨ Generar asunto + mensaje con IA'; }

  if(!result){ pToast('⚠️','No pude conectarme a Gemini. Escribí el mensaje manualmente.'); return; }
  try{
    var match = result.match(/\{[\s\S]*\}/);
    if(!match){ pToast('⚠️','Respuesta inesperada de Gemini. Intentá de nuevo.'); return; }
    var data = JSON.parse(match[0]);
    var subj = document.getElementById('massSubject');
    var body = document.getElementById('massBody');
    if(subj && data.asunto){
      subj.value = data.asunto;
      subj.style.transition = 'border-color .4s,background .4s';
      subj.style.borderColor = 'rgba(180,140,220,.7)';
      subj.style.background  = 'rgba(180,140,220,.1)';
      setTimeout(function(){ subj.style.borderColor=''; subj.style.background=''; }, 1800);
    }
    if(body && data.cuerpo){
      body.value = data.cuerpo;
      body.style.transition = 'border-color .4s,background .4s';
      body.style.borderColor = 'rgba(180,140,220,.7)';
      body.style.background  = 'rgba(180,140,220,.1)';
      setTimeout(function(){ body.style.borderColor=''; body.style.background=''; }, 1800);
      body.style.height = 'auto';
      body.style.height = Math.min(body.scrollHeight, 280)+'px';
    }
    if(subj) subj.scrollIntoView({ behavior:'smooth', block:'center' });
    pToast('✨','¡Listo! Revisá el texto antes de enviar.');
  }catch(e){ pToast('⚠️','Error al procesar la respuesta. Intentá de nuevo.'); }
}

async function pSendMassMessage(target){
  var subj = document.getElementById('massSubject');
  var body = document.getElementById('massBody');
  if(!subj || !subj.value.trim()){ pToast('⚠️','Ingresá un asunto'); return; }
  if(!body || !body.value.trim()){ pToast('⚠️','Escribí el mensaje'); return; }
  var subject = subj.value.trim();
  var message = body.value.trim();
  var icon    = target === 'pros' ? '🩺' : '📢';
  var sender  = 'Velo — Comunicado '+(target === 'pros' ? 'Profesionales' : 'Comunidad');

  // Save to Supabase so ALL users receive it in their inbox
  var saved = await sbSaveBroadcast(target, subject, message, icon, sender);

  // Fallback: also save to localStorage broadcast history
  var broadcasts = []; try{ broadcasts = JSON.parse(safeLS('get','velo_broadcasts')||'[]'); }catch(e){}
  broadcasts.unshift({ id:'mass-'+Date.now(), ts:Date.now(), target:target, subject:subject, body:message, icon:icon, sender:sender, sentBy:_ADMIN_EMAIL });
  safeLS('set','velo_broadcasts', JSON.stringify(broadcasts.slice(0,200)));

  var ov = document.getElementById('massMessageOv');
  if(ov) ov.remove();
  var recipientLabel = target === 'pros' ? 'profesionales' : 'usuarios';
  pToast('📤', saved ? 'Mensaje enviado a todos los '+recipientLabel+' ✅' : 'Enviado localmente (sin conexión a Supabase)');
  _renderAdmin();
}

async function sbSaveBroadcast(target, subject, body, icon, sender){
  if(!sbClient) return false;
  try{
    var {error} = await sbClient.from('broadcasts').insert({ target:target, subject:subject, body:body, icon:icon||'📢', sender:sender||'Velo', sent_at:new Date().toISOString() });
    return !error;
  }catch(e){ return false; }
}

async function sbLoadBroadcasts(userType){
  if(!sbClient) return null;
  try{
    // Load broadcasts for this user type (target = their type or 'all'), last 90 days
    var since = new Date(Date.now() - 90*24*3600*1000).toISOString();
    var {data,error} = await sbClient.from('broadcasts')
      .select('*')
      .in('target', [userType, 'all'])
      .gte('sent_at', since)
      .order('sent_at',{ascending:false})
      .limit(50);
    return error ? null : (data||[]);
  }catch(e){ return null; }
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

async function _sbSaveCrisisEvent(nivel, razon, detalle, ts){
  if(!sbClient) return;
  try{
    var user = await sbClient.auth.getUser();
    var uid = user && user.data && user.data.user ? user.data.user.id : null;
    await sbClient.from('reportes').insert({
      user_id: uid,
      mensaje: '[CRISIS '+nivel.toUpperCase()+'] '+razon+'\n\nMensaje: '+detalle,
      categoria: 'crisis_'+nivel,
      estado: 'abierto',
      created_at: new Date(ts).toISOString()
    });
  }catch(e){}
}

async function sbLoadCrisisEvents(){
  if(!sbClient) return [];
  try{
    var {data, error} = await sbClient.from('reportes')
      .select('*')
      .like('categoria','crisis%')
      .order('created_at',{ascending:false})
      .limit(50);
    return error ? [] : (data||[]);
  }catch(e){ return []; }
}

async function sbSaveContact(topic, mensaje, email){
  if(!sbClient) return false;
  try{
    var {error} = await sbClient.from('contacts').insert({ topic:topic||'General', mensaje:mensaje, user_email:email||'anónimo', leido:false, fecha:new Date().toISOString() });
    return !error;
  }catch(e){ return false; }
}

async function sbLoadContacts(){
  if(!sbClient) return null;
  try{
    var {data,error} = await sbClient.from('contacts').select('*').order('fecha',{ascending:false}).limit(100);
    return error ? null : (data||[]);
  }catch(e){ return null; }
}

async function sbMarkContactRead(id){
  if(!sbClient) return;
  try{ await sbClient.from('contacts').update({leido:true}).eq('id',id); }catch(e){}
}

// ── JITSI MEET — VIDEO CALL ────────────────────────────────────
function _jitsiRoomName(proId){
  // Deterministic room per booking: velo + proId + date (YYYYMMDD) → same room all day
  var d = new Date();
  var dateStr = d.getFullYear()+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0');
  return 'velo-'+proId+'-'+dateStr;
}

function pStartJitsiCall(){
  var pending = null; try{ pending = JSON.parse(safeLS('get','velo_current_session')||'null'); }catch(e){}
  var proId = pending ? pending.proId : 'sesion';
  var room = _jitsiRoomName(proId);
  var url = 'https://meet.jit.si/'+room;
  pToast('📹','Abriendo videollamada…');
  window.open(url, '_blank', 'noopener');
  // Mark session as started for admin audit
  var sessions = []; try{ sessions = JSON.parse(safeLS('get','velo_sessions')||'[]'); }catch(e){}
  if(pending && !pending.callStarted){
    pending.callStarted = true;
    pending.callStartedAt = Date.now();
    pending.room = room;
    safeLS('set','velo_current_session', JSON.stringify(pending));
    sessions.unshift(pending);
    safeLS('set','velo_sessions', JSON.stringify(sessions.slice(0,200)));
  }
}

function pInitSessionRoom(){
  var pending = null; try{ pending = JSON.parse(safeLS('get','velo_current_session')||'null'); }catch(e){}
  var pro = null;
  if(pending && pending.proId){
    pro = _proData.find(function(p){ return p.id === pending.proId; });
  }
  // Header
  _setEl('srProName',   pro ? pro.name : 'Tu profesional');
  _setEl('srProSpec',   pro ? pro.spec : '');
  _setEl('srProAv',     pro ? pro.av   : '🩺');
  _setEl('srProRating', pro ? '⭐ '+pro.rating : '');

  // Room link preview
  var room = pending ? _jitsiRoomName(pending.proId) : _jitsiRoomName('sesion');
  var linkEl = document.getElementById('srRoomLink');
  if(linkEl) linkEl.textContent = 'meet.jit.si/'+room;

  // Tips
  _setEl('srTips',
    '<ul style="font-size:13px;color:var(--ink4);line-height:2;padding-left:18px">'
    +'<li>Usá <strong>auriculares</strong> para mejor audio</li>'
    +'<li>Buscá un espacio <strong>tranquilo y privado</strong></li>'
    +'<li>La sala es <strong>privada</strong> — solo vos y tu profesional</li>'
    +'<li>No se graba la sesión</li>'
    +'</ul>'
  );
}

function pEndSession(){
  pToast('✅','¡Gracias! Ahora podés dejar tu reseña 🌿');
  // Enable admin transfer approval for this session
  var pending = null; try{ pending = JSON.parse(safeLS('get','velo_current_session')||'null'); }catch(e){}
  if(pending){
    pending.ended = true;
    pending.endedAt = Date.now();
    safeLS('set','velo_current_session', JSON.stringify(pending));
    // Add to admin pending transfers
    var transfers = []; try{ transfers = JSON.parse(safeLS('get','velo_pending_transfers')||'[]'); }catch(e){}
    transfers.unshift(pending);
    safeLS('set','velo_pending_transfers', JSON.stringify(transfers.slice(0,100)));
  }
  setTimeout(function(){ pGoTo('post-chat'); }, 800);
}

// ── STRIPE RETURN CHECK ───────────────────────────────────────
function _checkStripeReturn(){
  var params = new URLSearchParams(window.location.search);
  var stripeStatus = params.get('stripe');
  var session = params.get('session_id') || params.get('stripe_session');
  if(stripeStatus === 'cancel'){
    pToast('ℹ️','Pago cancelado. Podés intentarlo de nuevo cuando quieras.');
    window.history.replaceState({}, '', window.location.pathname);
    return;
  }
  if(stripeStatus === 'ok' || session){
    var pending = null; try{ pending = JSON.parse(safeLS('get','velo_stripe_pending')||'null'); }catch(e){}
    if(pending){
      pToast('✅','¡Pago confirmado! Tu sesión ha sido reservada 💚');
      safeLS('set','velo_current_session', JSON.stringify(pending));
      safeLS('del','velo_stripe_pending');
      window.history.replaceState({}, '', window.location.pathname);
      setTimeout(function(){ pGoTo('session-room'); }, 1000);
    }
  }
}

function _checkPayPalReturn(){
  var params = new URLSearchParams(window.location.search);
  var ppTok = params.get('token') || params.get('paymentId') || params.get('subscription_id') || params.get('pp');
  if(!ppTok) return;
  var pending = null; try{ pending = JSON.parse(safeLS('get','velo_pp_pending')||'null'); }catch(e){}
  var ppParam = params.get('pp');
  var effectiveType = (pending && pending.type) || ppParam || 'donation';
  if(effectiveType === 'plus'){
    // Activate Plus locally
    safeLS('set','velo_plan','plus');
    var subs = []; try{ subs = JSON.parse(safeLS('get','velo_subscribers')||'[]'); }catch(e){}
    var email = safeLS('get','velo_user_email');
    if(email && !subs.find(function(s){ return s.email===email; })){
      subs.push({ email:email, status:'active', ts:Date.now() });
      safeLS('set','velo_subscribers', JSON.stringify(subs));
    }
    // Update Supabase profile role to 'plus'
    _initSupabase();
    if(sbClient){
      var uid = safeLS('get','velo_user_id');
      if(uid) sbClient.from('profiles').update({ role:'plus' }).eq('id', uid).then(function(){});
    }
    safeLS('del','velo_pp_pending');
    pToast('⭐','¡Velo Plus activado! Bienvenido/a 🌿');
    // Send Plus welcome email (fire-and-forget)
    var _ppEmail = safeLS('get','velo_user_email');
    var _ppName  = safeLS('get','velo_user_name') || '';
    if(_ppEmail){
      fetch(SEND_EMAIL_PROXY, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ email:_ppEmail, name:_ppName, type:'plus' })
      }).catch(function(){});
    }
    window.history.replaceState({}, '', window.location.pathname);
  } else if(effectiveType === 'pro'){
    safeLS('set','velo_pro_approved','true');
    safeLS('del','velo_pp_pending');
    pToast('🩺','¡Registro profesional completado! 💚');
    window.history.replaceState({}, '', window.location.pathname);
    pGoTo('pro-panel');
  } else if(ppParam === 'cancel'){
    safeLS('del','velo_pp_pending');
    window.history.replaceState({}, '', window.location.pathname);
  } else {
    // donation
    pToast('💚','¡Donación recibida! Gracias por apoyar Velo 🌿');
    // Send donation thank-you email (fire-and-forget)
    var _ppEmail = safeLS('get','velo_user_email');
    var _ppName  = safeLS('get','velo_user_name') || '';
    var _ppAmt   = pending && pending.amount ? pending.amount : '';
    if(_ppEmail){
      fetch(SEND_EMAIL_PROXY, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ email:_ppEmail, name:_ppName, type:'donation', amount:_ppAmt })
      }).catch(function(){});
    }
    safeLS('del','velo_pp_pending');
    window.history.replaceState({}, '', window.location.pathname);
  }
}

// ── ANON NICKNAME ─────────────────────────────────────────────
var _anonNicknames = [
  'Colibrí Sereno','Brisa del Valle','Luz de Luna','Piedra Tranquila','Viento del Sur',
  'Nube Viajera','Mar Profundo','Bosque Quieto','Alba Dorada','Río Cristal',
  'Estrella Errante','Tierra Firme','Pájaro Libre','Sombra Suave','Flor Silvestre'
];

function pToggleAnonReg(checkbox){
  var nameInput = document.getElementById('regName');
  if(!nameInput) return;
  if(checkbox.checked){
    var nick = _anonNicknames[Math.floor(Math.random()*_anonNicknames.length)];
    nameInput.value = nick;
    nameInput.readOnly = true;
    nameInput.style.opacity = '.6';
  } else {
    nameInput.value = '';
    nameInput.readOnly = false;
    nameInput.style.opacity = '1';
    nameInput.focus();
  }
}

// Anti-contact-sharing detection in chat messages
var _contactPatterns = [
  /\b\d{8,15}\b/,                    // phone numbers
  /whatsapp/i, /telegram/i, /signal/i,
  /@gmail\.com|@hotmail|@yahoo/i,
  /instagram\.com|ig:\s*@/i,
  /facebook\.com|fb\.com/i,
  /mi.n[uú]mero|mi.tel[eé]fono|mi.celular|mi.correo.personal/i
];

function _hasContactInfo(text){
  return _contactPatterns.some(function(p){ return p.test(text); });
}

function _filterContactInfo(text, context){
  if(!_hasContactInfo(text)) return null;
  // Log to audit
  var audit = []; try{ audit = JSON.parse(safeLS('get','velo_audit_log')||'[]'); }catch(e){}
  audit.unshift({ ts:Date.now(), tipo:'contact_share_attempt', context:context, detail:text.slice(0,80) });
  safeLS('set','velo_audit_log', JSON.stringify(audit.slice(0,500)));
  return '⚠️ Mensaje bloqueado: Velo no permite el intercambio de datos de contacto externos. Todas las sesiones deben realizarse dentro de la plataforma.';
}

// ── LOGO ADMIN EASTER EGG ─────────────────────────────────────
var _logoClickCount = 0;
var _logoClickTimer = null;
function pLogoClick(){
  _logoClickCount++;
  console.log('Clic en el logo: ' + _logoClickCount);
  if(_logoClickTimer) clearTimeout(_logoClickTimer);
  _logoClickTimer = setTimeout(function(){ _logoClickCount = 0; }, 2500);
  if(_logoClickCount >= 4){
    _logoClickCount = 0;
    clearTimeout(_logoClickTimer);
    pGoTo('admin-login');
  }
}

// ── DAILY STATUS ──────────────────────────────────────────────
function _todayStatusKey(){
  var d = new Date();
  return 'velo_daily_status_'+d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}

function pInitDailyStatus(){
  var key = _todayStatusKey();
  var saved = {}; try{ saved = JSON.parse(safeLS('get', key)||'{}'); }catch(e){}
  var fields = ['statusMovie','statusMusic','statusBook','statusPhrase'];
  fields.forEach(function(f){ var el = document.getElementById(f); if(el) el.value = saved[f]||''; });
}

function pSaveDailyStatus(){
  var key = _todayStatusKey();
  var data = {
    movie:  (document.getElementById('statusMovie')  ? document.getElementById('statusMovie').value.trim()  : ''),
    music:  (document.getElementById('statusMusic')  ? document.getElementById('statusMusic').value.trim()  : ''),
    book:   (document.getElementById('statusBook')   ? document.getElementById('statusBook').value.trim()   : ''),
    phrase: (document.getElementById('statusPhrase') ? document.getElementById('statusPhrase').value.trim() : ''),
    ts: Date.now()
  };
  safeLS('set', key, JSON.stringify(data));
  pToast('✨','Estado del día guardado 💚');
}

function _getDailyStatus(){
  var key = _todayStatusKey();
  try{ return JSON.parse(safeLS('get',key)||'{}'); }catch(e){ return {}; }
}

// ── GLOBAL CONTENT REPORT ─────────────────────────────────────
function pReportContent(type, id, preview){
  var reasons = ['Contenido agresivo o hiriente','Discurso de odio o discriminación','Spam o autopromoción','Información médica incorrecta o peligrosa','Acoso o bullying','Sugerencias de autolesión','Otro'];
  var ov = document.createElement('div');
  ov.className = 'p-modal-ov show';
  ov.id = 'globalReportOv';
  ov.innerHTML = '<div class="p-sheet">'
    +'<div class="p-sheet-handle"></div>'
    +'<div style="font-size:28px;text-align:center;margin-bottom:8px">⚠️</div>'
    +'<div style="font-family:\'Cormorant Garamond\',serif;font-size:20px;color:var(--ink);text-align:center;margin-bottom:8px">Reportar contenido</div>'
    +(preview ? '<div style="font-size:12px;color:var(--ink4);background:var(--cream2);border-radius:10px;padding:10px;margin-bottom:14px;font-style:italic;line-height:1.5">'+_escHtml(preview.slice(0,120))+(preview.length>120?'…':'')+'</div>' : '')
    +'<div style="font-size:12px;font-weight:700;color:var(--ink3);margin-bottom:8px">¿Por qué lo reportás?</div>'
    +'<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px" id="rptGlobalReasons">'
    +reasons.map(function(r,i){
      return '<label style="display:flex;align-items:center;gap:10px;font-size:13px;color:var(--ink3);cursor:pointer;padding:8px;border-radius:10px;border:1.5px solid var(--border);transition:border-color .15s" onclick="this.style.borderColor=\'var(--sage3)\'">'
        +'<input type="radio" name="rptGlobal" value="'+r+'" style="accent-color:var(--sage2)"> '+r+'</label>';
    }).join('')
    +'</div>'
    +'<textarea class="p-textarea" id="rptGlobalDetail" rows="2" placeholder="Descripción adicional (opcional)" style="margin-bottom:12px"></textarea>'
    +'<div style="display:flex;gap:8px">'
    +'<button class="p-btn p-btn--md p-btn--full" style="background:var(--sos);border-color:var(--sos);color:#fff;font-family:\'Jost\',sans-serif;font-size:13px;font-weight:700;padding:11px;border-radius:14px;cursor:pointer" onclick="pSubmitGlobalReport(\''+type+'\',\''+id+'\')">Enviar reporte</button>'
    +'<button class="p-btn p-btn--secondary p-btn--md p-btn--full" onclick="document.getElementById(\'globalReportOv\').remove()">Cancelar</button>'
    +'</div>'
    +'</div>';
  document.body.appendChild(ov);
}

function pSubmitGlobalReport(type, id){
  var checked = document.querySelector('input[name="rptGlobal"]:checked');
  if(!checked){ pToast('⚠️','Seleccioná un motivo'); return; }
  var detail = (document.getElementById('rptGlobalDetail') ? document.getElementById('rptGlobalDetail').value.trim() : '');
  var ov = document.getElementById('globalReportOv');
  if(ov) ov.remove();

  // Save to audit log
  var audit = []; try{ audit = JSON.parse(safeLS('get','velo_audit_log')||'[]'); }catch(e){}
  var reportId = type+'-'+id;
  audit.unshift({ ts:Date.now(), tipo:'report_'+type, contentId:id, motivo:checked.value, detail:detail, resolved:false });
  safeLS('set','velo_audit_log', JSON.stringify(audit.slice(0,500)));

  // Mark content as hidden until admin resolves
  var hidden = []; try{ hidden = JSON.parse(safeLS('get','velo_hidden_content')||'[]'); }catch(e){}
  if(hidden.indexOf(reportId) < 0){ hidden.push(reportId); safeLS('set','velo_hidden_content', JSON.stringify(hidden)); }

  pToast('✅','Reporte enviado. El contenido quedó oculto hasta que lo revise el equipo de Velo 🙏');
}

function _isHidden(type, id){
  try{ var h = JSON.parse(safeLS('get','velo_hidden_content')||'[]'); return h.indexOf(type+'-'+id) >= 0; }catch(e){ return false; }
}

// ── PROFILE EXTRAS: DELETE ACCOUNT, CANCEL SUB, CONTACT ────────
function pDeleteAccount(){
  var ov = document.createElement('div');
  ov.className = 'p-modal-ov show';
  ov.innerHTML = '<div class="p-sheet">'
    +'<div class="p-sheet-handle"></div>'
    +'<div style="font-size:32px;text-align:center;margin-bottom:10px">⚠️</div>'
    +'<div style="font-family:\'Cormorant Garamond\',serif;font-size:20px;color:var(--ink);text-align:center;margin-bottom:10px">¿Eliminar tu cuenta?</div>'
    +'<p style="font-size:13px;color:var(--ink4);text-align:center;line-height:1.6;margin-bottom:18px">Esta acción es <strong>irreversible</strong>. Se eliminarán todos tus datos: diario, registros de ánimo, mensajes y participación en círculos.</p>'
    +'<div class="p-field"><label class="p-field-label">Escribí "ELIMINAR" para confirmar</label>'
    +'<input class="p-input" type="text" id="deleteConfirmInput" placeholder="ELIMINAR"></div>'
    +'<div style="display:flex;gap:8px;margin-top:12px">'
    +'<button class="p-btn p-btn--md p-btn--full" style="background:var(--sos);border-color:var(--sos);color:#fff;font-family:\'Jost\',sans-serif;font-weight:700;padding:11px;border-radius:14px;cursor:pointer" onclick="pConfirmDelete(this.closest(\'.p-modal-ov\'))">Eliminar cuenta</button>'
    +'<button class="p-btn p-btn--secondary p-btn--md p-btn--full" onclick="this.closest(\'.p-modal-ov\').remove()">Cancelar</button>'
    +'</div>'
    +'</div>';
  document.body.appendChild(ov);
}

function pConfirmDelete(ov){
  var input = document.getElementById('deleteConfirmInput');
  if(!input || input.value !== 'ELIMINAR'){ pToast('⚠️','Escribí ELIMINAR para confirmar'); return; }
  if(ov) ov.remove();
  // Clear all local data
  var keysToRemove = ['velo_session','velo_user_name','velo_user_email','velo_user_av','velo_user_motto','velo_user_type',
    'velo_diary','velo_inbox','velo_subscribers','velo_registered_ts','velo_guardian_convs','velo_circles','velo_helped_once'];
  keysToRemove.forEach(function(k){ safeLS('del',k); });
  if(sbClient){ try{ sbClient.auth.signOut(); }catch(e){} }
  pToast('👋','Tu cuenta ha sido eliminada. Hasta pronto.');
  setTimeout(function(){ _authenticated=false; pGoTo('landing'); }, 1800);
}

function pCancelSubscription(){
  var hasSub = _isPremium();
  if(!hasSub){ pToast('ℹ️','No tenés una suscripción activa'); return; }
  var ov = document.createElement('div');
  ov.className = 'p-modal-ov show';
  ov.innerHTML = '<div class="p-sheet">'
    +'<div class="p-sheet-handle"></div>'
    +'<div style="font-size:32px;text-align:center;margin-bottom:10px">⭐</div>'
    +'<div style="font-family:\'Cormorant Garamond\',serif;font-size:20px;color:var(--ink);text-align:center;margin-bottom:10px">Cancelar Velo Plus</div>'
    +'<p style="font-size:13px;color:var(--ink4);text-align:center;line-height:1.6;margin-bottom:18px">¿Seguro/a? Perderás acceso a las funciones Plus al final del período de facturación.</p>'
    +'<div style="display:flex;gap:8px">'
    +'<button class="p-btn p-btn--md p-btn--full" style="background:#c87a3e;border-color:#c87a3e;color:#fff;font-family:\'Jost\',sans-serif;font-weight:700;padding:11px;border-radius:14px;cursor:pointer" onclick="pConfirmCancelSub(this.closest(\'.p-modal-ov\'))">Sí, cancelar</button>'
    +'<button class="p-btn p-btn--secondary p-btn--md p-btn--full" onclick="this.closest(\'.p-modal-ov\').remove()">Mantener Plus</button>'
    +'</div>'
    +'</div>';
  document.body.appendChild(ov);
}

function pConfirmCancelSub(ov){
  if(ov) ov.remove();
  var email = safeLS('get','velo_user_email');
  var subs = []; try{ subs = JSON.parse(safeLS('get','velo_subscribers')||'[]'); }catch(e){}
  subs = subs.map(function(s){ return s.email===email ? Object.assign({},s,{status:'cancelled'}) : s; });
  safeLS('set','velo_subscribers', JSON.stringify(subs));
  pToast('👋','Suscripción cancelada. Podés volver a activarla cuando quieras 🌿');
  pLoadProfile();
}

function pContactUs(){
  var ov = document.createElement('div');
  ov.className = 'p-modal-ov show';
  ov.innerHTML = '<div class="p-sheet">'
    +'<div class="p-sheet-handle"></div>'
    +'<div style="font-family:\'Cormorant Garamond\',serif;font-size:22px;color:var(--ink);margin-bottom:8px">Contactanos 💚</div>'
    +'<p style="font-size:12px;color:var(--ink4);margin-bottom:16px;line-height:1.6">¿Tenés alguna pregunta, sugerencia o problema técnico? Escribinos y te respondemos a la brevedad.</p>'
    +'<div class="p-field"><label class="p-field-label">Asunto</label>'
    +'<select class="p-input" id="contactTopic" style="appearance:none">'
    +'<option>Consulta general</option><option>Problema técnico</option><option>Sugerencia de mejora</option><option>Reporte de seguridad</option><option>Solicitud de datos</option>'
    +'</select></div>'
    +'<div class="p-field"><label class="p-field-label">Mensaje</label>'
    +'<textarea class="p-textarea" id="contactMsg" rows="4" placeholder="Contanos qué necesitás..."></textarea></div>'
    +'<div style="display:flex;gap:8px">'
    +'<button class="p-btn p-btn--primary p-btn--md p-btn--full" onclick="pSendContactModal(this.closest(\'.p-modal-ov\'))">Enviar mensaje</button>'
    +'<button class="p-btn p-btn--secondary p-btn--md p-btn--full" onclick="this.closest(\'.p-modal-ov\').remove()">Cancelar</button>'
    +'</div>'
    +'<div style="height:8px"></div>'
    +'<p style="font-size:11px;color:var(--ink5);text-align:center">También podés escribirnos a <strong>wearevelo.app@gmail.com</strong></p>'
    +'</div>';
  document.body.appendChild(ov);
}

function pSendContactModal(ov){
  var msg   = document.getElementById('contactMsg');
  var topic = document.getElementById('contactTopic');
  if(!msg || !msg.value.trim()){ pToast('✍️','Escribí tu mensaje'); return; }
  var text = msg.value.trim();
  var ts   = Date.now();
  var msgs = []; try{ msgs = JSON.parse(safeLS('get','velo_admin_contacts')||'[]'); }catch(e){}
  msgs.unshift({ id:'c-'+ts, topic: topic?topic.value:'Consulta general', mensaje: text, email: safeLS('get','velo_user_email')||'anónimo', fecha: new Date().toLocaleDateString('es',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}), leido:false });
  safeLS('set','velo_admin_contacts', JSON.stringify(msgs.slice(0,200)));
  try{ sbEnviarReporte(text, topic?topic.value:'contacto').catch(function(){}); }catch(e){}
  if(ov) ov.remove();
  pToast('💌','¡Mensaje enviado! Te respondemos pronto 💚');
}

// Fake live counters removed — real-time data requires Supabase presence channels

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
    case 'help-chat':   /* initialized by pAccompanyHelp */ break;
    case 'bottle':      pRenderBottle(); break;
    case 'diary':       pInitDiary(); break;
    case 'mood':        pInitMood(); break;
    case 'respira':     pInitRespira(); break;
    case 'vela':        pInitVela(); break;
    case 'circles':     pRenderCircles(); break;
    case 'feed':        _renderCircleMessages(); break;
    case 'happy':       pRenderHappy(); break;
    case 'profile':     pLoadProfile(); break;
    case 'inbox':       pRenderInbox(); break;
    case 'donation-exit': pInitDonation(); break;
    case 'session-room': pInitSessionRoom(); break;
    case 'post-chat':   pInitPostChat(); break;
    case 'pro-panel':   switchProPanel('inicio', document.querySelector('.pro-nav-item')); break;
    case 'admin':          _renderAdmin(); break;
    case 'contact':        _initContactPage(); break;
    case 'news':           pRenderNews(); break;
    case 'calm-ai':        _initCalmAIPage(); break;
    case 'guardian-chat':  _gcInit(); break;
    case 'change-password':
      var cpBack = document.getElementById('changePassBackRow');
      if(cpBack) cpBack.style.display = safeLS('get','velo_needs_pw_change') === '1' ? 'none' : 'block';
      break;
  }
}

function _initContactPage(){
  // Pre-select "Problema con contraseña" if user came from forgot-password flow
  var sub = document.getElementById('contactSubject');
  if(sub && !sub.value) sub.value = 'Consulta general';
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
// ── MESSAGE REACTIONS + REPLY ────────────────────────────────────
var _msgCounter  = 0;
var _msgPopupData = null;

function _nextMsgId(){ return 'vmsg-'+(++_msgCounter); }

function _initMsgActions(){
  if(document.getElementById('msgActionsPopup')) return;
  var pop = document.createElement('div');
  pop.id = 'msgActionsPopup';
  pop.className = 'msg-actions-popup';
  pop.innerHTML = ['❤️','😢','💪','🙏','🌿','✨'].map(function(e){
    return '<button onclick="_msgReact(\''+e+'\')" title="'+e+'">'+e+'</button>';
  }).join('')
    +'<span class="msg-actions-divider"></span>'
    +'<button class="msg-reply-btn" onclick="_msgReplyAct()">↩ Responder</button>';
  document.body.appendChild(pop);
  document.addEventListener('click', function(e){
    if(!e.target.closest('#msgActionsPopup') && !e.target.closest('.msg-action-btn')){
      pop.style.display = 'none'; _msgPopupData = null;
    }
  });
}

function pShowMsgActions(btn, msgId, text, inputId, replyBarId){
  _initMsgActions();
  _msgPopupData = { msgId:msgId, text:text, inputId:inputId, replyBarId:replyBarId };
  var pop = document.getElementById('msgActionsPopup');
  if(!pop) return;
  pop.style.display = 'flex';
  var rect = btn.getBoundingClientRect();
  var top  = rect.top - 58;
  if(top < 8) top = rect.bottom + 8;
  var left = Math.max(8, Math.min(window.innerWidth - 280, rect.left - 80));
  pop.style.top  = top + 'px';
  pop.style.left = left + 'px';
}

function _msgReact(emoji){
  var pop = document.getElementById('msgActionsPopup');
  if(pop) pop.style.display = 'none';
  if(!_msgPopupData) return;
  var msgEl = document.getElementById(_msgPopupData.msgId);
  if(!msgEl) return;
  var rxBar = msgEl.querySelector('.msg-rx-bar');
  if(!rxBar){
    rxBar = document.createElement('div');
    rxBar.className = 'msg-rx-bar';
    var bubble = msgEl.querySelector('.feed-bubble');
    if(bubble) bubble.after(rxBar); else msgEl.appendChild(rxBar);
  }
  var existing = rxBar.querySelector('[data-emoji="'+emoji+'"]');
  if(existing){
    var c = parseInt(existing.getAttribute('data-cnt')||'1',10)+1;
    existing.setAttribute('data-cnt',c);
    existing.textContent = emoji+' '+c;
  } else {
    var chip = document.createElement('span');
    chip.className = 'msg-reaction mine';
    chip.setAttribute('data-emoji', emoji);
    chip.setAttribute('data-cnt', '1');
    chip.textContent = emoji+' 1';
    chip.onclick = function(){
      var cc = parseInt(chip.getAttribute('data-cnt')||'1',10)+1;
      chip.setAttribute('data-cnt',cc);
      chip.textContent = emoji+' '+cc;
    };
    rxBar.appendChild(chip);
  }
  pToast(emoji,'¡Reaccionaste!');
}

function _msgReplyAct(){
  var pop = document.getElementById('msgActionsPopup');
  if(pop) pop.style.display = 'none';
  if(!_msgPopupData) return;
  var bar = document.getElementById(_msgPopupData.replyBarId);
  if(bar){
    bar.style.display = 'flex';
    var textEl = bar.querySelector('.reply-preview-text');
    var preview = _msgPopupData.text.length > 70 ? _msgPopupData.text.slice(0,70)+'…' : _msgPopupData.text;
    if(textEl) textEl.textContent = '↩  '+preview;
    bar.setAttribute('data-reply-text', _msgPopupData.text);
  }
  var inp = document.getElementById(_msgPopupData.inputId);
  if(inp){ inp.focus(); }
}

function pClearReplyBar(barId){
  var bar = document.getElementById(barId);
  if(!bar) return;
  bar.style.display = 'none';
  bar.removeAttribute('data-reply-text');
}

function _getReplyQuote(barId){
  var bar = document.getElementById(barId);
  if(!bar || bar.style.display === 'none') return '';
  return bar.getAttribute('data-reply-text') || '';
}

function _buildMsgBubble(text, isUser, av, senderName, inputId, replyBarId, quoteText){
  var id  = _nextMsgId();
  var t   = new Date();
  var ts  = t.getHours()+':'+(t.getMinutes()<10?'0':'')+t.getMinutes();
  var quotePart = quoteText ? '<div class="reply-quote">'+_escHtml(quoteText.slice(0,80)+(quoteText.length>80?'…':''))+'</div>' : '';
  var actionBtn = '<button class="msg-action-btn" onclick="pShowMsgActions(this,\''+id+'\','+JSON.stringify(text)+',\''+inputId+'\',\''+replyBarId+'\')" aria-label="Acciones">•••</button>';
  if(isUser){
    safeLS('set','velo_total_msgs', String(parseInt(safeLS('get','velo_total_msgs')||'0',10)+1));
    return '<div class="feed-msg feed-msg--own" id="'+id+'" style="position:relative">'
      +'<div class="msg-wrap">'
      +actionBtn
      +'<div class="feed-bubble feed-bubble--own">'+quotePart+_escHtml(text)+'<span class="feed-time">'+ts+'</span></div>'
      +'</div></div>';
  } else {
    var avClick = senderName ? ' style="cursor:pointer" onclick="pQuickProfile('+JSON.stringify(senderName)+',' +JSON.stringify(av||'🌿')+')"' : '';
    return '<div class="feed-msg" id="'+id+'" style="position:relative">'
      +'<div class="feed-av"'+avClick+'>'+_avInline(av||'🌿',36)+'</div>'
      +'<div><div class="feed-sender" style="font-size:11px;color:var(--ink4)">'+(senderName||'')+'</div>'
      +'<div class="msg-wrap">'
      +'<div class="feed-bubble">'+quotePart+_escHtml(text)+'<span class="feed-time">'+ts+'</span></div>'
      +actionBtn
      +'</div></div></div>';
  }
}

document.addEventListener('DOMContentLoaded', function(){
  _initSupabase();
  _initMsgActions();
});

window.addEventListener('load', function(){
  _initSupabase();
  _checkStripeReturn();
  _checkPayPalReturn();

  // Handle Supabase email confirmation redirect
  if(window.location.hash && window.location.hash.includes('type=signup')){
    _initSupabase();
    if(sbClient){
      sbClient.auth.onAuthStateChange(function(event, session){
        if(event === 'SIGNED_IN' && session){
          safeLS('set','velo_user_email', session.user.email||'');
          safeLS('set','velo_user_name', safeLS('get','velo_user_name') || (session.user.email||'').split('@')[0]);
          safeLS('set','velo_session','1');
          safeLS('set','velo_user_type', safeLS('get','velo_user_type')||'user');
          _authenticated = true;
          _startGuardianHeartbeat();
          pToast('🎉','¡Cuenta confirmada! Bienvenido/a a Velo 🌿');
          _loginAndGo();
        }
      });
    } else {
      safeLS('set','velo_session','1');
      _authenticated = true;
      _loginAndGo();
    }
    return;
  }

  // Handle Supabase password recovery redirect (token in URL hash)
  if(window.location.hash && window.location.hash.includes('type=recovery')){
    _initSupabase();
    if(sbClient){
      sbClient.auth.onAuthStateChange(function(event, session){
        if(event === 'PASSWORD_RECOVERY'){
          if(session){ safeLS('set','velo_user_email', session.user.email||''); safeLS('set','velo_session','1'); _authenticated = true; }
          safeLS('set','velo_needs_pw_change','1');
          pGoTo('change-password');
        }
      });
    } else {
      // Fallback: go to change-password anyway
      safeLS('set','velo_needs_pw_change','1');
      pGoTo('change-password');
    }
    return;
  }

  // Check auth state
  var session = safeLS('get','velo_session');
  var type = safeLS('get','velo_user_type') || 'user';
  _userType = type;

  if(session === '1'){
    _authenticated = true;
    setTimeout(_startGuardianHeartbeat, 2000);
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

  // Mark guardian offline when closing the app
  window.addEventListener('beforeunload', function(){
    _stopGuardianHeartbeat();
    if(safeLS('get','velo_is_guardian') === 'true' && sbClient){
      try{
        var uid = safeLS('get','velo_user_email')||'guest';
        navigator.sendBeacon ? (function(){
          sbClient.from('guardian_presence').update({ status:'offline', last_seen: new Date().toISOString() }).eq('user_id', uid);
        })() : null;
      }catch(e){}
    }
  });

  // Register timestamp
  if(!safeLS('get','velo_registered_ts')){
    safeLS('set','velo_registered_ts', String(Date.now()));
  }
});

window.addEventListener('error', function(e){
  console.error('[Velo] runtime error:', e.error || e.message, (e.filename||'')+(e.lineno?':'+e.lineno:''));
});

// ── MOBILE TAP SAFETY NET ────────────────────────────────────
// On iOS some stacking/overlay quirks can swallow taps. This document-level
// handler resolves the real button at the touch point via elementsFromPoint
// (which sees *through* invisible overlays) and triggers it.
(function(){
  var sx = 0, sy = 0, moved = false;

  document.addEventListener('touchstart', function(e){
    var t = e.touches[0]; if(!t) return;
    sx = t.clientX; sy = t.clientY; moved = false;
  }, {passive:true});

  document.addEventListener('touchmove', function(e){
    var t = e.touches[0]; if(!t) return;
    if(Math.abs(t.clientX - sx) > 12 || Math.abs(t.clientY - sy) > 12) moved = true;
  }, {passive:true});

  document.addEventListener('touchend', function(e){
    if(moved) return;
    // Don't interfere while a modal / sheet / mobile menu is open.
    if(document.querySelector('.p-modal-ov.show, .p-modal-ov.open, .p-mobile-menu.open')) return;
    var t = e.changedTouches[0]; if(!t) return;

    var stack = [];
    try{ stack = document.elementsFromPoint(t.clientX, t.clientY) || []; }catch(err){ return; }

    for(var i=0; i<stack.length; i++){
      var el = stack[i];
      var tag = el.tagName;
      // Native interactive elements handle their own taps — stop before them.
      if(tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'A') return;
      if(tag === 'BUTTON' && el.hasAttribute('onclick')){
        e.preventDefault();
        try{ el.click(); }catch(err){ console.error('[Velo] tap nav error:', err); }
        return;
      }
    }
  }, {passive:false});
})();
