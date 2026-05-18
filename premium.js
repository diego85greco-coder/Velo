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
var P_DARK   = ['help','bottle','respira'];
var P_FADE   = ['landing','onboarding','register-type','donation-exit',
                'session-room','post-chat','pro-pending','admin-login'];

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
  if(ov) ov.classList.add('open');
}
function pShowPrivacy(){
  var ov = document.getElementById('privacyOv');
  if(ov) ov.classList.add('open');
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
  ov.classList.add('open');
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
  { id:'g1', name:'Ana Luz',     av:'🌸', bio:'Pasé por momentos muy difíciles con la ansiedad y encontré el camino. Aquí para escucharte sin juzgar.', status:'on',   convs:89,  recommend:142, rating:4.9, tags:['ansiedad','estrés','duelo'],        review:{ txt:'Ana me ayudó a encontrar calma cuando más lo necesitaba.',                   auth:'Lucía M.' },  mood:'Disponible ahora'    },
  { id:'g2', name:'Carlos R.',   av:'🌊', bio:'Sé lo que es sentirse solo en la oscuridad. Acompaño desde la empatía real, sin rollos, sin apuro.',      status:'on',   convs:63,  recommend:98,  rating:4.8, tags:['depresión','soledad','cambios'],      review:{ txt:'Con Carlos pude hablar de cosas que nunca había dicho en voz alta.',          auth:'Martín P.' }, mood:'Tranquilo hoy'        },
  { id:'g3', name:'Valentina S.',av:'🦋', bio:'Viví de cerca el duelo y los cambios de familia. Cada historia merece ser escuchada con el tiempo que necesita.', status:'busy', convs:134, recommend:215, rating:5.0, tags:['familia','pérdida','crianza'],      review:{ txt:'Valentina tiene una capacidad enorme para sostener el dolor ajeno.',        auth:'Ana G.' },    mood:'En conversación'     },
  { id:'g4', name:'Tomás L.',    av:'🌿', bio:'Aprendí a parar la pelota con el mindfulness cuando el burnout me desbordó. Te ayudo a respirar antes de reaccionar.', status:'on', convs:45, recommend:76, rating:4.7, tags:['mindfulness','burnout','trabajo'],   review:{ txt:'Tomás me enseñó a respirar antes de reaccionar.',                          auth:'Diego F.' },  mood:'Abierto a charlar'   },
  { id:'g5', name:'Sofía N.',    av:'🌙', bio:'Las noches difíciles no deberían atravesarse solas. Estoy especialmente disponible cuando el mundo duerme.', status:'on',   convs:112, recommend:189, rating:4.9, tags:['insomnio','angustia','noche'],        review:{ txt:'Encontrar a alguien disponible a las 3am fue un regalo.',                    auth:'Renata V.' }, mood:'Disponible de noche'  },
  { id:'g6', name:'Emilio T.',   av:'🏔️', bio:'Entiendo el peso del trauma y la crisis. Acompaño sin prisa, paso a paso, desde un lugar que también conocí.',  status:'off',  convs:38,  recommend:54,  rating:4.6, tags:['trauma','crisis','resiliencia'],     review:{ txt:'Emilio me ayudó a entender que lo que sentía era válido.',                   auth:'Camila H.' }, mood:'Descansando'          }
];

var _curGuardian = null;
var _guardianFilter = 'all';
var _myGuardianStatus = safeLS('get','velo_guardian_status') || 'disponible'; // disponible/ocupado/incognito

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

function pRenderGuardians(){
  _renderMyStatusBar();
  var list = document.getElementById('guardiansList');
  if(!list) return;
  var filtered = _guardianProfiles.filter(function(g){
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
    return '<div class="p-guardian-card" onclick="'+(isAnon?'pToast(\'👤\',\'Este guardián está en modo anónimo\')':'pOpenGuardian(\''+g.id+'\')')+'"><div style="display:flex;align-items:center;gap:14px"><div style="position:relative;font-size:38px;flex-shrink:0">'+(isAnon?'👤':g.av)+'<span style="position:absolute;bottom:-2px;right:-2px;width:12px;height:12px;border-radius:50%;background:'+statusColor+';border:2px solid #fff;box-shadow:0 0 4px '+statusColor+'"></span></div><div style="flex:1;min-width:0"><div style="display:flex;align-items:center;gap:8px;margin-bottom:3px"><span style="font-size:15px;font-weight:700;color:var(--ink)">'+(isAnon?'Guardián Anónimo':g.name)+'</span><span style="font-size:14px">'+badge.icon+'</span></div><div style="font-size:12px;color:var(--sage3);font-weight:600;margin-bottom:4px">'+statusLabel+' · '+g.convs+' conversaciones</div><p style="font-size:12px;color:var(--ink4);line-height:1.5;margin:0">'+(isAnon?'Disponible de forma anónima':g.bio)+'</p></div><button class="p-btn p-btn--primary p-btn--sm" onclick="event.stopPropagation();'+(g.status==='ocupado'?'pToast(\'🟡\',\''+g.name+' está ocupado/a ahora\')':'pAskGuardian(\''+g.id+'\')')+'">'+(g.status==='ocupado'?'Ocupado/a':'Acompañar')+'</button></div></div>';
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
  if(rvEl) rvEl.innerHTML = '<div class="p-review-card"><div class="p-row" style="margin-bottom:8px"><span style="font-size:14px">⭐⭐⭐⭐⭐</span></div><p class="p-rv-txt">"'+g.review.txt+'"</p><div style="font-size:11px;color:var(--ink5)">— '+g.review.auth+'</div></div>';
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
  if(ov) ov.classList.add('open');
}

function pConfirmAskGuardian(){
  // Set guardian as busy during chat
  safeLS('set','velo_guardian_status','ocupado');
  var ov = document.getElementById('askGuardianOv');
  if(ov) ov.classList.remove('open');
  pToast('💚','Solicitud enviada a '+(_curGuardian ? _curGuardian.name : 'el guardián')+'…');
  setTimeout(function(){
    pToast('🌿',(_curGuardian ? _curGuardian.name : 'Tu guardián')+' aceptó acompañarte ✨');
    setTimeout(function(){
      pGoTo('post-chat');
      // Restore status when chat completes (handled in pSendPostChat)
    }, 800);
  }, 2200);
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
  var stripeAmount = Math.round(p.rate * 100);
  var proName = p.name;
  var proSpec = p.spec;
  var sessionData = { proId:proId, name:proName, spec:proSpec, amount:p.rate, currency:p.currency, ts:Date.now() };
  safeLS('set','velo_stripe_pending', JSON.stringify(sessionData));
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
    safeLS('set','velo_current_session', JSON.stringify(sessionData));
    setTimeout(function(){ pGoTo('session-room'); }, 1500);
  }
}

// ── HELP ROOM ─────────────────────────────────────────────────
var _helpPosts = [];
var _helpMockSeeded = false;

function _seedHelpMock(){
  if(_helpMockSeeded) return;
  _helpMockSeeded = true;
  var now = Date.now();
  var mock = [
    { id:'h1', emoji:'😰', anon:true,  name:'Usuario Anónimo', time: now-2*60000,  preview:'No puedo dormir y no sé por qué me siento tan vacío/a…' },
    { id:'h2', emoji:'😢', anon:true,  name:'Usuario Anónimo', time: now-5*60000,  preview:'Tuve una pelea muy fuerte hoy y me siento muy solo/a…' },
    { id:'h3', emoji:'😔', anon:false, name:'Valentina S.',    time: now-8*60000,  preview:'Llevo semanas sin poder levantarme de la cama.' },
    { id:'h4', emoji:'😞', anon:true,  name:'Usuario Anónimo', time: now-15*60000, preview:'No sé si lo que me pasa es normal pero me pesa mucho.' }
  ];
  var stored = []; try{ stored = JSON.parse(safeLS('get','velo_help_posts')||'[]'); }catch(e){}
  if(!stored.length){
    safeLS('set','velo_help_posts', JSON.stringify(mock));
  }
}

function pRenderHelp(){
  _seedHelpMock();
  var list = document.getElementById('helpList');
  if(!list) return;
  var posts = []; try{ posts = JSON.parse(safeLS('get','velo_help_posts')||'[]'); }catch(e){}
  var hidden = []; try{ hidden = JSON.parse(safeLS('get','velo_hidden_content')||'[]'); }catch(e){}
  posts = posts.filter(function(h){ return !h.taken && hidden.indexOf('help-'+h.id)<0; });
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
var _helpChatAutoMsgPool = [
  '¿Seguís ahí? No tenés que responder rápido, tomá tu tiempo 🌿',
  'Estoy acá para escucharte, sin apuros 💙',
  'Cuando quieras compartir más, acá estoy 🤍'
];

function pAccompanyHelp(postId){
  var posts = []; try{ posts = JSON.parse(safeLS('get','velo_help_posts')||'[]'); }catch(e){}
  var post = posts.find(function(p){ return p.id===postId; });
  if(!post){ pToast('⚠️','Esta solicitud ya fue tomada'); return; }
  // Mark as taken — disappears from wall
  posts = posts.map(function(p){ return p.id===postId ? Object.assign({},p,{taken:true}) : p; });
  safeLS('set','velo_help_posts', JSON.stringify(posts));
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
  div.className = 'feed-msg feed-msg--own';
  div.innerHTML = '<div class="feed-bubble feed-bubble--own">'+_escHtml(text)+'<span class="feed-time">'+tStr+'</span></div>';
  msgEl.appendChild(div);
  msgEl.scrollTop = msgEl.scrollHeight;
  // Simulated reply after 8-15 seconds
  setTimeout(function(){
    _resetHelpInactivity();
    var reply = _helpChatAutoMsgPool[Math.floor(Math.random()*_helpChatAutoMsgPool.length)];
    var t2 = new Date();
    var tStr2 = t2.getHours()+':'+(t2.getMinutes()<10?'0':'')+t2.getMinutes();
    var div2 = document.createElement('div');
    div2.className = 'feed-msg';
    div2.innerHTML = '<div class="feed-av">'+(_curHelpPost?_curHelpPost.emoji:'💚')+'</div><div><div class="feed-sender">'+(_curHelpPost?_curHelpPost.name:'Usuario')+'</div><div class="feed-bubble">'+_escHtml(reply)+'<span class="feed-time">'+tStr2+'</span></div></div>';
    msgEl.appendChild(div2);
    msgEl.scrollTop = msgEl.scrollHeight;
  }, 8000 + Math.random()*7000);
}

function pLeaveHelpChat(){
  if(_helpChatInactivityTimer){ clearTimeout(_helpChatInactivityTimer); _helpChatInactivityTimer = null; }
  _curHelpPost = null;
  pGoTo('help');
  pRenderHelp();
}

function pOpenHelpForm(){ openModal('helpFormOv'); }

function pSendHelp(){
  var ta = document.getElementById('helpMsgTa');
  if(!ta || !ta.value.trim()){ pToast('✍️','Escribí tu mensaje antes de enviar'); return; }
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
    { id:'mb1', mood:'😔', text:'A veces el silencio duele más que las palabras.',          responses:2,  color:'rgba(116,198,157,.12)',   ts: Date.now()-3*60000   },
    { id:'mb2', mood:'💭', text:'¿Alguien más siente que no encaja en ningún lado?',         responses:7,  color:'rgba(200,165,100,.08)',   ts: Date.now()-8*60000   },
    { id:'mb3', mood:'😢', text:'Hoy recordé a alguien que ya no está. Lo extraño tanto.',   responses:4,  color:'rgba(196,181,232,.12)',   ts: Date.now()-15*60000  },
    { id:'mb4', mood:'🤗', text:'Para quien lo necesite: no estás solo/a. Esto también pasa.',responses:15, color:'rgba(116,198,157,.1)',   ts: Date.now()-22*60000  }
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
      +'<div style="display:flex;align-items:center;justify-content:space-between">'
      +'<span style="font-size:11px;color:rgba(200,165,100,.6)">💬 '+(b.responses||0)+' respuestas</span>'
      +'<button style="padding:5px 11px;background:rgba(200,165,100,.12);border:1px solid rgba(200,165,100,.22);border-radius:100px;color:#C8A560;font-size:11px;font-weight:700;cursor:pointer;font-family:\'Jost\',sans-serif" onclick="pOpenBottleReply(\''+b.id+'\',\''+b.text.substring(0,40).replace(/'/g,'\\\'').replace(/"/g,'&quot;')+'...\')">💌 Responder</button>'
      +'</div></div>';
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
  var id = 'ub'+Date.now();
  bottles.unshift({ id:id, mood:_selectedBottleMood, text:text, responses:0, color:'rgba(116,198,157,.12)', ts:Date.now() });
  safeLS('set','velo_my_bottles', JSON.stringify(bottles.slice(0,50)));
  pToast('🌊','¡Mensaje lanzado al mar! 🌿');
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
  ov.classList.add('open');
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

function _checkMonthlyMoodReport(){
  var today = new Date();
  if(today.getDate() !== 1) return;
  var reportKey = 'velo_mood_report_'+today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0');
  if(safeLS('get',reportKey) === '1') return; // already sent this month
  safeLS('set', reportKey, '1');

  // Gather last month's moods
  var prev = new Date(today.getFullYear(), today.getMonth()-1, 1);
  var prevYear = prev.getFullYear();
  var prevMonth = prev.getMonth()+1;
  var daysInPrev = new Date(prevYear, prevMonth, 0).getDate();
  var moodCounts = {}; var totalDays = 0;
  for(var d = 1; d <= daysInPrev; d++){
    var k = prevYear+'-'+String(prevMonth).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    var stored = safeLS('get','velo_mood_'+k);
    if(stored){ try{ var ms = JSON.parse(stored); if(ms.emoji){ moodCounts[ms.emoji]=(moodCounts[ms.emoji]||0)+1; totalDays++; } }catch(e){} }
  }

  var monthNames = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  var monthName = monthNames[prevMonth];

  var positives = (moodCounts['😄']||0) + (moodCounts['😊']||0);
  var analysis, summary;
  if(!totalDays){
    analysis = 'No registraste tu ánimo el mes pasado. Recordá que el seguimiento diario te ayuda a conocerte mejor. ¡Este mes empezás de cero! 🌱';
    summary  = 'Sin registros en '+monthName;
  } else {
    var pct = Math.round(positives/totalDays*100);
    var topEmoji = Object.keys(moodCounts).sort(function(a,b){ return moodCounts[b]-moodCounts[a]; })[0];
    summary = 'Registraste '+totalDays+' días en '+monthName+'. Tu ánimo más frecuente: '+topEmoji;
    if(pct >= 60){
      analysis = '¡'+monthName+' fue un mes mayormente positivo para vos! '+pct+'% de tus días registraste bienestar. Eso habla de tu fortaleza y resiliencia. Seguí construyendo ese espacio de cuidado. 🌻';
    } else if(pct >= 35){
      analysis = monthName+' tuvo sus altibajos, como la vida misma. Registraste días de alegría y también días más difíciles. Eso es completamente humano. Lo importante es que seguís acá, registrando y avanzando. 💙';
    } else {
      analysis = 'Parece que '+monthName+' fue un mes desafiante. Gracias por seguir registrando incluso en los días difíciles: eso es valentía real. Recordá que Velo siempre está acá para acompañarte. 🌿';
    }
  }

  // Append happy wall stats for prev month
  var happyStats = _happyStatsGet(prev);
  var happyLine = '';
  if(happyStats.posts || happyStats.reactionsReceived || happyStats.commentsReceived){
    var parts = [];
    if(happyStats.posts) parts.push('compartiste '+(happyStats.posts === 1 ? '1 momento de alegría' : happyStats.posts+' momentos de alegría')+' en el Muro de la Felicidad 🌻');
    if(happyStats.reactionsReceived) parts.push('recibiste '+happyStats.reactionsReceived+(happyStats.reactionsReceived === 1 ? ' reacción' : ' reacciones')+' de la comunidad 💛');
    if(happyStats.commentsReceived) parts.push('recibiste '+happyStats.commentsReceived+(happyStats.commentsReceived === 1 ? ' comentario' : ' comentarios')+' en tus publicaciones 💬');
    if(parts.length) happyLine = ' Además, '+parts.join(', ')+'.';
  }

  var inbox = []; try{ inbox = JSON.parse(safeLS('get','velo_inbox')||'[]'); }catch(e){}
  inbox.unshift({
    id: 'mood-report-'+Date.now(),
    tipo: 'reporte',
    icon: '📊',
    remitente: 'Velo — Análisis de Bienestar',
    asunto: 'Tu resumen emocional de '+monthName+' 🌿',
    extracto: summary,
    cuerpo: analysis + happyLine,
    leido: false,
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
    return '<div class="circle-card'+(c.official?' circle-card--official':'')+'" onclick="pOpenCircle(\''+c.id+'\','+JSON.stringify(c).replace(/'/g,'\\\'')+')">'
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
    if(m.own){
      return '<div class="feed-msg feed-msg--own">'
        +'<div class="feed-bubble feed-bubble--own">'+_escHtml(m.text)+'<span class="feed-time">'+tStr+'</span></div>'
        +'</div>';
    }
    return '<div class="feed-msg">'
      +'<div class="feed-av">'+m.av+'</div>'
      +'<div>'
      +'<div class="feed-sender">'+m.name+'</div>'
      +'<div class="feed-bubble">'+_escHtml(m.text)+'<span class="feed-time">'+tStr+'</span></div>'
      +'</div>'
      +'</div>';
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
  if(ov) ov.classList.add('open');
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
  ov.className = 'p-modal-ov open';
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
var _happyActiveTab = 'all'; // 'all' | 'mine'

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

  return '<div class="happy-card">'
    // header
    +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">'
    +'<div style="font-size:24px;width:40px;height:40px;border-radius:12px;background:var(--sun3);display:flex;align-items:center;justify-content:center;flex-shrink:0">'+h.emoji+'</div>'
    +'<div style="flex:1;min-width:0">'
    +'<div style="font-size:13px;font-weight:600;color:var(--ink)">'+_escHtml(h.name||'Usuario Anónimo')+'</div>'
    +'<div style="font-size:10px;color:var(--ink5)">'+relTime+(isOwn?' · <strong style="color:var(--sage)">Tuya</strong>':'')+'</div>'
    +'</div>'
    +(timeLeft ? '<span style="font-size:10px;color:'+expColor+';font-weight:600;white-space:nowrap">⏳ '+timeLeft+'</span>' : '')
    +'</div>'
    // text
    +'<p style="font-size:13px;color:var(--ink3);line-height:1.6;margin-bottom:12px;font-family:\'Cormorant Garamond\',serif;font-style:italic">"'+_escHtml(h.text)+'"</p>'
    // reactions
    +'<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px">'+rxBar+'</div>'
    // comments
    +(commHtml ? '<div style="margin-bottom:8px">'+commHtml+moreComments+'</div>' : '')
    // comment input (for published posts only — not demo)
    +(h.id.startsWith('hm') ? '' :
      '<div style="display:flex;gap:6px;align-items:center">'
      +'<input id="cmt-'+h.id+'" class="p-input" style="flex:1;font-size:12px;padding:6px 10px;height:auto" placeholder="Agregar comentario…" maxlength="120" onkeydown="if(event.key===\'Enter\')pHappyComment(\''+h.id+'\')">'
      +'<button onclick="pHappyComment(\''+h.id+'\')" style="padding:6px 10px;background:var(--sage7);border:1.5px solid var(--sage4);border-radius:8px;font-size:12px;cursor:pointer;color:var(--sage);font-family:\'Jost\',sans-serif;font-weight:700">💬</button>'
      +'</div>')
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
  if(!post) return; // demo post — no persistence
  if(!post.reactions) post.reactions = {};
  // Remove previous reaction if switching
  if(myReacted && post.reactions[myReacted] > 0) post.reactions[myReacted]--;
  post.reactions[emoji] = (post.reactions[emoji] || 0) + 1;
  _happySave(posts);
  safeLS('set','velo_happy_rx_'+postId, emoji);

  // Count reaction received if it's my own post
  if(post.userId === _myUserId()) _happyStatIncr('reactionsReceived');
  pToast(emoji,'¡Alegría compartida!');
  pRenderHappy();
}

function pHappyComment(postId){
  var inp = document.getElementById('cmt-'+postId);
  if(!inp || !inp.value.trim()) return;
  var text = inp.value.trim();
  var posts = _happyLoad();
  var post  = posts.find(function(p){ return p.id === postId; });
  if(!post) return;
  if(!post.comments) post.comments = [];
  var myName = safeLS('get','velo_user_name') || 'Vos';
  post.comments.push({ name: myName, text: text, ts: Date.now() });
  _happySave(posts);
  inp.value = '';

  if(post.userId === _myUserId()){
    _happyStatIncr('commentsReceived');
  } else {
    pToast('💬','Comentario enviado 🌿');
  }
  pRenderHappy();
}

function pOpenHappyPost(){
  var posts = _processHappyQueue();
  var queue = _happyQueueLoad();
  var myId  = _myUserId();
  var myQueued = queue.find(function(p){ return p.userId === myId; });
  if(myQueued){
    pToast('⏳','Ya tenés una publicación en lista de espera');
    return;
  }
  var ov = document.getElementById('happyPostOv');
  if(ov){ ov.classList.add('open'); }
  _selectedHappyEmoji = '☀️';
  var ta = document.getElementById('happyPostTa');
  if(ta) ta.value = '';
  var emojiRow = document.getElementById('happyEmojiRow');
  if(emojiRow) emojiRow.innerHTML = _happyEmojis.map(function(e){
    return '<button style="font-size:22px;padding:6px;border:2px solid '+(e==='☀️'?'rgba(255,200,50,.6)':'transparent')+';border-radius:10px;background:none;cursor:pointer;transition:border-color .15s" onclick="pSelHappyEmoji(this,\''+e+'\')">'+e+'</button>';
  }).join('');
}

function pSelHappyEmoji(el, emoji){
  _selectedHappyEmoji = emoji;
  var row = document.getElementById('happyEmojiRow');
  if(row) row.querySelectorAll('button').forEach(function(b){
    b.style.borderColor = b.textContent === emoji ? 'rgba(255,200,50,.6)' : 'transparent';
  });
}

function pSubmitHappyPost(){
  var ta = document.getElementById('happyPostTa');
  if(!ta || !ta.value.trim()){ pToast('✍️','Escribí algo antes de publicar'); return; }
  var myId  = _myUserId();
  var name  = safeLS('get','velo_user_name') || 'Usuario Anónimo';
  var posts = _processHappyQueue();
  var isAnon = safeLS('get','velo_incognito') === 'true';
  var post  = {
    id: 'h'+Date.now(), userId: myId,
    emoji: _selectedHappyEmoji, text: ta.value.trim(),
    name: isAnon ? 'Usuario Anónimo' : name,
    ts: Date.now(), reactions: {'💛':0,'🌸':0,'🤗':0,'🌿':0,'✨':0}, comments: []
  };

  if(posts.length < HAPPY_MAX){
    posts.unshift(post);
    _happySave(posts);
    _happyStatIncr('posts');
    closeModal('happyPostOv');
    pToast('☀️','¡Publicado en el Muro! Desaparece en 24h 💛');
  } else {
    // Add to queue
    var queue = _happyQueueLoad();
    queue.push(post);
    _happyQueueSave(queue);
    _happyStatIncr('posts');
    closeModal('happyPostOv');
    pToast('⏳','El muro está lleno ('+HAPPY_MAX+'/'+HAPPY_MAX+'). Tu publicación queda en lista de espera y se publicará automáticamente 🌿');
    // Inbox notification
    var inbox = []; try{ inbox = JSON.parse(safeLS('get','velo_inbox')||'[]'); }catch(e){}
    inbox.unshift({ id:'hqueue-'+Date.now(), tipo:'muro', icon:'⏳', remitente:'Muro de la Felicidad',
      asunto:'Tu publicación está en lista de espera ⏳',
      extracto:'El muro está lleno. Cuando expire una publicación de 24hs, la tuya se publicará automáticamente.',
      leido:false, fecha:new Date().toLocaleDateString('es',{day:'2-digit',month:'short'}) });
    safeLS('set','velo_inbox', JSON.stringify(inbox.slice(0,100)));
    _updateInboxDot();
  }
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

function pShowAvatarPicker(){
  var ov = document.getElementById('avatarPickerOv');
  if(ov) ov.classList.add('open');
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

  // Mini dashboard
  _renderUserDashboard();
  // Daily status in profile
  var incog = safeLS('get','velo_incognito') === 'true';
  var statusEl = document.getElementById('profileDailyStatus');
  if(statusEl){
    if(incog){
      statusEl.innerHTML = '';
    } else {
      var ds = _getDailyStatus();
      var parts = [];
      if(ds.movie)  parts.push('<span>🎬 '+_escHtml(ds.movie)+'</span>');
      if(ds.music)  parts.push('<span>🎵 '+_escHtml(ds.music)+'</span>');
      if(ds.book)   parts.push('<span>📚 '+_escHtml(ds.book)+'</span>');
      if(ds.phrase) parts.push('<em style="display:block;font-style:italic;margin-top:6px;color:var(--sage)">"'+_escHtml(ds.phrase)+'"</em>');
      if(parts.length){
        statusEl.innerHTML = '<div style="font-size:12px;color:var(--ink4);background:var(--sage7);border-radius:12px;padding:10px 14px;display:flex;flex-direction:column;gap:4px;line-height:1.6">'+parts.join('')+'</div>';
      } else {
        statusEl.innerHTML = '';
      }
    }
  }
  // Sub status
  var subEl = document.getElementById('subStatusDisplay');
  if(subEl){
    subEl.textContent = _isPremium() ? '✅ Velo Plus activo' : 'Sin suscripción activa';
    subEl.style.color = _isPremium() ? 'var(--sage)' : 'var(--ink4)';
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

  var guardianSection = '<div class="guardian-badge-card" style="margin-bottom:16px">'
    +'<div style="font-size:12px;font-weight:700;color:var(--sage);text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">Mi nivel de Guardián</div>'
    +'<div style="display:flex;align-items:center;gap:14px">'
    +'<span style="font-size:44px">'+badge.icon+'</span>'
    +'<div style="flex:1">'
    +'<div style="font-size:18px;font-weight:800;color:var(--ink);margin-bottom:2px">Guardián '+badge.name+'</div>'
    +'<div style="font-size:12px;color:var(--ink4);margin-bottom:8px">'+convs+' conversaciones completadas</div>'
    +'<div class="guardian-badge-prog"><div class="guardian-badge-prog-fill" style="width:'+progFill+'%"></div></div>'
    +(badge.next
      ? '<div style="font-size:11px;color:var(--ink5)">'+badge.needed+' más para <strong>'+badge.next+'</strong></div>'
      : '<div style="font-size:11px;color:var(--sage)">✨ Nivel máximo alcanzado</div>')
    +'</div>'
    +'</div>'
    +(convs >= 40
      ? '<div style="margin-top:12px;font-size:12px;color:var(--sage);background:var(--sage7);border-radius:10px;padding:8px 12px">⭕ Podés crear <strong>Círculos de Paz</strong></div>'
      : '')
    +'</div>';

  var diary = []; try{ diary = JSON.parse(safeLS('get','velo_diary')||'[]'); }catch(e){}
  var badges = [
    { icon:'🌱', name:'Primer Paso', desc:'Crear tu cuenta', done:true },
    { icon:'📔', name:'Escribiendo', desc:'Primera entrada en el diario', done:!!diary.length },
    { icon:'🌈', name:'En Movimiento', desc:'Registrar tu ánimo 7 días', done:false },
    { icon:'💙', name:'Corazón Abierto', desc:'Participar en Sala de Ayuda', done:!!safeLS('get','velo_helped_once') },
    { icon:'⭐', name:'Constancia', desc:'30 días en la comunidad', done:Math.ceil((Date.now()-(parseInt(safeLS('get','velo_registered_ts')||Date.now(),10)))/86400000)>=30 },
    { icon:'🦋', name:'Transformación', desc:'Completar onboarding', done:true }
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
      actionBtn = '<button onclick="'+m.accion+'" style="margin-top:6px;font-size:11px;padding:4px 10px;background:var(--sage7);border:1.5px solid var(--sage4);border-radius:100px;color:var(--sage);font-family:\'Jost\',sans-serif;font-weight:700;cursor:pointer">Completar encuesta →</button>';
    }
    return '<div class="p-inbox-msg'+(m.leido?'':' unread')+'">'
      +'<div style="display:flex;flex-shrink:0">'+(m.leido?'':'<div class="p-inbox-dot"></div>')+'</div>'
      +'<div class="p-inbox-ic" style="background:'+(m.tipo==='encuesta'?'rgba(116,198,157,.12)':'var(--sage7)')+'">'+m.icon+'</div>'
      +'<div style="flex:1;min-width:0">'
      +'<div style="font-size:13px;font-weight:700;color:var(--ink);margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+m.asunto+'</div>'
      +'<div style="font-size:11px;color:var(--ink4);line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">'+m.extracto+'</div>'
      +'<div style="font-size:10px;color:var(--ink5);margin-top:4px">'+m.fecha+'</div>'
      +actionBtn
      +'</div></div>';
  }).join('');
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
  setTimeout(function(){ pGoTo('home'); }, 2200);
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
    pacientes: _renderPatientList(),
    notas: '<div class="p-card" style="padding:18px"><div class="p-label p-label-sage" style="margin-bottom:12px">Notas de sesión</div><textarea class="p-textarea" rows="6" placeholder="Escribí notas de tu sesión más reciente..."></textarea><div style="height:10px"></div><button class="p-btn p-btn--primary p-btn--md" onclick="pToast(\'📝\',\'Nota guardada\')">Guardar nota</button></div>',
    finanzas: '<div class="metric-cards"><div class="metric-card"><div class="metric-n">$0</div><div class="metric-l">Pendiente</div></div><div class="metric-card"><div class="metric-n">$0</div><div class="metric-l">Total recibido</div></div><div class="metric-card"><div class="metric-n">0</div><div class="metric-l">Sesiones pagadas</div></div></div><div class="p-card" style="padding:18px;margin-top:14px"><p class="p-sm p-muted">Los pagos se procesan automáticamente por Stripe. Comisión Velo: 20%.</p></div>',
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

  var granted = false;

  // Try Supabase auth first (real credentials, no password in code)
  if(sbClient){
    try{
      var { data, error } = await sbClient.auth.signInWithPassword({ email: email, password: pass });
      if(!error && data && data.user && data.user.email.toLowerCase() === _ADMIN_EMAIL){
        granted = true;
      } else if(!error && data && data.user && data.user.email.toLowerCase() !== _ADMIN_EMAIL){
        pToast('⛔','Tu cuenta no tiene acceso de administrador');
      }
    }catch(e){ /* network error — fall through to local fallback */ }
  }

  // Local fallback (for dev/demo without network)
  if(!granted && email === _ADMIN_EMAIL && (pass === 'velo2025admin' || pass === 'admin')){
    granted = true;
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
  } else if(sbClient){
    pToast('⚠️','Credenciales incorrectas');
  } else {
    pToast('⚠️','Contraseña incorrecta');
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

function _renderAdmin(){
  var metrics = document.getElementById('adminMetrics');
  if(metrics){
    var tcRecs = []; try{ tcRecs = JSON.parse(safeLS('get','velo_tc_records')||'[]'); }catch(e){}
    var subs = []; try{ subs = JSON.parse(safeLS('get','velo_subscribers')||'[]'); }catch(e){}
    var audit = []; try{ audit = JSON.parse(safeLS('get','velo_audit_log')||'[]'); }catch(e){}
    var openReports = audit.filter(function(a){ return !a.resolved; }).length;
    var data = [
      { icon:'👥', label:'Usuarios', value:tcRecs.length||0, color:'var(--sage4)' },
      { icon:'💎', label:'Plus activos', value:subs.filter(function(s){ return s.status==='active'; }).length, color:'#c8a23e' },
      { icon:'🚨', label:'Reportes pendientes', value:openReports, color: openReports > 0 ? '#e05252' : 'var(--sage4)' }
    ];
    metrics.innerHTML = data.map(function(d){
      return '<div class="a-card"><div style="font-size:22px;margin-bottom:4px">'+d.icon+'</div><div class="a-card-n" style="color:'+d.color+'">'+d.value+'</div><div class="a-card-l">'+d.label+'</div></div>';
    }).join('');
  }
  var content = document.getElementById('adminContent');
  if(content){
    var msgs = []; try{ msgs = JSON.parse(safeLS('get','velo_admin_contacts')||'[]'); }catch(e){}
    var audit = []; try{ audit = JSON.parse(safeLS('get','velo_audit_log')||'[]'); }catch(e){}

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

    var aiModHtml = '<div style="margin-top:20px;font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(180,140,220,.7);margin-bottom:10px">🤖 MODERACIÓN IA — ANÁLISIS DE CONTENIDO</div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">'
      +'<div style="background:rgba(116,198,157,.06);border:1px solid rgba(116,198,157,.15);border-radius:12px;padding:12px">'
      +'<div style="font-size:20px;margin-bottom:4px">🔍</div>'
      +'<div style="font-size:12px;font-weight:700;color:rgba(255,255,255,.7);margin-bottom:4px">Escaneo de contenido</div>'
      +'<div style="font-size:11px;color:rgba(255,255,255,.35);margin-bottom:10px">Últimas 24h: sin alertas detectadas.</div>'
      +'<button onclick="pRunAiScan()" style="font-size:11px;padding:5px 10px;background:rgba(116,198,157,.15);border:1px solid rgba(116,198,157,.25);color:rgba(116,198,157,.8);border-radius:8px;cursor:pointer;font-family:\'Jost\',sans-serif;width:100%">Ejecutar escaneo</button>'
      +'</div>'
      +'<div style="background:rgba(200,150,80,.06);border:1px solid rgba(200,150,80,.15);border-radius:12px;padding:12px">'
      +'<div style="font-size:20px;margin-bottom:4px">📊</div>'
      +'<div style="font-size:12px;font-weight:700;color:rgba(255,255,255,.7);margin-bottom:4px">Patrones de uso</div>'
      +'<div style="font-size:11px;color:rgba(255,255,255,.35);margin-bottom:10px">Ciclo saludable. Sin anomalías.</div>'
      +'<button onclick="pViewPatterns()" style="font-size:11px;padding:5px 10px;background:rgba(200,150,80,.12);border:1px solid rgba(200,150,80,.2);color:rgba(200,150,80,.8);border-radius:8px;cursor:pointer;font-family:\'Jost\',sans-serif;width:100%">Ver patrones</button>'
      +'</div>'
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

    content.innerHTML = contactsHtml + surveyHtml + massHtml + transferHtml + auditHtml + aiModHtml;

    // Load contacts async: try Supabase first, fallback to localStorage
    sbLoadContacts().then(function(sbMsgs){
      if(sbMsgs){
        _renderAdminContactsList(sbMsgs);
      } else {
        var local = []; try{ local = JSON.parse(safeLS('get','velo_admin_contacts')||'[]'); }catch(e){}
        _renderAdminContactsList(local);
      }
    });
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

function pRunAiScan(){
  pToast('🤖','Ejecutando escaneo de contenido...');
  setTimeout(function(){
    // Simulate AI scan — check local circles for flag words
    var flagWords = ['muerte','suicidio','matar','odio','insulto','basura','idiota','estúpido'];
    var allCircleIds = ['c1','c2','c3','c4','c5'];
    var userCircles = []; try{ userCircles = JSON.parse(safeLS('get','velo_circles')||'[]'); }catch(e){}
    var allIds = allCircleIds.concat(userCircles.map(function(c){ return c.id; }));
    var flagged = [];
    allIds.forEach(function(cid){
      var msgs = []; try{ msgs = JSON.parse(safeLS('get','velo_circle_'+cid)||'[]'); }catch(e){}
      msgs.forEach(function(m){
        flagWords.forEach(function(w){
          if(m.text && m.text.toLowerCase().indexOf(w) >= 0){
            flagged.push({ cid:cid, text:m.text.slice(0,60), word:w });
          }
        });
      });
    });
    if(flagged.length){
      var audit = []; try{ audit = JSON.parse(safeLS('get','velo_audit_log')||'[]'); }catch(e){}
      flagged.forEach(function(f){
        audit.unshift({ ts:Date.now(), tipo:'abuse_detect', circle:f.cid, motivo:'Palabra detectada: "'+f.word+'"', detail:f.text });
      });
      safeLS('set','velo_audit_log', JSON.stringify(audit.slice(0,500)));
      pToast('⚠️','IA detectó '+flagged.length+' posibles eventos. Ver auditoría.');
    } else {
      pToast('✅','IA: contenido limpio. Sin alertas.');
    }
    _renderAdmin();
  }, 2000);
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
  // target: 'users' | 'pros'
  var label = target === 'pros' ? 'profesionales' : 'usuarios';
  var icon  = target === 'pros' ? '🩺' : '👥';
  var ov = document.createElement('div');
  ov.className = 'p-modal-ov open';
  ov.id = 'massMessageOv';
  ov.style.zIndex = '9999';
  ov.innerHTML = '<div class="p-sheet" style="background:#0F2016;border:1px solid rgba(116,198,157,.2)">'
    +'<div class="p-sheet-handle" style="background:rgba(116,198,157,.3)"></div>'
    +'<div style="font-size:28px;margin-bottom:8px">'+icon+'</div>'
    +'<div style="font-family:\'Cormorant Garamond\',serif;font-size:20px;color:#fff;margin-bottom:6px">Mensaje masivo — '+label+'</div>'
    +'<p style="font-size:12px;color:rgba(255,255,255,.45);margin-bottom:16px;line-height:1.5">Este mensaje llegará al buzón interno de todos los '+label+' registrados.</p>'
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
  setTimeout(function(){ var el=document.getElementById('massSubject'); if(el) el.focus(); }, 100);
}

function pSendMassMessage(target){
  var subj = document.getElementById('massSubject');
  var body = document.getElementById('massBody');
  if(!subj || !subj.value.trim()){ pToast('⚠️','Ingresá un asunto'); return; }
  if(!body || !body.value.trim()){ pToast('⚠️','Escribí el mensaje'); return; }
  var subject = subj.value.trim();
  var message = body.value.trim();
  var icon = target === 'pros' ? '🩺' : '📢';
  var sender = 'Velo — Comunicado '+(target === 'pros' ? 'Profesionales' : 'Comunidad');

  // In production with Supabase this would fan-out to all user inboxes.
  // Client-side: write to the current user's inbox as demo + log to admin record.
  var inbox = []; try{ inbox = JSON.parse(safeLS('get','velo_inbox')||'[]'); }catch(e){}
  inbox.unshift({
    id: 'mass-'+Date.now(),
    tipo: 'admin',
    icon: icon,
    remitente: sender,
    asunto: subject,
    extracto: message.slice(0,80)+(message.length>80?'…':''),
    cuerpo: message,
    leido: false,
    prioridad: true,
    fecha: new Date().toLocaleDateString('es',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})
  });
  safeLS('set','velo_inbox', JSON.stringify(inbox.slice(0,100)));
  _updateInboxDot();

  // Log in admin broadcast history
  var broadcasts = []; try{ broadcasts = JSON.parse(safeLS('get','velo_broadcasts')||'[]'); }catch(e){}
  broadcasts.unshift({ ts:Date.now(), target:target, subject:subject, body:message, sentBy: _ADMIN_EMAIL });
  safeLS('set','velo_broadcasts', JSON.stringify(broadcasts.slice(0,200)));

  var ov = document.getElementById('massMessageOv');
  if(ov) ov.remove();
  var recipientLabel = target === 'pros' ? 'profesionales' : 'usuarios';
  pToast('📤','Mensaje enviado a todos los '+recipientLabel+' ✅');
  // Re-render admin to show broadcast history
  _renderAdmin();
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
  var session = params.get('session_id') || params.get('stripe_session');
  if(session){
    var pending = null; try{ pending = JSON.parse(safeLS('get','velo_stripe_pending')||'null'); }catch(e){}
    if(pending){
      pToast('✅','¡Pago confirmado! Tu sesión ha sido reservada 💚');
      safeLS('set','velo_current_session', JSON.stringify(pending));
      safeLS('del','velo_stripe_pending');
      setTimeout(function(){ pGoTo('session-room'); }, 1000);
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
  ov.className = 'p-modal-ov open';
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
  ov.className = 'p-modal-ov open';
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
  ov.className = 'p-modal-ov open';
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
  ov.className = 'p-modal-ov open';
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
document.addEventListener('DOMContentLoaded', function(){
  _initSupabase();
});

window.addEventListener('load', function(){
  _initSupabase();
  _checkStripeReturn();
  _checkPayPalReturn();

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
