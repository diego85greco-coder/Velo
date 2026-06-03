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
var GEMINI_KEY    = ''; // key removed — use Vercel proxy only (set GEMINI_KEY in Vercel env vars)
var GEMINI_URLS   = [
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=',
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key='
];
var GEMINI_PROXY      = '/api/gemini';     // Gemini 2.5 Flash proxy (Google AI, grounding enabled)
var GROQ_PROXY        = '/api/groq';       // Groq proxy — llama-3.3-70b, same response shape as Gemini
var SEND_EMAIL_PROXY  = '/api/send-email'; // Vercel serverless proxy for thank-you emails
var _geminiUrlIdx = 0;

// ── COMMUNITY REAL-TIME STATE ─────────────────────────────────
var _sbHappy      = null;   // cached Supabase happy_posts
var _pendingHappyPost = null; // post just submitted, merged into render until Supabase confirms
var _sbHelp       = null;   // cached Supabase help_posts
var _sbBottles    = null;   // cached Supabase bottles
var _sbCircleMsgs = [];     // cached Supabase circle_messages
var _happyRtCh    = null;   // realtime channel happy_posts
var _helpRtCh     = null;   // realtime channel help_posts
var _bottleRtCh   = null;   // realtime channel bottles
var _circleRtCh   = null;   // realtime channel circle_messages
var _guardianRtCh = null;   // realtime channel guardian_presence
var _liveGuardians = [];    // cached live guardian rows from Supabase
var _grReqCh        = null;   // guardian_requests realtime channel (guardian side)
var _seekerGrCh     = null;   // guardian_requests realtime channel (seeker side)
var _seekerGrPollTmr= null;   // polling fallback for seeker waiting for guardian offer
var _grReqPollTmr   = null;   // polling fallback for guardian waiting for acceptance
var _helpChatRtCh   = null;   // realtime channel for help chat direct_messages
var _guardianWaitTimer = null; // 2-min timeout when user waits for help-post acceptance
var _seekerWaitTimer   = null; // 2-min timeout when user waits for direct guardian acceptance
var _pendingGuardianPost = null; // post object guardian clicked "Acompañar" on
var _pendingGuardianReqId = null; // ID of the guardian_request row sent (to cancel only that row)
var _dmRtCh      = null;   // realtime channel direct_messages (per-thread)
var _dmInboxCh   = null;   // realtime channel direct_messages (global inbox listener)
var _dmPollTmr   = null;   // polling fallback for global DM inbox
var _buzónRtCh   = null;   // realtime channel broadcasts (personal buzón alerts)
var _dmLastMsgId = null;   // last rendered DM message DB id (prevents flicker)
var _favsList     = null;   // cached favorites array (loaded lazily)
var _prevChatStatus = null; // status saved before entering any chat (restored on exit)
var _inActiveChat   = false; // true while user is in any live chat session
var _unameCache   = {};     // userId → @username string (no @ prefix stored)
function _uFill(uid, uname){ if(uid && uname) _unameCache[uid] = uname; }
function _uLook(uid){ return uid ? (_unameCache[uid]||'') : ''; }
function _uAt(uid){
  var u = _uLook(uid);
  return u ? '<span class="p-uname-tag">@'+_escHtml(u)+'</span>' : '';
}

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

// Extract text from Gemini-or-Groq-shaped response object
function _gText(json){
  try{
    var c = (json||{}).candidates;
    if(!c||!c[0]) return null;
    var p = ((c[0].content)||{}).parts;
    return (p&&p[0]&&typeof p[0].text==='string'&&p[0].text.trim()) ? p[0].text.trim() : null;
  }catch(e){ return null; }
}

async function _geminiCall(prompt, cfg){
  // 1. Gemini proxy
  try{
    var pr = await fetch(GEMINI_PROXY, { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ prompt:prompt, cfg:cfg||{} }) });
    if(pr.ok){ var t1 = _gText(await pr.json()); if(t1) return t1; }
    else { var e1={}; try{e1=await pr.json();}catch(x){} console.warn('[Velo] Gemini proxy',pr.status, e1.error||''); }
  }catch(e){ console.warn('[Velo] Gemini proxy fetch error:', e.message); }
  // 2. Groq proxy fallback (Llama 3.3-70b — returns Gemini-compatible shape)
  try{
    var gr = await fetch(GROQ_PROXY, { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ prompt:prompt, cfg:cfg||{} }) });
    if(gr.ok){ var t2 = _gText(await gr.json()); if(t2) return t2; }
  }catch(e){}
  // 3. Direct Gemini API (requires client-side key — likely empty in production)
  for(var attempt = 0; attempt < GEMINI_URLS.length; attempt++){
    var url = GEMINI_URLS[(_geminiUrlIdx + attempt) % GEMINI_URLS.length];
    try{
      var res = await fetch(url + GEMINI_KEY, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ contents:[{parts:[{text:prompt}]}],
          generationConfig: Object.assign({temperature:0.7,maxOutputTokens:300},cfg||{}) })
      });
      var t3 = _gText(await res.json());
      if(t3){ _geminiUrlIdx = (_geminiUrlIdx+attempt)%GEMINI_URLS.length; return t3; }
    }catch(e){ continue; }
  }
  return null;
}

// ── SUPABASE CONFIG ─────────────────────────────────────────
var SUPABASE_URL  = 'https://yuravtnjvvztsxdtggod.supabase.co';
var SUPABASE_ANON = 'sb_publishable_mBoqW2t3QoJvp5jFecEGgQ_1wrPiT9C';
var STRIPE_PK     = 'pk_live_51TXmCcV05dCjGGP2F9YnbPBIantFoxurCpISx86i0DFNFcmM2sovtp5LcV5tOVxI72V4AfgY8sK5GtJVTyYnnI1L00QwkGS6P4';
var PAYPAL_EMAIL  = 'wearevelo.app%40gmail.com';
var VELO_EMAIL    = 'consultas@heyvelo.app';
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
  var limits = { bottle:4, help:4, guardian:4 };
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
var _toastQueue = [];
var _toastBusy  = false;

function pToast(emoji, msg){
  var last = _toastQueue[_toastQueue.length-1];
  if(last && last.emoji === (emoji||'✓') && last.msg === (msg||'')) return;
  _toastQueue.push({ emoji: emoji || '✓', msg: msg || '' });
  if(!_toastBusy) _nextToast();
}

function _nextToast(){
  if(!_toastQueue.length){ _toastBusy = false; return; }
  _toastBusy = true;
  var item = _toastQueue.shift();
  var el = document.getElementById('pToast');
  var em = document.getElementById('pToastEmoji');
  var tx = document.getElementById('pToastMsg');
  if(!el){ _toastBusy = false; return; }
  if(em) em.textContent = item.emoji;
  if(tx) tx.textContent = item.msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function(){
    el.classList.remove('show');
    setTimeout(_nextToast, 300);
  }, 2000);
}
// Alias for compatibility
var toast = pToast;

// ── NAVIGATION STATE ─────────────────────────────────────────
var _curPage    = 'landing';
var _prevPage   = 'landing';
var _navToken   = 0; // incremented on every pGoTo — lets async renders bail if page changed
var _authenticated = false;
var _userType   = 'user'; // 'user' | 'pro' | 'admin'

var P_NO_NAV = ['landing','login','register','register-type','onboarding',
                'pro-reg','pro-onboarding','admin-login','pro-pending','verify-email','pick-username'];
var P_DARK   = ['help','bottle','respira'];
var P_FADE   = ['landing','onboarding','register-type','donation-exit',
                'session-room','post-chat','donate-cta','pro-pending','admin-login','calm-ai','guardian-chat','verify-email','pick-username'];

// ── NAVIGATE ─────────────────────────────────────────────────
function _trackPageView(id){
  try{
    var key = 'velo_page_views';
    var data = {}; try{ data = JSON.parse(safeLS('get', key)||'{}'); }catch(e){}
    data[id] = (data[id]||0) + 1;
    data.__total = (data.__total||0) + 1;
    data.__lastSeen = Date.now();
    safeLS('set', key, JSON.stringify(data));
    // Also fire Vercel Analytics custom event if available
    if(window.va) window.va('event', { name: 'page_view', properties: { page: id } });
  }catch(e){}
}

// Screens that should NOT be saved for reload-restore (auth flows, active chats, sensitive)
var _NO_RESTORE = ['landing','login','register','register-type','onboarding','pro-reg',
  'pro-onboarding','admin-login','admin','pro-pending','verify-email','pick-username',
  'change-password','guardian-chat','help-chat','session-room','post-chat','donate-cta'];

function pGoTo(id){
  if(!id) return;
  var inPage = document.getElementById('pg-'+id);
  if(!inPage){ console.warn('[Premium] page not found: pg-'+id); return; }

  // Deactivate current
  var outPage = document.getElementById('pg-'+_curPage);
  if(outPage){ outPage.classList.remove('active','fade-in'); }

  if(_curPage !== id) _prevPage = _curPage;
  _curPage = id;
  _navToken++;

  // Remember where the user is so a browser refresh restores this screen
  if(_authenticated && _NO_RESTORE.indexOf(id) < 0){
    try{ sessionStorage.setItem('velo_last_screen', id); }catch(e){}
  }

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
  _trackPageView(id);
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
function _syncBodyScroll(){
  var hasOpen = document.querySelector('.p-modal-ov.show');
  document.body.style.overflow   = hasOpen ? 'hidden' : '';
  document.body.style.touchAction = hasOpen ? 'none'   : '';
}
function openModal(id){
  var el = document.getElementById(id);
  if(!el) return;
  el.classList.add('show');
  _syncBodyScroll();
}
function closeModal(id){
  var el = document.getElementById(id);
  if(!el) return;
  el.classList.remove('show');
  _syncBodyScroll();
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

async function _sbSyncProfile(userId){
  _initSupabase();
  if(!sbClient || !userId) return;
  var res;
  try{
    res = await sbClient.from('profiles')
      .select('nombre,avatar,motto,role,status_music,status_book,status_phrase,status_film,username')
      .eq('id',userId).limit(1);
  }catch(e){ return; }

  if(res.error){
    // Query failed — don't overwrite Supabase with possibly-stale localStorage values
    return;
  }

  if(!res.data || !res.data.length){
    // No profile row yet — create a minimal one (let user fill in their name later)
    var curEmail = safeLS('get','velo_user_email') || '';
    if(curEmail){
      sbClient.from('profiles').upsert({
        id:userId, email:curEmail, role:'user',
        avatar: safeLS('get','velo_user_av')||'',
        motto:  safeLS('get','velo_user_motto')||''
      },{ onConflict:'id' }).catch(function(){});
    }
    return;
  }

  var p = res.data[0];
  if(p.nombre){
    var _email    = safeLS('get','velo_user_email') || '';
    var _emailPfx = _email.split('@')[0];
    var _localName = safeLS('get','velo_user_name') || '';
    // Detect auto-generated username patterns: no spaces + ends in 3+ digits OR matches email prefix
    var _looksAutoGen = (p.nombre === _emailPfx) ||
                        (p.nombre === _email) ||
                        /^[a-zA-Z0-9._-]+\d{3,}$/.test(p.nombre) ||
                        (p.nombre.indexOf(' ') < 0 && /^\w+\.\w+\d+$/.test(p.nombre));
    if(!_looksAutoGen){
      // Valid real name from Supabase — use it
      safeLS('set','velo_user_name', p.nombre);
    } else if(_localName && _localName !== _emailPfx && !(/^[a-zA-Z0-9._-]+\d{3,}$/.test(_localName))){
      // Supabase has a corrupted auto-name but localStorage has a valid name — repair Supabase silently
      sbClient.from('profiles').update({ nombre: _localName }).eq('id', userId).catch(function(){});
    }
  }
  if(p.avatar)        safeLS('set','velo_user_av',       p.avatar);
  if(p.motto)         safeLS('set','velo_user_motto',    p.motto);
  if(p.role)          safeLS('set','velo_user_type',     p.role);
  if(p.status_music)  safeLS('set','velo_status_music',  p.status_music);
  if(p.status_book)   safeLS('set','velo_status_book',   p.status_book);
  if(p.status_phrase) safeLS('set','velo_status_phrase', p.status_phrase);
  if(p.status_film)   safeLS('set','velo_status_film',   p.status_film);
  if(p.username)      safeLS('set','velo_username',       p.username);
  if(p.username)      _uFill(userId, p.username);
  if(p.role === 'plus'){
    sbClient.from('profiles').select('plus_expires_at').eq('id',userId).limit(1)
      .then(function(r2){
        if(r2.data && r2.data[0] && r2.data[0].plus_expires_at &&
           new Date(r2.data[0].plus_expires_at).getTime() < Date.now()){
          safeLS('del','velo_plan');
          safeLS('set','velo_user_type','user');
          sbClient.from('profiles').update({ role:'user' }).eq('id',userId).catch(function(){});
        } else {
          safeLS('set','velo_plan','plus');
        }
      }).catch(function(){ safeLS('set','velo_plan','plus'); });
  }
  // Check if new people have added us as favorite → show badge on star
  sbClient.from('user_favorites').select('id',{count:'exact',head:true}).eq('fav_id', userId)
    .then(function(fr){
      var newTotal = fr.count || 0;
      var prevCount = parseInt(safeLS('get','velo_fav_me_count')||'-1', 10);
      safeLS('set','velo_fav_me_count', String(newTotal));
      // Only show badge if count INCREASED vs last known value.
      // If this is the first session after localStorage clear (prevCount === -1),
      // auto-mark all as seen so stale favorites don't trigger a notification.
      if(prevCount === -1 || newTotal <= prevCount){
        safeLS('set','velo_fav_me_seen', String(newTotal));
      }
      _updateFavBadge();
    }).catch(function(){});
  // Restore guardian bio/tags/status from guardian_presence
  sbClient.from('guardian_presence').select('bio,tags,is_guardian,status').eq('user_id', userId).limit(1)
    .then(function(gr){
      if(gr.data && gr.data[0]){
        if(gr.data[0].bio)  safeLS('set','velo_guardian_bio', gr.data[0].bio);
        if(gr.data[0].tags) safeLS('set','velo_guardian_tags', Array.isArray(gr.data[0].tags) ? gr.data[0].tags.join(', ') : gr.data[0].tags);
        if(gr.data[0].is_guardian === true){
          safeLS('set','velo_is_guardian','true');
          if(gr.data[0].status && gr.data[0].status !== 'offline'){
            // Never restore incognito on session start — always wake up as disponible
            var restoredStatus = gr.data[0].status === 'incognito' ? 'disponible' : gr.data[0].status;
            safeLS('set','velo_guardian_status', restoredStatus);
            safeLS('set','velo_user_status', restoredStatus);
            _myGuardianStatus = restoredStatus;
          }
          setTimeout(_startGuardianReqListener, 300);
          // Re-render only when DB confirms ON — never override a manual toggle the user made after this query was sent
          _renderHomeStatusToggle();
        }
      }
    }).catch(function(){});
  // Refresh all UI with synced data
  var hn = document.getElementById('homeUserName');
  if(hn) hn.textContent = p.nombre || safeLS('get','velo_user_name') || '';
  _updateSidebarUser();
  _updateTopbarMoodBadge();
  pLoadProfile();
}

async function _ensureSbSession(){
  if(!sbClient) return false;
  try{
    var {data:sd} = await sbClient.auth.getSession();
    if(sd && sd.session){
      if(sd.session.user && sd.session.user.id){
        if(!safeLS('get','velo_user_id')){
          safeLS('set','velo_user_id', sd.session.user.id);
          _sbSyncProfile(sd.session.user.id);
        }
      }
      return true;
    }
    var email = safeLS('get','velo_user_email');
    var pass  = safeLS('get','velo_sb_pass');
    if(!email || !pass) return false;
    var {data:rd, error} = await sbClient.auth.signInWithPassword({email:email, password:pass});
    if(!error && rd && rd.user && rd.user.id) safeLS('set','velo_user_id', rd.user.id);
    return !error;
  }catch(e){ return false; }
}

// ── SUPABASE COMMUNITY HELPERS ────────────────────────────────
async function _sbLoad(table, qFn){
  _initSupabase();
  if(!sbClient) return null;
  try{
    var q = sbClient.from(table).select('*');
    if(qFn) q = qFn(q);
    var res = await q;
    if(res.error){ console.error('[_sbLoad] '+table+':', res.error.message, res.error); return null; }
    if(!res.data) return null;
    return res.data;
  }catch(e){ console.error('[_sbLoad catch] '+table+':', e); return null; }
}

function _sbSub(channelName, table, callback){
  _initSupabase();
  if(!sbClient) return null;
  try{
    var ch = sbClient.channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: table }, callback)
      .subscribe();
    return ch;
  }catch(e){ return null; }
}

function _sbUnsub(ch){
  if(ch && sbClient){ try{ sbClient.removeChannel(ch); }catch(e){} }
}

function _sbHappyRow(r){
  return { id:r.id, userId:r.user_id||'anon', av:r.user_av||'',
    name:r.anon?'Usuario Anónimo':(r.user_name||'Usuario'),
    anon:!!r.anon,
    emoji:r.emoji||'☀️', text:r.text||'', photo:r.photo||null, ts:new Date(r.created_at).getTime(),
    reactions:r.reactions||{'💛':0,'🌸':0,'🤗':0,'🌿':0,'✨':0}, comments:r.comments||[] };
}
function _sbHelpRow(r){
  return { id:r.id, emoji:r.emoji||'💙', anon:r.anon, name:r.anon?'Usuario Anónimo':(r.user_name||'Usuario'),
    av:r.anon?'':(r.user_av||''),
    userId:r.user_id||'', time:new Date(r.created_at).getTime(), preview:r.preview, taken:r.taken,
    closed:r.closed||false, urgencia:r.urgencia||'normal', isSB:true };
}
function _sbBottleRow(r){
  return { id:r.id, mood:r.mood||'💭', text:r.text, color:r.color||'rgba(116,198,157,.12)',
    userId:r.user_id||'', userName:r.user_name||'', userAv:r.user_av||'',
    anon: r.anon !== false, // default anon unless explicitly false
    ts:new Date(r.created_at).getTime(), isSB:true };
}
function _sbCircleMsgRow(r){
  var myId = safeLS('get','velo_user_id')||safeLS('get','velo_user_email')||'';
  return { id:String(r.id), sbId:r.id, userId:r.user_id||'', av:r.user_av||'🌿', name:r.user_name||'Usuario',
    text:r.text||'', ts:new Date(r.created_at).getTime(), own:r.user_id===myId, type:r.type||'text', reactions:r.reactions||{} };
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
  if(!_botGuardCheck()) return;

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
      _recordTC(name, email, 'TOS-v1');
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
        _clearSession();
        safeLS('set','velo_user_email', email);
        safeLS('set','velo_user_name', email.split('@')[0]);
        safeLS('set','velo_session','1');
        safeLS('set','velo_needs_pw_change','1');
        _authenticated = true;
        pToast('🔑','Ingresaste con contraseña provisional. Por favor cambiá tu contraseña.');
        setTimeout(function(){ pGoTo('change-password'); }, 900);
      } else {
        pToast('⚠️', result.error.message || 'Credenciales incorrectas. ¿Olvidaste tu contraseña?');
      }
    } else {
      _clearSession(); // fresh slate — no leftover data from a previous account
      safeLS('set','velo_user_email', email);
      safeLS('set','velo_sb_pass', pass);
      safeLS('set','velo_user_name', email.split('@')[0]);
      safeLS('set','velo_session','1');
      if(result.data && result.data.user && result.data.user.id){
        var uid = result.data.user.id;
        safeLS('set','velo_user_id', uid);
        // Await profile sync so name/avatar/status are restored before home renders
        await _sbSyncProfile(uid);
      }
      _authenticated = true;
      _startGuardianHeartbeat();
      setTimeout(_startGlobalDMListener, 2500);
      setTimeout(_startBuzónListener, 3000);
      setTimeout(_syncFavsFromSupabase, 3500);
      await _loginAndGo();
    }
  }catch(e){
    pToast('⚠️','Error de conexión');
  } finally {
    if(btn) btn.disabled = false;
    if(btnTxt) btnTxt.textContent = 'Ingresar';
  }
}

// Clears every session-scoped key so no data leaks between accounts (user ↔ admin ↔ pro)
function _clearSession(){
  ['velo_session','velo_admin_session','velo_user_email','velo_user_name','velo_user_id',
   'velo_user_type','velo_user_av','velo_user_motto','velo_sb_pass','velo_plan',
   'velo_status_music','velo_status_book','velo_status_phrase','velo_status_film','velo_pro_id','velo_pro_name',
   'velo_pro_spec','velo_pro_solidarity','velo_pro_approved','velo_is_guardian',
   'velo_guardian_bio','velo_guardian_tags','velo_guardian_setup_done','velo_needs_pw_change','velo_username'
  ].forEach(function(k){ safeLS('del', k); });
  // Stop guardian heartbeat and clear all RT channel refs so the next login can resubscribe
  _stopGuardianHeartbeat();
  _stopGuardianReqListener();
  [_guardianRtCh, _helpRtCh, _bottleRtCh, _happyRtCh, _circleRtCh, _dmRtCh, _dmInboxCh,
   _grReqCh, _seekerGrCh, _gcRtCh, _gcSeekerCh, _buzónRtCh, _helpChatRtCh].forEach(function(ch){ _sbUnsub(ch); });
  _guardianRtCh = null; _helpRtCh = null; _bottleRtCh = null; _happyRtCh = null;
  _circleRtCh = null; _dmRtCh = null; _dmInboxCh = null;
  _grReqCh = null; _seekerGrCh = null; _gcRtCh = null; _gcSeekerCh = null;
  _buzónRtCh = null; _helpChatRtCh = null;
  if(_seekerGrPollTmr){ clearInterval(_seekerGrPollTmr); _seekerGrPollTmr = null; }
  if(_grReqPollTmr){ clearInterval(_grReqPollTmr); _grReqPollTmr = null; }
  if(_dmPollTmr){ clearInterval(_dmPollTmr); _dmPollTmr = null; }
  // Clear per-user DM acceptance flags so they don't leak to the next session
  try{
    Object.keys(localStorage).filter(function(k){ return k.startsWith('velo_dm_accepted_'); })
      .forEach(function(k){ localStorage.removeItem(k); });
  }catch(e){}
  _favsList = null; // reset favorites cache
}

async function pSignOut(){
  // Mark guardian offline before clearing session data
  if(safeLS('get','velo_is_guardian') === 'true') await _updateGuardianPresence('offline');
  if(sbClient){ try{ await sbClient.auth.signOut(); }catch(e){} }
  _clearSession();
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

function pToggleFaq(btn){
  var a = btn.nextElementSibling;
  var isOpen = a.classList.contains('faq-open');
  document.querySelectorAll('.land-faq-a.faq-open').forEach(function(el){ el.classList.remove('faq-open'); });
  document.querySelectorAll('.land-faq-q.faq-open').forEach(function(el){ el.classList.remove('faq-open'); });
  if(!isOpen){ a.classList.add('faq-open'); btn.classList.add('faq-open'); }
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
    try{ await sbClient.auth.resetPasswordForEmail(val, {redirectTo: window.location.origin + '/app-premium.html'}); }catch(e){}
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
    if(msg) msg.value = 'No recibí el correo de recuperación y necesito acceder a mi cuenta.';
    // Pre-fill contact email with the forgot-password email if available
    var contactEmailEl = document.getElementById('contactEmail');
    if(contactEmailEl && val && !contactEmailEl.readOnly){ contactEmailEl.value = val; }
    // Pre-fill name if empty
    var contactNameEl = document.getElementById('contactName');
    if(contactNameEl && !contactNameEl.value) contactNameEl.value = val.split('@')[0];
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

async function _loginAndGo(){
  if(safeLS('get','velo_needs_pw_change') === '1'){ pGoTo('change-password'); return; }
  var type = safeLS('get','velo_user_type') || 'user';
  _userType = type;
  _trackVisitDay(); // Record today as an app visit (for Bronze badge)
  setTimeout(_pullVisitCountFromSB, 2500); // Sync count from Supabase after login
  if(type === 'admin'){
    pGoTo('admin');
  } else if(type === 'pro'){
    var approved = safeLS('get','velo_pro_approved');
    pGoTo(approved ? 'pro-panel' : 'pro-pending');
  } else {
    // Check for @username — redirect to picker if missing (new or existing users)
    var _uname = safeLS('get','velo_username') || '';
    var _unameQueryOk = true; // false if DB query itself errors (column missing, etc.)
    if(!_uname){
      _initSupabase();
      var _uid = safeLS('get','velo_user_id');
      if(sbClient && _uid){
        try{
          var _ur = await sbClient.from('profiles').select('username').eq('id',_uid).limit(1);
          if(_ur.error){
            // Column may not exist yet (SQL migration pending) — don't block login
            console.warn('[_loginAndGo] username query error (migration pending?):', _ur.error.message);
            _unameQueryOk = false;
          } else if(_ur.data && _ur.data[0] && _ur.data[0].username){
            safeLS('set','velo_username', _ur.data[0].username);
            _uname = _ur.data[0].username;
          }
        }catch(e){
          console.warn('[_loginAndGo] username fetch failed:', e);
          _unameQueryOk = false;
        }
      }
    }
    if(!_uname && _unameQueryOk){
      // Only redirect to picker if the page actually exists in the DOM
      // (guards against browser cache serving old HTML without pg-pick-username)
      if(document.getElementById('pg-pick-username')){
        pGoTo('pick-username');
        return;
      }
      // Page not in DOM → fall through to home (user can set username from profile)
    }
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

// ── TURNSTILE ──────────────────────────────────────────────────
async function _verifyTurnstile(widgetId){
  // Get token from the widget (Turnstile sets a hidden input)
  var token = '';
  var inputs = document.querySelectorAll('[name="cf-turnstile-response"]');
  // If multiple widgets, pick the one from the active form
  inputs.forEach(function(inp){
    if(!token && inp.value) token = inp.value;
  });
  if(!token){
    pToast('🛡️','Completá la verificación de seguridad antes de continuar.');
    return false;
  }
  try{
    var r = await fetch('/api/verify-turnstile', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ token: token })
    });
    var data = await r.json();
    if(!data.success){
      pToast('🛡️','Verificación de seguridad fallida. Intentá de nuevo.');
      // Reset all widgets so user can retry
      if(window.turnstile) window.turnstile.reset();
      return false;
    }
    return true;
  }catch(e){
    // Network error — allow through (fail open) so genuine users aren't blocked
    return true;
  }
}

// ── BOT PROTECTION ─────────────────────────────────────────────
var _botGuard = { openedAt:0, interacted:false };

function _botGuardInit(){
  _botGuard.openedAt   = Date.now();
  _botGuard.interacted = false;
}

// Call once at app start — tracks any real human gesture globally
function _botGuardStartListeners(){
  var mark = function(){ _botGuard.interacted = true; };
  ['mousemove','mousedown','keydown','touchstart','touchmove'].forEach(function(ev){
    document.addEventListener(ev, mark, { once:true, passive:true });
  });
}

// Returns null if human, or a reason string if bot-like
function _botGuardCheck(){
  // 1. Honeypot — any content means a bot filled the hidden field
  var hp = document.getElementById('_vhp') || document.getElementById('_vhp2');
  if(hp && hp.value){ _botGuardBlock('honeypot'); return false; }

  // 2. Headless browser fingerprint
  if(navigator.webdriver){ _botGuardBlock('headless'); return false; }
  if(typeof navigator.plugins !== 'undefined' && navigator.plugins.length === 0
     && !/firefox/i.test(navigator.userAgent)){ _botGuardBlock('no-plugins'); return false; }

  // 3. Submitted too fast (< 2.5s since form opened)
  var elapsed = Date.now() - _botGuard.openedAt;
  if(_botGuard.openedAt && elapsed < 2500){ _botGuardBlock('too-fast:'+elapsed+'ms'); return false; }

  // 4. No real human interaction detected
  if(!_botGuard.interacted){ _botGuardBlock('no-interaction'); return false; }

  // 5. Client-side rate limit: max 4 attempts per hour
  var now = Date.now();
  var attempts = [];
  try{ attempts = JSON.parse(safeLS('get','velo_reg_attempts')||'[]'); }catch(e){}
  attempts = attempts.filter(function(t){ return now - t < 3600000; });
  if(attempts.length >= 4){
    pToast('⏳','Demasiados intentos. Esperá unos minutos e intentá de nuevo.');
    return false;
  }
  attempts.push(now);
  safeLS('set','velo_reg_attempts', JSON.stringify(attempts));
  return true;
}

function _botGuardBlock(reason){
  // Log silently — don't reveal why to the bot
  _initSupabase();
  if(sbClient){
    sbClient.from('bot_attempts').insert({
      reason: reason, ua: navigator.userAgent.slice(0,200), ts: new Date().toISOString()
    }).then(function(){}).catch(function(){});
  }
  pToast('🛡️','Verificación de seguridad fallida. Intentá de nuevo.');
}

// ── TC RECORD ─────────────────────────────────────────────────
async function _fetchClientIP(){
  try{
    var r = await fetch('https://api.ipify.org?format=json');
    var j = await r.json();
    return j.ip || '';
  }catch(e){ return ''; }
}

async function _recordTC(name, email, version){
  version = version || 'TOS-v1';
  var now = new Date();
  var ip  = await _fetchClientIP();
  var recs = []; try{ recs = JSON.parse(safeLS('get','velo_tc_records')||'[]'); }catch(e){}
  recs.unshift({
    name:      name,
    email:     email,
    timestamp: now.toISOString(),
    ts_ms:     now.getTime(),
    ip:        ip || '(no disponible)',
    ua:        navigator.userAgent.slice(0,120),
    version:   version
  });
  safeLS('set','velo_tc_records', JSON.stringify(recs.slice(0,500)));
  if(!safeLS('get','velo_registered_ts')){
    safeLS('set','velo_registered_ts', String(now.getTime()));
  }
  _initSupabase();
  if(sbClient){
    try{
      sbClient.from('terms_acceptance').insert({
        email:       email,
        nombre:      name,
        rol:         safeLS('get','velo_user_type')||'user',
        accepted_at: now.toISOString(),
        version:     version,
        ip_hint:     ip || navigator.language||''
      }).then(function(){}).catch(function(){});
    }catch(e){}
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
  _checkMonthlyMoodReport(); // runs only if today is day 1 and not sent yet
  var d = new Date();
  var h = d.getHours();
  var greet = (h < 6 || h >= 20) ? 'Buenas noches' : h < 12 ? 'Buenos días' : 'Buenas tardes';
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
    var _gs = _gBtnStyle(isOn);
    gBtn.style.background  = _gs.bg;
    gBtn.style.borderColor = _gs.border;
    gBtn.style.color       = _gs.color;
    gBtn.textContent       = isOn ? '🛡️ Activado' : '🛡️ Actívame';
  }
  // Update label
  var gLabel = gWrap ? gWrap.querySelector('span') : null;
  if(gLabel) gLabel.textContent = isOn ? 'Activo' : 'Activarme';

  // Availability status toggle
  _renderHomeStatusToggle();

  // Today's mood
  _loadTodayMoodHome();
  _updateHomeCurrentMoodLine();
  _updateTopbarMoodBadge();
  _updateSidebarUser();
  _renderPersonalizedSuggestions();
  _updateHomeBell();
  // Hero entrance animation — retriggers on every navigation to home
  var _ha = document.querySelector('#pg-home .r-hero-v2');
  if(_ha){ _ha.classList.remove('r-greeting-anim'); void _ha.offsetHeight; setTimeout(function(){ _ha.classList.add('r-greeting-anim'); }, 80); }
  // Daily quote in home header (Gemini, cached per day)
  setTimeout(_loadDailyMotivationalQuote, 200);
}

function _updateHomeBell(){
  var msgs = []; try{ msgs = JSON.parse(safeLS('get','velo_inbox')||'[]'); }catch(e){}
  var unread = msgs.filter(function(m){ return !m.leido && !safeLS('get','velo_read_'+m.id); }).length;
  var label  = unread > 9 ? '9+' : String(unread);
  // Home bell badge
  var bell = document.getElementById('homeBellBadge');
  if(bell){ bell.style.display = unread > 0 ? 'block' : 'none'; bell.textContent = label; }
  // Home buzón card badge
  var buzón = document.getElementById('homeBuzónBadge');
  if(buzón){ buzón.style.display = unread > 0 ? 'block' : 'none'; buzón.textContent = label; }
  // Topbar mail button badge
  var mail = document.getElementById('homeMailBadge');
  if(mail){ mail.style.display = unread > 0 ? 'block' : 'none'; mail.textContent = label; }
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
  sbSaveMoodEntry(today, _selectedQuickMoodEmoji, labels[_selectedQuickMoodEmoji]||'', phrase.trim());
  // Update UI
  var moodLine = document.getElementById('homeCurrentMoodLine');
  if(moodLine) moodLine.textContent = _selectedQuickMoodEmoji + ' ' + (labels[_selectedQuickMoodEmoji]||'') + (phrase.trim() ? ' — ' + phrase.trim() : '');
  pCloseQuickMood();
  _updateTopbarMoodBadge();
  pToast(_selectedQuickMoodEmoji, 'Estado de ánimo guardado 💚');
}

// ── MI ESTADO VISIBLE ──────────────────────────────────────────
function pOpenMyStatus(){
  // Navigate to profile section and scroll to the estado card
  pGoTo('profile');
  setTimeout(function(){
    var el = document.getElementById('profileStatusCard');
    if(el) el.scrollIntoView({ behavior:'smooth', block:'start' });
  }, 350);
}

function pSaveMyStatus(){
  // Legacy — now handled by pSaveProfileStatus in the profile section
  closeModal('myStatusOv');
  pSaveProfileStatus();
}

// ── DAILY MOTIVATIONAL QUOTE (home, below greeting) ────────────
// Each entry: { text, author }
var _dailyQuoteFallbacks = [
  { text: 'La vida es lo que pasa mientras estás ocupado haciendo otros planes.', author: 'John Lennon' },
  { text: 'El futuro pertenece a quienes creen en la belleza de sus sueños.', author: 'Eleanor Roosevelt' },
  { text: 'Caer siete veces y levantarse ocho.', author: 'Proverbio japonés' },
  { text: 'Sé el cambio que quieres ver en el mundo.', author: 'Mahatma Gandhi' },
  { text: 'La felicidad no es algo hecho. Viene de tus propias acciones.', author: 'Dalai Lama' },
  { text: 'El éxito es ir de fracaso en fracaso sin perder el entusiasmo.', author: 'Winston Churchill' },
  { text: 'No llores porque terminó, sonríe porque sucedió.', author: 'Gabriel García Márquez' },
  { text: 'Nunca es demasiado tarde para ser lo que podrías haber sido.', author: 'George Eliot' },
  { text: 'Haz lo que puedas, con lo que tengas, donde estés.', author: 'Theodore Roosevelt' },
  { text: 'El único modo de hacer un gran trabajo es amar lo que haces.', author: 'Steve Jobs' },
  { text: 'Lo que no te mata te hace más fuerte.', author: 'Friedrich Nietzsche' },
  { text: 'El secreto de salir adelante es empezar.', author: 'Mark Twain' },
  { text: 'La imaginación es más importante que el conocimiento.', author: 'Albert Einstein' },
  { text: 'Sé tú mismo; los demás puestos ya están ocupados.', author: 'Oscar Wilde' },
  { text: 'No hay viento favorable para el barco que no sabe adónde va.', author: 'Séneca' },
  { text: 'La esperanza es el sueño del hombre despierto.', author: 'Aristóteles' },
  { text: 'Nuestros sueños se pueden hacer realidad si tenemos el coraje de perseguirlos.', author: 'Walt Disney' },
  { text: 'En el corazón de cada invierno hay una primavera que tiembla.', author: 'Khalil Gibran' },
  { text: 'Solo en la oscuridad puedes ver las estrellas.', author: 'Martin Luther King Jr.' },
  { text: 'La peor soledad es no estar cómodo con uno mismo.', author: 'Mark Twain' },
  { text: 'Si puedes soñarlo, puedes hacerlo.', author: 'Walt Disney' },
  { text: 'Todo lo que se puede imaginar es real.', author: 'Pablo Picasso' },
  { text: 'La creatividad es la inteligencia divirtiéndose.', author: 'Albert Einstein' },
  { text: 'Siempre parece imposible hasta que se hace.', author: 'Nelson Mandela' },
  { text: 'No cuentes los días, haz que los días cuenten.', author: 'Muhammad Ali' },
  { text: 'Cuando la vida te da razones para llorar, muéstrale que tienes mil razones para reír.', author: 'Paulo Coelho' },
  { text: 'La belleza de vivir está en atreverse a vivirla plenamente.', author: 'Frida Kahlo' },
  { text: 'Al final, lo que importa no son los años de vida, sino la vida en esos años.', author: 'Abraham Lincoln' },
  { text: 'El coraje es resistencia al miedo, dominio del miedo, no ausencia del miedo.', author: 'Mark Twain' },
  { text: 'Que tu vida sea la respuesta a tus oraciones.', author: 'Proverbio sufí' },
  { text: 'Apunta a la luna. Aunque falles, aterrizarás entre las estrellas.', author: 'Les Brown' },
  { text: 'No hay nada imposible para un corazón valiente.', author: 'Juana de Arco' },
  { text: 'Vive como si fueras a morir mañana. Aprende como si fueras a vivir para siempre.', author: 'Mahatma Gandhi' },
  { text: 'La gratitud convierte lo que tenemos en suficiente.', author: 'Melody Beattie' },
  { text: 'La gentileza es el idioma que el sordo puede oír y el ciego puede ver.', author: 'Mark Twain' },
  { text: 'Siempre parece imposible hasta que se hace.', author: 'Nelson Mandela' },
  { text: 'Cada día es una segunda oportunidad.', author: 'Proverbio popular' },
  { text: 'Donde hay voluntad, hay un camino.', author: 'Proverbio inglés' },
  { text: 'Dios nunca cierra una puerta sin abrir una ventana.', author: 'Papa Francisco' },
  { text: 'La paz no es solo ausencia de guerra; es una virtud, un estado mental.', author: 'Baruch Spinoza' },
  { text: 'El amor soporta todo, cree todo, espera todo, aguanta todo.', author: '1 Corintios 13:7' },
  { text: 'No temas, porque yo estoy contigo.', author: 'Isaías 41:10' },
  { text: 'Ser feliz no significa que todo sea perfecto. Significa que decidiste ver más allá de las imperfecciones.', author: 'Gerard Way' },
  { text: 'La música puede cambiar el mundo porque puede cambiar a las personas.', author: 'Bono' },
  { text: 'Nunca camines por el camino trazado, pues te llevará solo a donde otros ya han ido.', author: 'Alexander Graham Bell' },
  { text: 'No importa cuántas veces caes, sino cuántas te levantas.', author: 'Vince Lombardi' },
  { text: 'Lo que el sol es para las flores, eres tú para mí.', author: 'Proverbio' },
  { text: 'Eres tú quien decide qué tipo de persona ser hoy.', author: 'Viktor Frankl' },
  { text: 'Nadie puede hacerte sentir inferior sin tu consentimiento.', author: 'Eleanor Roosevelt' },
  { text: 'El sufrimiento que no te mata te hace más sabio y más fuerte.', author: 'Jorge Bucay' },
  { text: 'Trata a los demás como quieras que te traten a ti.', author: 'Regla de oro universal' }
];

async function _loadDailyMotivationalQuote(){
  var textEl   = document.getElementById('homeDailyQuoteText');
  var authorEl = document.getElementById('homeDailyQuoteAuthor');
  if(!textEl) return;
  // Use LOCAL date so quote rotates at local midnight, not UTC midnight
  var _d0 = new Date();
  var today = _d0.getFullYear()+'-'+String(_d0.getMonth()+1).padStart(2,'0')+'-'+String(_d0.getDate()).padStart(2,'0');
  var cacheKey = 'velo_dq3_'+today; // v3 prefix forces regeneration if stale cache exists

  // Load history first — needed for dedup check and avoid clause
  var history = [];
  try{ history = JSON.parse(safeLS('get','velo_quote_history')||'[]'); }catch(e){}
  // Only look at PREVIOUS days (not today's entry) to avoid false positives on re-load
  var prevHistory = history.filter(function(q){ return q.date !== today; });
  var prevTexts   = prevHistory.slice(0,7).map(function(q){ return q.text; }).filter(Boolean);
  var prevAuthors = prevHistory.slice(0,14).map(function(q){ return q.author; }).filter(Boolean);

  var cached = safeLS('get', cacheKey);
  if(cached){
    try{
      var obj = JSON.parse(cached);
      // If this exact quote appeared in the last 7 days → delete cache, regenerate
      if(obj.text && prevTexts.indexOf(obj.text) !== -1){
        safeLS('del', cacheKey);
      } else {
        textEl.textContent   = obj.text   || cached;
        if(authorEl) authorEl.textContent = obj.author ? '— ' + obj.author : '';
        return;
      }
    }catch(e){ textEl.textContent = cached; return; }
  }

  // Show loading skeleton while Gemini generates the quote
  textEl.style.opacity = '.45';
  textEl.textContent = 'Cargando frase del día...';
  if(authorEl) authorEl.textContent = '✨ Velo IA';

  var d = new Date();
  var dias = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  var avoidClause = prevAuthors.length
    ? 'NO uses ninguno de estos autores que ya se mostraron recientemente: '+prevAuthors.join(', ')+'. '
    : '';
  // Also send recent quote texts so Gemini doesn't repeat word-for-word
  var avoidTextClause = prevTexts.length
    ? 'NO repitas estas frases que ya aparecieron recientemente: '+prevTexts.map(function(t){ return '"'+t.slice(0,35)+'..."'; }).join('; ')+'. '
    : '';
  // Pick a random source category each day using date as seed (forces variety)
  var _cats = [
    'un filósofo griego o estoico (Epicteto, Marco Aurelio, Sócrates, Platón, Aristóteles)',
    'un escritor o poeta latinoamericano (Pablo Neruda, Gabriel García Márquez, Octavio Paz, Borges, Isabel Allende, Mario Benedetti)',
    'un líder espiritual o religioso (Papa Francisco, Dalai Lama, Francisco de Asís, Martin Luther King Jr., Madre Teresa)',
    'un científico, inventor o explorador (Marie Curie, Stephen Hawking, Carl Sagan, Leonardo da Vinci, Nikola Tesla)',
    'un artista, músico o cantante (Frida Kahlo, Pablo Picasso, Beethoven, Bob Marley, Shakira, Mercedes Sosa)',
    'un personaje de libro o película inspiradora (El Principito, El Alquimista de Paulo Coelho, Mufasa en El Rey León, Gandalf, Dumbledore)',
    'un empresario, emprendedor o deportista (Muhammad Ali, Serena Williams, Roger Federer, Steve Jobs, Elon Musk)',
    'un proverbio sabio de cultura africana, árabe, china, japonesa o indígena latinoamericana',
    'un poeta o escritor universal (Rainer Maria Rilke, Walt Whitman, Emily Dickinson, Khalil Gibran, Antoine de Saint-Exupéry)',
    'un líder histórico o activista de derechos humanos (Nelson Mandela, Eleanor Roosevelt, Simón Bolívar, Sor Juana, Rosa Parks)',
    'una frase bíblica o de texto sagrado que sea de esperanza, amor o fortaleza',
    'un psicólogo o autor de autoayuda (Viktor Frankl, Brené Brown, Wayne Dyer, Jorge Bucay, Louise Hay)'
  ];
  var _catIdx = (d.getDate() * 7 + d.getMonth() * 31 + d.getFullYear()) % _cats.length;
  var _chosenCat = _cats[_catIdx];
  var prompt = 'Dame UNA frase célebre, inspiradora y positiva de '+_chosenCat+'. '
    +'Hoy es '+dias[d.getDay()]+' '+d.getDate()+'/'+(d.getMonth()+1)+'/'+d.getFullYear()+'. '
    +avoidClause+avoidTextClause
    +'La frase debe transmitir esperanza, ánimo, superación, amor, bienestar, alegría o logro. '
    +'Que sea una frase REAL y conocida, no inventada. Traducida al español si es en otro idioma. '
    +'Entre 10 y 35 palabras. '
    +'Devolvé SOLO un objeto JSON sin markdown: {"text":"frase en español","author":"Nombre completo del autor o fuente"}.';

  var raw = await _geminiCall(prompt, { temperature:0.92, maxOutputTokens:120 });
  var quote = null;
  if(raw){
    try{
      var jsonMatch = raw.match(/\{[\s\S]*"text"[\s\S]*"author"[\s\S]*\}/);
      if(jsonMatch) quote = JSON.parse(jsonMatch[0]);
    }catch(e){}
  }
  // Fallback if Gemini failed or returned a duplicate
  if(!quote || !quote.text || !quote.author || prevTexts.indexOf(quote.text) !== -1){
    var idx = (d.getDate() - 1 + d.getMonth() * 31 + d.getFullYear()) % _dailyQuoteFallbacks.length;
    quote = _dailyQuoteFallbacks[idx];
    // If that fallback is also a recent duplicate, use the next one
    if(prevTexts.indexOf(quote.text) !== -1){
      quote = _dailyQuoteFallbacks[(idx + 1) % _dailyQuoteFallbacks.length];
    }
  }

  // Save to history (keep last 30 days)
  history.unshift({ text: quote.text, author: quote.author, date: today });
  safeLS('set', 'velo_quote_history', JSON.stringify(history.slice(0,30)));

  safeLS('set', cacheKey, JSON.stringify(quote));
  textEl.style.opacity = '';
  textEl.textContent   = quote.text;
  if(authorEl) authorEl.textContent = '— ' + quote.author;
}

function _updateTopbarMoodBadge(){
  var emojiEl = document.getElementById('topbarMoodEmoji');
  if(!emojiEl) return;
  var today = _dateKey();
  var stored = safeLS('get','velo_mood_'+today);
  var emoji = '🤗';
  if(stored){ try{ var m=JSON.parse(stored); if(m.emoji) emoji=m.emoji; }catch(e){} }
  emojiEl.textContent = emoji;
  var sidebarEmoji = document.getElementById('sidebarMoodEmoji');
  if(sidebarEmoji) sidebarEmoji.textContent = emoji;
  var streak = 0;
  var d = new Date();
  for(var i=0;i<90;i++){
    var k = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    if(safeLS('get','velo_mood_'+k)) streak++;
    else if(i>0) break;
    d.setDate(d.getDate()-1);
  }
  var streakEl = document.getElementById('topbarMoodStreak');
  var streakNumEl = document.getElementById('topbarMoodStreakNum');
  if(streakEl){ streakEl.style.display = streak>=2 ? '' : 'none'; }
  if(streakNumEl) streakNumEl.textContent = streak;
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
      var moodText = m.emoji + ' ' + (labels[m.emoji]||m.label||'') + (m.note ? ' — '+m.note.slice(0,40) : '');
      // Mood registered — plain text, no blinking pill
      el.style.animation = 'none';
      el.style.background = 'transparent';
      el.style.border = 'none';
      el.style.padding = '0';
      el.style.color = 'var(--ink4)';
      el.style.fontSize = '12px';
      el.style.fontWeight = '500';
      el.style.borderRadius = '0';
      el.textContent = moodText;
      return;
    }catch(e){}
  }
  // Not registered yet — show animated pill
  el.style.cssText = 'display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:600;color:var(--sage2);background:linear-gradient(135deg,rgba(116,198,157,.18),rgba(183,228,199,.25));border:1px solid rgba(116,198,157,.35);border-radius:100px;padding:4px 10px;animation:p-breathe 3s ease-in-out infinite';
  el.textContent = '🌷 ¿Cómo te sentís hoy?';
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
  if(safeLS('get','velo_user_type') === 'plus') return true;
  if(safeLS('get','velo_plan') === 'plus') return true;
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

// ── VISIT DAY TRACKING ──────────────────────────────────────────
// Records each unique calendar day the user opens the app (for Bronze badge)
function _localDateStr(){
  var d = new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}

// Push current visit count to Supabase profiles.visit_day_count (fire-and-forget)
function _pushVisitCountToSB(count){
  _initSupabase();
  var uid = _myUserId();
  if(!sbClient || !uid || uid === 'guest') return;
  sbClient.from('profiles').update({ visit_day_count: count }).eq('id', uid)
    .then(function(){}).catch(function(){}); // silent — column may not exist yet
}

// On boot: read visit_day_count from Supabase and take the maximum with local count.
// This restores count on new devices or after localStorage is cleared.
async function _pullVisitCountFromSB(){
  _initSupabase();
  var uid = _myUserId();
  if(!sbClient || !uid || uid === 'guest') return;
  try{
    var r = await sbClient.from('profiles').select('visit_day_count').eq('id', uid).maybeSingle();
    if(r.error || !r.data) return;
    var sbCount = parseInt(r.data.visit_day_count || 0, 10);
    if(sbCount > 0){
      safeLS('set','velo_visit_day_count_sb', String(sbCount));
      // Push local if local days > Supabase (so Supabase always has the highest)
      var localCount = _getVisitDayCount();
      if(localCount > sbCount) _pushVisitCountToSB(localCount);
    }
    // Always refresh the UI so both devices show the same number
    _updateHomeStreak();
  }catch(e){} // Column may not exist yet — ignore
}

function _updateHomeStreak(){
  var el = document.getElementById('homeStatStreak');
  if(el) el.textContent = _getVisitDayCount();
  var pEl = document.getElementById('profileDays');
  if(pEl) pEl.textContent = Math.max(1, _getVisitDayCount());
}

function _trackVisitDay(){
  var today = _localDateStr();
  var days = []; try{ days = JSON.parse(safeLS('get','velo_visit_days')||'[]'); }catch(e){}
  if(days.indexOf(today) < 0){
    days.push(today);
    safeLS('set','velo_visit_days', JSON.stringify(days));
    // Delay push so _pullVisitCountFromSB (runs at 2500ms) can set the SB baseline first.
    // _getVisitDayCount() then returns Math.max(local, sbCount) — never overwrites a higher SB value.
    setTimeout(function(){
      _pushVisitCountToSB(_getVisitDayCount());
    }, 3200);
  }
}

function _getVisitDayCount(){
  var days = []; try{ days = JSON.parse(safeLS('get','velo_visit_days')||'[]'); }catch(e){}
  var sbCount = parseInt(safeLS('get','velo_visit_day_count_sb')||'0', 10);
  return Math.max(days.length, sbCount);
}
// Returns the number of CONSECUTIVE days ending on today (or yesterday if not yet visited today)
function _getConsecutiveStreak(){
  var days = []; try{ days = JSON.parse(safeLS('get','velo_visit_days')||'[]'); }catch(e){}
  if(!days.length) return 0;
  // Sort descending
  days.sort(function(a,b){ return a < b ? 1 : a > b ? -1 : 0; });
  var today = _localDateStr();
  var d = new Date(); d.setHours(12,0,0,0);
  var yesterday = new Date(d); yesterday.setDate(d.getDate()-1);
  var yesterdayStr = yesterday.getFullYear()+'-'+String(yesterday.getMonth()+1).padStart(2,'0')+'-'+String(yesterday.getDate()).padStart(2,'0');
  // Streak must start from today or yesterday (if user hasn't visited yet today, keep streak alive)
  if(days[0] !== today && days[0] !== yesterdayStr) return 1;
  var streak = 1;
  for(var i = 1; i < days.length; i++){
    var prev = new Date(days[i-1]+'T12:00:00');
    var curr = new Date(days[i]+'T12:00:00');
    var diff = Math.round((prev - curr) / 86400000);
    if(diff === 1){ streak++; } else { break; }
  }
  return streak;
}

// ── GUARDIAN DATA ─────────────────────────────────────────────
// Guardianes = usuarios de la comunidad que se ofrecen a acompañar a otros.
// Nivel Bronce: 5 días distintos de uso de la app.
// Niveles superiores: número de conversaciones completadas.
function _getBadge(convs){
  var visitDays = _getVisitDayCount();
  if(convs >= 100) return { icon:'💎', name:'Diamante', color:'#7B68EE', next:null,        needed:0,           visitBased:false };
  if(convs >= 40)  return { icon:'🥇', name:'Oro',      color:'#C8A200', next:'Diamante',  needed:100-convs,   visitBased:false };
  if(convs >= 20)  return { icon:'🥈', name:'Plata',    color:'#8892A4', next:'Oro',        needed:40-convs,    visitBased:false };
  if(visitDays >= 5) return { icon:'🥉', name:'Bronce', color:'#C07840', next:'Plata',      needed:20-convs,    visitBased:false };
  // Not yet Bronze: show days needed
  return { icon:'🌱', name:'Novato', color:'var(--sage4)', next:'Bronce', needed:5-visitDays, visitBased:true, visitDays:visitDays };
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

// The user's general availability (disponible/ocupado). Guardians may also be 'incognito'.
function _presenceStatus(){
  if(safeLS('get','velo_is_guardian') === 'true') return safeLS('get','velo_guardian_status') || 'disponible';
  return safeLS('get','velo_user_status') || 'disponible';
}

// Upserts the current user's presence row. Used for ALL logged-in users, not just guardians.
async function _updateGuardianPresence(status){
  _initSupabase();
  if(!sbClient) return;
  var uid = _myUserId ? _myUserId() : (safeLS('get','velo_user_email')||'guest');
  if(!uid || uid === 'guest') return;
  var isG  = safeLS('get','velo_is_guardian') === 'true';
  var name = safeLS('get','velo_user_name') || 'Usuario';
  // Don't store base64/http avatars in guardian_presence — huge rows slow down the list for everyone
  // The real photo is read from profiles table when opening someone's profile card
  var _rawAv = safeLS('get','velo_user_av') || (isG ? '💚' : '🧑');
  var av = (_rawAv.startsWith('data:') || _rawAv.startsWith('http')) ? (isG ? '💚' : '🧑') : _rawAv;
  var st   = status || _presenceStatus();
  var row  = { user_id: uid, name: name, avatar: av, is_guardian: isG,
    status: st, last_seen: new Date().toISOString() };
  if(isG){
    row.bio = safeLS('get','velo_guardian_bio') || '';
    var tagsRaw = safeLS('get','velo_guardian_tags') || '';
    row.tags = tagsRaw ? tagsRaw.split(',').map(function(t){ return t.trim(); }).filter(Boolean) : [];
    row.convs = parseInt(safeLS('get','velo_guardian_convs')||'0', 10);
    row.rating = 5.0;
  }
  try{
    var _upRes = await sbClient.from('guardian_presence').upsert(row, { onConflict: 'user_id' });
    if(_upRes && _upRes.error) console.error('[presence upsert]', _upRes.error.message, _upRes.error);
  }catch(e){ console.error('[presence upsert catch]', e); }
}

// ── PRESENCE CACHE (online dots everywhere) ────────────────────
var _presenceCache = {};
async function _refreshPresenceCache(){
  _initSupabase();
  if(!sbClient) return;
  try{
    var cutoff = new Date(Date.now() - 10*60*1000).toISOString();
    var res = await sbClient.from('guardian_presence').select('user_id,status,last_seen').gte('last_seen', cutoff);
    var fresh = {};
    (res.data||[]).forEach(function(r){ fresh[r.user_id] = { status:r.status, last_seen:r.last_seen }; });
    _presenceCache = fresh;
  }catch(e){}
}
function _presenceInfo(userId){
  var p = userId ? _presenceCache[userId] : null;
  if(p && p.last_seen && (Date.now() - new Date(p.last_seen).getTime()) < 5*60*1000 && p.status !== 'offline'){
    if(p.status === 'ocupado') return { color:'#E0A92E', label:'Ocupado/a', on:true };
    return { color:'#5BBF87', label:'En línea', on:true };
  }
  return { color:'rgba(150,150,150,.45)', label:'Desconectado', on:false };
}
// Returns a small presence-dot HTML span. Empty string when no userId (anonymous).
function _presenceDot(userId, size){
  if(!userId) return '';
  var s = size || 9;
  var info = _presenceInfo(userId);
  return '<span title="'+info.label+'" style="display:inline-block;width:'+s+'px;height:'+s+'px;border-radius:50%;background:'+info.color+';border:1.5px solid #fff;box-shadow:0 0 3px rgba(0,0,0,.25);flex-shrink:0"></span>';
}

// Universal presence heartbeat — runs for every logged-in user, not only guardians.
function _startGuardianHeartbeat(){
  _startGuardianReqListener();
  if(_guardianHeartbeatTimer) return;
  var beat = function(){
    _updateGuardianPresence(_inActiveChat ? 'ocupado' : _presenceStatus());
    _refreshPresenceCache();
    if(_curCircle){
      var _cmId = safeLS('get','velo_user_id') || safeLS('get','velo_user_email') || '';
      if(_cmId && sbClient){
        sbClient.from('circle_members').upsert({circle_id:_curCircle.id, user_id:_cmId, last_seen:new Date().toISOString()},
          {onConflict:'circle_id,user_id'}).then(function(){}).catch(function(){});
      }
    }
  };
  beat();
  // Re-render home pill on first beat — by the time the boot heartbeat fires (+2s),
  // the async guardian_presence DB sync has almost always completed, so this
  // corrects any stale pill render from the 100ms _loadHomeData() call.
  _renderHomeStatusToggle();
  _guardianHeartbeatTimer = setInterval(beat, 60000);
}

function _stopGuardianHeartbeat(){
  if(_guardianHeartbeatTimer){ clearInterval(_guardianHeartbeatTimer); _guardianHeartbeatTimer = null; }
  _stopGuardianReqListener();
}

function pHomeToggleGuardian(){
  var wasOn = safeLS('get','velo_is_guardian') === 'true';
  if(!wasOn){
    // Show setup modal on the first activation of each day
    var today = new Date().toISOString().slice(0,10);
    var lastDay = safeLS('get','velo_guardian_setup_day') || '';
    if(lastDay !== today){
      safeLS('set','velo_guardian_setup_day', today);
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
      var _gs = _gBtnStyle(isOn);
      gBtn.style.background  = _gs.bg;
      gBtn.style.borderColor = _gs.border;
      gBtn.style.color       = _gs.color;
      gBtn.textContent       = isOn ? '🛡️ Activado' : '🛡️ Actívame';
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
  // Mark setup as done so the modal never appears again (even if bio was left blank)
  safeLS('set','velo_guardian_setup_done', '1');
  var existing = document.getElementById('guardianSetupOv');
  if(existing) existing.remove();
  // Activate guardian mode (sets localStorage + upserts presence with is_guardian:true)
  pToggleGuardianMode();
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
    // Always reset to disponible when activating — clears any stuck incognito state
    safeLS('set','velo_guardian_status','disponible');
    _myGuardianStatus = 'disponible';
    _startGuardianHeartbeat();
    _startGuardianReqListener();
    _updateGuardianPresence('disponible');
    pToast('🛡️','¡Aparecés como guardián disponible!');
  } else {
    // Stop heartbeat fully so re-activation can start fresh (clears timer + listener)
    _stopGuardianHeartbeat();
    _updateGuardianPresence();
    pToast('👤','Ya no aparecés en la lista de guardianes');
  }
  // Rebuild the home-page status pill immediately so the toggle reflects the new state
  _renderHomeStatusToggle();
  _renderMyStatusBar();
  pRenderGuardians();
  // Fallback re-render after a tick — covers edge cases where the DOM wasn't ready on first call
  setTimeout(_renderHomeStatusToggle, 50);
}

function pSaveGuardianBio(){
  var bioEl  = document.getElementById('guardianBioInput');
  var tagsEl = document.getElementById('guardianTagsInput');
  var saveBtn = document.querySelector('#guardianModeDetails .p-btn--primary');
  if(bioEl)  safeLS('set','velo_guardian_bio',  bioEl.value.trim());
  if(tagsEl) safeLS('set','velo_guardian_tags', tagsEl.value.trim());
  if(safeLS('get','velo_is_guardian') === 'true') _updateGuardianPresence('disponible');
  if(saveBtn){ var orig = saveBtn.textContent; saveBtn.textContent = '✅ Guardado'; setTimeout(function(){ saveBtn.textContent = orig; }, 2000); }
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
  if(status !== 'incognito') safeLS('set','velo_user_status', status);
  _updateGuardianPresence(status);
  pRenderGuardians();
  _renderMyStatusBar();
  _renderHomeStatusToggle();
  pToast(status==='disponible'?'🟢':status==='ocupado'?'🟡':'👤', 'Estado: '+(status==='disponible'?'Disponible':status==='ocupado'?'Ocupado':'Anónimo'));
}

// Home availability toggle (Disponible / Ocupado) — shown below the greeting
function pSetUserStatus(status){
  safeLS('set','velo_user_status', status);
  var isGuardian = safeLS('get','velo_is_guardian') === 'true';
  if(isGuardian){
    safeLS('set','velo_guardian_status', status);
    _myGuardianStatus = status;
    if(status === 'ocupado'){
      pToast('🟡','Aparecés como guardián ocupado. Desmarcá para volver a disponible.');
    } else {
      pToast('🟢','Volviste a estar disponible como guardián.');
    }
    if(document.getElementById('myGuardianStatus')) _renderMyStatusBar();
  } else {
    pToast(status==='ocupado'?'🟡':'🟢', status==='ocupado'?'Te marcaste como ocupado/a':'Estás disponible');
  }
  _updateGuardianPresence(status);
  _renderHomeStatusToggle();
}


function _gBtnStyle(isOn){
  var dark = document.body.classList.contains('r-dark');
  return {
    bg:     isOn ? 'rgba(116,198,157,.18)' : (dark ? 'rgba(255,255,255,.07)'  : 'rgba(255,255,255,.55)'),
    border: isOn ? 'rgba(116,198,157,.48)' : (dark ? 'rgba(255,255,255,.22)'  : 'rgba(27,94,58,.22)'),
    color:  isOn ? (dark ? 'rgba(116,198,157,.95)' : 'var(--sage2)') : (dark ? 'rgba(255,255,255,.70)' : 'var(--ink3)')
  };
}
function _renderHomeStatusToggle(){
  var el = document.getElementById('homeGuardianWrap');
  if(!el) return;
  var isGuardian = safeLS('get','velo_is_guardian') === 'true';
  var lbl = '<span style="font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;display:block;text-align:center;margin-top:4px">';
  el.innerHTML =
    '<div style="display:flex;flex-direction:column;align-items:center">'
    +'<button class="r-status-pill r-gmode-btn'+(isGuardian?' r-gmode-btn--on':'')+'" onclick="pToggleGuardianMode()">'
    +(isGuardian?'<span style="font-size:14px">✅</span>':'<span style="font-size:14px">🛡️</span>')
    +'<span>Modo Guardián</span>'
    +'</button>'
    +lbl+'<span style="color:'+(isGuardian?'rgba(34,197,94,.80)':'rgba(200,158,56,.75)')+'">'+(isGuardian?'ACTIVO':'ACTIVAR')+'</span></span>'
    +'</div>';
}

function _renderMyStatusBar(){
  var el = document.getElementById('myGuardianStatus');
  if(!el) return;
  var st = _myGuardianStatus;
  el.innerHTML = '<div style="background:rgba(255,255,255,.7);border:1.5px solid var(--border);border-radius:14px;padding:12px 16px;display:flex;align-items:center;gap:12px">'
    +'<div style="font-size:11px;font-weight:700;color:var(--ink2);letter-spacing:.5px">MI ESTADO</div>'
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
  var _tok = _navToken;
  _renderMyStatusBar();
  var list = document.getElementById('guardiansList');
  if(!list) return;
  _renderFavWidget('guardiansFavWidget');
  // Load guardian stats
  _loadGuardianStats();
  // Try to load live guardians from Supabase
  var liveGuardians = [];
  _initSupabase();
  if(sbClient){
    try{
      var cutoff = new Date(Date.now() - 10*60*1000).toISOString(); // active in last 10 min
      var myId = _myUserId();
      var { data, error: gpErr } = await sbClient.from('guardian_presence')
        .select('*').neq('status','offline').gte('last_seen', cutoff);
      if(_navToken !== _tok) return;
      if(gpErr) console.error('[pRenderGuardians] query error:', gpErr.message, gpErr);
      if(data && data.length){
        var filtered0 = data
          .filter(function(r){ return r.user_id !== myId; })
          .filter(function(r){ return r.is_guardian !== false; });
        // Fetch usernames from profiles for all visible guardians
        var gIds = filtered0.map(function(r){ return r.user_id; });
        var uMap = {};
        try{
          var uRes = await sbClient.from('profiles').select('id,username').in('id', gIds);
          if(uRes.data) uRes.data.forEach(function(p){ if(p.id && p.username){ uMap[p.id] = p.username; _uFill(p.id, p.username); } });
        }catch(e){}
        liveGuardians = filtered0.map(function(r){
          return { id: 'live_'+r.user_id, name: r.name, av: r.avatar, bio: r.bio||'',
            tags: Array.isArray(r.tags)?r.tags:[], status: r.status,
            convs: r.convs||0, rating: r.rating||5.0, reviews:[], recommend: r.convs||0,
            username: uMap[r.user_id] || '' };
        });
        _liveGuardians = liveGuardians;
        if(typeof syncHeroStats === 'function') syncHeroStats();
      }
    }catch(e){}
  }

  // Only real live guardians — no fake fallback profiles
  var combined = liveGuardians;
  var filtered = combined.filter(function(g){
    if(_guardianFilter === 'disponible') return g.status === 'disponible';
    if(_guardianFilter === 'ocupado') return g.status === 'ocupado';
    return true;
  });
  var selfBanner = '';
  if(safeLS('get','velo_is_guardian') === 'true'){
    selfBanner = '<div style="background:rgba(116,198,157,.18);border:1.5px solid rgba(116,198,157,.45);border-radius:14px;padding:11px 14px;margin-bottom:12px;display:flex;align-items:center;gap:10px">'
      +'<span style="font-size:20px">🟢</span>'
      +'<div style="font-size:12.5px;color:var(--ink);font-weight:600;line-height:1.45">Estás visible como guardián. Las solicitudes de acompañamiento te llegarán acá.</div>'
      +'</div>';
  }
  if(_navToken !== _tok) return;
  if(!filtered.length){
    var emptyMsg = _guardianFilter !== 'todos'
      ? '<div class="p-empty"><span class="p-empty-emoji">🛡️</span><div class="p-empty-title">Ningún guardián en este estado</div><div class="p-empty-sub">Probá con "Todos"</div></div>'
      : '<div class="p-empty"><span class="p-empty-emoji">🛡️</span><div class="p-empty-title">No hay guardianes conectados ahora</div><div class="p-empty-sub">¡Sé el primero! Activá tu estado como Disponible arriba para aparecer aquí.</div></div>';
    list.innerHTML = selfBanner + emptyMsg;
    return;
  }
  list.innerHTML = selfBanner + filtered.map(function(g){
    var badge = _getBadge(g.convs||0);
    var gVerified = (badge.name==='Plata'||badge.name==='Oro'||badge.name==='Diamante');
    var statusColor = g.status==='disponible'?'var(--st-on)':g.status==='ocupado'?'#C8A200':'rgba(150,150,150,.5)';
    var statusLabel = g.status==='disponible'?'Disponible':g.status==='ocupado'?'Ocupado':'Anónimo';
    var isAnon = g.status==='incognito';
    var rawId = g.id.replace('live_','');
    var isFav = !isAnon && pIsFav(rawId);
    var gVbadge = gVerified && !isAnon ? '<span class="velo-verified" title="Verificado — Plata o superior">✓</span>' : '';
    var gVavBadge = gVerified && !isAnon ? '<span style="position:absolute;bottom:-2px;left:-2px;width:14px;height:14px;border-radius:50%;background:#1d9bf0;border:2px solid var(--bg-main,#fff);color:#fff;font-size:8px;font-weight:900;display:flex;align-items:center;justify-content:center;z-index:2;line-height:1">✓</span>' : '';
    var gUsername = (!isAnon && g.username) ? ('<div class="gc-username">@'+_escHtml(g.username)+'</div>') : '';
    return '<div class="p-guardian-card" onclick="'+(isAnon?'pToast(\'👤\',\'Este guardián está en modo anónimo\')':'pOpenGuardian(\''+g.id+'\')')+'"><div style="display:flex;align-items:center;gap:14px"><div style="position:relative;font-size:38px;flex-shrink:0">'+(isAnon?'👤':g.av)+'<span style="position:absolute;bottom:-2px;right:-2px;width:12px;height:12px;border-radius:50%;background:'+statusColor+';border:2px solid #fff;box-shadow:0 0 4px '+statusColor+'"></span>'+gVavBadge+'</div><div style="flex:1;min-width:0"><div style="display:flex;align-items:center;gap:6px;margin-bottom:2px"><span style="font-size:15px;font-weight:700;color:var(--ink);line-height:1.2">'+(isAnon?'Guardián Anónimo':_escHtml(g.name||'—'))+'</span>'+gVbadge+'<span style="font-size:14px">'+badge.icon+'</span></div>'+gUsername+'<div style="font-size:12px;color:var(--sage3);font-weight:600;margin-bottom:4px">'+statusLabel+' · '+g.convs+' conversaciones</div><p style="font-size:12px;color:var(--ink4);line-height:1.5;margin:0">'+(isAnon?'Disponible de forma anónima':_escHtml(g.bio||''))+'</p></div>'
      +'<div style="display:flex;gap:6px;align-items:center">'
      +(!isAnon ? '<button onclick="event.stopPropagation();'+(isFav?'pRemoveFav':'pAddFav')+'('+_jsAttr(rawId)+','+_jsAttr(g.name)+','+_jsAttr(g.av||'🌿')+');pRenderGuardians()" style="padding:6px 8px;background:'+(isFav?'rgba(255,200,50,.18)':'rgba(255,200,50,.07)')+';border:1px solid rgba(255,200,50,'+(isFav?'.4':'.2')+');border-radius:10px;font-size:15px;cursor:pointer" title="'+(isFav?'Quitar favorito':'Guardar favorito')+'">'+(isFav?'⭐':'☆')+'</button>' : '')
      +'<button class="p-btn p-btn--primary p-btn--sm" onclick="event.stopPropagation();'+(g.status==='ocupado'?'pToast(\'🟡\','+_jsAttr(g.name+' está ocupado/a ahora')+')':'pOpenGuardian('+_jsAttr(g.id)+')')+'">'+(g.status==='ocupado'?'Ocupado/a':'Solicitar')+'</button>'
      +'</div></div></div>';
  }).join('');
}

function pOpenGuardian(id){
  _curGuardian = _liveGuardians.find(function(g){ return g.id === id; })
    || _guardianProfiles.find(function(g){ return g.id === id; });
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
  var _isDark = document.body.classList.contains('r-dark');
  var badgeHtml = '<div style="display:flex;align-items:center;gap:10px;background:'+(_isDark?'rgba(255,255,255,.07)':'rgba(255,255,255,.7)')+';border:1px solid '+(_isDark?'rgba(116,198,157,.18)':'rgba(0,0,0,.07)')+';border-radius:14px;padding:12px 16px;margin-bottom:14px">'
    +'<span style="font-size:28px">'+badge.icon+'</span>'
    +'<div style="flex:1;min-width:0">'
    +'<div style="font-size:13px;font-weight:700;color:var(--ink)">Guardián '+badge.name+'</div>'
    +'<div style="font-size:11px;color:var(--ink4);margin-bottom:6px">'+g.convs+' conversaciones completadas</div>'
    +'<div style="height:5px;background:'+(_isDark?'rgba(255,255,255,.12)':'var(--cream2)')+';border-radius:99px;overflow:hidden">'
    +'<div style="height:100%;width:'+tierPct+'%;background:'+badge.color+';border-radius:99px;transition:width .6s"></div>'
    +'</div>'
    +(badge.next ? '<div style="font-size:10px;color:var(--ink5);margin-top:4px">'+badge.needed+' conversaciones para '+badge.next+'</div>' : '<div style="font-size:10px;color:var(--ink5);margin-top:4px">Nivel máximo ✨</div>')
    +'</div></div>';
  var badgeEl = document.getElementById('gdBadge');
  if(badgeEl) badgeEl.innerHTML = badgeHtml;
  var stPill = document.getElementById('gdStatusPill');
  if(stPill){
    if(g.status === 'disponible'){
      stPill.innerHTML = '<span class="p-pill p-pill--live"><span class="p-ldot p-ldot--on"></span> Disponible</span>';
    } else if(g.status === 'ocupado'){
      stPill.innerHTML = '<span class="p-pill" style="background:rgba(212,128,32,.1);color:var(--st-busy);border:1px solid rgba(212,128,32,.2)">⏳ Ocupado/a</span>';
    } else {
      stPill.innerHTML = '<span class="p-pill" style="background:rgba(144,152,160,.1);color:var(--st-off)">● Descansando</span>';
    }
  }
  var tagsEl = document.getElementById('gdMoodTags');
  if(tagsEl) tagsEl.innerHTML = g.tags.map(function(t){ return '<span class="p-tag">'+t+'</span>'; }).join('');
  var askBtn = document.getElementById('gdAskBtn');
  if(askBtn){
    if(g.status === 'ocupado'){
      askBtn.disabled = true;
      askBtn.textContent = '⏳ Ocupado/a ahora';
    } else {
      askBtn.disabled = false;
      askBtn.innerHTML = '💚 Pedir acompañamiento';
    }
  }
  var rvEl = document.getElementById('gdReviews');
  if(rvEl) rvEl.innerHTML = '<p class="p-sm p-muted">Cargando reseñas…</p>';
  var favBtn = document.getElementById('gdFavBtn');
  if(favBtn){
    var gUidFav = (g.id||'').replace('live_','');
    var isFavNow = gUidFav ? pIsFav(gUidFav) : false;
    favBtn.textContent = isFavNow ? '⭐' : '☆';
    favBtn.style.background = isFavNow ? 'rgba(255,200,50,.25)' : 'rgba(255,200,50,.15)';
  }
  pGoTo('guardian-detail');
  // Load reviews + profile status data from Supabase
  (function(){
    var gUid = (g.id||'').replace('live_','');
    var myId = _myUserId();

    // Clear cultural status while loading
    var csEl = document.getElementById('gdCulturalStatus');
    var csCard = document.getElementById('gdCulturalCard');
    if(csEl) csEl.innerHTML = '';
    if(csCard) csCard.style.display = 'none';

    _loadUserReviews(gUid).then(function(revs){
      var el = document.getElementById('gdReviews');
      if(!el) return;
      if(!revs.length){ el.innerHTML = '<p class="p-sm p-muted">Sin reseñas aún.</p>'; return; }
      el.innerHTML = _renderReviewsList(revs, myId, gUid);
    });

    // Load cultural status (music, book, film, phrase) from profiles table
    // Only attempt if gUid looks like a UUID (36-char hex)
    _initSupabase();
    if(sbClient && gUid && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(gUid)){
      sbClient.from('profiles')
        .select('status_music,status_book,status_phrase,status_film')
        .eq('id', gUid).limit(1)
        .then(function(res){
          if(!res || !res.data || !res.data[0]) return;
          var p = res.data[0];
          var items = [
            p.status_music  ? '<div style="display:flex;align-items:baseline;gap:6px;font-size:13px;color:var(--ink3);line-height:1.5"><span style="min-width:18px">🎵</span><span>'+_escHtml(p.status_music)+'</span></div>'  : '',
            p.status_film   ? '<div style="display:flex;align-items:baseline;gap:6px;font-size:13px;color:var(--ink3);line-height:1.5"><span style="min-width:18px">🎬</span><span>'+_escHtml(p.status_film)+'</span></div>'   : '',
            p.status_book   ? '<div style="display:flex;align-items:baseline;gap:6px;font-size:13px;color:var(--ink3);line-height:1.5"><span style="min-width:18px">📖</span><span>'+_escHtml(p.status_book)+'</span></div>'   : '',
            p.status_phrase ? '<div style="display:flex;align-items:baseline;gap:6px;font-size:13px;color:var(--ink3);line-height:1.5"><span style="min-width:18px">💬</span><span style="font-style:italic">'+_escHtml(p.status_phrase)+'</span></div>' : ''
          ].filter(Boolean);
          if(items.length && csEl && csCard){
            csEl.innerHTML = items.join('<div style="height:7px"></div>');
            csCard.style.display = '';
          }
        }).catch(function(){});
    }
  })();
}

function pAskGuardian(){
  if(!_curGuardian) return;
  if(_curGuardian.status === 'ocupado'){ pToast('⏳',_curGuardian.name+' está ocupado/a ahora'); return; }
  // Open the request modal
  var ov = document.getElementById('askGuardianOv');
  var lbl = document.getElementById('askGuardianName');
  if(lbl) lbl.textContent = _curGuardian.name;
  var ta = document.getElementById('askGuardianTa');
  if(ta) ta.value = '';
  if(ov) ov.classList.add('show');
}

async function pConfirmAskGuardian(){
  var guardian = _curGuardian;
  if(!guardian){ pToast('⚠️','Seleccioná un guardián'); return; }
  if(!_checkDailyLimit('guardian')){
    var ov2 = document.getElementById('askGuardianOv');
    if(ov2) ov2.classList.remove('show');
    pShowDailyLimitModal('guardian');
    return;
  }
  var ctxTa = document.getElementById('askGuardianTa');
  var context = ctxTa ? ctxTa.value.trim() : '';
  var ov = document.getElementById('askGuardianOv');
  if(ov) ov.classList.remove('show');
  _initSupabase();
  var myId = _myUserId();
  var guardianUid = (guardian.id||'').replace('live_','');
  if(!sbClient || !myId || myId==='guest' || !guardianUid){
    pToast('⚠️','No se pudo enviar la solicitud. Revisá tu conexión.');
    return;
  }
  _incDailyLimit('guardian');
  var reqId = 'gd'+Date.now();
  var myName = safeLS('get','velo_user_name')||'Usuario';
  var myAv   = safeLS('get','velo_user_av')||'🧑';
  var reqPayload = {
    id: reqId, kind:'direct', status:'pending',
    seeker_id: myId, seeker_name: myName, seeker_av: myAv,
    guardian_id: guardianUid, guardian_name: guardian.name||'Guardián',
    context: context, created_at: new Date().toISOString()
  };
  try{
    await sbClient.from('guardian_requests').insert({
      id: reqId, kind:'direct', status:'pending',
      seeker_id: myId, seeker_name: myName, seeker_av: myAv,
      guardian_id: guardianUid, guardian_name: guardian.name||'Guardián',
      context: context
    });
  }catch(e){ pToast('⚠️','No se pudo enviar la solicitud'); return; }

  // Primary notification: DM sentinel — same mechanism as __velo_chat_req__.
  // Deleted by the guardian's _handleDMPayload on receipt, or after 60s if not picked up.
  try{
    var _sentRes = await sbClient.from('direct_messages').insert({
      from_id: myId, from_name: myName, from_av: myAv,
      to_id: guardianUid,
      text: '__velo_guardian_req__:'+JSON.stringify(reqPayload)
    }).select('id').single();
    var _sentId = _sentRes && _sentRes.data && _sentRes.data.id;
    if(_sentId){
      setTimeout(function(){
        if(sbClient) sbClient.from('direct_messages').delete().eq('id',_sentId).then(function(){}).catch(function(){});
      }, 60000);
    }
  }catch(e){}

  // Broadcast the full request object directly to the guardian via Realtime broadcast
  // (pure WebSocket — no RLS, no DB read required on the guardian side)
  try{
    var _bcastCh = sbClient.channel('velo:gnotify:'+guardianUid);
    _bcastCh.subscribe(function(status){
      if(status === 'SUBSCRIBED'){
        _bcastCh.send({ type:'broadcast', event:'guardian_request', payload:{
          id: reqId, kind:'direct', status:'pending',
          seeker_id: myId, seeker_name: myName, seeker_av: myAv,
          guardian_id: guardianUid, guardian_name: guardian.name||'Guardián',
          context: context, created_at: new Date().toISOString()
        }});
        setTimeout(function(){ try{ sbClient.removeChannel(_bcastCh); }catch(e){} }, 3000);
      }
    });
  }catch(e){}

  var _noRespGuardianId   = guardianUid;
  var _noRespGuardianName = guardian.name || 'Guardián';
  var _noRespGuardianAv   = guardian.av   || '🌿';
  _gcPeer = { id: guardianUid, name: _noRespGuardianName, av: _noRespGuardianAv };
  _showGuardianWaitSheet(_noRespGuardianName, reqId);
  _subscribeSeekerRequest(reqId);
  // 2-minute timeout: show message compose screen for Buzón Velo
  if(_seekerWaitTimer) clearTimeout(_seekerWaitTimer);
  _seekerWaitTimer = setTimeout(function(){
    var ov = document.getElementById('gdWaitOv');
    if(!ov) return;
    var sheet = ov.querySelector('.p-sheet');
    if(sheet){
      sheet.innerHTML = '<div class="p-sheet-handle"></div>'
        +'<div style="padding:16px 4px 8px">'
        +'<div style="text-align:center;margin-bottom:14px">'
        +'<div style="font-size:36px;margin-bottom:8px">💤</div>'
        +'<div style="font-size:16px;font-weight:700;color:var(--ink);margin-bottom:6px">Sin respuesta</div>'
        +'<p style="font-size:12.5px;color:var(--ink3);margin:0;line-height:1.55">'+_escHtml(_noRespGuardianName)+' no está disponible ahora. Podés dejarle un mensaje y te responderá por el Buzón Velo.</p>'
        +'</div>'
        +'<textarea id="gdNoRespMsg" rows="3" placeholder="Escribí tu mensaje para '+_escHtml(_noRespGuardianName)+'…" maxlength="500" style="width:100%;box-sizing:border-box;padding:10px 12px;border:1.5px solid var(--border2);border-radius:12px;font-size:13px;font-family:\'Jost\',sans-serif;background:var(--cream);color:var(--ink);resize:none;outline:none;margin-bottom:10px"></textarea>'
        +'<div style="display:flex;flex-direction:column;gap:8px">'
        +'<button id="gdSendNoRespBtn" style="padding:12px;background:var(--sage);border:none;border-radius:12px;font-size:13px;font-weight:700;color:#fff;cursor:pointer;font-family:\'Jost\',sans-serif;width:100%">💌 Enviar mensaje al Buzón Velo</button>'
        +'<button id="gdCancelNoRespBtn" style="padding:11px;background:var(--cream2);border:1.5px solid var(--border2);border-radius:12px;font-size:13px;font-weight:600;color:var(--ink3);cursor:pointer;font-family:\'Jost\',sans-serif;width:100%">Intentar en otro momento</button>'
        +'</div></div>';
      // Wire buttons after DOM insertion
      var sendBtn   = sheet.querySelector('#gdSendNoRespBtn');
      var cancelBtn = sheet.querySelector('#gdCancelNoRespBtn');
      if(cancelBtn) cancelBtn.addEventListener('click', function(){ pCancelGuardianWait(reqId); });
      if(sendBtn) sendBtn.addEventListener('click', function(){
        var ta = sheet.querySelector('#gdNoRespMsg');
        var msg = ta ? ta.value.trim() : '';
        if(!msg){ pToast('✏️','Escribí un mensaje primero'); return; }
        _initSupabase();
        var myId   = _myUserId();
        var myName = safeLS('get','velo_user_name') || 'Usuario';
        var myAv   = safeLS('get','velo_user_av')   || '🧑';
        if(sbClient && myId && _noRespGuardianId){
          sbClient.from('direct_messages').insert({
            from_id: myId, from_name: myName, from_av: myAv,
            to_id: _noRespGuardianId,
            text: '💙 Solicité tu acompañamiento pero no pudiste responder. Te dejo este mensaje:\n\n' + msg
          }).then(function(){
            pToast('💌','Mensaje enviado al Buzón Velo de '+_noRespGuardianName);
          }).catch(function(){ pToast('⚠️','No se pudo enviar el mensaje'); });
        }
        pCancelGuardianWait(reqId);
      });
    }
    if(_seekerPollTmr){ clearInterval(_seekerPollTmr); _seekerPollTmr = null; }
    if(_gcSeekerCh && sbClient){ try{ sbClient.removeChannel(_gcSeekerCh); }catch(e){} _gcSeekerCh = null; }
    _seekerWaitTimer = null;
  }, 60000);
}

function _showGuardianWaitSheet(name, reqId){
  var existing = document.getElementById('gdWaitOv');
  if(existing) existing.remove();
  var ov = document.createElement('div');
  ov.className = 'p-modal-ov show';
  ov.id = 'gdWaitOv';
  ov.innerHTML = '<div class="p-sheet">'
    +'<div class="p-sheet-handle"></div>'
    +'<div style="text-align:center;padding:10px 0 8px">'
    +'<div style="font-size:46px;margin-bottom:12px">💚</div>'
    +'<div style="font-family:\'Cormorant Garamond\',serif;font-size:21px;color:var(--ink);margin-bottom:8px">Esperando a '+_escHtml(name)+'</div>'
    +'<p style="font-size:13px;color:var(--ink3);margin:0 0 18px;line-height:1.55">Le avisamos que pediste acompañamiento. Te abriremos el chat apenas acepte 🌿</p>'
    +'<div style="font-size:24px;margin-bottom:18px;letter-spacing:3px;color:var(--sage3)">• • •</div>'
    +'</div>'
    +'<button class="p-btn p-btn--secondary p-btn--md p-btn--full" onclick="pCancelGuardianWait('+_jsAttr(reqId)+')">Cancelar solicitud</button>'
    +'</div>';
  document.body.appendChild(ov);
}

function _closeGuardianWaitSheet(){
  if(_seekerWaitTimer){ clearTimeout(_seekerWaitTimer); _seekerWaitTimer = null; }
  var ov = document.getElementById('gdWaitOv');
  if(ov) ov.remove();
}

function pCancelGuardianWait(reqId){
  _closeGuardianWaitSheet();
  if(_gcSeekerCh && sbClient){ try{ sbClient.removeChannel(_gcSeekerCh); }catch(e){} _gcSeekerCh = null; }
  if(_seekerPollTmr){ clearInterval(_seekerPollTmr); _seekerPollTmr = null; }
  if(sbClient && reqId){
    sbClient.from('guardian_requests').update({status:'cancelled'}).eq('id',reqId).then(function(){}).catch(function(){});
  }
  pToast('🌿','Solicitud cancelada');
}

function _handleSeekerReqRow(row, reqId){
  if(String(row.id) !== String(reqId)) return;
  if(row.status === 'accepted'){
    if(_gcSeekerCh && sbClient){ try{ sbClient.removeChannel(_gcSeekerCh); }catch(e){} _gcSeekerCh = null; }
    if(_seekerPollTmr){ clearInterval(_seekerPollTmr); _seekerPollTmr = null; }
    if(!document.getElementById('gdWaitOv')) return; // already handled
    _closeGuardianWaitSheet();
    _openGuardianChat(row.guardian_id, row.guardian_name||'Guardián', (_gcPeer&&_gcPeer.av)||'🌿', reqId, 'seeker');
  } else if(row.status === 'rejected' || row.status === 'declined'){
    if(_gcSeekerCh && sbClient){ try{ sbClient.removeChannel(_gcSeekerCh); }catch(e){} _gcSeekerCh = null; }
    if(_seekerPollTmr){ clearInterval(_seekerPollTmr); _seekerPollTmr = null; }
    if(!document.getElementById('gdWaitOv')) return;
    _closeGuardianWaitSheet();
    pToast('🌿','El guardián no puede acompañarte ahora. Probá con otro 💚');
  }
}

function _subscribeSeekerRequest(reqId){
  if(_gcSeekerCh && sbClient){ try{ sbClient.removeChannel(_gcSeekerCh); }catch(e){} _gcSeekerCh = null; }
  if(_seekerPollTmr){ clearInterval(_seekerPollTmr); _seekerPollTmr = null; }
  if(!sbClient) return;
  // Realtime listener (filtered by request id)
  _gcSeekerCh = sbClient.channel('velo:gdreq:'+reqId)
    .on('postgres_changes',{
      event:'UPDATE', schema:'public', table:'guardian_requests',
      filter: 'id=eq.'+reqId
    }, function(payload){
      _handleSeekerReqRow(payload.new||{}, reqId);
    })
    .subscribe(function(status, err){
      if(status !== 'SUBSCRIBED') console.warn('[seeker req listener] status:', status, err||'');
    });
  // Polling fallback every 3s — primary delivery since Realtime needs replication enabled
  _seekerPollTmr = setInterval(function(){
    if(!document.getElementById('gdWaitOv')){ clearInterval(_seekerPollTmr); _seekerPollTmr = null; return; }
    if(!sbClient) return;
    sbClient.from('guardian_requests').select('*').eq('id', reqId).limit(1)
      .then(function(res){
        if(res && res.data && res.data[0]) _handleSeekerReqRow(res.data[0], reqId);
      }).catch(function(){});
  }, 3000);
}

// ── GUARDIAN REQUEST LISTENER (guardian side) ──────────────────
var _guardianReqCh   = null;
var _guardianPollTimer = null;
var _pendingGdReq    = null;

function _checkPendingGuardianRequests(){
  if(!sbClient || safeLS('get','velo_is_guardian') !== 'true') return;
  if(document.getElementById('gdReqOv')) return; // already showing one
  var myId = _myUserId();
  if(!myId || myId.startsWith('guest')) return;
  var myEmail = safeLS('get','velo_user_email') || '';
  // Check both UUID and email to handle cases where presence was stored with email before UUID sync
  var query = sbClient.from('guardian_requests').select('*')
    .eq('kind','direct').eq('status','pending')
    .order('created_at',{ascending:false}).limit(5);
  query.then(function(res){
    if(!res || !res.data || !res.data.length) return;
    var mine = res.data.filter(function(r){
      return r.guardian_id === myId || (myEmail && r.guardian_id === myEmail);
    });
    if(mine.length) _showGuardianRequest(mine[0]);
  }).catch(function(e){ console.error('[guardian req poll]', e); });
}

function _startGuardianReqListener(){
  _initSupabase();
  if(!sbClient) return;
  if(safeLS('get','velo_is_guardian') !== 'true') return;
  var myId = _myUserId();
  if(!myId || myId.startsWith('guest')) return;
  var myEmail = safeLS('get','velo_user_email') || '';
  // Immediate check — catches requests that arrived while offline or before listener started
  _checkPendingGuardianRequests();
  // Primary channel: Realtime BROADCAST (no RLS, pure WebSocket pub-sub)
  // The seeker sends the full request object here immediately after INSERT.
  if(!_guardianReqCh){
    _guardianReqCh = sbClient.channel('velo:gnotify:'+myId);
    _guardianReqCh
      .on('broadcast', { event: 'guardian_request' }, function(msg){
        var r = msg.payload || {};
        if(r.kind === 'direct' && r.status === 'pending') _showGuardianRequest(r);
      })
      .subscribe(function(status, err){
        if(status === 'SUBSCRIBED'){
          _checkPendingGuardianRequests(); // catch anything that arrived before subscribe
        } else {
          console.warn('[guardian notify] broadcast status:', status, err||'');
        }
      });
    // Also subscribe on email key in case presence row used email as user_id
    if(myEmail && myEmail !== myId){
      sbClient.channel('velo:gnotify:'+myEmail)
        .on('broadcast', { event: 'guardian_request' }, function(msg){
          var r = msg.payload || {};
          if(r.kind === 'direct' && r.status === 'pending') _showGuardianRequest(r);
        })
        .subscribe();
    }
    // Also keep a postgres_changes listener as secondary (works if table replication is enabled)
    sbClient.channel('velo:gdreq:'+myId)
      .on('postgres_changes',{
        event:'INSERT', schema:'public', table:'guardian_requests',
        filter: 'guardian_id=eq.'+myId
      }, function(payload){
        var r = payload.new||{};
        if(r.kind === 'direct' && r.status === 'pending') _showGuardianRequest(r);
      })
      .subscribe();
  }
  // Polling fallback every 5s — primary delivery mechanism since Realtime
  // requires the table to have replication enabled in Supabase dashboard
  if(!_guardianPollTimer){
    _guardianPollTimer = setInterval(_checkPendingGuardianRequests, 5000);
  }
}

function _stopGuardianReqListener(){
  if(_guardianReqCh && sbClient){ try{ sbClient.removeChannel(_guardianReqCh); }catch(e){} _guardianReqCh = null; }
  if(_guardianPollTimer){ clearInterval(_guardianPollTimer); _guardianPollTimer = null; }
}

function _showGuardianRequest(req){
  if(document.getElementById('gdReqOv')) return; // one at a time
  _pendingGdReq = req;
  var ov = document.createElement('div');
  ov.className = 'p-modal-ov show';
  ov.id = 'gdReqOv';
  ov.innerHTML = '<div class="p-sheet">'
    +'<div class="p-sheet-handle"></div>'
    +'<div style="text-align:center;padding:8px 0 14px">'
    +'<div style="font-size:48px;margin-bottom:10px">'+_avInline(req.seeker_av||'🧑',54)+'</div>'
    +'<div style="font-family:\'Cormorant Garamond\',serif;font-size:20px;color:var(--ink);margin-bottom:6px">'+_escHtml(req.seeker_name||'Alguien')+'</div>'
    +'<p style="font-size:13px;color:var(--ink3);margin:0 0 12px;line-height:1.5">solicita tu acompañamiento 💚</p>'
    +(req.context ? '<div style="background:var(--cream2);border-radius:12px;padding:11px 13px;font-size:13px;color:var(--ink3);font-style:italic;text-align:left;line-height:1.55">"'+_escHtml(req.context)+'"</div>' : '')
    +'</div>'
    +'<button class="p-btn p-btn--primary p-btn--lg p-btn--full" onclick="pAcceptGuardianRequest()" style="margin-bottom:8px">💚 Aceptar y acompañar</button>'
    +'<button class="p-btn p-btn--secondary p-btn--md p-btn--full" onclick="pRejectGuardianRequest()">Ahora no puedo</button>'
    +'</div>';
  document.body.appendChild(ov);
}

async function pAcceptGuardianRequest(){
  var req = _pendingGdReq;
  if(!req) return;
  var ov = document.getElementById('gdReqOv');
  if(ov) ov.remove();
  _initSupabase();
  var myId   = _myUserId();
  var myName = safeLS('get','velo_user_name') || 'Guardián';
  var myAv   = safeLS('get','velo_user_av')   || '🌿';
  if(sbClient){
    try{ await sbClient.from('guardian_requests').update({status:'accepted'}).eq('id',req.id); }catch(e){}
    if(req.context){
      sbClient.from('direct_messages').insert({
        from_id: req.seeker_id, from_name: req.seeker_name||'Usuario', from_av: req.seeker_av||'🧑',
        to_id: req.guardian_id, text: req.context
      }).then(function(){}).catch(function(){});
    }
    // Notify seeker via DM sentinel — bypasses RLS on guardian_requests
    try{
      var _accPayload = JSON.stringify({ req_id:req.id, guardian_id:myId, guardian_name:myName, guardian_av:myAv });
      var _accRes = await sbClient.from('direct_messages').insert({
        from_id:myId, from_name:myName, from_av:myAv,
        to_id:req.seeker_id,
        text:'__velo_guardian_acc__:'+_accPayload
      }).select('id').single();
      var _accSentId = _accRes && _accRes.data && _accRes.data.id;
      if(_accSentId){
        setTimeout(function(){
          if(sbClient) sbClient.from('direct_messages').delete().eq('id',_accSentId).then(function(){}).catch(function(){});
        }, 60000);
      }
    }catch(e){}
  }
  _pendingGdReq = null;
  _openGuardianChat(req.seeker_id, req.seeker_name||'Usuario', req.seeker_av||'🧑', req.id, 'guardian');
}

function pRejectGuardianRequest(){
  var req = _pendingGdReq;
  var ov = document.getElementById('gdReqOv');
  if(ov) ov.remove();
  if(req && sbClient){
    sbClient.from('guardian_requests').update({status:'rejected'}).eq('id',req.id).then(function(){}).catch(function(){});
    // Notify seeker via DM sentinel
    var _rMyId   = _myUserId();
    var _rMyName = safeLS('get','velo_user_name') || 'Guardián';
    var _rMyAv   = safeLS('get','velo_user_av')   || '🌿';
    sbClient.from('direct_messages').insert({
      from_id:_rMyId, from_name:_rMyName, from_av:_rMyAv,
      to_id:req.seeker_id,
      text:'__velo_guardian_rej__:'+req.id
    }).then(function(){}).catch(function(){});
  }
  _pendingGdReq = null;
  pToast('🌿','Solicitud rechazada');
}

// ── GUARDIAN CHAT ROOM — real person-to-person ─────────────────
var _gcPeer   = null;   // { id, name, av } — the other party
var _gcReqId  = null;   // guardian_requests row id
var _gcRole   = null;   // 'seeker' | 'guardian'
var _gcRtCh        = null;   // realtime channel
var _gcSeekerCh    = null;   // seeker's request-status channel
var _seekerPollTmr = null;   // polling fallback for seeker wait
var _gcPollTmr     = null;   // polling fallback for guardian chat messages
var _gcLastMsgId   = null;   // last rendered message DB id (prevents flicker on poll)

function _openGuardianChat(peerId, peerName, peerAv, reqId, role){
  _prevChatStatus = _presenceStatus();
  _inActiveChat = true;
  _updateGuardianPresence('ocupado');
  _gcPeer      = { id:peerId, name:peerName||'Usuario', av:peerAv||'🌿' };
  _gcReqId     = reqId;
  _gcRole      = role;
  _gcLastMsgId = null; // reset so first render is a clean full load
  pGoTo('guardian-chat');
}

function _gcInit(){
  var g = _gcPeer;
  var gcAv   = document.getElementById('gcAv');
  var gcName = document.getElementById('gcName');
  if(gcAv)   gcAv.textContent   = (g && g.av)   || '🌿';
  if(gcName) gcName.textContent = (g && g.name) || 'Acompañamiento';
  var msgEl = document.getElementById('gcMessages');
  if(msgEl) msgEl.innerHTML = '';
  if(g){ _gcRender(); _gcSubscribe(); }
}

async function _gcRender(){
  var el = document.getElementById('gcMessages');
  if(!el || !_gcPeer) return;
  var myId = _myUserId();
  _initSupabase();
  if(!sbClient) return;
  try{
    var res = await sbClient.from('direct_messages').select('*')
      .or('and(from_id.eq.'+myId+',to_id.eq.'+_gcPeer.id+'),and(from_id.eq.'+_gcPeer.id+',to_id.eq.'+myId+')')
      .order('created_at',{ascending:true}).limit(120);
    var data = res.data || [];
    var sentinels = ['__velo_chat_req__','__velo_chat_acc__','__velo_chat_rej__','__velo_chat_busy__'];
    var msgs = data.filter(function(m){ var t=m.text||''; return sentinels.indexOf(t)<0&&!t.startsWith('__velo_guardian_req__:')&&!t.startsWith('__velo_guardian_acc__:')&&!t.startsWith('__velo_guardian_rej__:')&&!t.startsWith('__velo_guardian_bye__:')&&!t.startsWith('__velo_dm_bye__:')&&!t.startsWith('__velo_help_bye__:'); });
    if(!msgs.length){
      if(!document.getElementById('gcPlaceholder')){
        el.innerHTML = '<div id="gcPlaceholder" style="text-align:center;padding:34px 16px;color:var(--ink5);font-size:13px;line-height:1.6">Este es un espacio seguro 🌿<br>Escriban con presencia y cuidado.</div>';
        _gcLastMsgId = null;
      }
      return;
    }
    var lastId = msgs[msgs.length-1].id;
    // Nothing new — skip re-render entirely (prevents polling flicker)
    if(lastId === _gcLastMsgId) return;
    var wasAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    // If we already have messages rendered, try to append only new ones
    if(_gcLastMsgId){
      var lastIdx = msgs.findIndex(function(m){ return m.id === _gcLastMsgId; });
      if(lastIdx >= 0 && lastIdx < msgs.length - 1){
        var ph = document.getElementById('gcPlaceholder');
        if(ph) ph.remove();
        msgs.slice(lastIdx + 1).forEach(function(m){
          var tmp = document.createElement('div');
          var isOwn = m.from_id === myId;
          tmp.innerHTML = _buildMsgBubble(m.text||'', isOwn, isOwn?'':(m.from_av||'🌿'), isOwn?'':(m.from_name||''), 'gcInput', 'gcReplyBar', '', m.reactions||{}, 'direct_messages:'+m.id, isOwn?'':(m.from_id||''));
          while(tmp.firstChild) el.appendChild(tmp.firstChild);
        });
        _gcLastMsgId = lastId;
        if(wasAtBottom) el.scrollTop = el.scrollHeight;
        return;
      }
    }
    // Full render (first load or message not found in current DOM — e.g. reaction update)
    el.innerHTML = msgs.map(function(m){
      var isOwn = m.from_id === myId;
      return _buildMsgBubble(m.text||'', isOwn, isOwn?'':(m.from_av||'🌿'), isOwn?'':(m.from_name||''), 'gcInput', 'gcReplyBar', '', m.reactions||{}, 'direct_messages:'+m.id, isOwn?'':(m.from_id||''));
    }).join('');
    _gcLastMsgId = lastId;
    el.scrollTop = el.scrollHeight;
  }catch(e){}
}

function _showChatExitBanner(bannerId, messagesElId, inputElId, exitFn, peerName){
  if(document.getElementById(bannerId)) return;
  var msgEl  = document.getElementById(messagesElId);
  var chatEl = msgEl ? msgEl.parentNode : null;
  if(!chatEl) return;
  var banner = document.createElement('div');
  banner.id = bannerId;
  banner.style.cssText = 'position:sticky;bottom:0;left:0;right:0;background:rgba(20,48,30,.96);backdrop-filter:blur(14px);border-top:1.5px solid rgba(116,198,157,.32);padding:14px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px;z-index:50;flex-shrink:0';
  banner.innerHTML = '<div style="display:flex;align-items:center;gap:10px">'
    +'<span style="font-size:20px">👋</span>'
    +'<div>'
    +'<div style="font-size:14px;font-weight:700;color:#fff;line-height:1.2">'+_escHtml(peerName)+' salió del chat</div>'
    +'<div style="font-size:11px;color:rgba(255,255,255,.5);margin-top:2px">La sesión ha finalizado</div>'
    +'</div>'
    +'</div>'
    +'<button onclick="('+exitFn+')" style="padding:9px 20px;background:rgba(116,198,157,.88);border:none;border-radius:100px;font-size:13px;font-weight:700;color:#0a1810;cursor:pointer;font-family:\'Jost\',sans-serif;white-space:nowrap">Salir ✓</button>';
  if(msgEl && msgEl.nextSibling){ chatEl.insertBefore(banner, msgEl.nextSibling); }
  else { chatEl.appendChild(banner); }
  var inp = document.getElementById(inputElId);
  if(inp){ inp.disabled = true; inp.placeholder = 'La sesión ha finalizado'; }
}
function _showGuardianExitBanner(peerName){
  _showChatExitBanner('gcExitBanner', 'gcMessages', 'gcInput', 'pEndGuardianChat()', peerName);
}
function _showDMExitBanner(peerName){
  _showChatExitBanner('dmExitBanner', 'dmMessages', 'dmInput', 'pLeaveDM()', peerName);
}
function _showHelpExitBanner(peerName){
  _showChatExitBanner('helpExitBanner', 'helpChatMessages', 'helpChatInput', 'pLeaveHelpChat()', peerName);
}

function _showBuzónAlert(subject, senderId, senderName, senderAv){
  if(_inActiveChat) return;
  var existing = document.getElementById('buzónAlertPop');
  if(existing) existing.remove();
  var isDark = document.body.classList.contains('r-dark');
  var pop = document.createElement('div');
  pop.id = 'buzónAlertPop';
  pop.style.cssText = 'position:fixed;bottom:76px;left:50%;transform:translateX(-50%) translateY(12px);background:'+(isDark?'rgba(14,36,22,.97)':'rgba(255,255,255,.97)')+';backdrop-filter:blur(16px);border:1.5px solid '+(isDark?'rgba(116,198,157,.38)':'rgba(30,90,55,.22)')+';border-radius:18px;padding:13px 16px;display:flex;align-items:center;gap:11px;z-index:8500;cursor:pointer;max-width:320px;width:calc(100% - 40px);box-shadow:0 6px 28px rgba(0,0,0,'+(isDark?'.45':'.14')+');opacity:0;transition:opacity .28s ease,transform .28s ease';
  var avHtml = senderAv && senderAv.length <= 4
    ? '<div style="width:34px;height:34px;border-radius:50%;background:'+(isDark?'rgba(116,198,157,.18)':'rgba(116,198,157,.14)')+';display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">'+_escHtml(senderAv)+'</div>'
    : _avInline(senderAv||'🌿', 34);
  pop.innerHTML = '<div style="width:34px;height:34px;border-radius:50%;background:'+(isDark?'rgba(116,198,157,.18)':'rgba(116,198,157,.14)')+';display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">📣</div>'
    +'<div style="flex:1;min-width:0">'
    +'<div style="font-size:12px;font-weight:700;color:'+(isDark?'rgba(116,198,157,.95)':'#1a6b3c')+';margin-bottom:2px;letter-spacing:.3px">Alerta Buzón Velo</div>'
    +'<div style="font-size:13px;font-weight:600;color:'+(isDark?'rgba(255,255,255,.88)':'#0a1810')+';overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+_escHtml(subject||'Nuevo mensaje')+'</div>'
    +'</div>'
    +'<div style="font-size:12px;font-weight:700;color:'+(isDark?'rgba(116,198,157,.85)':'#1a6b3c')+';flex-shrink:0;white-space:nowrap">Ver →</div>';
  pop.onclick = function(){
    pop.remove();
    pGoTo('inbox');
    setTimeout(pRenderInbox, 150);
  };
  document.body.appendChild(pop);
  requestAnimationFrame(function(){
    pop.style.opacity = '1';
    pop.style.transform = 'translateX(-50%) translateY(0)';
  });
  setTimeout(function(){
    if(!pop.parentNode) return;
    pop.style.opacity = '0';
    pop.style.transform = 'translateX(-50%) translateY(8px)';
    setTimeout(function(){ if(pop.parentNode) pop.remove(); }, 300);
  }, 5500);
}

function _startBuzónListener(){
  if(_buzónRtCh) return;
  _initSupabase();
  var myId = safeLS('get','velo_user_id')||'';
  if(!myId || !sbClient) return;
  var myTarget = 'user:'+myId;
  _buzónRtCh = sbClient.channel('velo:buzon:'+myId)
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'broadcasts'}, function(payload){
      var b = payload.new||{};
      if(b.target !== myTarget) return;
      var sInfo = null; try{ sInfo = JSON.parse(b.sender); }catch(e){}
      _showBuzónAlert(b.subject||'Nuevo mensaje', sInfo&&sInfo.i, sInfo&&sInfo.n, sInfo&&sInfo.a||b.icon||'💌');
      _updateInboxDot();
    })
    .subscribe();
}

function _gcSubscribe(){
  if(_gcRtCh && sbClient){ try{ sbClient.removeChannel(_gcRtCh); }catch(e){} _gcRtCh = null; }
  if(_gcPollTmr){ clearInterval(_gcPollTmr); _gcPollTmr = null; }
  if(!sbClient || !_gcPeer) return;
  var myId = _myUserId();
  var rel = function(m){
    return (m.from_id===myId && m.to_id===_gcPeer.id) || (m.from_id===_gcPeer.id && m.to_id===myId);
  };
  // Realtime channel
  _gcRtCh = sbClient.channel('velo:gc:'+myId+':'+_gcPeer.id)
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'direct_messages'},function(p){ if(rel(p.new||{})) _gcRender(); })
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'direct_messages'},function(p){ if(rel(p.new||{})) _gcRender(); })
    .subscribe(function(status, err){
      if(status !== 'SUBSCRIBED') console.warn('[gc subscribe] status:', status, err||'');
    });
  // Polling fallback every 6s — reloads messages if Realtime drops
  _gcPollTmr = setInterval(function(){
    if(!_gcPeer || !sbClient){ clearInterval(_gcPollTmr); _gcPollTmr = null; return; }
    _gcRender();
  }, 6000);
}

function pSendGuardianMsg(){
  var ta = document.getElementById('gcInput');
  if(!ta || !ta.value.trim() || !_gcPeer) return;
  var text = ta.value.trim();
  if(text.length > 2000){ pToast('⚠️','Mensaje demasiado largo (máx 2000 caracteres)'); return; }
  ta.value = ''; ta.style.height = '';
  _geminiModerateContent(text, 'guardian-chat');
  var quote = _getReplyQuote('gcReplyBar');
  pClearReplyBar('gcReplyBar');
  var fullText = quote ? '↩ "'+quote.slice(0,60)+(quote.length>60?'…':'')+'"  \n'+text : text;
  var myId   = _myUserId();
  var myName = safeLS('get','velo_user_name')||'Usuario';
  var myAv   = safeLS('get','velo_user_av')||'🌿';
  // Optimistic render
  var el = document.getElementById('gcMessages');
  var _gcLastBubble = null;
  if(el){
    var ph = document.getElementById('gcPlaceholder');
    if(ph) ph.remove();
    var div = document.createElement('div');
    div.innerHTML = _buildMsgBubble(text, true, '', '', 'gcInput', 'gcReplyBar', quote);
    var child = div.firstElementChild;
    if(child){ el.appendChild(child); el.scrollTop = el.scrollHeight; _gcLastBubble = child; }
  }
  _initSupabase();
  if(sbClient){
    sbClient.from('direct_messages').insert({
      from_id:myId, from_name:myName, from_av:myAv, to_id:_gcPeer.id, text:fullText
    }).select('id').single().then(function(res){
      if(res && res.data && res.data.id && _gcLastBubble){
        _gcLastBubble.setAttribute('data-sb-id', 'direct_messages:'+res.data.id);
      }
    }).catch(function(){});
  }
}

function _bumpProfileCounter(field, value){
  _initSupabase();
  if(!sbClient) return;
  var uid = _myUserId();
  if(!uid || uid === 'guest') return;
  var upd = {}; upd[field] = value;
  sbClient.from('profiles').update(upd).eq('id', uid).then(function(){}).catch(function(){});
}

function pEndGuardianChat(){
  if(_gcRtCh && sbClient){ try{ sbClient.removeChannel(_gcRtCh); }catch(e){} _gcRtCh = null; }
  if(_gcPollTmr){ clearInterval(_gcPollTmr); _gcPollTmr = null; }
  if(_gcReqId && sbClient){
    sbClient.from('guardian_requests').update({status:'ended'}).eq('id',_gcReqId).then(function(){}).catch(function(){});
  }
  // Notify peer that this user left the guardian chat
  if(sbClient && _gcPeer && _gcPeer.id){
    var _byeMyId   = _myUserId();
    var _byeMyName = safeLS('get','velo_user_name') || 'Usuario';
    var _byeMyAv   = safeLS('get','velo_user_av')   || '🧑';
    sbClient.from('direct_messages').insert({
      from_id:_byeMyId, from_name:_byeMyName, from_av:_byeMyAv,
      to_id:_gcPeer.id,
      text:'__velo_guardian_bye__:'+JSON.stringify({ name:_byeMyName, av:_byeMyAv })
    }).then(function(){}).catch(function(){});
  }
  var exitStatus = _prevChatStatus || _presenceStatus();
  _inActiveChat = false;
  _prevChatStatus = null;
  if(_gcRole === 'guardian'){
    var convs = parseInt(safeLS('get','velo_guardian_convs')||'0',10) + 1;
    safeLS('set','velo_guardian_convs', String(convs));
    _bumpProfileCounter('helped_count', convs);
    _updateGuardianPresence(exitStatus);
    _gcPeer = null; _gcReqId = null; _gcRole = null;
    pToast('💚','Gracias por acompañar 🌿');
    pGoTo('guardians');
  } else {
    var received = parseInt(safeLS('get','velo_help_received')||'0',10) + 1;
    safeLS('set','velo_help_received', String(received));
    _bumpProfileCounter('received_count', received);
    var rGuardian = _gcPeer ? { id:_gcPeer.id, name:_gcPeer.name } : null;
    safeLS('set','velo_postchat_guardian', rGuardian ? JSON.stringify(rGuardian) : '');
    _updateGuardianPresence(exitStatus);
    _gcPeer = null; _gcReqId = null; _gcRole = null;
    pGoTo('post-chat');
  }
}

// ── PROFESSIONALS ──────────────────────────────────────────────
var _proData = []; // populated when real professionals register via admin

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

  if(!_proData.length){
    list.innerHTML = '<div class="p-empty" style="padding:40px 20px">'
      +'<span class="p-empty-emoji">🌱</span>'
      +'<div class="p-empty-title">Próximamente</div>'
      +'<div class="p-empty-sub" style="max-width:280px;margin:0 auto">Actualmente no disponemos de profesionales. Estamos ampliando nuestro catálogo de servicios — volvé pronto.</div>'
      +'</div>';
    return;
  }
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


async function pRenderHelp(){
  var _tok = _navToken;
  var list = document.getElementById('helpList');
  if(!list) return;
  _renderFavWidget('helpFavWidget');
  var hidden = []; try{ hidden = JSON.parse(safeLS('get','velo_hidden_content')||'[]'); }catch(e){}

  var posts, usingSB = false;
  var myHelpId = safeLS('get','velo_user_id') || safeLS('get','velo_user_email') || '';
  var sbRows = await _sbLoad('help_posts', function(q){
    var since = new Date(Date.now() - 48*60*60*1000).toISOString();
    // Exclude closed posts (received a support message)
    return q.gte('created_at', since).or('closed.eq.false,closed.is.null')
      .order('created_at',{ascending:false}).limit(30);
  });
  if(_navToken !== _tok) return;
  if(sbRows !== null){
    usingSB = true;
    posts = sbRows.map(_sbHelpRow).filter(function(h){ return hidden.indexOf('help-'+h.id)<0 && !_isBlocked(h.userId); });
  } else {
    var realPosts = []; try{ realPosts = JSON.parse(safeLS('get','velo_help_posts')||'[]'); }catch(e){}
    posts = realPosts.filter(function(h){ return !h.closed && hidden.indexOf('help-'+h.id)<0 && !_isBlocked(h.userId); });
  }
  // Separate own posts from others' (own posts stay visible to author for deletion, even if anonymous)
  _helpPosts = posts.filter(function(h){ return (h.userId||'') !== myHelpId; });
  var myOwnPosts = myHelpId ? posts.filter(function(h){ return (h.userId||'') === myHelpId; }) : [];

  var count = document.getElementById('helpActiveCount');
  if(count) count.textContent = _helpPosts.length+' esperando acompañamiento';

  await _refreshPresenceCache();

  // Batch-fetch usernames for non-anon help-post authors not yet cached
  if(sbClient){
    var _hUnknown = posts.filter(function(h){ return !h.anon && h.userId && !_uLook(h.userId); }).map(function(h){ return h.userId; });
    if(_hUnknown.length){ try{ var _hur = await sbClient.from('profiles').select('id,username').in('id',_hUnknown); if(_hur.data) _hur.data.forEach(function(p){ _uFill(p.id, p.username); }); }catch(e){} }
  }

  if(!posts.length){
    list.innerHTML = '<div class="p-empty" style="color:rgba(255,255,255,.5)"><span class="p-empty-emoji">💚</span><div class="p-empty-title" style="color:rgba(255,255,255,.7)">Todo tranquilo por acá</div><div class="p-empty-sub">Nadie espera acompañamiento en este momento</div></div>';
    return;
  }

  function _helpCard(h, isOwn){
    var timeLeft = h.time + 24*3600*1000 - Date.now();
    var timeStr = (function(){
      if(timeLeft <= 0) return 'expirado';
      var mins = Math.floor(timeLeft/60000);
      if(mins < 60) return '⏳ '+mins+'min restantes';
      var hrs = Math.floor(mins/60); var rem = mins%60;
      return '⏳ '+(rem ? hrs+'h '+rem+'min' : hrs+'h')+' restantes';
    })();
    var urgBadge = h.urgencia==='urgente'
      ? '<span style="font-size:9px;background:rgba(220,50,50,.25);color:rgba(255,130,130,.9);border:1px solid rgba(220,50,50,.3);border-radius:6px;padding:1px 6px;margin-left:4px">🔴 Urgente</span>'
      : h.urgencia==='media'
      ? '<span style="font-size:9px;background:rgba(230,160,20,.2);color:rgba(255,200,80,.9);border:1px solid rgba(230,160,20,.25);border-radius:6px;padding:1px 6px;margin-left:4px">🟡 Media</span>'
      : '';
    var actions = isOwn
      ? '<span style="font-size:11px;color:rgba(116,198,157,.7);font-style:italic">Tu publicación 💙</span>'
        +'<button onclick="pDeleteHelpPost(\''+h.id+'\')" style="margin-left:8px;padding:4px 10px;background:rgba(255,80,80,.1);border:1px solid rgba(255,80,80,.2);border-radius:100px;color:rgba(255,120,120,.8);font-size:11px;cursor:pointer;font-family:\'Jost\',sans-serif">🗑️ Eliminar</button>'
      : '<button class="p-btn p-btn--primary p-btn--sm" onclick="pAccompanyHelp(\''+h.id+'\')">💚 Acompañar</button>'
        +'<button style="font-size:11px;font-weight:600;padding:4px 9px;background:rgba(200,50,50,.1);border:1px solid rgba(200,50,50,.25);border-radius:100px;color:rgba(190,45,35,.9);cursor:pointer;font-family:\'Jost\',sans-serif" onclick="pReportContent(\'help\',\''+h.id+'\')">⚠️ Reportar</button>';
    var canClickProfile = !h.anon && !isOwn && h.userId && h.name !== 'Usuario Anónimo';
    var hAv = h.av || h.emoji || '💙';
    var profCall = 'pQuickProfile('+_jsAttr(h.name)+','+_jsAttr(hAv)+',\'\',\'\','+_jsAttr(h.userId||'')+')';
    var uAtTag = _uAt(h.anon ? '' : h.userId);
    var nameHtml = canClickProfile
      ? '<div><span style="font-size:12px;font-weight:600;color:var(--ink);cursor:pointer" onclick="'+profCall+'">'+_escHtml(h.name)+'</span>'+uAtTag+'</div>'
      : '<div><span style="font-size:12px;font-weight:600;color:var(--ink)">'+_escHtml(h.name)+'</span>'+uAtTag+'</div>';
    var avHtml = (hAv && (hAv.indexOf('data:')===0||hAv.indexOf('http')===0)) ? _avInline(hAv,32) : (!h.anon ? hAv : (h.emoji||'💙'));
    var pDot = (!h.anon && h.userId) ? _presenceDot(h.userId, 10) : '';
    var avDotHtml = pDot
      ? '<div style="position:relative;display:inline-block">' + avHtml + '<span style="position:absolute;bottom:-1px;right:-3px">' + pDot + '</span></div>'
      : avHtml;
    return '<div class="dark-seeker" id="helppost-'+h.id+'">'
      +'<div style="display:flex;align-items:flex-start;gap:11px">'
      +'<div style="font-size:28px;flex-shrink:0;'+(canClickProfile?'cursor:pointer" onclick="'+profCall:'')+'">' + avDotHtml + '</div>'
      +'<div style="flex:1;min-width:0">'
      +'<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:3px">'
      +nameHtml
      +'<span style="font-size:10px;color:var(--ink5);margin-top:2px">'+timeStr+'</span>'
      +urgBadge
      +'</div>'
      +'<div style="font-size:13px;color:var(--ink3);line-height:1.55;margin-bottom:10px;font-style:italic">'+_escHtml(h.preview)+'</div>'
      +'<div style="display:flex;gap:8px;align-items:center">'+actions+'</div>'
      +'</div></div></div>';
  }

  // Show own posts pinned at top (public AND anonymous), then others below
  var ownHtml = myOwnPosts.map(function(h){ return _helpCard(h, true); }).join('');
  var othersHtml = _helpPosts.map(function(h){ return _helpCard(h, false); }).join('');
  list.innerHTML = ownHtml + othersHtml;
}

function pDeleteHelpPost(postId){
  if(!confirm('¿Eliminar tu publicación de la Sala de Ayuda?')) return;
  _initSupabase();
  if(sbClient){
    sbClient.from('help_posts').update({closed:true}).eq('id',postId).then(function(){}).catch(function(){});
  }
  safeLS('set','velo_my_help_post_id','');
  var card = document.getElementById('helppost-'+postId);
  if(card){ card.style.transition='opacity .3s'; card.style.opacity='0'; setTimeout(function(){ pRenderHelp(); },350); }
  else { pRenderHelp(); }
  pToast('💙','Publicación eliminada');
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
  // Find the post in the rendered cache (covers Supabase posts), fall back to localStorage
  var post = (_helpPosts||[]).find(function(p){ return p.id===postId; });
  if(!post){
    var lsPosts = []; try{ lsPosts = JSON.parse(safeLS('get','velo_help_posts')||'[]'); }catch(e){}
    post = lsPosts.find(function(p){ return p.id===postId; });
  }
  if(!post){ pToast('⚠️','Esta solicitud ya no está disponible'); return; }

  _pendingGuardianPost = post;
  safeLS('set','velo_helped_others', String(parseInt(safeLS('get','velo_helped_others')||'0',10)+1));
  safeLS('set','velo_helped_once','1');

  // Supabase post → notify the seeker (who sees popup to accept/decline) then wait
  // Do NOT mark post as taken — it stays visible so multiple helpers can accompany
  if(post.isSB && sbClient){
    _guardianSendRequest(post);
  } else {
    _curHelpPost = post;
    _openHelpChat(post);
  }
}

async function _guardianSendRequest(post){
  _initSupabase();
  if(!sbClient){ _curHelpPost = post; _openHelpChat(post); return; }
  var myId   = safeLS('get','velo_user_id')||safeLS('get','velo_user_email')||'anon';
  var myName = safeLS('get','velo_user_name')||'Guardián';
  var myAv   = safeLS('get','velo_user_av')||'🌿';
  var reqId  = 'gr'+Date.now();
  _pendingGuardianReqId = reqId; // store so _guardianCancelWait can target only this row
  // Insert guardian_request row — await so we know it arrived before showing overlay
  var insErr = null;
  try{
    var insResult = await sbClient.from('guardian_requests').insert({
      id: reqId, post_id: post.id,
      seeker_id: post.userId||null,
      guardian_id: myId, guardian_name: myName, guardian_av: myAv,
      status: 'pending'
    });
    if(insResult && insResult.error) insErr = insResult.error;
  }catch(e){ insErr = e; }
  if(insErr){
    pToast('⚠️','No se pudo enviar la solicitud. Verificá tu conexión.');
    return;
  }
  // Show waiting overlay with 80s countdown
  _showGuardianWaitOverlay(post, myName);
  // Subscribe to guardian_requests changes for this row
  if(_grReqCh) try{ sbClient.removeChannel(_grReqCh); }catch(e){}
  if(_grReqPollTmr){ clearInterval(_grReqPollTmr); _grReqPollTmr = null; }
  _grReqCh = sbClient.channel('velo:gr:'+post.id)
    .on('postgres_changes', {event:'UPDATE', schema:'public', table:'guardian_requests'}, function(payload){
      var row = payload.new || {};
      if(String(row.post_id) !== String(post.id)) return;
      if(row.status === 'accepted'){
        _guardianRequestAccepted(post);
      } else if(row.status === 'declined'){
        _guardianRequestDeclined(post);
      }
    })
    .subscribe(function(status, err){
      if(status !== 'SUBSCRIBED') console.warn('[guardian gr listener] status:', status, err||'');
    });
  // Polling fallback every 8s — catches seeker acceptance if Realtime drops
  _grReqPollTmr = setInterval(function(){
    if(!sbClient || !document.getElementById('guardianWaitOv')) {
      clearInterval(_grReqPollTmr); _grReqPollTmr = null; return;
    }
    sbClient.from('guardian_requests').select('*').eq('id', reqId).limit(1)
      .then(function(res){
        if(!res || !res.data || !res.data[0]) return;
        var row = res.data[0];
        if(row.status === 'accepted') _guardianRequestAccepted(post);
        else if(row.status === 'declined') _guardianRequestDeclined(post);
      }).catch(function(){});
  }, 8000);
  // 120 second timeout
  if(_guardianWaitTimer) clearTimeout(_guardianWaitTimer);
  _guardianWaitTimer = setTimeout(function(){ _guardianRequestExpired(post); }, 60000);
}

function _showGuardianWaitOverlay(post, myName){
  var existing = document.getElementById('guardianWaitOv');
  if(existing) existing.remove();
  var ov = document.createElement('div');
  ov.id = 'guardianWaitOv';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px';
  ov.innerHTML = '<div id="guardianWaitCard" style="background:var(--cream);border-radius:20px;padding:28px 24px;max-width:340px;width:100%;text-align:center">'
    +'<div style="font-size:44px;margin-bottom:12px">💙</div>'
    +'<div style="font-size:17px;font-weight:700;color:var(--ink);margin-bottom:8px">Esperando respuesta…</div>'
    +'<div style="font-size:13px;color:var(--ink3);margin-bottom:18px">Le avisamos a <strong>'+_escHtml(post.name)+'</strong> que querés acompañarle. Si no responde en 1 minuto te mostraremos opciones.</div>'
    +'<div id="guardianWaitCountdown" style="font-size:32px;font-weight:800;color:var(--sage);margin-bottom:20px">2:00</div>'
    +'<button onclick="_guardianCancelWait()" style="padding:10px 24px;background:var(--cream2);border:1.5px solid var(--border2);border-radius:100px;font-size:13px;font-weight:600;color:var(--ink3);cursor:pointer;font-family:\'Jost\',sans-serif">Cancelar</button>'
    +'</div>';
  document.body.appendChild(ov);
  // Start countdown display: 1 minute (60s), shown as M:SS
  var secs = 60;
  var cdEl = document.getElementById('guardianWaitCountdown');
  var cdInt = setInterval(function(){
    secs--;
    if(cdEl){ var m=Math.floor(secs/60), s=secs%60; cdEl.textContent=m+':'+(s<10?'0':'')+s; }
    if(secs <= 0) clearInterval(cdInt);
  }, 1000);
  ov.setAttribute('data-cd-int', cdInt);
}

function _guardianCancelWait(){
  if(_guardianWaitTimer){ clearTimeout(_guardianWaitTimer); _guardianWaitTimer = null; }
  _clearGuardianWaitOverlay();
  if(_pendingGuardianReqId && sbClient){
    // Use the specific row ID — NOT post_id — to avoid cancelling other guardians' requests
    sbClient.from('guardian_requests').update({status:'declined'}).eq('id',_pendingGuardianReqId).then(function(){}).catch(function(){});
  }
  _pendingGuardianPost = null;
  _pendingGuardianReqId = null;
  pToast('↩️','Cancelado. La solicitud sigue disponible en la sala.');
}

function _clearGuardianWaitOverlay(){
  var ov = document.getElementById('guardianWaitOv');
  if(ov){
    var cdInt = ov.getAttribute('data-cd-int');
    if(cdInt) clearInterval(parseInt(cdInt,10));
    ov.remove();
  }
  if(_grReqCh && sbClient){ try{ sbClient.removeChannel(_grReqCh); }catch(e){} _grReqCh = null; }
  if(_grReqPollTmr){ clearInterval(_grReqPollTmr); _grReqPollTmr = null; }
}

function _guardianRequestAccepted(post){
  if(_guardianWaitTimer){ clearTimeout(_guardianWaitTimer); _guardianWaitTimer = null; }
  _clearGuardianWaitOverlay();
  _curHelpPost = post;
  _openHelpChat(post);
}

function _guardianRequestDeclined(post){
  if(_guardianWaitTimer){ clearTimeout(_guardianWaitTimer); _guardianWaitTimer = null; }
  _clearGuardianWaitOverlay();
  _showLeaveMessageModal(post, 'La persona declinó el acompañamiento en este momento.');
}

function _guardianRequestExpired(post){
  if(_grReqCh && sbClient){ try{ sbClient.removeChannel(_grReqCh); }catch(e){} _grReqCh = null; }
  var card = document.getElementById('guardianWaitCard');
  if(card){
    card.innerHTML = '<div style="font-size:40px;margin-bottom:12px">💤</div>'
      +'<div style="font-size:16px;font-weight:700;color:var(--ink);margin-bottom:10px">Sin respuesta</div>'
      +'<p style="font-size:13px;color:var(--ink3);margin:0 0 18px;line-height:1.55">Quizás el usuario que estás intentando conectar se desconectó y por eso no responde a la solicitud. Podés intentar en otro momento, o dejarle un mensaje en su buzón.</p>'
      +'<div style="display:flex;flex-direction:column;gap:10px">'
      +'<button onclick="_guardianCancelWait();pGoTo(\'help\')" style="padding:11px;background:var(--cream2);border:1.5px solid var(--border2);border-radius:12px;font-size:13px;font-weight:600;color:var(--ink3);cursor:pointer;font-family:\'Jost\',sans-serif">Intentar en otro momento</button>'
      +'<button onclick="_guardianCancelWait();_showLeaveMessageModal('+JSON.stringify(post)+',\'Quizás no estaba disponible en ese momento.\')" style="padding:11px;background:var(--sage);border:none;border-radius:12px;font-size:13px;font-weight:700;color:#fff;cursor:pointer;font-family:\'Jost\',sans-serif">💌 Enviar mensaje al buzón</button>'
      +'</div>';
  } else {
    _clearGuardianWaitOverlay();
    _showLeaveMessageModal(post, 'Quizás el usuario se desconectó y no pudo responder.');
  }
}

function _showLeaveMessageModal(post, reason){
  var existing = document.getElementById('leaveMessageOv');
  if(existing) existing.remove();
  var ov = document.createElement('div');
  ov.id = 'leaveMessageOv';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px';
  ov.innerHTML = '<div style="background:var(--cream);border-radius:20px;padding:28px 24px;max-width:340px;width:100%">'
    +'<div style="font-size:32px;text-align:center;margin-bottom:10px">💌</div>'
    +'<div style="font-size:15px;font-weight:700;color:var(--ink);margin-bottom:6px;text-align:center">'+_escHtml(reason)+'</div>'
    +'<div style="font-size:12px;color:var(--ink3);margin-bottom:14px;text-align:center">¿Querés dejarle un mensaje de apoyo para cuando vuelva?</div>'
    +'<textarea id="leaveMessageTa" placeholder="Escribí unas palabras de aliento…" rows="3" style="width:100%;background:var(--cream2);border:1.5px solid var(--border2);border-radius:12px;padding:10px 12px;font-size:13px;color:var(--ink);outline:none;resize:none;box-sizing:border-box;font-family:\'Jost\',sans-serif"></textarea>'
    +'<div style="display:flex;gap:10px;margin-top:14px">'
    +'<button onclick="document.getElementById(\'leaveMessageOv\').remove();pGoTo(\'help\')" style="flex:1;padding:11px;background:var(--cream2);border:1.5px solid var(--border2);border-radius:12px;font-size:13px;font-weight:600;color:var(--ink3);cursor:pointer;font-family:\'Jost\',sans-serif">Cancelar</button>'
    +'<button onclick="_sendLeaveMessage('+_jsAttr(post.id)+')" style="flex:1;padding:11px;background:var(--sage);border:none;border-radius:12px;font-size:13px;font-weight:700;color:#fff;cursor:pointer;font-family:\'Jost\',sans-serif">💙 Enviar</button>'
    +'</div></div>';
  document.body.appendChild(ov);
}

function _sendLeaveMessage(postId){
  var ta = document.getElementById('leaveMessageTa');
  var msg = ta ? ta.value.trim() : '';
  if(!msg){ pToast('✍️','Escribí unas palabras antes de enviar'); return; }
  var ov = document.getElementById('leaveMessageOv');
  if(ov) ov.remove();
  _initSupabase();
  if(sbClient){
    // Save the support message in guardian_requests
    sbClient.from('guardian_requests').update({support_msg:msg, status:'message_left'})
      .eq('post_id',postId).then(function(){}).catch(function(){});
    // Close the help post — it received support (a message), remove it from the wall
    sbClient.from('help_posts').update({closed:true}).eq('id',postId).then(function(){}).catch(function(){});
  }
  pToast('💌','Mensaje enviado. Lo verán cuando vuelvan 💚');
  setTimeout(function(){ pGoTo('help'); }, 1200);
}

function _subscribeSeekerToGuardianRequest(postId){
  _initSupabase();
  if(!sbClient || !postId) return;
  if(_seekerGrCh) try{ sbClient.removeChannel(_seekerGrCh); }catch(e){}
  if(_seekerGrPollTmr){ clearInterval(_seekerGrPollTmr); _seekerGrPollTmr = null; }
  _seekerGrCh = sbClient.channel('velo:seeker:'+postId)
    .on('postgres_changes', {event:'INSERT', schema:'public', table:'guardian_requests'}, function(payload){
      var r = payload.new||{};
      if(String(r.post_id) !== String(postId)) return;
      _showSeekerGuardianPopup(postId, r);
    })
    .subscribe(function(status, err){
      if(status !== 'SUBSCRIBED') console.warn('[seeker gr listener] status:', status, err||'');
    });
  // Polling fallback every 10s — catches offers if Realtime drops
  _seekerGrPollTmr = setInterval(function(){
    if(!sbClient) return;
    if(document.getElementById('seekerGuardianOv')) return; // already showing popup
    sbClient.from('guardian_requests').select('*')
      .eq('post_id', postId).eq('status','pending').order('created_at',{ascending:false}).limit(1)
      .then(function(res){
        if(res && res.data && res.data.length) _showSeekerGuardianPopup(postId, res.data[0]);
      }).catch(function(){});
  }, 10000);
}

function _showSeekerGuardianPopup(postId, row){
  var existing = document.getElementById('seekerGuardianOv');
  if(existing) return; // already showing
  var guardianName = row.guardian_name||'Guardián';
  var guardianAv   = row.guardian_av||'🌿';
  var reqId        = row.id||'';
  var isDark = document.body.classList.contains('r-dark');
  var cardBg   = isDark ? '#162a1e' : '#fff';
  var cardBrd  = isDark ? 'border:1px solid rgba(116,198,157,.22);' : '';
  var titleClr = isDark ? 'rgba(255,255,255,.95)' : '#1a2e1a';
  var bodyClr  = isDark ? 'rgba(210,240,222,.85)' : '#2D5040';
  var subClr   = isDark ? 'rgba(255,255,255,.55)' : '#6e9a84';
  var cdClr    = isDark ? '#72e0a6' : '#1B5E3A';
  var skipBg   = isDark ? 'rgba(255,255,255,.08)' : 'rgba(245,240,230,.9)';
  var skipBrd  = isDark ? 'rgba(255,255,255,.15)' : 'rgba(180,170,150,.4)';
  var skipClr  = isDark ? 'rgba(255,255,255,.7)' : '#5a7060';
  var ov = document.createElement('div');
  ov.id = 'seekerGuardianOv';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px';
  ov.innerHTML = '<div style="background:'+cardBg+';border-radius:20px;padding:28px 24px;max-width:340px;width:100%;text-align:center;'+cardBrd+'">'
    +'<div style="font-size:44px;margin-bottom:10px">'+_avInline(guardianAv,52)+'</div>'
    +'<div style="font-size:17px;font-weight:700;color:'+titleClr+';margin-bottom:8px;font-family:\'Cormorant Garamond\',serif">Un guardián quiere acompañarte 💙</div>'
    +'<div style="font-size:14px;color:'+bodyClr+';margin-bottom:6px"><strong>'+_escHtml(guardianName)+'</strong> vio tu mensaje y está aquí para escucharte.</div>'
    +'<div style="font-size:12px;color:'+subClr+';margin-bottom:10px">¿Aceptás el acompañamiento ahora?</div>'
    +'<div id="seekerGuardianCountdown" style="font-size:28px;font-weight:800;color:'+cdClr+';margin-bottom:18px">80</div>'
    +'<div style="display:flex;gap:10px">'
    +'<button onclick="_seekerDeclineRequest(\''+reqId+'\',\''+postId+'\')" style="flex:1;padding:12px;background:'+skipBg+';border:1.5px solid '+skipBrd+';border-radius:12px;font-size:13px;font-weight:600;color:'+skipClr+';cursor:pointer;font-family:\'Jost\',sans-serif">Ahora no</button>'
    +'<button onclick="_seekerAcceptRequest('+_jsAttr(reqId)+','+_jsAttr(postId)+','+_jsAttr(guardianName)+','+_jsAttr(guardianAv)+','+_jsAttr(row.guardian_id||'')+')\" style="flex:1;padding:12px;background:#1B5E3A;border:none;border-radius:12px;font-size:14px;font-weight:700;color:#fff;cursor:pointer;font-family:\'Jost\',sans-serif">💚 Aceptar</button>'
    +'</div></div>';
  document.body.appendChild(ov);
  // Countdown + auto-dismiss after 80s
  var seekSecs = 80;
  var seekCdEl = document.getElementById('seekerGuardianCountdown');
  var seekCdInt = setInterval(function(){
    seekSecs--;
    if(seekCdEl) seekCdEl.textContent = seekSecs;
    if(seekSecs <= 0){ clearInterval(seekCdInt); var el=document.getElementById('seekerGuardianOv'); if(el) el.remove(); }
  }, 1000);
  ov.setAttribute('data-cd-int', seekCdInt);
}

function _seekerAcceptRequest(reqId, postId, guardianName, guardianAv, guardianId){
  var ov = document.getElementById('seekerGuardianOv');
  if(ov){ var cdi = ov.getAttribute('data-cd-int'); if(cdi) clearInterval(parseInt(cdi,10)); ov.remove(); }
  // Stop polling — no longer needed once connected
  if(_seekerGrPollTmr){ clearInterval(_seekerGrPollTmr); _seekerGrPollTmr = null; }
  if(_seekerGrCh && sbClient){ try{ sbClient.removeChannel(_seekerGrCh); }catch(e){} _seekerGrCh = null; }
  _initSupabase();
  if(sbClient){
    sbClient.from('guardian_requests').update({status:'accepted'}).eq('id',reqId).then(function(){}).catch(function(){});
  }
  // Open a seeker-side help chat — guardianId is the peer to exchange messages with
  var safeEmoji = (guardianAv && !guardianAv.startsWith('data:') && !guardianAv.startsWith('http')) ? guardianAv : '💙';
  var fakePost = { id:postId, name:guardianName, emoji:safeEmoji, preview:'Guardián conectado',
    userId: guardianId||'', isSeeker:true };
  _curHelpPost = fakePost;
  _openHelpChat(fakePost);
  pToast('💚','¡Conectado/a con '+guardianName+'!');
}

function _seekerDeclineRequest(reqId, postId){
  var ov = document.getElementById('seekerGuardianOv');
  if(ov){ var cdi = ov.getAttribute('data-cd-int'); if(cdi) clearInterval(parseInt(cdi,10)); ov.remove(); }
  // Stop polling — no longer waiting for offers
  if(_seekerGrPollTmr){ clearInterval(_seekerGrPollTmr); _seekerGrPollTmr = null; }
  if(_seekerGrCh && sbClient){ try{ sbClient.removeChannel(_seekerGrCh); }catch(e){} _seekerGrCh = null; }
  _initSupabase();
  if(sbClient){
    sbClient.from('guardian_requests').update({status:'declined'}).eq('id',reqId).then(function(){}).catch(function(){});
    sbClient.from('help_posts').update({taken:false, taken_by:null}).eq('id',postId).then(function(){}).catch(function(){});
  }
  pToast('💙','De acuerdo. Tu mensaje sigue visible en la sala.');
}

// Re-subscribe seeker if they already have an active help post on page load
function _restoreSeekerSubscription(){
  var postId = safeLS('get','velo_my_help_post_id');
  if(postId){
    _subscribeSeekerToGuardianRequest(postId);
    // Immediate check — catch offers that arrived while the tab was closed or offline
    if(sbClient && !document.getElementById('seekerGuardianOv')){
      sbClient.from('guardian_requests').select('*')
        .eq('post_id', postId).eq('status','pending').order('created_at',{ascending:false}).limit(1)
        .then(function(res){
          if(res && res.data && res.data.length) _showSeekerGuardianPopup(postId, res.data[0]);
        }).catch(function(){});
    }
  }
  // Also check if there are any pending support messages
  _checkPendingSupportMessages();
}

function _checkPendingSupportMessages(){
  var postId = safeLS('get','velo_my_help_post_id');
  if(!postId) return;
  _initSupabase();
  if(!sbClient) return;
  sbClient.from('guardian_requests').select('*').eq('post_id',postId).eq('status','message_left').limit(1)
    .then(function(res){
      if(res.data && res.data.length){
        var row = res.data[0];
        var inbox = []; try{ inbox = JSON.parse(safeLS('get','velo_inbox')||'[]'); }catch(e){}
        var alreadyIn = inbox.some(function(m){ return m.id==='gr-msg-'+row.id; });
        if(!alreadyIn){
          inbox.unshift({ id:'gr-msg-'+row.id, tipo:'guardian', icon:'💙',
            remitente:row.guardian_name||'Guardián', asunto:'Un guardián te dejó un mensaje 💙',
            cuerpo:row.support_msg||'', extracto:(row.support_msg||'').slice(0,60),
            leido:false, prioritario:false, fecha:new Date(row.created_at).toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'}) });
          safeLS('set','velo_inbox', JSON.stringify(inbox.slice(0,100)));
          _updateInboxDot();
          pToast('💙','Tenés un mensaje de un guardián en tu buzón 💌');
          safeLS('set','velo_my_help_post_id',''); // clear since it's been handled
        }
      }
    }).catch(function(){});
}

function _openHelpChat(post){
  _setEl('helpChatTitle', post.name + ' · ' + post.emoji);
  var msgEl = document.getElementById('helpChatMessages');
  if(msgEl){
    var t = new Date();
    var tStr = t.getHours()+':'+(t.getMinutes()<10?'0':'')+t.getMinutes();
    msgEl.innerHTML = '<div class="feed-system-msg">Chat de acompañamiento iniciado · '+ tStr +'</div>';
  }
  _prevChatStatus = _presenceStatus();
  _inActiveChat = true;
  _updateGuardianPresence('ocupado');
  pGoTo('help-chat');
  _resetHelpInactivity();
  _subscribeHelpChat(post);
  _loadHelpChatHistory(post);
}

function _subscribeHelpChat(post){
  _initSupabase();
  if(_helpChatRtCh && sbClient){ try{ sbClient.removeChannel(_helpChatRtCh); }catch(e){} _helpChatRtCh = null; }
  if(!sbClient || !post.userId) return;
  var myId   = safeLS('get','velo_user_id')||safeLS('get','velo_user_email')||'';
  var peerId = post.userId;
  if(!myId || !peerId) return;
  _helpChatRtCh = sbClient.channel('velo:hchat:'+[myId,peerId].sort().join(':'))
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'direct_messages'}, function(payload){
      var m = payload.new||{};
      var relevant = (m.from_id===myId&&m.to_id===peerId)||(m.from_id===peerId&&m.to_id===myId);
      if(!relevant) return;
      if(m.text && m.text.startsWith('__velo_help_bye__:')){
        if(m.id && sbClient) sbClient.from('direct_messages').delete().eq('id',m.id).then(function(){}).catch(function(){});
        var _hBye = {}; try{ _hBye = JSON.parse(m.text.slice('__velo_help_bye__:'.length)); }catch(e){}
        _showHelpExitBanner(_hBye.name || m.from_name || 'El otro usuario');
        return;
      }
      if(m.from_id === myId) return; // already rendered optimistically
      _renderHelpChatMsg(m, false);
    })
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'direct_messages'}, function(payload){
      var m = payload.new||{};
      var relevant = (m.from_id===myId&&m.to_id===peerId)||(m.from_id===peerId&&m.to_id===myId);
      if(!relevant || !m.id) return;
      var bubble = document.querySelector('[data-sb-id="direct_messages:'+m.id+'"]');
      if(!bubble) return;
      var oldBar = bubble.querySelector('.msg-rx-bar');
      if(oldBar) oldBar.remove();
      if(m.reactions && typeof m.reactions === 'object'){
        var chips = Object.keys(m.reactions).map(function(e){
          var cnt = m.reactions[e]||1;
          return '<span class="msg-reaction" data-emoji="'+e+'" data-cnt="'+cnt+'" onclick="_msgReact(\''+e+'\')">'+e+' '+cnt+'</span>';
        }).join('');
        if(chips){
          var newBar = document.createElement('div');
          newBar.className = 'msg-rx-bar';
          newBar.innerHTML = chips;
          bubble.appendChild(newBar);
        }
      }
    })
    .subscribe();
}

async function _loadHelpChatHistory(post){
  _initSupabase();
  if(!sbClient || !post.userId) return;
  if(post.anon) return; // anonymous post → start fresh, never show previous history
  var myId = safeLS('get','velo_user_id')||safeLS('get','velo_user_email')||'';
  if(!myId) return;
  try{
    var {data} = await sbClient.from('direct_messages')
      .select('*')
      .or('and(from_id.eq.'+myId+',to_id.eq.'+post.userId+'),and(from_id.eq.'+post.userId+',to_id.eq.'+myId+')')
      .order('created_at',{ascending:true}).limit(100);
    if(data && data.length){
      data.forEach(function(m){ _renderHelpChatMsg(m, m.from_id===myId); });
      var el = document.getElementById('helpChatMessages');
      if(el) el.scrollTop = el.scrollHeight;
    }
  }catch(e){}
}

function _renderHelpChatMsg(m, isOwn){
  var msgEl = document.getElementById('helpChatMessages');
  if(!msgEl) return;
  var _sentinels = ['__velo_chat_req__','__velo_chat_acc__','__velo_chat_rej__','__velo_chat_busy__'];
  var _t=m.text||''; if(_sentinels.indexOf(_t)>=0||_t.startsWith('__velo_guardian_req__:')||_t.startsWith('__velo_guardian_acc__:')||_t.startsWith('__velo_guardian_rej__:')||_t.startsWith('__velo_guardian_bye__:')||_t.startsWith('__velo_dm_bye__:')||_t.startsWith('__velo_help_bye__:')) return;
  var post = _curHelpPost||{};
  var div = document.createElement('div');
  div.innerHTML = _buildMsgBubble(m.text||'', isOwn, isOwn?'':(post.emoji||'💙'), isOwn?'':(post.name||''), 'helpChatInput', 'helpChatReplyBar', '', m.reactions||{}, m.id?'direct_messages:'+m.id:'', isOwn?'':(m.from_id||''));
  var child = div.firstElementChild;
  if(child){ msgEl.appendChild(child); msgEl.scrollTop = msgEl.scrollHeight; }
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
  _geminiModerateContent(text, 'sala-de-ayuda-chat');
  _resetHelpInactivity();
  var quote = _getReplyQuote('helpChatReplyBar');
  pClearReplyBar('helpChatReplyBar');
  var fullText = quote ? '↩ "'+quote.slice(0,60)+(quote.length>60?'…':'')+'"  \n'+text : text;
  // Optimistic render
  var msgEl = document.getElementById('helpChatMessages');
  if(msgEl){
    var div = document.createElement('div');
    div.innerHTML = _buildMsgBubble(text, true, '', '', 'helpChatInput', 'helpChatReplyBar', quote);
    var child = div.firstElementChild; if(child) msgEl.appendChild(child);
    msgEl.scrollTop = msgEl.scrollHeight;
  }
  _geminiCrisisCheck(text);
  // Insert to Supabase → real-time delivers message to the other party
  _initSupabase();
  if(sbClient && _curHelpPost && _curHelpPost.userId){
    var myId   = safeLS('get','velo_user_id')||safeLS('get','velo_user_email')||'';
    var myName = safeLS('get','velo_user_name')||'';
    var myAv   = safeLS('get','velo_user_av')||'💚';
    // Capture the just-rendered bubble so we can stamp its data-sb-id once Supabase returns the row ID.
    // Without this, reactions from the other user can't find the bubble via the UPDATE subscription.
    var _hLastBubble = msgEl ? msgEl.lastElementChild : null;
    sbClient.from('direct_messages').insert({
      from_id:myId, from_name:myName, from_av:myAv, to_id:_curHelpPost.userId, text:fullText
    }).select('id').single().then(function(res){
      if(res && res.data && res.data.id && _hLastBubble){
        _hLastBubble.setAttribute('data-sb-id', 'direct_messages:'+res.data.id);
      }
    }).catch(function(){});
  }
}

function pLeaveHelpChat(){
  if(_helpChatInactivityTimer){ clearTimeout(_helpChatInactivityTimer); _helpChatInactivityTimer = null; }
  // Notify peer with exit sentinel before disconnecting
  var _hPost = _curHelpPost;
  if(sbClient && _hPost && _hPost.userId){
    var _hMyId   = safeLS('get','velo_user_id')||'';
    var _hMyName = safeLS('get','velo_user_name')||'Usuario';
    var _hMyAv   = safeLS('get','velo_user_av')||'🧑';
    if(_hMyId){
      sbClient.from('direct_messages').insert({
        from_id:_hMyId, from_name:_hMyName, from_av:_hMyAv, to_id:_hPost.userId,
        text:'__velo_help_bye__:'+JSON.stringify({ name:_hMyName, av:_hMyAv })
      }).then(function(){}).catch(function(){});
    }
  }
  if(_helpChatRtCh && sbClient){ try{ sbClient.removeChannel(_helpChatRtCh); }catch(e){} _helpChatRtCh = null; }
  var post = _curHelpPost;
  _curHelpPost = null;
  // Save guardian info for the post-chat review (seeker side only)
  if(post && post.isSeeker && post.userId){
    safeLS('set','velo_postchat_guardian', JSON.stringify({ id:post.userId, name:post.name||'Guardián' }));
  }
  var exitStatus = safeLS('get','velo_is_guardian') === 'true' ? 'disponible' : (_prevChatStatus || _presenceStatus());
  _inActiveChat = false;
  _prevChatStatus = null;
  if(safeLS('get','velo_is_guardian') === 'true') safeLS('set','velo_guardian_status','disponible');
  _updateGuardianPresence(exitStatus);
  _showHelpChatRating(post);
}

function _showHelpChatRating(post){
  var existing = document.getElementById('helpRatingOv');
  if(existing) existing.remove();
  var isDark = document.body.classList.contains('r-dark');
  var ov = document.createElement('div');
  ov.id = 'helpRatingOv';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px';
  var cardBg   = isDark ? '#162a1e' : '#fff';
  var cardBrd  = isDark ? 'border:1px solid rgba(116,198,157,.22);' : '';
  var titleClr = isDark ? 'rgba(255,255,255,.95)' : '#1a2e1a';
  var subClr   = isDark ? 'rgba(255,255,255,.60)' : '#6e9a84';
  var favBg    = isDark ? 'rgba(116,198,157,.15)' : 'rgba(116,198,157,.12)';
  var favBrd   = isDark ? 'rgba(116,198,157,.3)' : 'rgba(116,198,157,.25)';
  var favTxtClr= isDark ? '#a8dfc0' : '#1B5E3A';
  var favBtnBg = isDark ? 'rgba(116,198,157,.3)' : 'rgba(116,198,157,.18)';
  var favBtnClr= isDark ? '#c0f0d8' : '#1B5E3A';
  var skipBg   = isDark ? 'rgba(255,255,255,.08)' : 'rgba(245,240,230,.9)';
  var skipBrd  = isDark ? 'rgba(255,255,255,.15)' : 'rgba(180,170,150,.4)';
  var skipClr  = isDark ? 'rgba(255,255,255,.7)' : '#5a7060';
  ov.innerHTML = '<div style="background:'+cardBg+';border-radius:20px;padding:28px 24px;max-width:340px;width:100%;text-align:center;'+cardBrd+'">'
    +'<div style="font-size:44px;margin-bottom:12px">💚</div>'
    +'<div style="font-size:17px;font-weight:700;color:'+titleClr+';margin-bottom:6px;font-family:\'Cormorant Garamond\',serif">¡Conversación finalizada!</div>'
    +'<div style="font-size:13px;color:'+subClr+';margin-bottom:20px;line-height:1.5">Gracias por acompañar y ser acompañado/a. 🌿</div>'
    +(post && post.userId && post.userId !== 'anon' && !post.anon
      ? '<div style="margin-bottom:16px;padding:14px;background:'+favBg+';border-radius:14px;border:1px solid '+favBrd+'">'
        +'<div style="font-size:12px;color:'+favTxtClr+';margin-bottom:10px;font-weight:600">¿Querés mantener contacto con esta persona?</div>'
        +'<button onclick="pAddFav('+_jsAttr(post.userId)+','+_jsAttr(post.name||'Usuario')+','+_jsAttr(post.emoji||'🧑')+');document.getElementById(\'helpRatingOv\').remove();pGoTo(\'post-chat\')" style="padding:11px 22px;background:'+favBtnBg+';border:1.5px solid '+favBrd+';border-radius:100px;font-size:14px;font-weight:700;color:'+favBtnClr+';cursor:pointer;font-family:\'Jost\',sans-serif;width:100%">⭐ Guardar en favoritos</button>'
        +'</div>'
      : '')
    +'<button onclick="document.getElementById(\'helpRatingOv\').remove();pGoTo(\'post-chat\')" style="padding:12px 28px;background:'+skipBg+';border:1.5px solid '+skipBrd+';border-radius:100px;font-size:13px;font-weight:600;color:'+skipClr+';cursor:pointer;font-family:\'Jost\',sans-serif;width:100%">Omitir</button>'
    +'</div>';
  document.body.appendChild(ov);
}

function _helpRateStar(btn, rating, postId){
  var stars = document.querySelectorAll('#helpRatingStars button');
  stars.forEach(function(s,i){ s.style.opacity = i < rating ? '1' : '.4'; });
  _initSupabase();
  if(sbClient && postId){
    sbClient.from('guardian_requests').update({rating:rating}).eq('post_id',postId).then(function(){}).catch(function(){});
  }
  setTimeout(function(){
    var ov = document.getElementById('helpRatingOv');
    if(ov) ov.remove();
    pGoTo('post-chat');
    pToast('🌟','¡Gracias por tu valoración! 💚');
  }, 600);
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
    pShowDailyLimitModal('help');
    return;
  }
  _incDailyLimit('help');
  var msg = ta.value.trim();
  _geminiModerateContent(msg, 'sala-de-ayuda');
  var showProfile = document.getElementById('helpShowProfile') && document.getElementById('helpShowProfile').checked;
  var isAnon = !showProfile;
  var name = isAnon ? 'Usuario Anónimo' : _myDisplayName();
  var userAv = isAnon ? '' : (safeLS('get','velo_user_av')||'🧑');
  ta.value = '';
  closeModal('helpFormOv');
  pToast('💌','Mensaje publicado. Alguien te acompañará pronto 💚');
  var posts = []; try{ posts = JSON.parse(safeLS('get','velo_help_posts')||'[]'); }catch(e){}
  var ts = Date.now();
  posts.unshift({ id:'hu'+ts, emoji:'💙', anon:isAnon, name:name, av:userAv, time:ts, preview:msg, taken:false,
    userId: safeLS('get','velo_user_id')||safeLS('get','velo_user_email')||'' });
  safeLS('set','velo_help_posts', JSON.stringify(posts.slice(0,50)));
  safeLS('set','velo_helped_once','1');
  // Insert to Supabase so all users see it (await so pRenderHelp sees the new post)
  _initSupabase();
  if(sbClient){
    try{
      await sbClient.from('help_posts').insert({ id:'hu'+ts,
        user_id: safeLS('get','velo_user_id')||null, user_name: name, user_av: userAv,
        emoji: isAnon ? '💙' : (userAv || '🧑'), preview:msg, urgencia:'normal', anon:isAnon, taken:false
      });
    }catch(e){ console.error('[pSendHelp insert]', e); }
  }
  var inbox = []; try{ inbox = JSON.parse(safeLS('get','velo_inbox')||'[]'); }catch(e){}
  inbox.unshift({ id:'help-'+ts, tipo:'sistema', icon:'💚', remitente:'Sala de Ayuda', asunto:'Tu mensaje fue publicado', cuerpo:'Tu mensaje fue publicado en la Sala de Ayuda. Alguien te acompañará pronto.\n\n"'+msg+'"', extracto:'Alguien te acompañará pronto.', leido:false, prioritario:false, fecha:new Date().toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'}) });
  safeLS('set','velo_inbox', JSON.stringify(inbox.slice(0,100)));
  // Store seeker's own post id so we can receive guardian notifications
  safeLS('set','velo_my_help_post_id','hu'+ts);
  _subscribeSeekerToGuardianRequest('hu'+ts);
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
  var prompt = 'You are the content moderation system for Velo, a peer-to-peer mental health support app.\n'
    +'Analyze the following message (may be in Spanish or English) and detect ONLY: harassment/bullying toward others, aggression/threats, or spam/advertising/self-promotion.\n'
    +'NEVER flag as problematic: expressions of pain, sadness, anxiety, personal crisis, suicidal ideation, requests for help, or emotional venting — these are exactly why this app exists.\n'
    +'NEVER flag venting, profanity in self-expression (e.g. "me siento una mierda"), or dark/negative feelings.\n'
    +'Only flag content directed aggressively AT others, or clear spam/advertising.\n'
    +'Respond ONLY with valid JSON, no markdown: {"problema": true/false, "tipo": "acoso|spam|ninguno", "gravedad": "alta|media|baja"}\n\n'
    +'Message: "'+text.replace(/"/g,"'")+'"';
  var result = await _geminiCall(prompt);
  if(!result) return;
  try{
    var match = result.match(/\{[\s\S]*\}/);
    if(!match) return;
    var data = JSON.parse(match[0]);
    if(data.problema && data.gravedad === 'alta'){
      var uid = safeLS('get','velo_user_id') || '';
      var flagEntry = { ts:Date.now(), tipo:'abuse_detect', section:section, circle:section,
        motivo:'Gemini — '+data.tipo+' detectado', detail:text.slice(0,120), resolved:false };
      var audit = []; try{ audit = JSON.parse(safeLS('get','velo_audit_log')||'[]'); }catch(e){}
      audit.unshift(flagEntry);
      safeLS('set','velo_audit_log', JSON.stringify(audit.slice(0,500)));
      _initSupabase();
      if(sbClient){
        sbClient.from('moderation_flags').insert({
          section: section, tipo: data.tipo, gravedad: 'alta',
          content: text.slice(0,300), user_id: uid, resolved: false
        }).then(function(){}).catch(function(){});
      }
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

  // Admin-published news take priority over AI-generated ones
  _initSupabase();
  var adminNews = (await sbLoadAdminNews()).map(function(n){
    return { emoji:n.emoji||'📰', titulo:n.titulo, cuerpo:n.cuerpo, reflexion:'',
      sourceUrl:n.source_url||'', sourceName:n.source_name||'Velo', _src:'admin' };
  });
  if(safeLS('get','velo_admin_news_only') === '1' && adminNews.length){
    _renderNewsList(newsEl, adminNews);
    return;
  }

  var cached = safeLS('get', cacheKey);
  if(cached){
    try{
      var cachedItems = JSON.parse(cached);
      // Skip static fallback cache — always re-fetch if we only have static content
      var isLive = cachedItems.some(function(it){ return it._src === 'g' || it._src === 'ai'; });
      if(isLive){ _renderNewsList(newsEl, adminNews.concat(cachedItems)); return; }
    }catch(e){}
  }
  newsEl.innerHTML = '<div style="text-align:center;padding:40px;color:var(--ink4)">🌞 Buscando noticias positivas del mundo...</div>';

  var monthYear = ['enero','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][new Date().getMonth()]+' '+new Date().getFullYear();

  // Attempt 1: Grounded search — Gemini with Google Search finds real articles with verified URLs
  // We ask Gemini to include the sourceUrl directly in JSON (it has web access via grounding tool).
  // Grounding chunks are used as a secondary fallback for items that got no URL from the JSON.
  var gPrompt = 'Use Google Search to find 5 real positive news stories published recently ('+monthYear+'). '
    +'Topics: medical breakthroughs, environment/nature wins, human solidarity, science, animals rescued, social innovation. '
    +'For EACH story you MUST include: the real article URL (sourceUrl), the news outlet name (sourceName), '
    +'the article title, a 2-3 sentence summary in Argentine Spanish (rioplatense), and a short wellbeing reflection. '
    +'Only include stories you actually found via Google Search — do NOT invent stories or URLs. '
    +'Respond ONLY with valid JSON array, no markdown fences: '
    +'[{"emoji":"...","titulo":"...","cuerpo":"...","reflexion":"...","sourceName":"...","sourceUrl":"https://..."}]';

  var result = await _geminiCallGrounded(gPrompt, { maxOutputTokens:2000 });
  var items = [];

  if(result.text){
    try{
      var raw = result.text.replace(/```json\n?|```/g,'').trim();
      var m = raw.match(/\[[\s\S]*\]/);
      if(m) items = JSON.parse(m[0]);
    }catch(e){}
    // Validate URLs returned by Gemini — keep only real http URLs (grounding ensures they're real).
    // For any item still missing a URL, try to fill from grounding chunks (pool of all cited sources).
    var chunkPool = (result.urls || []).slice(); // [{uri, title}, ...]
    items.forEach(function(item){
      var hasUrl = item.sourceUrl && item.sourceUrl.startsWith('http');
      if(!hasUrl && chunkPool.length){
        var chunk = chunkPool.shift();
        item.sourceUrl = chunk.uri;
        if(!item.sourceName || item.sourceName.length < 2) item.sourceName = chunk.title || 'Fuente';
      }
      if(!item.sourceUrl || !item.sourceUrl.startsWith('http')) item.sourceUrl = '';
    });
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
    // Static curated fallback — always show something positive
    items = [
      { emoji:'🌱', titulo:'Reforestación récord: 1.000 millones de árboles plantados en 2024', cuerpo:'Una coalición de países y organizaciones alcanzó el hito histórico de plantar mil millones de árboles en un solo año, contribuyendo a absorber millones de toneladas de CO₂ y restaurar ecosistemas degradados en cinco continentes.', reflexion:'Cada árbol es un acto de fe en el futuro. La humanidad puede regenerarse cuando actúa unida. 🌿', _src:'static' },
      { emoji:'💊', titulo:'Nueva terapia elimina dolor crónico sin opioides en ensayo clínico', cuerpo:'Investigadores desarrollaron un tratamiento basado en neuromodulación que redujo el dolor crónico en un 80% de los participantes sin generar dependencia, abriendo una nueva era en el manejo del dolor.', reflexion:'El alivio del sufrimiento humano sigue avanzando. La ciencia trabaja para que vivir bien sea posible para todos. 💙', _src:'static' },
      { emoji:'🤝', titulo:'Comunidades rurales en África logran autosuficiencia energética solar', cuerpo:'Más de 200 aldeas en África Subsahariana accedieron por primera vez a electricidad limpia gracias a micro-redes solares comunitarias, transformando la educación, la salud y la economía local.', reflexion:'La energía limpia no es solo tecnología — es dignidad y oportunidad. ✨', _src:'static' },
      { emoji:'🐋', titulo:'Población de ballenas jorobadas se recuperó al 93% respecto a niveles históricos', cuerpo:'Después de décadas de protección internacional, las ballenas jorobadas del Atlántico Sur alcanzaron casi su población pre-cacería, en uno de los mayores éxitos de conservación marina de la historia.', reflexion:'La naturaleza sana cuando le damos tiempo y espacio. Esta historia nos recuerda que el daño puede revertirse. 🌊', _src:'static' },
      { emoji:'📚', titulo:'País nórdico logra 100% de alfabetización digital en adultos mayores de 60', cuerpo:'Un programa nacional de inclusión digital capacitó a más de 400.000 personas mayores en el uso de internet, videollamadas y servicios en línea, reduciendo el aislamiento social en un 40%.', reflexion:'Aprender no tiene edad. Cada persona conectada es una vida más acompañada. 🌻', _src:'static' }
    ];
  }

  safeLS('set', cacheKey, JSON.stringify(items));
  _renderNewsList(newsEl, adminNews.concat(items));
}

function _renderNewsList(el, items){
  _newsListCache = items;
  el.innerHTML = items.map(function(item, i){
    var hasLink = item.sourceUrl && item.sourceUrl.startsWith('http');
    // Only show a source name badge for admin-curated content with a real verified link.
    // Groq-generated items have no web access so source names are AI-invented — show "Velo IA" instead.
    var isAdminReal = item._src === 'admin' && hasLink;
    var sourceTag = isAdminReal
      ? '<a href="'+_escHtml(item.sourceUrl)+'" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" style="display:inline-flex;align-items:center;gap:3px;color:var(--sage2);font-weight:700;text-decoration:none;background:var(--sage7);padding:3px 8px;border-radius:100px;border:1px solid rgba(116,198,157,.25)">🔗 '+_escHtml(item.sourceName||'Ver fuente')+'</a>'
      : '<span style="color:var(--ink5);font-style:italic">✨ Historia de bienestar · Velo IA</span>';
    return '<div class="p-card p-card--hover" style="margin-bottom:14px;padding:18px;cursor:pointer" onclick="pOpenNewsDetail('+i+')">'
      +'<div style="display:flex;align-items:flex-start;gap:14px">'
      +'<div style="font-size:36px;line-height:1;flex-shrink:0">'+_escHtml(item.emoji||'📰')+'</div>'
      +'<div style="flex:1;min-width:0">'
      +'<div style="font-family:\'Cormorant Garamond\',serif;font-size:17px;color:var(--ink);margin-bottom:6px;font-weight:700">'+_escHtml(item.titulo)+'</div>'
      +'<div style="font-size:13px;color:var(--ink2);line-height:1.6">'+_escHtml(item.cuerpo)+'</div>'
      +'<div style="margin-top:10px;font-size:11px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">'
      +sourceTag
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
  var _nd = new Date();
  var _months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  var _dateStr = _nd.getDate()+' de '+_months[_nd.getMonth()]+' de '+_nd.getFullYear();
  var isAdminRealDetail = item._src === 'admin' && hasLink;
  var sourceRef = isAdminRealDetail
    ? '<a href="'+_escHtml(item.sourceUrl)+'" target="_blank" rel="noopener noreferrer" style="font-size:12px;color:var(--sage2);font-weight:600;text-decoration:none;display:inline-flex;align-items:center;gap:4px">🔗 '+_escHtml(item.sourceName||'Ver fuente')+'</a>'
    : '<span style="font-size:12px;color:var(--ink4);font-style:italic">✨ Historia de bienestar · Velo IA</span>';
  var sourceBlock = '<div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px 12px;margin-bottom:18px;padding:10px 14px;background:rgba(116,198,157,.07);border-radius:10px;border:1px solid rgba(116,198,157,.18)">'
    +'<span style="font-size:12px;color:var(--ink4)">📅 '+_dateStr+'</span>'
    +'<span style="color:var(--ink5);font-size:12px">·</span>'
    +sourceRef
    +'</div>';
  var ov = document.createElement('div');
  ov.className = 'p-modal-ov show';
  ov.id = 'newsDetailOv';
  ov.innerHTML = '<div class="p-sheet" style="max-height:85vh;overflow-y:auto">'
    +'<div class="p-sheet-handle"></div>'
    +'<div style="font-size:52px;text-align:center;margin-bottom:12px">'+_escHtml(item.emoji||'📰')+'</div>'
    +'<h2 style="font-family:\'Cormorant Garamond\',serif;font-size:22px;font-weight:700;color:var(--ink);margin-bottom:14px;line-height:1.3;text-align:center">'+_escHtml(item.titulo)+'</h2>'
    +sourceBlock
    +'<p style="font-size:14px;color:var(--ink2);line-height:1.75;margin-bottom:20px">'+_escHtml(item.cuerpo)+'</p>'
    +'<div style="background:var(--sage7);border-radius:12px;padding:12px 14px;margin-bottom:20px">'
    +'<div style="font-size:11px;font-weight:700;color:var(--sage3);letter-spacing:.5px;margin-bottom:6px">✨ REFLEXIÓN VELO IA</div>'
    +'<p style="font-size:13px;color:var(--ink3);line-height:1.65;margin:0;font-style:italic">'+_escHtml(item.reflexion||'Cada buena noticia nos recuerda que el mundo avanza con esperanza.')+'</p>'
    +'</div>'
    +(hasLink
      ? '<a href="'+item.sourceUrl+'" target="_blank" rel="noopener noreferrer" class="p-btn p-btn--secondary p-btn--lg p-btn--full" style="display:block;text-align:center;text-decoration:none;margin-bottom:10px;background:var(--sage7);border-color:rgba(116,198,157,.4);color:var(--sage2)">🔗 Leer artículo completo en '+_escHtml(item.sourceName||'la fuente')+'</a>'
      : '<a href="https://www.google.com/search?q='+encodeURIComponent(item.titulo)+'" target="_blank" rel="noopener noreferrer" class="p-btn p-btn--secondary p-btn--lg p-btn--full" style="display:block;text-align:center;text-decoration:none;margin-bottom:10px;background:var(--sage7);border-color:rgba(116,198,157,.4);color:var(--sage2)">🔍 Buscar noticia en Google</a>'
    )
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
  if(!isUser){
    // Render **bold** markdown in bot responses (text is already HTML-escaped)
    var bubble = div.querySelector('.feed-bubble');
    if(bubble) bubble.innerHTML = bubble.innerHTML.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  }
  var child = div.firstElementChild;
  if(child) msgEl.appendChild(child);
  msgEl.scrollTop = msgEl.scrollHeight;
}

async function _geminiChat(systemPrompt, msgs, cfg){
  // 1. Gemini proxy — primary (multi-turn chat)
  try{
    var pr = await fetch(GEMINI_PROXY, { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ type:'chat', systemPrompt:systemPrompt, msgs:msgs, cfg:cfg||{} }) });
    if(pr.ok){ var t1 = _gText(await pr.json()); if(t1) return t1; }
    else { var e1={}; try{e1=await pr.json();}catch(x){} console.warn('[Velo] Gemini chat',pr.status,e1.error||''); }
  }catch(e){ console.warn('[Velo] Gemini chat error:',e.message); }
  // 2. Groq proxy — fallback multi-turn chat (llama-3.3-70b)
  try{
    var gr = await fetch(GROQ_PROXY, { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ type:'chat', systemPrompt:systemPrompt, msgs:msgs, cfg:cfg||{} }) });
    if(gr.ok){ var t2 = _gText(await gr.json()); if(t2) return t2; }
  }catch(e){}
  // 3. Last resort: embed conversation as single generate prompt
  var convLines = msgs.slice(-8).map(function(m){
    return (m.user ? 'Usuario' : 'Acompañante Velo') + ': ' + m.text;
  });
  var fallbackPrompt = systemPrompt
    + '\n\nConversación hasta ahora:\n' + convLines.join('\n')
    + '\n\nAcompañante Velo (respondé en 2-3 oraciones, cálido y específico a lo que el usuario dijo):';
  return _geminiCall(fallbackPrompt, Object.assign({ temperature:0.88, maxOutputTokens:220 }, cfg||{}));
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

  var systemPrompt = 'Sos Velo, un acompañante empático y cálido de una app de acompañamiento emocional entre pares. '
    +'Tu rol es escuchar activamente, validar emociones genuinamente y ofrecer apoyo real sin juzgar ni diagnosticar. '
    +'Respondés en español rioplatense (usás "vos", "te", "estás", "querés"). '
    +'Tus respuestas tienen 3-5 oraciones: primero validás la emoción específica que mencionó la persona, luego ofrecés una reflexión o acompañamiento genuino, y terminás con una pregunta abierta que invite a seguir hablando. '
    +'NUNCA repitas la misma frase. NUNCA des respuestas genéricas o de formulario. '
    +'Siempre respondés refiriéndote exactamente a lo que el usuario dijo, con detalles concretos de su situación. '
    +'Si mencionan riesgo de autolesión o crisis, con calidez invitales a la Sala de Ayuda o al 135 (Argentina). '
    +'No sos médico ni terapeuta. Sos un acompañante que escucha de verdad.';

  var reply = await _geminiChat(systemPrompt, _calmAIMsgs.slice(-12), { temperature:0.88, maxOutputTokens:420 });
  if(!reply){
    // Auto-retry once after 1.5s (handles cold-start / transient failures)
    await new Promise(function(r){ setTimeout(r, 1500); });
    reply = await _geminiChat(systemPrompt, _calmAIMsgs.slice(-12), { temperature:0.88, maxOutputTokens:420 });
  }
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
        var codeMap = { AR:'🇦🇷 Argentina', UY:'🇺🇾 Uruguay', CL:'🇨🇱 Chile', CO:'🇨🇴 Colombia', MX:'🇲🇽 México', ES:'🇪🇸 España', PE:'🇵🇪 Perú', VE:'🇻🇪 Venezuela', BR:'🇧🇷 Brasil', DE:'🇩🇪 Alemania', IT:'🇮🇹 Italia', FR:'🇫🇷 Francia', US:'🇺🇸 Estados Unidos', CR:'🇨🇷 Costa Rica', PR:'🇵🇷 Puerto Rico', BO:'🇧🇴 Bolivia', SV:'🇸🇻 El Salvador', EC:'🇪🇨 Ecuador', PT:'🇵🇹 Portugal' };
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
  '🇩🇪 Alemania': [
    { label:'Emergencias',                       num:'112',             url:'tel:112' },
    { label:'Policía',                           num:'110',             url:'tel:110' },
    { label:'Telefonseelsorge — Crisis emocional (24h)', num:'0800 111 0 111', url:'tel:08001110111' },
    { label:'Telefonseelsorge — línea alternativa', num:'0800 111 0 222', url:'tel:08001110222' },
    { label:'Violencia doméstica',               num:'08000 116 016',   url:'tel:0800116016' }
  ],
  '🇮🇹 Italia': [
    { label:'Emergencias',                       num:'112',             url:'tel:112' },
    { label:'Ambulancia',                        num:'118',             url:'tel:118' },
    { label:'Policía',                           num:'113',             url:'tel:113' },
    { label:'Telefono Amico — Crisis emocional', num:'02 2327 2327',    url:'tel:0223272327' },
    { label:'Telefono Azzurro (menores)',         num:'19696',           url:'tel:19696' },
    { label:'Violencia de género',               num:'1522',            url:'tel:1522' }
  ],
  '🇫🇷 Francia': [
    { label:'Emergencias',                       num:'112',             url:'tel:112' },
    { label:'SAMU — Ambulancia',                 num:'15',              url:'tel:15' },
    { label:'Policía',                           num:'17',              url:'tel:17' },
    { label:'3114 — Prévention Suicide (24h)',   num:'3114',            url:'tel:3114' },
    { label:'Violencia de género',               num:'3919',            url:'tel:3919' }
  ],
  '🇺🇸 Estados Unidos': [
    { label:'Emergencias',                       num:'911',             url:'tel:911' },
    { label:'988 Suicide & Crisis Lifeline (24h)', num:'988',           url:'tel:988' },
    { label:'Crisis Text Line',                  num:'Texto HOME → 741741', url:'sms:741741' },
    { label:'SAMHSA Helpline',                   num:'1-800-662-4357',  url:'tel:18006624357' },
    { label:'Violencia doméstica (NDVH)',        num:'1-800-799-7233',  url:'tel:18007997233' },
    { label:'Trevor Project (LGBT+)',            num:'1-866-488-7386',  url:'tel:18664887386' }
  ],
  '🇨🇷 Costa Rica': [
    { label:'Emergencias',                       num:'911',             url:'tel:911' },
    { label:'Cruz Roja',                         num:'128',             url:'tel:128' },
    { label:'Línea de Crisis — CCSS',            num:'800 800 4000',    url:'tel:8008004000' },
    { label:'Violencia doméstica',               num:'800 800 4010',    url:'tel:8008004010' }
  ],
  '🇵🇷 Puerto Rico': [
    { label:'Emergencias',                       num:'911',             url:'tel:911' },
    { label:'Línea PAS — Crisis emocional (24h)', num:'1-800-981-0023', url:'tel:18009810023' },
    { label:'Crisis Text Line',                  num:'Texto HOME → 741741', url:'sms:741741' },
    { label:'Violencia doméstica',               num:'787-765-2285',    url:'tel:7877652285' }
  ],
  '🇧🇴 Bolivia': [
    { label:'Emergencias',                       num:'911',             url:'tel:911' },
    { label:'Policía (DIPROVE)',                 num:'110',             url:'tel:110' },
    { label:'Bomberos',                          num:'119',             url:'tel:119' },
    { label:'Violencia de género (SLIM)',        num:'800 10 4100',     url:'tel:800104100' }
  ],
  '🇸🇻 El Salvador': [
    { label:'Emergencias',                       num:'911',             url:'tel:911' },
    { label:'Policía (PNC)',                     num:'911',             url:'tel:911' },
    { label:'Cruz Roja',                         num:'2222-5155',       url:'tel:22225155' },
    { label:'Línea Vida — Salud Mental',         num:'132',             url:'tel:132' },
    { label:'Violencia de género',               num:'126',             url:'tel:126' }
  ],
  '🇪🇨 Ecuador': [
    { label:'Emergencias',                       num:'911',             url:'tel:911' },
    { label:'Policía',                           num:'101',             url:'tel:101' },
    { label:'Bomberos',                          num:'102',             url:'tel:102' },
    { label:'Cruz Roja',                         num:'131',             url:'tel:131' },
    { label:'Salud Mental — MSP',               num:'171',             url:'tel:171' },
    { label:'Violencia de género',               num:'1800 137 137',    url:'tel:1800137137' }
  ],
  '🇵🇹 Portugal': [
    { label:'Emergencias',                       num:'112',             url:'tel:112' },
    { label:'SNS 24 — Serviço Nacional de Saúde (24h)', num:'808 24 24 24', url:'tel:808242424' },
    { label:'SOS Voz Amiga — Crisis emocional',  num:'213 544 545',     url:'tel:213544545' },
    { label:'SOS Voz Amiga — línea alternativa', num:'912 802 669',     url:'tel:912802669' },
    { label:'Violência no Namoro (APAV)',         num:'116 006',         url:'tel:116006' },
    { label:'Violencia doméstica (UMAR)',         num:'800 202 148',     url:'tel:800202148' }
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
    +'<select id="sosCountrySel" onchange="pSosCountry(this.value)" tabindex="-1" style="width:100%;padding:10px 14px;background:rgba(255,255,255,.08);border:1.5px solid rgba(255,255,255,.15);border-radius:12px;color:#fff;font-size:13px;font-weight:600;font-family:\'Jost\',sans-serif;cursor:pointer">'
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
  // iOS Safari scrolls the sheet to the first focusable element (<select>) when it's injected.
  // Reset scrollTop immediately and again after the next paint so the header stays visible.
  var _sheet = document.querySelector('#sosOv .p-sheet');
  if(_sheet){
    _sheet.scrollTop = 0;
    requestAnimationFrame(function(){ _sheet.scrollTop = 0; });
    setTimeout(function(){ _sheet.scrollTop = 0; }, 80);
  }
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

async function pRenderBottleResponses(){
  var el = document.getElementById('bottleRespList');
  if(!el) return;

  // Only show bottles YOU replied to — responses to your own go to Buzón Velo
  var cutoff24h = Date.now() - 24*3600*1000;
  var replied = []; try{ replied = JSON.parse(safeLS('get','velo_bottles_replied')||'[]'); }catch(e){}
  // Remove expired entries (> 24h) and persist
  replied = replied.filter(function(r){ return r.ts && r.ts > cutoff24h; });
  safeLS('set','velo_bottles_replied', JSON.stringify(replied));

  if(!replied.length){
    el.innerHTML = '<div class="p-empty"><span class="p-empty-emoji">💬</span>'
      +'<div class="p-empty-title" style="color:var(--ink2)">Aún no respondiste mensajes</div>'
      +'<div class="p-empty-sub">Cuando respondas un mensaje del mar, aparecerá aquí 🌊</div></div>';
    return;
  }

  el.innerHTML = replied.map(function(r){
    var relTime = (function(){
      var d = Date.now()-r.ts;
      if(d<3600000) return 'hace '+Math.floor(d/60000)+'min';
      return 'hace '+Math.floor(d/3600000)+'h';
    })();
    var expireMin = Math.round((r.ts + 24*3600*1000 - Date.now()) / 60000);
    var expireLabel = expireMin > 60 ? Math.floor(expireMin/60)+'h' : expireMin+'min';
    var authorHtml = (r.authorName)
      ? '<div style="display:flex;align-items:center;gap:7px;margin-bottom:10px;cursor:pointer" onclick="pQuickProfile('+_jsAttr(r.authorName)+','+_jsAttr(r.authorAv||'🧑')+',\'\',\'\','+_jsAttr(r.authorId||'')+')">'
        +_avInline(r.authorAv||'🧑',22)
        +'<span class="bottle-replied-author">'+_escHtml(r.authorName)+'</span>'
        +'<span class="bottle-replied-meta">· ver perfil</span>'
        +'</div>'
      : '<div style="margin-bottom:10px"><span class="bottle-replied-meta">Mensaje anónimo 🌊</span></div>';
    return '<div class="dark-bottle bottle-replied-card" style="border-left:3px solid rgba(80,150,200,.4)">'
      // Header row
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">'
      +'<span class="bottle-replied-tag">💬 Respondiste</span>'
      +'<span class="bottle-replied-meta">'+relTime+' · expira en '+expireLabel+'</span>'
      +'</div>'
      // Author
      +authorHtml
      // Original message
      +'<div class="bottle-original-block">'
      +'<div class="bottle-block-label">Mensaje del mar</div>'
      +'<p class="bottle-original-text">"'+(r.preview ? _escHtml(r.preview.slice(0,120)+(r.preview.length>120?'…':'')) : '…')+'"</p>'
      +'</div>'
      // Your reply
      +'<div class="bottle-reply-block">'
      +'<div class="bottle-block-label" style="color:#1a6fa8">Tu respuesta</div>'
      +'<p class="bottle-reply-text">'+_escHtml(r.reply||'')+'</p>'
      +'</div>'
      +'</div>';
  }).join('');
}

async function pDeleteBottleResponse(broadcastId, cardEl){
  if(!confirm('¿Eliminar esta respuesta?')) return;
  if(cardEl){ cardEl.style.transition='opacity .3s'; cardEl.style.opacity='0'; setTimeout(function(){ if(cardEl.parentNode) cardEl.parentNode.removeChild(cardEl); },350); }
  _initSupabase();
  if(sbClient && broadcastId){
    try{ await sbClient.from('broadcasts').delete().eq('id', broadcastId); }catch(e){}
  }
  // Also remove from localStorage inbox
  var inbox = []; try{ inbox = JSON.parse(safeLS('get','velo_inbox')||'[]'); }catch(e){}
  inbox = inbox.filter(function(m){ return m.id !== broadcastId; });
  safeLS('set','velo_inbox', JSON.stringify(inbox));
  pToast('🗑️','Respuesta eliminada');
}

async function _loadGuardianStats(){
  var el = document.getElementById('guardianStatsBar');
  if(!el || !sbClient) return;
  try{
    var [r1, r2] = await Promise.all([
      sbClient.from('help_posts').select('id', {count:'exact',head:true}),
      sbClient.from('help_posts').select('id', {count:'exact',head:true}).eq('taken',true)
    ]);
    var total  = (r1 && r1.count != null) ? r1.count : '—';
    var helped = (r2 && r2.count != null) ? r2.count : '—';
    el.textContent = '🕊️ '+total+' ayudas solicitadas · 💚 '+helped+' personas acompañadas';
    el.style.display = 'block';
  }catch(e){}
}

async function _loadBottleStats(){
  var el = document.getElementById('bottleStatsBar');
  if(!el || !sbClient) return;
  try{
    var [r1, r2] = await Promise.all([
      sbClient.from('bottles').select('id', {count:'exact',head:true}),
      sbClient.from('bottles').select('id', {count:'exact',head:true}).eq('replied',true)
    ]);
    var total    = (r1 && r1.count != null) ? r1.count : '—';
    var replied  = (r2 && r2.count != null) ? r2.count : '—';
    el.textContent = '🌊 '+total+' mensajes enviados al mar  ·  💌 '+replied+' respondidos';
    el.style.display = 'block';
    el.style.color = 'var(--ink4)';
  }catch(e){}
}

async function pRenderBottle(){
  var _tok = _navToken;
  _renderFavWidget('bottleFavWidget');
  var moodRow = document.getElementById('bottleMoodRow');
  if(moodRow) moodRow.innerHTML = _bottleMoods.map(function(m){
    return '<button style="font-size:22px;padding:7px;border:2px solid transparent;border-radius:10px;background:none;cursor:pointer;transition:all .15s" onclick="pSelBottleMood(this,\''+m+'\')" data-mood="'+m+'">'+m+'</button>';
  }).join('');

  var list = document.getElementById('bottleList');
  if(!list) return;

  var allBottles, usingSB = false;
  var myId = safeLS('get','velo_user_id')||safeLS('get','velo_user_email')||'';
  // Load stats
  _loadBottleStats();
  // Show all bottles — stay visible after reply so multiple people can respond
  var cutoff24h = new Date(Date.now() - 24*3600*1000).toISOString();
  var sbRows = await _sbLoad('bottles', function(q){
    return q.gte('created_at', cutoff24h).order('created_at',{ascending:false}).limit(60);
  });
  if(_navToken !== _tok) return;
  if(sbRows !== null){
    usingSB = true;
    allBottles = sbRows.map(_sbBottleRow);
    // Purge LS bottles that: (a) are older than 24h, or (b) belong to a different userId (old sessions)
    var myBottlesLS = []; try{ myBottlesLS = JSON.parse(safeLS('get','velo_my_bottles')||'[]'); }catch(e){}
    var cutoff24hMs = Date.now() - 24*3600*1000;
    var cleanedLS = myBottlesLS.filter(function(b){ return b.ts > cutoff24hMs && (!b.userId || b.userId === myId); });
    if(cleanedLS.length !== myBottlesLS.length) safeLS('set','velo_my_bottles', JSON.stringify(cleanedLS));
    myBottlesLS = cleanedLS;
    var sbIds = allBottles.reduce(function(s,b){ s[b.id]=1; return s; }, {});
    myBottlesLS.forEach(function(b){ if(!sbIds[b.id] && b.ts > Date.now()-24*3600*1000) allBottles.unshift(b); });
  } else {
    // Fallback: localStorage + mock data
    var mockBottles = [
      { id:'mb1', mood:'😔', text:'A veces el silencio duele más que las palabras.',            color:'rgba(116,198,157,.12)',   ts: Date.now()-3*60000   },
      { id:'mb2', mood:'💭', text:'¿Alguien más siente que no encaja en ningún lado?',           color:'rgba(200,165,100,.08)',   ts: Date.now()-8*60000   },
      { id:'mb3', mood:'😢', text:'Hoy recordé a alguien que ya no está. Lo extraño tanto.',     color:'rgba(196,181,232,.12)',   ts: Date.now()-15*60000  },
      { id:'mb4', mood:'🤗', text:'Para quien lo necesite: no estás solo/a. Esto también pasa.', color:'rgba(116,198,157,.1)',    ts: Date.now()-22*60000  }
    ];
    var responded = []; try{ responded = JSON.parse(safeLS('get','velo_bottle_responded')||'[]'); }catch(e){}
    var filteredMock = mockBottles.filter(function(b){ return responded.indexOf(b.id) < 0; });
    var myBottles = []; try{ myBottles = JSON.parse(safeLS('get','velo_my_bottles')||'[]'); }catch(e){}
    allBottles = myBottles.concat(filteredMock);
  }

  // Hide bottles already replied to by this user — they move to "Mis respuestas" tab
  allBottles = allBottles.filter(function(b){
    return safeLS('get','velo_bottle_replied_'+b.id) !== '1';
  });

  // Batch-fetch usernames for non-anon bottle authors not yet cached
  if(sbClient){ var _bUnknown = allBottles.filter(function(b){ return !b.anon && b.userId && !_uLook(b.userId); }).map(function(b){ return b.userId; }); if(_bUnknown.length){ try{ var _br = await sbClient.from('profiles').select('id,username').in('id',_bUnknown); if(_br.data) _br.data.forEach(function(p){ _uFill(p.id,p.username); }); }catch(e){} } }

  if(!allBottles.length){
    list.innerHTML = '<div class="p-empty"><span class="p-empty-emoji">🌊</span><div class="p-empty-title">El mar está tranquilo</div><div class="p-empty-sub">Sé el primero en lanzar un mensaje</div></div>';
    return;
  }

  list.innerHTML = allBottles.map(function(b, i){
    var relTime = b.ts ? (function(){
      var tl = b.ts + 24*3600*1000 - Date.now();
      if(tl <= 0) return 'expirado';
      var mins = Math.floor(tl/60000);
      if(mins < 60) return '⏳ '+mins+'min restantes';
      var hrs = Math.floor(mins/60); var rem = mins%60;
      return '⏳ '+(rem ? hrs+'h '+rem+'min' : hrs+'h')+' restantes';
    })() : '⏳ 24h restantes';
    var isOwn = myId && (b.userId||'') === myId;
    var alreadyReplied = safeLS('get','velo_bottle_replied_'+b.id) === '1';
    var actions;
    if(isOwn){
      actions = '<div style="display:flex;gap:7px;align-items:center">'
        +'<span style="font-size:11px;color:var(--ink4);font-style:italic">Tu mensaje 🌊</span>'
        +'<button data-del-btn="1" style="padding:4px 9px;background:rgba(255,80,80,.08);border:1px solid rgba(255,80,80,.2);border-radius:100px;color:rgba(255,120,120,.75);font-size:11px;font-weight:700;cursor:pointer;font-family:\'Jost\',sans-serif" onclick="pDeleteBottle(\''+b.id+'\')">🗑️</button>'
        +'</div>';
    } else {
      actions = '<div style="display:flex;gap:7px;align-items:center">'
        +'<button style="padding:5px 11px;background:rgba(200,50,50,.12);border:1px solid rgba(200,50,50,.28);border-radius:100px;color:rgba(180,50,50,.9);font-size:11px;font-weight:700;cursor:pointer;font-family:\'Jost\',sans-serif" onclick="pReportBottle(\''+b.id+'\')">🚩 Reportar</button>'
        +(alreadyReplied
          ? '<span style="font-size:11px;color:var(--sage2);font-weight:700">💛 Ya respondiste</span>'
          : '<button style="padding:5px 11px;background:rgba(80,150,200,.12);border:1px solid rgba(80,150,200,.28);border-radius:100px;color:#1E5A80;font-size:11px;font-weight:700;cursor:pointer;font-family:\'Jost\',sans-serif" onclick="pOpenBottleReply('+_jsAttr(b.id)+','+_jsAttr(b.text.substring(0,120))+','+_jsAttr(b.userId||b.user_id||'')+','+_jsAttr(b.anon?'':''+( b.userName||''))+','+_jsAttr(b.anon?'':''+( b.userAv||''))+')">💌 Responder</button>')
        +'</div>';
    }
    var showAuthor = !b.anon && b.userName && !isOwn;
    var authorHtml = showAuthor
      ? '<div style="display:flex;align-items:center;gap:7px;margin-bottom:8px;cursor:pointer" onclick="pQuickProfile('+_jsAttr(b.userName||'Usuario')+','+_jsAttr(b.userAv||'🧑')+',\'\',\'\','+_jsAttr(b.userId||'')+')">'
        +_avInline(b.userAv||'🧑',24)
        +'<div style="display:flex;flex-direction:column;line-height:1.2">'
        +'<span style="font-size:11px;color:#1E5A80;font-weight:600">'+_escHtml(b.userName)+'</span>'
        +(_uAt(b.userId||''))
        +'</div>'
        +'<span style="font-size:10px;color:var(--ink5)">· toca para ver perfil</span>'
        +'</div>'
      : (b.anon
        ? '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">'
          +'<span style="font-size:11px;font-weight:700;color:rgba(255,255,255,.45);letter-spacing:.3px">👤 Usuario Anónimo</span>'
          +'</div>'
        : '');
    return '<div class="dark-bottle" id="bottle-'+b.id+'" style="animation-delay:'+i*.08+'s;border-left:3px solid rgba(80,150,200,.3)">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px"><span style="font-size:20px">'+b.mood+'</span><span style="font-size:10px;color:var(--ink5)">'+relTime+'</span></div>'
      +authorHtml
      +'<p style="font-size:13px;color:var(--ink);line-height:1.6;margin-bottom:10px;font-family:\'Cormorant Garamond\',serif;font-style:italic">"'+b.text+'"</p>'
      +'<div style="display:flex;align-items:center;justify-content:flex-end">'+actions+'</div></div>';
  }).join('');
}

var _selectedBottleMood = '';
function pSelBottleMood(el, mood){
  _selectedBottleMood = mood;
  var parent = document.getElementById('bottleMoodRow');
  if(parent) parent.querySelectorAll('button').forEach(function(b){
    b.style.borderColor = b.dataset.mood === mood ? 'rgba(200,165,100,.5)' : 'transparent';
    b.style.background = b.dataset.mood === mood ? 'rgba(200,165,100,.1)' : 'none';
  });
}

function pToggleBottleProfile(tog){
  tog.classList.toggle('on');
  var isVisible = tog.classList.contains('on');
  document.getElementById('bottleShowProfile').checked = isVisible;
  // Hide emoji picker when profile is visible (avatar is used instead)
  var emojiSec = document.getElementById('bottleEmojiSection');
  if(emojiSec) emojiSec.style.display = isVisible ? 'none' : '';
}

function pOpenBottleForm(){
  // Reset emoji selection so the user must pick one each time (when anonymous)
  _selectedBottleMood = '';
  var parent = document.getElementById('bottleMoodRow');
  if(parent) parent.querySelectorAll('button').forEach(function(b){
    b.style.borderColor = 'transparent';
    b.style.background = 'none';
  });
  // Reset profile toggle to default (anonymous)
  var tog = document.getElementById('bottleProfileTog');
  if(tog) tog.classList.remove('on');
  var cb = document.getElementById('bottleShowProfile');
  if(cb) cb.checked = false;
  var emojiSec = document.getElementById('bottleEmojiSection');
  if(emojiSec) emojiSec.style.display = '';
  openModal('bottleFormOv');
}

async function pSendBottle(){
  var ta = document.getElementById('bottleMsgTa');
  if(!ta || !ta.value.trim()){ pToast('✍️','Escribí algo antes de lanzar'); return; }
  var showProfile = document.getElementById('bottleShowProfile') && document.getElementById('bottleShowProfile').checked;
  // Require an emoji when posting anonymously — it's the only identifier shown
  if(!showProfile && !_selectedBottleMood){
    pToast('😊','Elegí un emoji para tu mensaje anónimo'); return;
  }
  if(!_checkDailyLimit('bottle')){
    closeModal('bottleFormOv');
    pShowDailyLimitModal('bottle');
    return;
  }
  var text = ta.value.trim();
  var isAnon = !showProfile;
  var myName = isAnon ? null : _myDisplayName();
  var myAv   = isAnon ? null : (safeLS('get','velo_user_av')||'🧑');
  var myId   = safeLS('get','velo_user_id')||safeLS('get','velo_user_email')||'';
  ta.value = '';
  closeModal('bottleFormOv');
  _incDailyLimit('bottle');
  var bottles = []; try{ bottles = JSON.parse(safeLS('get','velo_my_bottles')||'[]'); }catch(e){}
  var id = 'ub'+Date.now();
  bottles.unshift({ id:id, mood:_selectedBottleMood, text:text, responses:0, color:'rgba(116,198,157,.12)', ts:Date.now(),
    userId:myId, userName:myName, userAv:myAv, anon:isAnon });
  safeLS('set','velo_my_bottles', JSON.stringify(bottles.slice(0,50)));
  pToast('🌊','¡Mensaje lanzado al mar! 🌿');
  _geminiModerateContent(text, 'mensajes-al-mar');
  _initSupabase();
  if(sbClient){
    // Always store user_id so delete button and reply notifications work for anon posts too
    try{
      await sbClient.from('bottles').insert({ id:id,
        user_id: myId||null,
        user_name: myName||null, user_av: myAv||null, anon: isAnon,
        mood:_selectedBottleMood, text:text, color:'rgba(116,198,157,.12)', replied:false
      });
    }catch(e){ console.error('[pSendBottle insert]', e); }
  }
  pRenderBottle();
}

var _curBottleReplyId   = null;
var _curBottleReplyText = '';
var _curBottleUserId    = null;
var _curBottleAuthorName = '';
var _curBottleAuthorAv   = '';

function pOpenBottleReply(bottleId, bottlePreview, bottleUserId, authorName, authorAv){
  _curBottleReplyId    = bottleId;
  _curBottleReplyText  = bottlePreview;
  _curBottleUserId     = bottleUserId || null;
  _curBottleAuthorName = authorName || '';
  _curBottleAuthorAv   = authorAv   || '';
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
  _geminiModerateContent(replyText, 'mensajes-al-mar-reply');
  closeModal('bottleReplyOv');

  // 1. Record that THIS user replied and optimistically hide the bottle from their view
  if(_curBottleReplyId){
    safeLS('set','velo_bottle_replied_'+_curBottleReplyId,'1');
    // Save replied bottle details so it appears in "Mis respuestas" tab
    var _rBottles = []; try{ _rBottles = JSON.parse(safeLS('get','velo_bottles_replied')||'[]'); }catch(e){}
    _rBottles.unshift({ id:_curBottleReplyId, preview:_curBottleReplyText||'', reply:replyText, ts:Date.now(), authorName:_curBottleAuthorName||'', authorAv:_curBottleAuthorAv||'', authorId:_curBottleUserId||'' });
    safeLS('set','velo_bottles_replied', JSON.stringify(_rBottles.slice(0,30)));
    // Optimistically fade out the bottle card immediately
    var card = document.getElementById('bottle-'+_curBottleReplyId);
    if(card){ card.style.transition='opacity .4s'; card.style.opacity='0'; setTimeout(function(){ if(card.parentNode) card.parentNode.removeChild(card); }, 450); }
  }
  _initSupabase();
  if(sbClient && _curBottleReplyId){
    sbClient.from('bottles').update({ replied:true, replied_by: safeLS('get','velo_user_id')||'' })
      .eq('id', _curBottleReplyId).then(function(){}).catch(function(){});
  }

  // 2. Deliver to the bottle author's inbox via Supabase broadcasts
  if(sbClient && _curBottleUserId){
    var _rid = safeLS('get','velo_user_id')||'';
    var _rName = safeLS('get','velo_user_name')||'';
    var _rAv = safeLS('get','velo_user_av')||'🧑';
    sbClient.from('broadcasts').insert({
      target: 'user:'+_curBottleUserId,
      subject: '¡Tu mensaje en el mar recibió una respuesta!',
      body: (_curBottleReplyText ? '🌊 Tu mensaje:\n"'+_curBottleReplyText+'"\n\n' : '')+'💬 Respuesta:\n"'+replyText+'"',
      icon: '🌊',
      sender: _rid ? JSON.stringify({ n:_rName, i:_rid, a:_rAv, u:safeLS('get','velo_username')||'' }) : 'Velo — Al Mar',
      sent_at: new Date().toISOString()
    }).then(function(){}).catch(function(){});
  }

  pToast('💌','¡Respuesta enviada! 🌊');
  setTimeout(function(){ pToast('📬','El autor recibió tu respuesta en su buzón Velo'); }, 1200);
}

function pDeleteBottle(bottleId){
  // Two-tap confirm: first tap shows "¿Seguro?" state; second tap deletes
  var btn = document.querySelector('#bottle-'+bottleId+' [data-del-btn]');
  if(btn && btn.dataset.confirmPending === '1'){
    _doDeleteBottle(bottleId);
  } else {
    if(btn){
      btn.dataset.confirmPending = '1';
      btn.textContent = '¿Seguro? 🗑️';
      btn.style.background = 'rgba(255,80,80,.18)';
      btn.style.borderColor = 'rgba(255,80,80,.4)';
      btn.style.color = 'rgba(255,120,120,.95)';
      setTimeout(function(){
        if(btn && btn.dataset.confirmPending === '1'){
          btn.dataset.confirmPending = '0';
          btn.textContent = '🗑️';
          btn.style.background = 'rgba(255,80,80,.08)';
          btn.style.borderColor = 'rgba(255,80,80,.2)';
          btn.style.color = 'rgba(255,120,120,.75)';
        }
      }, 3000);
    } else {
      _doDeleteBottle(bottleId); // fallback if button not found
    }
  }
}
async function _doDeleteBottle(bottleId){
  _initSupabase();
  if(sbClient){
    try{ await sbClient.from('bottles').delete().eq('id', bottleId); }catch(e){}
  }
  var myBottles = []; try{ myBottles = JSON.parse(safeLS('get','velo_my_bottles')||'[]'); }catch(e){}
  safeLS('set','velo_my_bottles', JSON.stringify(myBottles.filter(function(b){ return b.id !== bottleId; })));
  var card = document.getElementById('bottle-'+bottleId);
  if(card){ card.style.transition='opacity .3s'; card.style.opacity='0'; setTimeout(function(){ pRenderBottle(); },350); }
  else { pRenderBottle(); }
  pToast('🌊','Mensaje eliminado del mar');
}

function pReportBottle(bottleId){
  var bottle = _sbBottles && _sbBottles.find(function(b){ return String(b.id) === String(bottleId); });
  var preview = bottle && bottle.text ? bottle.text : '';
  pReportContent('bottle', bottleId, preview);
}

// ── DIARY ──────────────────────────────────────────────────────
var _diaryEmojis = ['😊','😢','😰','😤','😴','🤔','💪','🌿','✨','💔'];
var _diaryPrivacyShown = false;

function pInitDiary(){
  var dateEl = document.getElementById('diaryDateLbl');
  if(dateEl){ var d = new Date(); dateEl.textContent = _fmtDate(d.getTime()).split('·')[0].trim(); }
  var row = document.getElementById('diaryEmojiRow');
  if(row) row.innerHTML = _diaryEmojis.map(function(e){
    return '<button class="diary-emoji-btn" onclick="pSelDiaryEmoji(this,\''+e+'\')" data-emoji="'+e+'">'+e+'</button>';
  }).join('');
  // Show privacy notice once per session
  if(!_diaryPrivacyShown){
    _diaryPrivacyShown = true;
    var banner = document.getElementById('diaryPrivacyBanner');
    if(banner) banner.style.display = 'flex';
  }
  _loadDiaryEntries();
}

var _selectedDiaryEmoji = '';
function pSelDiaryEmoji(el, emoji){
  _selectedDiaryEmoji = _selectedDiaryEmoji === emoji ? '' : emoji;
  document.querySelectorAll('.diary-emoji-btn').forEach(function(b){
    b.classList.toggle('sel', b.dataset.emoji === _selectedDiaryEmoji);
  });
}

function _openDiaryEmojiPicker(){
  var existing = document.getElementById('diaryEmojiPickerOv');
  if(existing){ existing.remove(); return; }
  var groups = [
    { label:'Caras', emojis:['😀','😃','😄','😁','😅','😂','🤣','😊','😇','🙂','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','😐','😑','😶','🙄','😏','😒','😞','😔','😟','😕','🙃','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','😈','👿','😱','😨','😰','😥','😓','🤔','🤭','🤫','🤥','😶','😐','🥱','😴','🤤','😪'] },
    { label:'Corazones', emojis:['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','🫀','♥️'] },
    { label:'Naturaleza', emojis:['🌸','🌺','🌻','🌹','🌷','🌼','💐','🌿','🍃','🍀','🌱','🌲','🌳','🌴','🌵','🎋','🌾','🍂','🍁','🌙','⭐','✨','💫','🌟','🌈','☁️','🌤️','⛅','🌦️','🌧️','⛈️','🌨️','❄️','🌊','💧','🔥','🌺'] },
    { label:'Animales', emojis:['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🦆','🦅','🦉','🦇','🐝','🦋','🐛','🐌','🐞','🐜','🪲','🐢','🦎','🐍','🦕','🐙','🦑','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊'] },
    { label:'Varios', emojis:['✨','🌈','⭐','🌟','💫','🎉','🎊','🎈','🎁','🏆','🥇','🎯','🎨','🎭','🎬','🎤','🎧','🎵','🎶','🎸','🎹','🎺','🎻','🥁','📚','📖','✏️','📝','💡','🔮','🌙','🕯️','💎','🌺','🧘','💪','🙏','👏','🤝'] }
  ];
  var ov = document.createElement('div');
  ov.id = 'diaryEmojiPickerOv';
  ov.style.cssText = 'position:fixed;inset:0;z-index:9100;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.5)';
  var html = '<div style="background:var(--cream);border-radius:20px 20px 0 0;padding:20px 16px 28px;width:100%;max-width:560px;max-height:70vh;overflow-y:auto">'
    +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">'
    +'<div style="font-size:13px;font-weight:700;color:var(--ink)">Elegí un emoji</div>'
    +'<button onclick="document.getElementById(\'diaryEmojiPickerOv\').remove()" style="background:none;border:none;cursor:pointer;font-size:18px;color:var(--ink4)">✕</button>'
    +'</div>';
  groups.forEach(function(g){
    html += '<div style="font-size:10px;font-weight:700;color:var(--ink4);letter-spacing:1px;text-transform:uppercase;margin:10px 0 6px">'+g.label+'</div>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:4px;">';
    g.emojis.forEach(function(em){
      html += '<button onclick="_setDiaryEmoji(\''+em+'\')" style="background:none;border:none;cursor:pointer;font-size:24px;padding:4px;border-radius:8px;line-height:1">'+em+'</button>';
    });
    html += '</div>';
  });
  html += '</div>';
  ov.innerHTML = html;
  ov.onclick = function(ev){ if(ev.target===ov) ov.remove(); };
  document.body.appendChild(ov);
}

function _setDiaryEmoji(emoji){
  _selectedDiaryEmoji = emoji;
  var btn = document.getElementById('diaryEmojiBtn');
  var chosen = document.getElementById('diaryEmojiChosen');
  if(btn) btn.textContent = '😊 Elegir emoji';
  if(chosen) chosen.textContent = emoji;
  var ov = document.getElementById('diaryEmojiPickerOv');
  if(ov) ov.remove();
}

async function pSaveDiary(){
  var ta = document.getElementById('diaryTa');
  if(!ta || !ta.value.trim()){ pToast('✍️','Escribí algo primero'); return; }
  var titleEl = document.getElementById('diaryTitleInput');
  var title = titleEl ? titleEl.value.trim() : '';
  var emoji = _selectedDiaryEmoji || '';
  var rawText = ta.value.trim();
  // Legacy combined text for sbSaveDiaryEntry compatibility
  var text = (emoji ? emoji+' ' : '') + rawText;
  var ts = Date.now();
  var dateLabel = _fmtDate(ts);
  // Local storage
  var entries = []; try{ entries = JSON.parse(safeLS('get','velo_diary')||'[]'); }catch(e){}
  entries.unshift({ title:title, emoji:emoji, text:rawText, dateLabel:dateLabel, ts:ts });
  safeLS('set','velo_diary', JSON.stringify(entries.slice(0,200)));
  // Supabase
  sbSaveDiaryEntry(text, dateLabel, ts);
  ta.value = '';
  if(titleEl) titleEl.value = '';
  _selectedDiaryEmoji = '';
  var chosenEl = document.getElementById('diaryEmojiChosen');
  if(chosenEl) chosenEl.textContent = '';
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
  _diaryEntries = entries;
  if(!entries.length){
    el.innerHTML = '<div class="p-empty"><span class="p-empty-emoji">📔</span><div class="p-empty-title">Aún no tenés entradas</div><div class="p-empty-sub">Este es tu espacio seguro. 🌙</div></div>';
    return;
  }
  // Sort newest first
  entries = entries.slice().sort(function(a,b){ return (b.ts||0) - (a.ts||0); });
  el.innerHTML = entries.map(function(e, i){
    // Show title if exists, else first 36 chars of text as display label
    var displayTitle = e.title || (e.text||'').slice(0, 36) + ((e.text||'').length > 36 ? '…' : '');
    var emojiPrefix = e.emoji ? e.emoji+' ' : '';
    return '<div class="diary-row" style="animation-delay:'+i*.04+'s;display:flex;align-items:center;gap:8px">'
      +'<div style="flex:1;cursor:pointer;min-width:0" onclick="pOpenDiaryEntry('+e.ts+')">'
      +'<div class="diary-row-date">'+_escHtml(e.dateLabel||'')+'</div>'
      +'<div class="diary-row-preview" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+_escHtml(emojiPrefix+displayTitle)+'</div>'
      +'</div>'
      +'<button onclick="event.stopPropagation();pDeleteDiary('+e.ts+')" style="background:none;border:none;cursor:pointer;font-size:16px;color:var(--ink4);padding:4px 6px;flex-shrink:0" title="Eliminar">🗑️</button>'
      +'</div>';
  }).join('');
}

var _diaryEntries = [];
function pOpenDiaryEntry(ts){
  var entries = _diaryEntries;
  if(!entries.length){ try{ entries = JSON.parse(safeLS('get','velo_diary')||'[]'); }catch(e){} }
  var entry = entries.find(function(e){ return e.ts === ts; });
  if(!entry) return;
  var ov = document.getElementById('diaryEntryOv');
  if(!ov) return;
  var dateEl   = document.getElementById('diaryEntryDate');
  var emojiEl  = document.getElementById('diaryEntryEmoji');
  var titleEl  = document.getElementById('diaryEntryTitle');
  var textEl   = document.getElementById('diaryEntryText');
  var delBtn   = document.getElementById('diaryEntryDel');
  if(dateEl)  dateEl.textContent  = entry.dateLabel || '';
  if(emojiEl) emojiEl.textContent = entry.emoji || '';
  if(titleEl){ titleEl.textContent = entry.title || ''; titleEl.style.display = entry.title ? '' : 'none'; }
  if(textEl)  textEl.textContent  = entry.text || '';
  if(delBtn)  delBtn.onclick = function(){ closeModal('diaryEntryOv'); pDeleteDiary(ts); };
  openModal('diaryEntryOv');
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
  _updateTopbarMoodBadge();
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

// ── MOOD QUICK VIEW MODAL ─────────────────────────────────────
async function pOpenMoodQuickView(){
  var existing = document.getElementById('moodQuickOv');
  if(existing) existing.remove();

  // Build calendar grid for current month (merge localStorage + Supabase)
  var now = new Date();
  var year = now.getFullYear();
  var month = now.getMonth();
  var daysInMonth = new Date(year, month+1, 0).getDate();
  var monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  // Build moodMap from localStorage first
  var moodMap = {};
  for(var _d=1; _d<=daysInMonth; _d++){
    var _dk = year+'-'+String(month+1).padStart(2,'0')+'-'+String(_d).padStart(2,'0');
    var _st = safeLS('get','velo_mood_'+_dk);
    if(_st){ try{ var _ms=JSON.parse(_st); if(_ms.emoji) moodMap[_dk]=_ms; }catch(e){} }
  }
  // Merge from Supabase
  try{
    var sbMoods = await sbLoadAllMoods(year, month+1);
    if(sbMoods) sbMoods.forEach(function(e){ if(e.emoji) moodMap[e.date_key]=e; });
  }catch(e){}

  // If modal was removed while loading, abort
  if(document.getElementById('moodQuickOv')) return;

  var calHtml = '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:5px;margin:0 auto 16px;max-width:330px">';
  ['L','M','M','J','V','S','D'].forEach(function(d){
    calHtml += '<div style="text-align:center;font-size:9px;font-weight:700;color:var(--ink5);padding:2px 0">'+d+'</div>';
  });
  var firstDay = new Date(year, month, 1).getDay();
  firstDay = firstDay === 0 ? 6 : firstDay - 1;
  for(var i=0; i<firstDay; i++) calHtml += '<div></div>';
  for(var d=1; d<=daysInMonth; d++){
    var dk = year+'-'+String(month+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    var entry = moodMap[dk];
    var isToday = d === now.getDate();
    calHtml += '<div style="aspect-ratio:1;border-radius:8px;background:'+(entry?'rgba(116,198,157,.2)':'var(--cream2)')+';display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;'+(isToday?'outline:2px solid var(--sage);outline-offset:1px':'')+'">'
      +'<span style="font-size:9px;color:'+(entry?'var(--sage3)':'var(--ink5)')+';font-weight:700;line-height:1">'+d+'</span>'
      +(entry?'<span style="font-size:13px;line-height:1">'+entry.emoji+'</span>':'')
      +'</div>';
  }
  calHtml += '</div>';

  // Last 5 mood reports from inbox
  var inbox = []; try{ inbox = JSON.parse(safeLS('get','velo_inbox')||'[]'); }catch(e){}
  var reports = inbox.filter(function(m){ return m.tipo==='reporte' && m.icon==='📊'; }).slice(0,5);
  var reportsHtml = '';
  if(reports.length){
    reportsHtml = '<div style="margin-top:4px"><div style="font-size:10px;font-weight:700;letter-spacing:1.5px;color:var(--ink5);text-transform:uppercase;margin-bottom:10px">Últimos reportes</div>'
      + reports.map(function(r){
        return '<div style="background:var(--cream2);border-radius:12px;padding:12px 14px;margin-bottom:8px;cursor:pointer" onclick="document.getElementById(\'moodQuickOv\').remove();pOpenInboxMsg(\''+r.id+'\',null)">'
          +'<div style="font-size:12px;font-weight:700;color:var(--ink);margin-bottom:3px">'+_escHtml(r.asunto||'Reporte mensual')+'</div>'
          +'<div style="font-size:11px;color:var(--ink4);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.5">'+_escHtml(r.extracto||'')+'</div>'
          +'<div style="font-size:10px;color:var(--ink5);margin-top:4px">'+_escHtml(r.fecha||'')+'</div>'
          +'</div>';
      }).join('')
      + '</div>';
  }

  var ov = document.createElement('div');
  ov.className = 'p-modal-ov show';
  ov.id = 'moodQuickOv';
  ov.innerHTML = '<div class="p-sheet" style="max-height:88vh;overflow-y:auto">'
    +'<div class="p-sheet-handle"></div>'
    +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">'
    +'<div><div style="font-size:11px;font-weight:700;letter-spacing:1.5px;color:var(--sage3);text-transform:uppercase">Seguimiento</div>'
    +'<div style="font-family:\'Cormorant Garamond\',serif;font-size:20px;color:var(--ink)">'+monthNames[month]+' '+year+'</div></div>'
    +'<button onclick="document.getElementById(\'moodQuickOv\').remove()" style="width:32px;height:32px;border-radius:50%;background:var(--cream2);border:none;font-size:16px;cursor:pointer;color:var(--ink4)">✕</button>'
    +'</div>'
    +'<div style="background:rgba(116,198,157,.07);border:1px solid rgba(116,198,157,.18);border-radius:10px;padding:8px 12px;margin-bottom:10px;font-size:11px;color:var(--sage2)">🔒 Solo vos podés ver estos registros</div>'
    +'<div style="background:rgba(221,212,245,.15);border:1px solid rgba(196,181,232,.3);border-radius:10px;padding:9px 12px;margin-bottom:14px;font-size:11px;color:var(--ink3);line-height:1.55">✨ La IA genera un reporte mensual con análisis de tus ánimos registrados. Lo recibirás en tu <strong>Buzón Velo</strong> el día 1 de cada mes 💌</div>'
    + calHtml
    + reportsHtml
    +'<div style="height:8px"></div>'
    +'<button class="p-btn p-btn--primary p-btn--md p-btn--full" onclick="document.getElementById(\'moodQuickOv\').remove();pGoTo(\'mood\')">Registrar ánimo de hoy ✨</button>'
    +'<div style="height:8px"></div>'
    +'<button class="p-btn p-btn--secondary p-btn--md p-btn--full" onclick="document.getElementById(\'moodQuickOv\').remove()">Cerrar</button>'
    +'</div>';
  document.body.appendChild(ov);
  ov.addEventListener('click', function(e){ if(e.target===ov) ov.remove(); });
}

// ── SATISFACTION SURVEY (every 90 days) ──────────────────────
var SURVEY_INTERVAL = 90 * 24 * 60 * 60 * 1000; // 90 days in ms
var _surveyScores   = { general: 0, utilidad: 0, recomendaria: 0 };
var _surveyFuncion  = '';

// Stable id per calendar quarter so read-tracking survives re-renders/reloads
function _surveyQuarterId(){
  var n = new Date();
  return 'survey-' + n.getFullYear() + 'Q' + (Math.floor(n.getMonth()/3)+1);
}

function _checkSurveyDue(){
  // Only for regular users (not admin, not pro)
  if(safeLS('get','velo_user_type') === 'admin') return;
  if(safeLS('get','velo_user_type') === 'pro') return;
  var sid = _surveyQuarterId();
  // Already opened/completed this quarter's survey → never re-add
  if(safeLS('get','velo_read_'+sid) === '1') return;
  var last = parseInt(safeLS('get','velo_last_survey')||'0', 10);
  if(Date.now() - last < SURVEY_INTERVAL) return;
  // Don't send twice in the same session
  if(safeLS('get','velo_survey_sent_session') === '1') return;
  safeLS('set','velo_survey_sent_session','1');
  // Add inbox notification
  var inbox = []; try{ inbox = JSON.parse(safeLS('get','velo_inbox')||'[]'); }catch(e){}
  // Skip if ANY survey already exists (read or unread) — avoids duplicate unread copies
  if(inbox.some(function(m){ return m.tipo === 'encuesta'; })) return;
  inbox.unshift({
    id: sid,
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
  // Mark survey as read immediately when opened (don't require submit to clear badge)
  try{
    var inbx = JSON.parse(safeLS('get','velo_inbox')||'[]');
    var changed = false;
    inbx = inbx.map(function(m){ if(m.tipo==='encuesta' && !m.leido){ changed=true; return Object.assign({},m,{leido:true}); } return m; });
    if(changed){ safeLS('set','velo_inbox', JSON.stringify(inbx)); _updateHomeBell(); }
  }catch(e){}
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
  // Persist to Supabase so admin sees aggregated results
  _initSupabase();
  if(sbClient){
    try{
      sbClient.from('surveys').insert({ user_id: safeLS('get','velo_user_id')||safeLS('get','velo_user_email')||'anon',
        general:_surveyScores.general, utilidad:_surveyScores.utilidad, recomendaria:_surveyScores.recomendaria,
        funcion:_surveyFuncion||'', sugerencia:sugerencia }).then(function(){}).catch(function(){});
    }catch(e){}
  }
  safeLS('set','velo_survey_sent_session','1');
  // Mark inbox message as read
  var inbox = []; try{ inbox = JSON.parse(safeLS('get','velo_inbox')||'[]'); }catch(e){}
  inbox = inbox.map(function(m){ return m.tipo==='encuesta' ? Object.assign({},m,{leido:true}) : m; });
  safeLS('set','velo_inbox', JSON.stringify(inbox));
  _updateHomeBell();
  closeModal('surveyOv');
  pToast('💚','¡Gracias por tu opinión! Nos ayudás a mejorar Velo 🌿');
  setTimeout(function(){ if(document.getElementById('inboxList')) pRenderInbox(); }, 300);
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
  var helpedOthers  = parseInt(safeLS('get','velo_guardian_convs')||'0',10);
  var helpReceived  = parseInt(safeLS('get','velo_help_received')||'0',10);
  var myBottles = []; try{ myBottles = JSON.parse(safeLS('get','velo_my_bottles')||'[]'); }catch(e){}
  var bottleCount = myBottles.filter(function(b){ var bd=new Date(b.ts); return b.ts && bd.getFullYear()===prevYear && (bd.getMonth()+1)===prevMonth; }).length;

  // Diary activity for the month
  var diaryArr = []; try{ diaryArr = JSON.parse(safeLS('get','velo_diary')||'[]'); }catch(e){}
  var monthPrefix = prevYear+'-'+String(prevMonth).padStart(2,'0');
  var diaryCount = diaryArr.filter(function(e){ return e.dateLabel && e.dateLabel.indexOf(monthPrefix) > -1 || (e.ts && new Date(e.ts).getFullYear()===prevYear && (new Date(e.ts).getMonth()+1)===prevMonth); }).length;

  // Reviews received from Supabase
  var reviewsReceived = 0; var reviewStars = 0;
  _initSupabase();
  var myUid = safeLS('get','velo_user_id')||'';
  if(sbClient && myUid){
    try{
      await _ensureSbSession();
      var cutoffStart = new Date(prevYear, prevMonth-1, 1).toISOString();
      var cutoffEnd   = new Date(prevYear, prevMonth, 0, 23, 59, 59).toISOString();
      var rvRes = await sbClient.from('reviews').select('stars')
        .eq('pro_id', myUid).gte('created_at', cutoffStart).lte('created_at', cutoffEnd);
      if(rvRes.data && rvRes.data.length){
        reviewsReceived = rvRes.data.length;
        reviewStars = Math.round(rvRes.data.reduce(function(s,r){ return s+(r.stars||5); },0) / reviewsReceived * 10) / 10;
      }
    }catch(e){}
  }

  // Detect unused sections for invitation
  var happyArr = []; try{ happyArr = JSON.parse(safeLS('get','velo_happy_posts')||'[]'); }catch(e){}
  var unusedSections = [];
  if(!diaryArr.length) unusedSections.push('el Diario Emocional 📔');
  if(!happyArr.length) unusedSections.push('el Muro de la Felicidad 🌻');
  if(!myBottles.length) unusedSections.push('Mensajes al Mar 🌊');

  var analysis;
  if(!totalDays){
    analysis = 'No registraste tu ánimo en '+monthName+'. Recordá que el seguimiento diario te ayuda a conocerte mejor. ¡Este mes es una nueva oportunidad! 🌱';
  } else {
    var moodList = Object.entries(moodCounts).map(function(e){ return e[0]+' ('+e[1]+' días)'; }).join(', ');
    var topFirst  = Object.keys(firstHalf).sort(function(a,b){ return (firstHalf[b]||0)-(firstHalf[a]||0); })[0]||'variado';
    var topSecond = Object.keys(secondHalf).sort(function(a,b){ return (secondHalf[b]||0)-(secondHalf[a]||0); })[0]||'variado';
    var pct = Math.round(positives/totalDays*100);
    var prompt = 'Sos un asistente empático de bienestar emocional de la app Velo.\n'
      +'Analizá los datos del usuario en '+monthName+' y escribí un mensaje personalizado, cálido y esperanzador en español rioplatense (usá "vos/te").\n\n'
      +'Datos reales del mes:\n'
      +'- Días registrados: '+totalDays+' de '+daysInPrev+' posibles\n'
      +'- Distribución de ánimo: '+moodList+'\n'
      +'- Primera quincena predominó: '+topFirst+'\n'
      +'- Segunda quincena predominó: '+topSecond+'\n'
      +'- Días con ánimo positivo: '+pct+'%\n'
      +(diaryCount?'- Entradas en el Diario: '+diaryCount+'\n':'')
      +(happyStats.posts?'- Momentos en el Muro de la Felicidad: '+happyStats.posts+'\n':'')
      +(happyStats.reactionsReceived?'- Reacciones recibidas en el Muro: '+happyStats.reactionsReceived+'\n':'')
      +(helpedOthers?'- Conversaciones como guardián/acompañante: '+helpedOthers+'\n':'')
      +(helpReceived?'- Veces que recibió apoyo/acompañamiento: '+helpReceived+'\n':'')
      +(bottleCount?'- Mensajes enviados al Mar: '+bottleCount+'\n':'')
      +(reviewsReceived?'- Reseñas recibidas este mes: '+reviewsReceived+' (promedio '+reviewStars+'⭐)\n':'')
      +'\nEscribí 3-4 oraciones que:\n'
      +'1. Reconozcan cómo fue el mes con honestidad\n'
      +'2. Destaquen algún patrón real de los datos (ánimo, conexión con otros, escritura)\n'
      +'3. Terminen con un mensaje motivador sin ser cursi\n'
      +'Sin asteriscos, sin markdown, sin listas. Solo texto corrido. Máximo 100 palabras.';

    var aiText = await _geminiCall(prompt);
    analysis = aiText || (pct >= 60
      ? '¡'+monthName+' fue un mes mayormente positivo para vos! '+pct+'% de tus días registraste bienestar. Seguí construyendo ese espacio de cuidado. 🌻'
      : pct >= 35
        ? monthName+' tuvo sus altibajos. Lo importante es que seguís registrando y avanzando. 💙'
        : 'Parece que '+monthName+' fue un mes desafiante. Gracias por seguir registrando incluso en los días difíciles. 🌿');
  }

  // Build rich message body
  var extraLines = '';
  if(helpedOthers > 0) extraLines += '\n\n💙 Acompañaste a '+helpedOthers+' persona'+(helpedOthers>1?'s':'')+' como guardián/a en '+monthName+'. Eso importa más de lo que imaginás.';
  if(helpReceived > 0) extraLines += '\n\n🌿 Recibiste acompañamiento '+helpReceived+' vez'+(helpReceived>1?'es':'')+'. Pedir apoyo también es valentía.';
  if(bottleCount > 0) extraLines += '\n\n🌊 Lanzaste '+bottleCount+' mensaje'+(bottleCount>1?'s':'')+' al Mar. Esas palabras llegaron a alguien que las necesitaba.';
  if(reviewsReceived > 0) extraLines += '\n\n⭐ Recibiste '+reviewsReceived+' reseña'+(reviewsReceived>1?'s':'')+' este mes con un promedio de '+reviewStars+' estrellas. ¡La comunidad te valora!';
  if(diaryCount > 0) extraLines += '\n\n📔 Escribiste '+diaryCount+' entrada'+(diaryCount>1?'s':'')+' en tu diario. Cada página es un paso hacia conocerte mejor.';
  if(unusedSections.length > 0 && unusedSections.length <= 2) extraLines += '\n\n✨ ¿Todavía no exploraste '+unusedSections.join(' ni ')+'? Este mes es un buen momento para descubrirlos.';
  extraLines += '\n\n🌻 Si Velo te está siendo útil, considerá apoyar con una donación. Cada aporte ayuda a mantener este espacio gratuito para más personas.';

  var inbox = []; try{ inbox = JSON.parse(safeLS('get','velo_inbox')||'[]'); }catch(e){}
  inbox.unshift({
    id: 'mood-report-'+Date.now(), tipo:'reporte', icon:'📊',
    remitente:'Velo — Análisis de Bienestar ✨',
    asunto:'Tu resumen de '+monthName+' 🌿',
    extracto: summary,
    cuerpo: analysis + happyLine + extraLines,
    leido:false,
    fecha: new Date().toLocaleDateString('es',{day:'2-digit',month:'short'})
  });
  safeLS('set','velo_inbox', JSON.stringify(inbox.slice(0,100)));
  _updateInboxDot();
  setTimeout(function(){ pToast('📊','Recibiste tu resumen de '+monthName+' en el buzón 💚'); }, 3000);
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
    var isToday2 = dd === now.getDate();
    html += '<div style="aspect-ratio:1;background:'+(entry?'rgba(116,198,157,.18)':'rgba(0,0,0,.04)')+';border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;'+(isToday2?'outline:2px solid var(--sage);outline-offset:1px;':'')+'" title="'+k+'">'
      +'<span style="font-size:9px;color:'+(entry?'var(--sage3)':'var(--ink5)')+';font-weight:700;line-height:1">'+dd+'</span>'
      +(entry?'<span style="font-size:14px;line-height:1">'+entry.emoji+'</span>':'')
      +'</div>';
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
      _respiraTimer = null;
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
  _respiraTimer = null;
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
  { id:'c1', name:'Manejo de Ansiedad', emoji:'🌊', members:0, maxMembers:30, desc:'Estrategias y apoyo para el día a día con ansiedad.', active:true, official:true },
  { id:'c2', name:'Duelo y Pérdida', emoji:'🌙', members:0, maxMembers:30, desc:'Acompañamiento en procesos de duelo. Sin prisas.', active:false, official:true },
  { id:'c3', name:'Crianza Consciente', emoji:'🌱', members:0, maxMembers:30, desc:'Madres, padres y familias que crían con presencia.', active:false, official:true },
  { id:'c4', name:'Trastornos del Sueño', emoji:'😴', members:0, maxMembers:30, desc:'Cuando la noche no descansa. Juntos buscamos calma.', active:false, official:true },
  { id:'c5', name:'Autoestima', emoji:'✨', members:0, maxMembers:30, desc:'Reconstruir la confianza desde la raíz.', active:false, official:true }
];

var _curCircle = null;
var _circleAutoMsgTimer = null;
var _circleJoinedSession = {}; // tracks circles joined this session (for join/leave system messages)
var _circleMembersCh  = null;  // realtime channel circle_members
var _selectedCircleFoto = '';  // base64 photo for new circle

function pRenderCircles(){
  var list = document.getElementById('circlesList');
  if(!list) return;

  var userConvs = parseInt(safeLS('get','velo_guardian_convs')||'0', 10);
  var canCreate = userConvs >= 40 || _isPremium();

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

  var lsCircles = []; try{ lsCircles = JSON.parse(safeLS('get','velo_circles')||'[]'); }catch(e){}
  var allCircles = lsCircles.concat(_circlesData);
  _renderCircleCards(list, allCircles, {});

  _initSupabase();
  if(!sbClient) return;

  // Subscribe once to circle_members for live count updates
  if(!_circleMembersCh){
    _circleMembersCh = _sbSub('velo:circle_members', 'circle_members', function(){
      _refreshCircleMemberCounts();
    });
  }

  // Load user-created circles from Supabase (non-official)
  sbClient.from('circles').select('*').eq('official', false).order('created_at',{ascending:false}).limit(50)
    .then(function(res){
      var sbCircles = (res.data||[]).map(function(r){
        return { id:r.id, name:r.name, desc:r.descripcion||'', emoji:r.emoji||'⭕', foto:r.foto||'',
          members:0, maxMembers:r.cap_max||30, active:true, official:false };
      });
      // Merge: Supabase circles take precedence over same-id localStorage ones
      var merged = sbCircles.slice();
      lsCircles.forEach(function(lc){
        if(!merged.find(function(sc){ return sc.id === lc.id; })) merged.push(lc);
      });
      allCircles = merged.concat(_circlesData);
      _renderCircleCards(list, allCircles, {});
      _refreshCircleMemberCounts(allCircles);
    }).catch(function(){
      _refreshCircleMemberCounts(allCircles);
    });
}

function _circleCardHtml(c, memberCounts){
  var msgs = []; try{ msgs = JSON.parse(safeLS('get','velo_circle_'+c.id)||'[]'); }catch(e){}
  var lastMsg = msgs.length ? msgs[msgs.length-1] : null;
  var maxM = c.maxMembers || 30;
  var memberCount = memberCounts && memberCounts[c.id] !== undefined ? memberCounts[c.id] : (c.members||0);
  var capPct = Math.min(100, Math.round(memberCount/maxM*100));
  var isFull = memberCount >= maxM;
  var imgHtml = c.foto
    ? '<img src="'+c.foto+'" alt="" style="width:52px;height:52px;border-radius:18px;object-fit:cover;flex-shrink:0">'
    : '<div style="font-size:34px;width:52px;height:52px;border-radius:18px;background:var(--sage7);display:flex;align-items:center;justify-content:center;flex-shrink:0;position:relative">'
      +c.emoji
      +(c.official ? '<span style="position:absolute;bottom:-4px;right:-4px;font-size:12px;background:#fff;border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,.15)" title="Sala oficial Velo">🛡️</span>' : '')
      +'</div>';
  return '<div class="circle-card'+(c.official?' circle-card--official':'')+'" id="circlecard-'+c.id+'" onclick="pOpenCircle(\''+c.id+'\')">'
    +'<div style="display:flex;align-items:center;gap:13px">'
    +imgHtml
    +'<div style="flex:1;min-width:0">'
    +'<div style="font-size:15px;font-weight:700;color:var(--ink);margin-bottom:2px">'+c.name+'</div>'
    +'<div style="font-size:12px;color:var(--ink2);margin-bottom:5px">'+c.desc+'</div>'
    +'<div style="height:5px"></div>'
    +'<div style="display:flex;align-items:center;gap:6px">'
    +'<div style="flex:1;height:4px;background:var(--cream2);border-radius:100px;overflow:hidden"><div style="height:100%;width:'+capPct+'%;background:'+(isFull?'var(--sos)':'var(--sage3)')+';border-radius:100px"></div></div>'
    +'<span class="circle-member-count-'+c.id+'" style="font-size:10px;color:var(--ink3);font-weight:600">'+memberCount+'/'+maxM+'</span>'
    +(isFull ? '<span style="font-size:10px;color:var(--sos);font-weight:700">Lleno</span>' : '')
    +'</div>'
    +'</div>'
    +'<div style="text-align:right;flex-shrink:0;margin-left:6px">'
    +(c.active ? '<span class="p-pill p-pill--live" style="font-size:10px"><span class="p-ldot p-ldot--on"></span> Activo</span><br>' : '')
    +(c.official ? '<span style="font-size:10px;color:var(--sage);font-weight:700">Oficial</span>' : '')
    +'</div>'
    +'</div>'
    +'</div>';
}

function _renderCircleCards(list, circles, memberCounts){
  list.innerHTML = circles.map(function(c){ return _circleCardHtml(c, memberCounts); }).join('');
}

function _refreshCircleMemberCounts(circles){
  _initSupabase();
  if(!sbClient) return;
  var since = new Date(Date.now() - 10*60*1000).toISOString();
  sbClient.from('circle_members').select('circle_id,user_id').gte('last_seen', since)
    .then(function(res){
      if(!res.data) return;
      var counts = {};
      res.data.forEach(function(r){ counts[r.circle_id] = (counts[r.circle_id]||0)+1; });
      // Update all visible circle count spans
      Object.keys(counts).forEach(function(cid){
        var span = document.querySelector('.circle-member-count-'+cid);
        if(span){
          var maxM = 30;
          var card = document.getElementById('circlecard-'+cid);
          if(card){ var existing = span.textContent.split('/'); maxM = parseInt(existing[1])||30; }
          span.textContent = counts[cid]+'/'+maxM;
        }
      });
      // Update open circle header
      if(_curCircle){
        var n = counts[_curCircle.id] || 0;
        _setEl('feedCircleMembers', n + (n===1?' persona activa':' personas activas'));
      }
    }).catch(function(){});
}

function pOpenCircle(id, circleData){
  _curCircle = typeof circleData === 'string' ? JSON.parse(circleData) : circleData;
  if(!_curCircle){ _curCircle = _circlesData.find(function(c){ return c.id===id; }); }

  _setEl('feedCircleName',  _curCircle ? _curCircle.name  : 'Círculo');
  _setEl('feedCircleEmoji', _curCircle ? _curCircle.emoji : '⭕');
  _setEl('feedCircleMembers', _curCircle ? _curCircle.members+' personas' : '');
  var rulesEl = document.getElementById('feedCircleRules');
  if(rulesEl) rulesEl.innerHTML = '🤝 Sin juicios · Sin agresión · Sin consejo no solicitado';

  // Subscribe to real-time messages for this circle
  _initSupabase();
  _sbUnsub(_circleRtCh);
  _circleRtCh = null;
  if(sbClient){
    _circleRtCh = _sbSub('velo:circle:'+id, 'circle_messages', function(payload){
      if(payload.new && payload.new.circle_id === id){ _renderCircleMessages(); }
    });
    // Upsert user into circle_members for real-time presence counting
    var _cmId = safeLS('get','velo_user_id') || safeLS('get','velo_user_email') || '';
    if(_cmId){
      sbClient.from('circle_members').upsert({circle_id:id, user_id:_cmId, last_seen:new Date().toISOString()},
        {onConflict:'circle_id,user_id'}).then(function(){}).catch(function(){});
    }
    // Announce join once per session per circle
    if(!_circleJoinedSession[id]){
      _circleJoinedSession[id] = true;
      var jName = safeLS('get','velo_user_name') || 'Alguien';
      var jId   = safeLS('get','velo_user_id') || safeLS('get','velo_user_email') || 'anon';
      sbClient.from('circle_messages').insert({ circle_id:id, user_id:jId, user_name:jName,
        user_av:'', text:jName+' se unió al chat', type:'system' }).then(function(){}).catch(function(){});
    }
  }

  pGoTo('feed');
  setTimeout(function(){ _renderCircleMessages(); _startCircleAutoMsg(); }, 100);
}

async function _renderCircleMessages(){
  var _tok = _navToken;
  var el = document.getElementById('feedMessages');
  if(!el || !_curCircle) return;

  // Load from Supabase for real multi-user messages
  var sbRows = await _sbLoad('circle_messages', function(q){
    return q.eq('circle_id', _curCircle.id).order('created_at',{ascending:true}).limit(100);
  });
  if(_navToken !== _tok) return;

  var msgs;
  if(sbRows !== null && sbRows.length){
    msgs = sbRows.map(_sbCircleMsgRow);
    _sbCircleMsgs = msgs;
    // Only use mock auto-messages if no real messages exist
    if(_circleAutoMsgTimer){ clearInterval(_circleAutoMsgTimer); _circleAutoMsgTimer = null; }
  } else if(sbRows !== null && !sbRows.length){
    // Supabase connected but circle is empty — show seed message, no mocks
    msgs = [];
  } else {
    // Supabase unavailable — use only real localStorage messages
    try{ msgs = JSON.parse(safeLS('get','velo_circle_'+_curCircle.id)||'[]'); }catch(e){ msgs = []; }
  }

  el.innerHTML = msgs.map(function(m){
    if(m.type === 'system'){
      return '<div style="text-align:center;margin:10px 0"><span style="font-size:11px;color:var(--ink5);font-style:italic;background:var(--cream2);padding:4px 12px;border-radius:100px">'+_escHtml(m.text)+'</span></div>';
    }
    return _buildMsgBubble(m.text, !!m.own, m.av, m.name, 'feedInput', 'feedReplyBar', '', m.reactions, m.sbId, m.userId);
  }).join('');
  el.scrollTop = el.scrollHeight;

  // Count active members: users who sent a message in the last 2 hours (not all-time)
  if(sbRows !== null){
    var twoHoursAgo = Date.now() - 2*60*60*1000;
    var uids = {};
    sbRows.forEach(function(r){
      if(r.user_id && r.type !== 'system' && new Date(r.created_at).getTime() > twoHoursAgo){
        uids[r.user_id] = 1;
      }
    });
    var memberCount = Object.keys(uids).length;
    _setEl('feedCircleMembers', memberCount + (memberCount===1?' persona activa':' personas activas'));
  }
}

function pSendCircleMsg(){
  var ta = document.getElementById('feedInput');
  if(!ta || !ta.value.trim() || !_curCircle) return;
  var text = ta.value.trim();
  if(text.length > 2000){ pToast('⚠️','Mensaje demasiado largo (máx 2000 caracteres)'); return; }
  ta.value = '';
  ta.style.height = '';
  var emojiPanel = document.getElementById('feedEmojiPanel');
  if(emojiPanel) emojiPanel.style.display = 'none';
  var circleQuote = _getReplyQuote('feedReplyBar');
  pClearReplyBar('feedReplyBar');
  var fullText = circleQuote ? '↩ "'+circleQuote.slice(0,60)+(circleQuote.length>60?'…':'')+'"  \n'+text : text;

  var msgs = []; try{ msgs = JSON.parse(safeLS('get','velo_circle_'+_curCircle.id)||'[]'); }catch(e){}
  var name = safeLS('get','velo_user_name') || 'Vos';
  var av   = safeLS('get','velo_user_av')   || '🧑';
  var userConvs = parseInt(safeLS('get','velo_guardian_convs')||'0', 10);
  var badge = _getBadge(userConvs);
  var myId = safeLS('get','velo_user_id')||safeLS('get','velo_user_email')||'anon';
  msgs.push({ id:'m'+Date.now(), av:av, name:name+' '+badge.icon, text:fullText, ts:Date.now(), own:true, userId:myId });
  safeLS('set','velo_circle_'+_curCircle.id, JSON.stringify(msgs.slice(-100)));
  _geminiModerateContent(fullText, 'circulo-'+_curCircle.id);
  // Insert to Supabase so all circle members see the message in real-time
  _initSupabase();
  if(sbClient){
    sbClient.from('circle_messages').insert({ circle_id:_curCircle.id,
      user_id: myId, user_name: name+' '+badge.icon, user_av: av||'🌿', text:fullText, type:'text'
    }).then(function(){}).catch(function(){});
  }
  _renderCircleMessages();
}

var _circleMsgEmojis = ['😊','😢','❤️','🙏','💪','🌿','✨','🤗','🌸','😌','🥺','💙','🌈','☀️','🦋','🕊️','🌊','💚','😔','🫂'];
function pToggleCircleEmojis(){
  var panel = document.getElementById('feedEmojiPanel');
  if(!panel) return;
  if(panel.style.display === 'flex'){ panel.style.display = 'none'; return; }
  if(!panel.innerHTML){
    panel.innerHTML = _circleMsgEmojis.map(function(e){
      return '<button type="button" onclick="pInsertCircleEmoji(\''+e+'\')" style="font-size:22px;background:none;border:none;cursor:pointer;padding:4px;border-radius:8px">'+e+'</button>';
    }).join('');
  }
  panel.style.display = 'flex';
}
function pInsertCircleEmoji(e){
  var ta = document.getElementById('feedInput');
  if(!ta) return;
  ta.value = (ta.value || '') + e;
  ta.focus();
}

function _startCircleAutoMsg(){ /* disabled — no fake auto-messages */ }

function pLeaveCircle(){
  if(_circleAutoMsgTimer){ clearInterval(_circleAutoMsgTimer); _circleAutoMsgTimer = null; }
  var leftCircle = _curCircle;
  _initSupabase();
  if(sbClient && leftCircle && _circleJoinedSession[leftCircle.id]){
    delete _circleJoinedSession[leftCircle.id];
    var lName = safeLS('get','velo_user_name') || 'Alguien';
    var lId   = safeLS('get','velo_user_id') || safeLS('get','velo_user_email') || 'anon';
    sbClient.from('circle_messages').insert({ circle_id:leftCircle.id, user_id:lId, user_name:lName,
      user_av:'', text:lName+' salió del chat', type:'system' }).then(function(){}).catch(function(){});
  }
  // Remove from circle_members
  var _cmId = safeLS('get','velo_user_id') || safeLS('get','velo_user_email') || '';
  if(sbClient && leftCircle && _cmId){
    sbClient.from('circle_members').delete().eq('circle_id', leftCircle.id).eq('user_id', _cmId)
      .then(function(){}).catch(function(){});
  }
  _curCircle = null;
  pGoTo('circles');
  // Refresh member counts after leaving so the list reflects current state
  setTimeout(pRenderCircles, 300);
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
  var capMinEl = document.getElementById('newCircleCapMin');
  var capMaxEl = document.getElementById('newCircleCapMax');
  var emoji   = _selectedCircleEmoji || '⭕';
  if(!nameEl || !nameEl.value.trim()){ pToast('⚠️','Poné un nombre al círculo'); return; }
  var capMin = Math.max(5, Math.min(30, parseInt((capMinEl&&capMinEl.value)||'5', 10)));
  var capMax = Math.max(capMin, Math.min(30, parseInt((capMaxEl&&capMaxEl.value)||'30', 10)));
  var myId = safeLS('get','velo_user_id') || safeLS('get','velo_user_email') || 'anon';
  var c = {
    id: 'uc'+Date.now(),
    name: nameEl.value.trim(),
    desc: descEl ? descEl.value.trim() : '',
    emoji: emoji,
    foto: _selectedCircleFoto || '',
    members: 1,
    active: true,
    maxMembers: capMax
  };
  // Save to localStorage as fallback
  var circles = []; try{ circles = JSON.parse(safeLS('get','velo_circles')||'[]'); }catch(e){}
  circles.unshift(c);
  safeLS('set','velo_circles', JSON.stringify(circles.slice(0,20)));
  // Save to Supabase for multiuser
  _initSupabase();
  if(sbClient){
    sbClient.from('circles').insert({
      id: c.id, name: c.name, descripcion: c.desc, emoji: c.emoji, foto: c.foto,
      cap_min: capMin, cap_max: capMax, creator_id: myId, official: false
    }).then(function(){}).catch(function(){});
  }
  _selectedCircleFoto = '';
  var prevEl = document.getElementById('newCirclePhotoPreview');
  if(prevEl) prevEl.style.display = 'none';
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

function pCirclePhotoUpload(input){
  if(!input || !input.files || !input.files[0]) return;
  var file = input.files[0];
  if(!file.type.startsWith('image/')){ pToast('⚠️','Solo imágenes'); return; }
  if(file.size > 2*1024*1024){ pToast('⚠️','La imagen debe pesar menos de 2MB'); return; }
  var reader = new FileReader();
  reader.onload = function(e){
    _selectedCircleFoto = e.target.result;
    var prevEl = document.getElementById('newCirclePhotoPreview');
    if(prevEl){ prevEl.src = _selectedCircleFoto; prevEl.style.display = 'block'; }
    var lbl = document.getElementById('newCirclePhotoLabel');
    if(lbl) lbl.textContent = 'Foto cargada ✓';
  };
  reader.readAsDataURL(file);
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
  return safeLS('get','velo_user_id') || safeLS('get','velo_user_email') || 'guest-'+(safeLS('get','velo_user_name')||'user');
}

// Reliable display name — never empty, falls back to email prefix
function _myDisplayName(){
  return safeLS('get','velo_user_name') || (safeLS('get','velo_user_email')||'').split('@')[0] || 'Usuario';
}

// Produces a JS string literal safe to embed inside a double-quoted HTML
// onclick="" attribute. Using JSON.stringify directly emits double quotes
// that prematurely close the attribute — this wraps in single quotes and
// escapes them, turning any inner double quote into &quot;.
function _jsAttr(v){
  return "'" + String(v == null ? '' : v)
    .replace(/\\/g,'\\\\').replace(/'/g,"\\'")
    .replace(/"/g,'&quot;').replace(/[\r\n]+/g,' ') + "'";
}

// Loads reviews written ABOUT a given user (most recent first)
async function _loadUserReviews(userId){
  _initSupabase();
  if(!sbClient || !userId) return [];
  try{
    await _ensureSbSession();
    var res = await sbClient.from('reviews').select('*').eq('pro_id', userId)
      .order('created_at',{ascending:false}).limit(50);
    if(res.error) console.error('[reviews load]', res.error.message);
    return res.data || [];
  }catch(e){ console.error('[reviews load catch]', e); return []; }
}

function _reviewCardHtml(r, myId, proId){
  var canDel = myId && (r.user_id === myId || proId === myId);
  var delBtn = canDel
    ? '<button onclick="pDeleteReview(\''+_escHtml(String(r.id||''))+'\',this.closest(\'.p-review-card\'))" style="background:none;border:none;cursor:pointer;font-size:14px;color:var(--ink5);padding:0 0 0 8px;line-height:1;flex-shrink:0" title="Eliminar reseña">🗑️</button>'
    : '';
  return '<div class="p-review-card" style="margin-bottom:10px">'
    +'<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px">'
    +'<span style="font-size:13px">'+'⭐'.repeat(Math.min(5,r.stars||5))+'</span>'
    +delBtn+'</div>'
    +(r.texto ? '<p class="p-rv-txt" style="margin:0 0 4px">&#8220;'+_escHtml(r.texto)+'&#8221;</p>' : '')
    +'<div style="font-size:11px;color:var(--ink5)">— '+_escHtml(r.reviewer_name||'Anónimo')+'</div>'
    +'</div>';
}

function _renderReviewsList(revs, myId, proId){
  var LIMIT = 5;
  var visible = revs.slice(0, LIMIT);
  var rest = revs.slice(LIMIT);
  var html = visible.map(function(r){ return _reviewCardHtml(r, myId, proId); }).join('');
  if(rest.length){
    var moreId = 'rvMore'+Math.random().toString(36).slice(2,7);
    html += '<div id="'+moreId+'" style="display:none">'
      + rest.map(function(r){ return _reviewCardHtml(r, myId, proId); }).join('')
      +'</div>'
      +'<button onclick="var m=document.getElementById(\''+moreId+'\');if(!m)return;var open=m.style.display!==\'none\';m.style.display=open?\'none\':\'block\';this.textContent=open?\'Ver más ('+(rest.length)+') ↓\':\'Ver menos ↑\';" style="background:none;border:none;color:var(--sage);font-size:12px;font-weight:600;cursor:pointer;padding:4px 0;font-family:\'Jost\',sans-serif">Ver más ('+rest.length+') ↓</button>';
  }
  return html;
}

async function pDeleteReview(reviewId, cardEl){
  if(!reviewId) return;
  if(!confirm('¿Eliminar esta reseña?')) return;
  _initSupabase();
  if(sbClient){
    try{ await sbClient.from('reviews').delete().eq('id', reviewId); }catch(e){}
  }
  if(cardEl){
    cardEl.style.transition = 'opacity .3s';
    cardEl.style.opacity = '0';
    setTimeout(function(){ if(cardEl.parentNode) cardEl.parentNode.removeChild(cardEl); }, 350);
  }
  pToast('🗑️','Reseña eliminada');
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
function sbUpdateHappyPost(id, fields){
  _initSupabase();
  if(!sbClient) return;
  try{ sbClient.from('happy_posts').update(fields).eq('id', id).then(function(){}).catch(function(){}); }catch(e){}
}
function pZoomPhoto(src){
  if(!src) return;
  var existing = document.getElementById('photoZoomOv');
  if(existing) existing.remove();
  var ov = document.createElement('div');
  ov.id = 'photoZoomOv';
  ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.92);display:flex;align-items:center;justify-content:center;padding:20px;cursor:zoom-out';
  ov.innerHTML = '<img src="'+_escHtml(src)+'" style="max-width:100%;max-height:100%;border-radius:12px;object-fit:contain">'
    +'<button style="position:absolute;top:16px;right:16px;width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.15);border:none;color:#fff;font-size:20px;cursor:pointer">✕</button>';
  ov.addEventListener('click', function(){ ov.remove(); });
  document.body.appendChild(ov);
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

async function pRenderHappy(){
  var _tok = _navToken;
  var list = document.getElementById('happyList');
  if(!list) return;
  // Only reset form if user hasn't started typing
  var _ta = document.getElementById('happyPostTa');
  if(!_ta || !_ta.value.trim()) pOpenHappyPost();
  var myId = _myUserId();

  // Load from Supabase (shared wall) or fall back to localStorage
  var sbRows = await _sbLoad('happy_posts', function(q){
    var cutoff = new Date(Date.now()-24*60*60*1000).toISOString();
    return q.gte('created_at',cutoff).order('created_at',{ascending:false}).limit(50);
  });
  if(_navToken !== _tok) return;
  var posts, usingSB = false;
  if(sbRows !== null){
    usingSB = true;
    posts = sbRows.map(_sbHappyRow).filter(function(h){ return !_isBlocked(h.userId); });
    // Merge post that was just submitted; Supabase may not have returned it yet
    if(_pendingHappyPost){
      var alreadyIn = posts.some(function(p){ return p.id === _pendingHappyPost.id; });
      if(!alreadyIn) posts.unshift(_pendingHappyPost);
      else _pendingHappyPost = null;
    }
    _sbHappy = posts;
    // Batch-fetch usernames for non-anon authors not yet cached
    if(sbClient){ var _hpUnknown = posts.filter(function(h){ return !h.anon && h.userId && h.userId!=='anon' && !_uLook(h.userId); }).map(function(h){ return h.userId; }); if(_hpUnknown.length){ try{ var _hpr = await sbClient.from('profiles').select('id,username').in('id',_hpUnknown); if(_hpr.data) _hpr.data.forEach(function(p){ _uFill(p.id,p.username); }); }catch(e){} } }
  } else {
    posts = _processHappyQueue();
  }

  // Queue notice (only in localStorage mode)
  var queueNote = document.getElementById('happyQueueNote');
  if(queueNote){
    if(!usingSB){
      var queue = _happyQueueLoad();
      var myQueued = queue.find(function(p){ return p.userId === myId; });
      if(myQueued){
        var pos = queue.indexOf(myQueued)+1;
        queueNote.style.display='';
        queueNote.innerHTML='⏳ Tu publicación está en lista de espera (posición '+pos+' de '+queue.length+').';
      } else { queueNote.style.display='none'; }
    } else { queueNote.style.display='none'; }
  }

  var counter = document.getElementById('happyCounter');
  if(counter) counter.textContent = posts.length+' publicaciones activas';

  // Update history entries with live stats from Supabase
  if(usingSB && myId){
    try{
      var _hKeyU = 'velo_happy_history_'+myId;
      var hist = JSON.parse(safeLS('get',_hKeyU)||safeLS('get','velo_happy_history')||'[]');
      var dirty = false;
      hist.forEach(function(he){
        var live = posts.find(function(p){ return p.id === he.id; });
        if(live){
          he.reactions = live.reactions;
          he.commentCount = (live.comments||[]).length;
          dirty = true;
        }
      });
      if(dirty) safeLS('set',_hKeyU, JSON.stringify(hist));
    }catch(e){}
  }

  var queue = usingSB ? [] : _happyQueueLoad();
  if(_happyActiveTab === 'mine'){
    _renderMyHappy(list, posts, queue, myId);
  } else if(_happyActiveTab === 'history'){
    _renderHappyHistory(list);
  } else {
    _renderAllHappy(list, posts);
  }
}

function _renderAllHappy(list, posts){
  var all = posts;
  if(!all.length){
    list.innerHTML = '<div class="p-empty" style="grid-column:1/-1"><span class="p-empty-emoji">☀️</span><div class="p-empty-title">El muro está vacío</div><div class="p-empty-sub">¡Sé el primero en compartir un momento de alegría!</div></div>';
    return;
  }
  list.innerHTML = all.map(function(h){ return _happyPostCard(h, false); }).join('');
}

function _renderMyHappy(list, posts, queue, myId){
  var mine = posts.filter(function(p){ return p.userId === myId; });
  var active = mine[0]; // most recent active post (sorted desc)
  var myQueued = queue.filter(function(p){ return p.userId === myId; });

  if(!active && !myQueued.length){
    list.innerHTML = '<div class="p-empty" style="grid-column:1/-1"><span class="p-empty-emoji">📌</span>'
      +'<div class="p-empty-title">No tenés publicación activa</div>'
      +'<div class="p-empty-sub">Publicá algo en el Muro de la Felicidad para verla aquí ☀️</div></div>';
    return;
  }

  var html = '';
  if(active){
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">'
      +'<span style="font-size:18px">📌</span>'
      +'<span style="font-size:12px;font-weight:700;color:var(--sage);letter-spacing:.3px">Tu publicación activa</span>'
      +'<span style="font-size:10px;color:var(--ink5);margin-left:auto">Visible por 24h · desaparece del muro al expirar</span>'
      +'</div>';
    html += _happyPostCard(active, true);
  }
  myQueued.forEach(function(p){
    html += '<div class="happy-card" style="border:1.5px dashed rgba(255,200,50,.4);opacity:.8;margin-top:12px">'
      +'<div style="font-size:11px;font-weight:700;color:rgba(255,180,30,.8);margin-bottom:8px;display:flex;align-items:center;gap:6px">⏳ En lista de espera</div>'
      +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">'
      +'<div style="font-size:26px;width:42px;height:42px;border-radius:13px;background:var(--sun3);display:flex;align-items:center;justify-content:center">'+p.emoji+'</div>'
      +'<div><div style="font-size:13px;font-weight:600;color:var(--ink)">'+_escHtml(p.name)+'</div>'
      +'<div style="font-size:10px;color:var(--ink5)">Enviado '+_happyRelTime(p.ts)+'</div></div></div>'
      +'<p style="font-size:13px;color:var(--ink3);line-height:1.6;font-family:\'Cormorant Garamond\',serif;font-style:italic">"'+_escHtml(p.text)+'"</p>'
      +'</div>';
  });
  list.innerHTML = html;
}

function _renderHappyHistory(list){
  var _hUid = _myUserId ? _myUserId() : (safeLS('get','velo_user_id')||'');
  var _hKey = _hUid ? 'velo_happy_history_'+_hUid : 'velo_happy_history';
  var history = []; try{ history = JSON.parse(safeLS('get',_hKey)||'[]'); }catch(e){}
  if(!history.length){
    list.innerHTML = '<div class="p-empty" style="grid-column:1/-1"><span class="p-empty-emoji">📅</span>'
      +'<div class="p-empty-title">Tu historial está vacío</div>'
      +'<div class="p-empty-sub">Cuando publiques algo en el Muro, quedará guardado aquí para siempre 🌟</div></div>';
    return;
  }
  var clearBtn = '<div style="text-align:right;margin-bottom:14px">'
    +'<button onclick="pClearHappyHistory()" style="padding:6px 14px;background:rgba(220,60,60,.06);border:1px solid rgba(220,60,60,.18);border-radius:100px;font-size:12px;color:rgba(200,60,60,.7);cursor:pointer;font-family:\'Jost\',sans-serif;font-weight:600">🗑️ Borrar historial</button>'
    +'</div>';
  list.innerHTML = clearBtn + history.map(function(h, i){
    var date = new Date(h.ts);
    var dateStr = date.toLocaleDateString('es', { day:'2-digit', month:'short', year:'numeric' });
    var timeStr = date.toLocaleTimeString('es', { hour:'2-digit', minute:'2-digit' });
    var rxTotal = 0;
    if(h.reactions) rxTotal = Object.keys(h.reactions).reduce(function(a,k){ return a+(h.reactions[k]||0); }, 0);
    var statsHtml = '';
    if(rxTotal > 0 || (h.commentCount > 0)){
      statsHtml = '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">';
      if(rxTotal > 0) statsHtml += '<span style="font-size:10px;background:rgba(255,224,102,.25);border-radius:100px;padding:3px 9px;font-weight:600;color:rgba(160,120,0,.8)">💛 '+rxTotal+' reaccion'+(rxTotal>1?'es':'')+'</span>';
      if(h.commentCount > 0) statsHtml += '<span style="font-size:10px;background:rgba(116,198,157,.15);border-radius:100px;padding:3px 9px;font-weight:600;color:var(--sage)">💬 '+h.commentCount+' comentario'+(h.commentCount>1?'s':'')+'</span>';
      statsHtml += '</div>';
    }
    return '<div class="happy-card" style="position:relative">'
      +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">'
      +'<div style="font-size:24px;width:40px;height:40px;border-radius:12px;background:var(--sun3);display:flex;align-items:center;justify-content:center;flex-shrink:0">'+h.emoji+'</div>'
      +'<div style="flex:1;min-width:0">'
      +'<div style="font-size:11px;font-weight:700;color:var(--sage)">Mi publicación</div>'
      +'<div style="font-size:10px;color:var(--ink5)">'+dateStr+' · '+timeStr+'</div>'
      +'</div>'
      +(i===0 ? '<span style="font-size:10px;background:var(--sage7);color:var(--sage);border-radius:100px;padding:2px 8px;font-weight:700;white-space:nowrap">Más reciente</span>' : '')
      +'</div>'
      +(h.photo ? '<img src="'+h.photo+'" onclick="pZoomPhoto(this.src)" style="width:100%;max-height:180px;object-fit:cover;border-radius:10px;display:block;margin-bottom:12px;cursor:zoom-in">' : '')
      +(h.text ? '<p style="font-size:13px;color:var(--ink3);line-height:1.6;margin:0;font-family:\'Cormorant Garamond\',serif;font-style:italic">"'+_escHtml(h.text)+'"</p>' : '')
      +statsHtml
      +'</div>';
  }).join('');
}

function pClearHappyHistory(){
  if(!confirm('¿Borrar todo tu historial del Muro de la Felicidad? Esta acción no se puede deshacer.')) return;
  var _hUid2 = _myUserId ? _myUserId() : (safeLS('get','velo_user_id')||'');
  var _hKey2 = _hUid2 ? 'velo_happy_history_'+_hUid2 : 'velo_happy_history';
  safeLS('set',_hKey2,'[]');
  pRenderHappy();
  pToast('🗑️','Historial borrado');
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
  var commCount = comments.length;
  var shownComments = isOwn ? comments : comments.slice(0, 5);
  var commHtml = '';
  if(commCount > 0){
    commHtml = '<div style="margin-bottom:10px">';
    commHtml += '<div style="font-size:11px;font-weight:700;color:var(--ink4);margin-bottom:8px;display:flex;align-items:center;gap:5px"><span>💬</span><span>'+commCount+' comentario'+(commCount>1?'s':'')+'</span></div>';
    shownComments.forEach(function(c){
      var cAnon = !c.userId || c.name === 'Usuario Anónimo' || c.name === 'Anónimo';
      var cClickAttr = !cAnon
        ? ' onclick="pQuickProfile('+_jsAttr(c.name||'Usuario')+','+_jsAttr(c.av||'🧑')+',\'\',\'\','+_jsAttr(c.userId)+')"'
        : '';
      var avHtml = cAnon
        ? '<div style="font-size:13px;width:26px;height:26px;border-radius:50%;background:var(--cream2);display:flex;align-items:center;justify-content:center;flex-shrink:0">👤</div>'
        : '<div style="flex-shrink:0;cursor:pointer"'+cClickAttr+'>'+_avInline(c.av||'🧑',26)+'</div>';
      commHtml += '<div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:8px">'
        + avHtml
        +'<div style="background:var(--cream2);border-radius:0 12px 12px 12px;padding:7px 11px;flex:1;min-width:0">'
        +'<div style="font-size:11px;font-weight:700;color:var(--ink2);margin-bottom:2px'+(cAnon?'':';cursor:pointer')+'"'+cClickAttr+'>'+_escHtml(c.name||'Usuario')+'</div>'
        +'<div style="font-size:12px;color:var(--ink3);line-height:1.45;word-break:break-word">'+_escHtml(c.text)+'</div>'
        +'</div></div>';
    });
    if(!isOwn && commCount > 5){
      commHtml += '<div style="font-size:11px;color:var(--sage);text-align:center;padding:4px 0;font-weight:600">+ '+(commCount-5)+' comentarios más</div>';
    }
    commHtml += '</div>';
  }
  var moreComments = '';

  // Avatar: profile photo if available, else mood emoji
  var hasPhoto = h.av && (h.av.startsWith('data:') || h.av.startsWith('http'));
  var avatarHtml = hasPhoto
    ? '<div style="position:relative;width:40px;height:40px;flex-shrink:0">'
      +'<img src="'+_escHtml(h.av)+'" style="width:40px;height:40px;border-radius:12px;object-fit:cover;display:block">'
      +'<span style="position:absolute;bottom:-3px;right:-3px;font-size:14px;line-height:1">'+h.emoji+'</span>'
      +'</div>'
    : '<div style="font-size:24px;width:40px;height:40px;border-radius:12px;background:var(--sun3);display:flex;align-items:center;justify-content:center;flex-shrink:0">'+h.emoji+'</div>';

  var canClick = !isOwn && h.userId && h.userId !== 'anon' && !h.anon;
  var authorClick = canClick ? ' style="cursor:pointer" onclick="pQuickProfile('+_jsAttr(h.name||'Usuario')+','+_jsAttr(h.av||'')+',\'\',\'\','+_jsAttr(h.userId||'')+')"' : '';
  return '<div class="happy-card" data-id="'+h.id+'">'
    // header
    +'<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">'
    +'<div'+authorClick+'>'+avatarHtml+'</div>'
    +'<div style="flex:1;min-width:0">'
    +'<div style="font-size:13px;font-weight:600;color:var(--ink)'+(canClick?';cursor:pointer':'')+'"'+(canClick?' onclick="pQuickProfile('+_jsAttr(h.name||'Usuario')+','+_jsAttr(h.av||'')+',\'\',\'\','+_jsAttr(h.userId||'')+')"':'')+'>'+_escHtml(h.name||'Usuario Anónimo')+'</div>'
    +(!h.anon && h.userId && h.userId!=='anon' ? _uAt(h.userId) : '')
    +'<div style="font-size:10px;color:var(--ink5);margin-top:1px">'+relTime+(isOwn?' · <strong style="color:var(--sage)">Tuya</strong>':'')+'</div>'
    +'</div>'
    +(isOwn
      ? '<button onclick="pDeleteHappyPost(\''+h.id+'\')" style="padding:5px 10px;background:rgba(255,80,80,.07);border:1px solid rgba(255,80,80,.18);border-radius:100px;color:rgba(200,60,60,.7);font-size:11px;cursor:pointer;font-family:\'Jost\',sans-serif;flex-shrink:0" title="Eliminar publicación">🗑️</button>'
      : '<button onclick="pReportContent(\'happy\','+_jsAttr(h.id)+','+_jsAttr((h.text||'').slice(0,80))+')" style="padding:4px 9px;background:rgba(200,50,50,.12);border:1px solid rgba(200,50,50,.25);border-radius:100px;color:rgba(180,50,50,.88);font-size:10px;font-weight:700;cursor:pointer;font-family:\'Jost\',sans-serif;flex-shrink:0">🚩 Reportar</button>')
    +(timeLeft ? '<span style="font-size:10px;color:'+expColor+';font-weight:600;white-space:nowrap;flex-shrink:0">⏳ '+timeLeft+'</span>' : '')
    +'</div>'
    // photo
    +(h.photo ? '<img src="'+h.photo+'" onclick="pZoomPhoto(this.src)" style="width:100%;max-height:240px;object-fit:cover;border-radius:12px;display:block;margin-bottom:14px;cursor:zoom-in">' : '')
    // text
    +(h.text ? '<p style="font-size:14px;color:var(--ink3);line-height:1.65;margin-bottom:14px;font-family:\'Cormorant Garamond\',serif;font-style:italic">"'+_escHtml(h.text)+'"</p>' : '')
    // reactions
    +'<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">'+rxBar+'</div>'
    // divider + comments
    +(commHtml ? '<div style="border-top:1px solid var(--border2);padding-top:12px;margin-bottom:12px">'+commHtml+'</div>' : '<div style="border-top:1px solid var(--border2);margin-bottom:12px"></div>')
    // comment input
    +'<div style="display:flex;gap:8px;align-items:center">'
    +'<input id="cmt-'+h.id+'" class="p-input" style="flex:1;font-size:12px;padding:7px 12px;height:auto;border-radius:100px" placeholder="Dejar un comentario…" maxlength="120" onkeydown="if(event.key===\'Enter\')pHappyComment(\''+h.id+'\')">'
    +'<button onclick="pHappyComment(\''+h.id+'\')" style="padding:7px 12px;background:var(--sage7);border:1.5px solid var(--sage4);border-radius:100px;font-size:12px;cursor:pointer;color:var(--sage);font-family:\'Jost\',sans-serif;font-weight:700;flex-shrink:0;white-space:nowrap">Enviar 💬</button>'
    +'</div>'
    +(safeLS('get','velo_incognito')==='true' ? '<div style="font-size:10.5px;color:var(--ink5);line-height:1.5;margin-top:6px;font-style:italic">En tu perfil tenés activo el modo incógnito. Si querés comentar con tu perfil público, desactivá esa opción.</div>' : '')
    +'</div>';
}

async function pDeleteHappyPost(postId){
  if(!confirm('¿Eliminar esta publicación del Muro?')) return;
  _initSupabase();
  if(sbClient){
    try{ await sbClient.from('happy_posts').delete().eq('id', postId); }catch(e){}
  }
  // Remove from local cache
  if(_sbHappy) _sbHappy = _sbHappy.filter(function(h){ return h.id !== postId; });
  var card = document.querySelector('.happy-card[data-id="'+postId+'"]') || document.getElementById('hp-'+postId);
  if(card){ card.style.transition='opacity .3s'; card.style.opacity='0'; setTimeout(function(){ pRenderHappy(); },350); }
  else { setTimeout(function(){ pRenderHappy(); },50); }
  pToast('✅','Publicación eliminada');
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
  // Supabase-loaded post → update in memory + persist to Supabase
  var sbPost = (_sbHappy||[]).find(function(p){ return p.id === postId; });
  if(sbPost){
    if(!sbPost.reactions) sbPost.reactions = {};
    if(myReacted && sbPost.reactions[myReacted] > 0) sbPost.reactions[myReacted]--;
    sbPost.reactions[emoji] = (sbPost.reactions[emoji] || 0) + 1;
    sbUpdateHappyPost(postId, { reactions: sbPost.reactions });
    safeLS('set','velo_happy_rx_'+postId, emoji);
    pToast(emoji,'¡Alegría compartida!');
    var _rxCard = document.querySelector('.happy-card[data-id="'+postId+'"]');
    if(_rxCard){ _rxCard.outerHTML = _happyPostCard(sbPost, sbPost.userId === _myUserId()); }
    else { setTimeout(pRenderHappy, 600); }
    return;
  }
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
  // A comment is anonymous ONLY if the user has incognito mode enabled
  var incognito = safeLS('get','velo_incognito') === 'true';
  var myName = incognito ? 'Usuario Anónimo' : _myDisplayName();
  var myAv   = incognito ? '' : (safeLS('get','velo_user_av')||'🧑');
  var myId   = incognito ? '' : _myUserId();
  var comment = { name:myName, text:text, ts:Date.now(), userId:myId, av:myAv };
  // Supabase-loaded post → update in memory + persist to Supabase
  var sbPost = (_sbHappy||[]).find(function(p){ return p.id === postId; });
  if(sbPost){
    if(!sbPost.comments) sbPost.comments = [];
    sbPost.comments.push(comment);
    sbUpdateHappyPost(postId, { comments: sbPost.comments });
    inp.value = '';
    pToast('💬','Comentario enviado 🌿');
    var _cmtCard = document.querySelector('.happy-card[data-id="'+postId+'"]');
    if(_cmtCard){ _cmtCard.outerHTML = _happyPostCard(sbPost, sbPost.userId === _myUserId()); }
    else { setTimeout(pRenderHappy, 600); }
    return;
  }
  var posts = _happyLoad();
  var post  = posts.find(function(p){ return p.id === postId; });
  var isMock = false;
  if(!post){
    post = _happyMock.find(function(p){ return p.id === postId; });
    isMock = true;
  }
  if(!post) return;
  if(!post.comments) post.comments = [];
  post.comments.push(comment);
  if(!isMock){
    _happySave(posts);
    if(post.userId === _myUserId()) _happyStatIncr('commentsReceived');
  }
  inp.value = '';
  pToast('💬','Comentario enviado 🌿');
  pRenderHappy();
}

var _happySelectedPhoto = null;

function pExpandHappyCompose(){
  var bar = document.getElementById('happyComposeBar');
  var body = document.getElementById('happyComposeBody');
  if(bar) bar.style.display = 'none';
  if(body) body.style.display = 'block';
  pOpenHappyPost();
  var ta = document.getElementById('happyPostTa');
  if(ta) setTimeout(function(){ ta.focus(); }, 50);
}

function pOpenHappyPost(){
  _selectedHappyEmoji = '☀️';
  _happySelectedPhoto = null;
  var ta = document.getElementById('happyPostTa');
  if(ta) ta.value = '';
  // Reset anon toggle to default off (anónimo)
  var tog = document.getElementById('happyProfileTog');
  var chk = document.getElementById('happyShowProfile');
  if(tog) tog.classList.remove('on');
  if(chk) chk.checked = false;
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
    var maxPx = 600, w = image.width, h = image.height;
    if(w > maxPx || h > maxPx){ var r = Math.min(maxPx/w, maxPx/h); w = Math.round(w*r); h = Math.round(h*r); }
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(image, 0, 0, w, h);
    cb(c.toDataURL('image/jpeg', 0.62));
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

async function pSubmitHappyPost(){
  var ta = document.getElementById('happyPostTa');
  var hasText = ta && ta.value.trim();
  var hasPhoto = !!_happySelectedPhoto;
  if(!hasText && !hasPhoto){ pToast('✍️','Escribí algo o adjuntá una foto antes de publicar'); return; }
  var myId  = _myUserId();
  var name  = _myDisplayName();
  var posts = _processHappyQueue();
  var happyShowProfile = document.getElementById('happyShowProfile');
  var isAnon = !(happyShowProfile && happyShowProfile.checked);
  var userAv = isAnon ? '' : (safeLS('get','velo_user_av') || '🧑');
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
    if(post.text) _geminiModerateContent(post.text, 'muro-felicidad');
    pToast('☀️','¡Publicado en el Muro! Desaparece en 24h 💛');
    // Insert to Supabase so all users see it
    _initSupabase();
    if(sbClient){
      // Never send base64 avatars to Supabase — just use emoji to keep payload small
      var sbAv = (post.av||'').startsWith('data:') ? '🧑' : (post.av||'');
      var ins = await sbClient.from('happy_posts').insert({ id:post.id,
        user_id: safeLS('get','velo_user_id')||safeLS('get','velo_user_email')||'anon',
        user_name: post.name, user_av: sbAv, emoji: post.emoji||'☀️',
        text: post.text||'', photo: post.photo||'', anon: !!isAnon, reactions: post.reactions
      });
      if(ins && ins.error) console.error('[happy insert]', ins.error.message, ins.error);
    }
    // Inject into pending so pRenderHappy shows it instantly (even if Supabase is slow/fails)
    _pendingHappyPost = post;
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
  // Save to persistent history (never expires) — scoped to current user
  var _hUid3 = _myUserId ? _myUserId() : (safeLS('get','velo_user_id')||'');
  var _hKey3 = _hUid3 ? 'velo_happy_history_'+_hUid3 : 'velo_happy_history';
  var hist = []; try{ hist = JSON.parse(safeLS('get',_hKey3)||'[]'); }catch(e){}
  hist.unshift({ id:post.id, emoji:post.emoji, text:post.text, photo:post.photo, ts:post.ts, name:post.name });
  safeLS('set',_hKey3, JSON.stringify(hist.slice(0,200)));

  // Reset form and collapse compose back to bar
  pClearHappyPhoto();
  if(ta) ta.value = '';
  var bar = document.getElementById('happyComposeBar');
  var body = document.getElementById('happyComposeBody');
  if(body) body.style.display = 'none';
  if(bar) bar.style.display = '';
  pRenderHappy();
}

function _renderUserDashboard(){
  var el = document.getElementById('userMiniDashboard');
  if(!el) return;
  var helped = parseInt(safeLS('get','velo_helped_others')||'0',10);
  var helpedMe = parseInt(safeLS('get','velo_help_received')||'0',10);
  var convs = parseInt(safeLS('get','velo_guardian_convs')||'0',10);
  var badge = _getBadge(convs);
  el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">'
    +'<div class="mini-dash-card" onclick="switchProfileTab(\'logros\',document.querySelector(\'[onclick*=logros]\'))">'
    +'<div style="font-size:28px;margin-bottom:4px">'+badge.icon+'</div>'
    +'<div style="font-size:11px;font-weight:800;color:var(--ink)">'+badge.name+'</div>'
    +'<div style="font-size:10px;color:var(--ink4)">Nivel</div>'
    +'</div>'
    +'<div class="mini-dash-card"><div style="font-size:24px;font-weight:800;color:var(--sage);margin-bottom:2px">'+helped+'</div><div style="font-size:11px;color:var(--ink3)">Ayudé</div></div>'
    +'<div class="mini-dash-card"><div style="font-size:24px;font-weight:800;color:var(--sage);margin-bottom:2px">'+helpedMe+'</div><div style="font-size:11px;color:var(--ink3)">Me ayudaron</div></div>'
    +'<div class="mini-dash-card" onclick="switchProfileTab(\'reseñas\',document.querySelector(\'[onclick*=reseñas]\'))">'
    +'<div id="miniDashReviewCount" style="font-size:24px;font-weight:800;color:var(--sage);margin-bottom:2px">…</div>'
    +'<div style="font-size:11px;color:var(--ink3)">Reseñas</div>'
    +'</div>'
    +'</div>';
  // Load real count from Supabase (localStorage key was never written)
  var myId = safeLS('get','velo_user_id')||'';
  var countEl = document.getElementById('miniDashReviewCount');
  if(myId){
    _loadUserReviews(myId).then(function(revs){
      var c = document.getElementById('miniDashReviewCount');
      if(c) c.textContent = revs.length;
    });
  } else if(countEl) {
    countEl.textContent = '0';
  }
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
  _syncAvatarToSb(emoji);
  pToast('✅','Avatar actualizado');
  closeModal('avatarPickerOv');
  pLoadProfile();
  _updateSidebarUser();
}

function pSetAvatarFromFile(input){
  if(!input.files || !input.files[0]) return;
  var file = input.files[0];
  if(file.size > 5*1024*1024){ pToast('⚠️','Imagen demasiado grande (máx 5MB)'); return; }
  var reader = new FileReader();
  reader.onload = function(e){
    _compressImg(e.target.result, function(dataUrl){
      safeLS('set','velo_user_av', dataUrl);
      _syncAvatarToSb(dataUrl);
      pToast('✅','Foto de perfil actualizada 🌿');
      closeModal('avatarPickerOv');
      pLoadProfile();
      _updateSidebarUser();
    });
  };
  reader.readAsDataURL(file);
}

function _syncAvatarToSb(av){
  _initSupabase();
  var uid = safeLS('get','velo_user_id');
  if(!sbClient || !uid) return;
  sbClient.from('profiles').upsert({ id:uid, avatar:av },{ onConflict:'id' })
    .then(function(r){ if(r && r.error) pToast('⚠️','Foto guardada solo en este dispositivo (sin conexión a la nube).'); })
    .catch(function(){ pToast('⚠️','Foto guardada solo en este dispositivo (sin conexión a la nube).'); });
}

function pLoadProfile(){
  var name  = safeLS('get','velo_user_name') || 'Usuario';
  var av    = safeLS('get','velo_user_av') || '🧑';
  var motto = safeLS('get','velo_user_motto') || 'Mi camino, mi ritmo.';
  var uname = safeLS('get','velo_username') || '';
  var _pConvs = parseInt(safeLS('get','velo_guardian_convs')||'0',10);
  var _pBadge = _getBadge(_pConvs);
  var _pVerified = (_pBadge.name==='Plata'||_pBadge.name==='Oro'||_pBadge.name==='Diamante');
  // Name with verified tick
  var nameEl = document.getElementById('profileName');
  if(nameEl) nameEl.innerHTML = _escHtml(name) + (_pVerified ? ' <span class="velo-verified" title="Verificado — Plata o superior">✓</span>' : '');
  _renderAvatarEl('profileAv', av);
  // Verified badge on avatar photo (bottom-left, status dot is bottom-right)
  var avWrap = document.getElementById('profileAv') && document.getElementById('profileAv').parentElement;
  if(avWrap){
    var old = avWrap.querySelector('.velo-verified-av');
    if(old) old.parentElement.removeChild(old);
    if(_pVerified){
      var vb = document.createElement('div');
      vb.className = 'velo-verified-av';
      vb.title = 'Verificado — Guardián Plata o superior';
      vb.textContent = '✓';
      avWrap.appendChild(vb);
    }
  }
  _setEl('profileMotto', motto);
  // Show @username or prompt to set one
  var unameEl = document.getElementById('profileUsername');
  if(unameEl){
    if(uname){
      unameEl.innerHTML = '<span style="color:var(--sage2);font-weight:700">@'+uname+'</span>';
      unameEl.onclick = null;
      unameEl.style.cursor = 'default';
    } else {
      unameEl.innerHTML = '<span style="color:#E0A92E;font-weight:700;cursor:pointer" onclick="pGoTo(\'pick-username\')">⚠️ Elegí tu @usuario</span>';
      unameEl.onclick = function(){ pGoTo('pick-username'); };
      unameEl.style.cursor = 'pointer';
    }
  }
  // Pre-fill username in edit modal
  var euEl = document.getElementById('editUsername');
  if(euEl) euEl.value = uname;

  // Plan badge
  var planBadge = document.getElementById('profilePlanBadge');
  if(planBadge){
    planBadge.innerHTML = _isPremium()
      ? '<span class="p-pill p-pill--gold">⭐ Velo Plus</span>'
      : '<span class="p-pill p-pill--sage">🌱 Gratuito</span>';
  }

  // Email
  _setEl('profileEmail', safeLS('get','velo_user_email') || '—');

  // Stats — show from localStorage first for instant display
  var daysReg = _getVisitDayCount() || Math.ceil((Date.now() - (parseInt(safeLS('get','velo_registered_ts')||Date.now(),10))) / 86400000);
  _setEl('profileDays', Math.max(1, daysReg));
  var _locHelped = parseInt(safeLS('get','velo_guardian_convs')||'0', 10);
  var _locRecv   = parseInt(safeLS('get','velo_help_received')||'0', 10);
  _setEl('profileChats',    _locHelped + _locRecv);
  _setEl('profileHelped',   _locHelped);
  _setEl('profileReceived', _locRecv);
  // Count real conversations — three sources: localStorage, guardian_requests table, profiles table
  _initSupabase();
  var _pUid = safeLS('get','velo_user_id');
  if(sbClient && _pUid){
    Promise.all([
      sbClient.from('guardian_requests').select('id', {count:'exact', head:true}).eq('guardian_id', _pUid).eq('status','ended'),
      sbClient.from('guardian_requests').select('id', {count:'exact', head:true}).eq('seeker_id',   _pUid).eq('status','ended'),
      sbClient.from('profiles').select('helped_count,received_count').eq('id', _pUid).maybeSingle()
    ]).then(function(results){
      var realH  = (results[0] && results[0].count  != null) ? results[0].count  : 0;
      var realR  = (results[1] && results[1].count  != null) ? results[1].count  : 0;
      var profH  = (results[2] && results[2].data   && results[2].data.helped_count)   ? parseInt(results[2].data.helped_count,  10) : 0;
      var profR  = (results[2] && results[2].data   && results[2].data.received_count) ? parseInt(results[2].data.received_count,10) : 0;
      var finalH = Math.max(_locHelped, realH, profH);
      var finalR = Math.max(_locRecv,   realR, profR);
      // Restore localStorage from highest known value (survives cache clears)
      if(finalH > _locHelped){ safeLS('set','velo_guardian_convs', String(finalH)); }
      if(finalR > _locRecv)  { safeLS('set','velo_help_received',  String(finalR)); }
      // Keep profiles table in sync (write-back if guardian_requests has more data)
      if(finalH > profH) _bumpProfileCounter('helped_count',   finalH);
      if(finalR > profR) _bumpProfileCounter('received_count', finalR);
      _setEl('profileChats',    finalH + finalR);
      _setEl('profileHelped',   finalH);
      _setEl('profileReceived', finalR);
    }).catch(function(){});
  }

  // Mi estado inputs — pre-fill from saved values
  var msEl = document.getElementById('profStatusMusic');
  var mbEl = document.getElementById('profStatusBook');
  var mfEl = document.getElementById('profStatusFilm');
  var mpEl = document.getElementById('profStatusPhrase');
  if(msEl) msEl.value = safeLS('get','velo_status_music')  || '';
  if(mbEl) mbEl.value = safeLS('get','velo_status_book')   || '';
  if(mfEl) mfEl.value = safeLS('get','velo_status_film')   || '';
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
  if(rvEl){
    var myProfileId = safeLS('get','velo_user_id')||'';
    if(myProfileId){
      rvEl.innerHTML = '<p class="p-sm p-muted">Cargando reseñas…</p>';
      _loadUserReviews(myProfileId).then(function(revs){
        if(!revs.length){
          rvEl.innerHTML = '<div class="p-empty"><span class="p-empty-emoji">⭐</span><div class="p-empty-title">Aún no hay reseñas</div><div class="p-empty-sub">Las reseñas aparecerán después de tus sesiones</div></div>';
          return;
        }
        rvEl.innerHTML = _renderReviewsList(revs, myProfileId, myProfileId);
      });
    } else {
      rvEl.innerHTML = '<div class="p-empty"><span class="p-empty-emoji">⭐</span><div class="p-empty-title">Aún no hay reseñas</div><div class="p-empty-sub">Las reseñas aparecerán después de tus sesiones</div></div>';
    }
  }

  // Badges
  _renderBadgesGrid();
}

async function pSaveProfileStatus(){
  var music  = (document.getElementById('profStatusMusic')||{}).value  || '';
  var book   = (document.getElementById('profStatusBook')||{}).value   || '';
  var film   = (document.getElementById('profStatusFilm')||{}).value   || '';
  var phrase = (document.getElementById('profStatusPhrase')||{}).value || '';
  safeLS('set','velo_status_music',  music.trim());
  safeLS('set','velo_status_book',   book.trim());
  safeLS('set','velo_status_film',   film.trim());
  safeLS('set','velo_status_phrase', phrase.trim());
  _initSupabase();
  var uid = safeLS('get','velo_user_id');
  if(sbClient && uid){
    try{
      // Update only the 4 status fields — avoids upsert conflicts with nombre/email constraints
      var updateRes = await sbClient.from('profiles')
        .update({
          status_music:  music.trim(),
          status_book:   book.trim(),
          status_film:   film.trim(),
          status_phrase: phrase.trim()
        })
        .eq('id', uid);
      if(updateRes && updateRes.error){
        console.error('[pSaveProfileStatus]', updateRes.error);
        pToast('⚠️','Guardado solo en este dispositivo (error de red)');
        return;
      }
      pToast('✨','Estado actualizado y visible para todos 💚');
    }catch(e){
      console.error('[pSaveProfileStatus catch]', e);
      pToast('⚠️','Guardado solo en este dispositivo (sin conexión)');
    }
  } else {
    pToast('✨', 'Estado actualizado 💚');
  }
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
    { name:'Novato',   icon:'🌱', min:0,   max:5,   color:'var(--sage4)', unlock:'Nivel inicial — podés pedir acompañamiento a otros guardianes' },
    { name:'Bronce',   icon:'🥉', min:5,   max:20,  color:'#C07840',      unlock:'Requiere: ingresar 5 días distintos a la app · Desbloqueá: insignia de Bronce en tu perfil' },
    { name:'Plata',    icon:'🥈', min:20,  max:40,  color:'#8892A4',      unlock:'Requiere: 20 conversaciones completadas · Desbloqueá: insignia verificada visible en la comunidad' },
    { name:'Oro',      icon:'🥇', min:40,  max:100, color:'#C8A200',      unlock:'Requiere: 40 conversaciones · Desbloqueá: crear Círculos de Paz ☮️ + prioridad en el listado' },
    { name:'Diamante', icon:'💎', min:100, max:100, color:'#7B68EE',      unlock:'Requiere: 100 conversaciones · Desbloqueá: estado top de la comunidad + descuento en Velo Plus ✨' }
  ];
  var tierRows = tiers.map(function(t){
    var reached = t.name === 'Bronce' ? _getVisitDayCount() >= 5 : convs >= t.min;
    var isCurrent = badge.name === t.name;
    var minLabel = t.name === 'Bronce' ? '' : (t.min > 0 ? t.min + ' conv.' : '');
    return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border2)">'
      +'<span style="font-size:22px;opacity:'+(reached?1:.35)+'">'+t.icon+'</span>'
      +'<div style="flex:1;min-width:0">'
      +'<div style="font-size:12px;font-weight:700;color:'+(reached?'var(--ink)':'var(--ink5)')+'">'+t.name
      +(isCurrent?' <span style="font-size:10px;background:var(--sage6);color:var(--sage);border-radius:100px;padding:1px 7px;margin-left:4px">Actual</span>':'')
      +(minLabel?'  <span style="font-size:10px;color:var(--ink5)">'+minLabel+'</span>':'')+'</div>'
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
      ? '<div style="font-size:11px;color:var(--ink5);margin-top:4px">'+badge.needed+(badge.visitBased?' días':' conv.')+' más para <strong style="color:var(--sage2)">'+badge.next+'</strong></div>'
      : '<div style="font-size:11px;color:var(--sage);margin-top:4px">✨ Nivel máximo alcanzado</div>')
    +'</div>'
    +'</div>'
    +'<div style="font-size:11px;font-weight:700;color:var(--ink4);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Qué desbloquea cada nivel</div>'
    +tierRows
    +'</div>';

  var diary = []; try{ diary = JSON.parse(safeLS('get','velo_diary')||'[]'); }catch(e){}
  var _badgeUid = _myUserId ? _myUserId() : (safeLS('get','velo_user_id')||'');
  var _badgeHKey = _badgeUid ? 'velo_happy_history_'+_badgeUid : 'velo_happy_history';
  var happyPosts = []; try{ happyPosts = JSON.parse(safeLS('get',_badgeHKey)||safeLS('get','velo_happy_posts')||'[]'); }catch(e){}
  var daysActive = Math.ceil((Date.now()-(parseInt(safeLS('get','velo_registered_ts')||Date.now(),10)))/86400000);
  var badges = [
    { icon:'🌱', name:'Primer Paso',      desc:'Crear tu cuenta',                              done:true },
    { icon:'📔', name:'Escribiendo',       desc:'Primera entrada en el diario',                 done:!!diary.length },
    { icon:'🌈', name:'En Movimiento',     desc:'Registrar tu ánimo 7 días',                   done:false },
    { icon:'💙', name:'Corazón Abierto',   desc:'Participar en Sala de Ayuda',                 done:!!safeLS('get','velo_helped_once') },
    { icon:'⭐', name:'Constancia',        desc:'30 días en la comunidad',                     done:daysActive>=30 },
    { icon:'🦋', name:'Transformación',    desc:'Completar onboarding',                        done:!!safeLS('get','velo_onboarding_done') },
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

async function pSaveProfile(){
  var nameEl  = document.getElementById('editName');
  var mottoEl = document.getElementById('editMotto');
  var name  = nameEl ? nameEl.value.trim() : '';
  var motto = mottoEl ? mottoEl.value.trim() : '';
  if(!name){ pToast('⚠️','Ingresá tu nombre'); return; }
  if(name)  safeLS('set','velo_user_name', name);
  if(motto) safeLS('set','velo_user_motto', motto);
  if(_selectedAv) safeLS('set','velo_user_av', _selectedAv);
  // Handle @username change
  var unameInput = document.getElementById('editUsername');
  var newUname = unameInput ? unameInput.value.toLowerCase().replace(/[^a-z0-9.\-_]/g,'').trim() : '';
  var curUname = safeLS('get','velo_username') || '';
  // Sync to Supabase so profile persists across devices
  _initSupabase();
  var uid = safeLS('get','velo_user_id');
  if(sbClient && uid){
    // Handle username update if changed
    if(newUname && newUname !== curUname){
      if(newUname.length < 5 || newUname.length > 20){
        pToast('⚠️','El @usuario debe tener entre 5 y 20 caracteres'); return;
      }
      // Check uniqueness
      try{
        var _rU = await sbClient.from('profiles').select('id').eq('username', newUname).neq('id', uid).limit(1);
        if(_rU.data && _rU.data.length){ pToast('⚠️','Ese @usuario ya está tomado, elegí otro'); return; }
        var _rUpd = await sbClient.from('profiles').update({ username: newUname }).eq('id', uid);
        if(!_rUpd.error){ safeLS('set','velo_username', newUname); }
        else { console.error('[pSaveProfile username]', _rUpd.error); pToast('⚠️','Error al guardar @usuario'); return; }
      }catch(e){ console.error('[pSaveProfile username catch]', e); }
    }
    var _rawAv = safeLS('get','velo_user_av') || '';
    // Don't store huge base64 in the profiles text row — only store emoji/small values here
    // Large base64 avatars are stored via _syncAvatarToSb which handles them separately
    var av = _rawAv.length > 8000 ? '' : _rawAv;
    if(_rawAv.length > 8000) _syncAvatarToSb(_rawAv); // push large avatar to a separate column
    var email = safeLS('get','velo_user_email') || '';
    sbClient.from('profiles').upsert({
      id:uid, nombre:name, avatar:av, motto:motto, email:email,
      status_music:  safeLS('get','velo_status_music')||'',
      status_book:   safeLS('get','velo_status_book')||'',
      status_phrase: safeLS('get','velo_status_phrase')||'',
      status_film:   safeLS('get','velo_status_film')||''
    },{ onConflict:'id' })
    .then(function(r){
      if(r && r.error){
        console.error('[pSaveProfile] Supabase error:', r.error);
        pToast('⚠️','Perfil guardado localmente (error al sincronizar)');
      } else {
        pToast('✅','Perfil actualizado 💚');
      }
    })
    .catch(function(e){
      console.error('[pSaveProfile] catch:', e);
      pToast('⚠️','Perfil guardado localmente (sin conexión).');
    });
  }
  closeModal('editProfileOv');
  pLoadProfile();
  _updateSidebarUser();
}

// ── @USERNAME PICKER ──────────────────────────────────────────────
var _usernameCheckTimer = null;
function pCheckUsername(val){
  var statusEl = document.getElementById('pickUsernameStatus');
  var btn = document.getElementById('pickUsernameBtn');
  if(btn) btn.disabled = true;
  // Auto-sanitize: lowercase, only allowed chars
  val = val.toLowerCase().replace(/[^a-z0-9.\-_]/g,'');
  var inputEl = document.getElementById('pickUsernameInput');
  if(inputEl && inputEl.value !== val) inputEl.value = val;
  if(!val || val.length < 5){
    if(statusEl) statusEl.innerHTML = val.length > 0 ? '<span style="color:#E05C5C">Mínimo 5 caracteres</span>' : '';
    return;
  }
  if(val.length > 20){
    if(statusEl) statusEl.innerHTML = '<span style="color:#E05C5C">Máximo 20 caracteres</span>';
    return;
  }
  if(statusEl) statusEl.innerHTML = '<span style="color:var(--ink4)">Verificando…</span>';
  clearTimeout(_usernameCheckTimer);
  _usernameCheckTimer = setTimeout(async function(){
    _initSupabase();
    if(!sbClient){ if(btn) btn.disabled = false; return; }
    try{
      var r = await sbClient.from('profiles').select('id').eq('username', val).limit(1);
      var taken = r.data && r.data.length > 0;
      if(statusEl) statusEl.innerHTML = taken
        ? '<span style="color:#E05C5C">❌ Ya está tomado, elegí otro</span>'
        : '<span style="color:var(--sage2)">✓ Disponible</span>';
      if(btn){ btn.disabled = taken; btn.style.opacity = taken ? '.5' : '1'; }
    }catch(e){ if(btn){ btn.disabled = false; btn.style.opacity='1'; } }
  }, 500);
}

async function pSaveUsername(){
  var inputEl = document.getElementById('pickUsernameInput');
  if(!inputEl) return;
  var val = inputEl.value.toLowerCase().replace(/[^a-z0-9.\-_]/g,'').trim();
  if(!val || val.length < 5 || val.length > 20){
    pToast('⚠️','El @usuario debe tener entre 5 y 20 caracteres'); return;
  }
  _initSupabase();
  var uid = safeLS('get','velo_user_id');
  if(sbClient && uid){
    try{
      // Final uniqueness check
      var rChk = await sbClient.from('profiles').select('id').eq('username', val).neq('id', uid).limit(1);
      if(rChk.data && rChk.data.length){ pToast('⚠️','Ese @usuario ya está tomado'); return; }
      var rSave = await sbClient.from('profiles').update({ username: val }).eq('id', uid);
      if(rSave.error){ console.error('[pSaveUsername]', rSave.error); pToast('⚠️','Error al guardar. Intentá de nuevo.'); return; }
    }catch(e){ console.error('[pSaveUsername catch]', e); pToast('⚠️','Error de conexión'); return; }
  }
  safeLS('set','velo_username', val);
  safeLS('set','velo_onboarding_done','1');
  pToast('✨','@'+val+' guardado 🎉');
  // Navigate: if came from registration flow → verify-email, else home
  var fromReg = safeLS('get','velo_pick_username_from_reg');
  if(fromReg === '1'){
    safeLS('set','velo_pick_username_from_reg','');
    var veEl = document.getElementById('verifyEmailAddr');
    var em = safeLS('get','velo_user_email') || '';
    if(veEl) veEl.textContent = em;
    pGoTo('verify-email');
  } else {
    pGoTo('home');
    setTimeout(function(){
      _loadHomeData();
      _updateSidebarUser();
    }, 100);
  }
}

// Variant for edit profile modal (uses editUsernameStatus element)
var _editUsernameCheckTimer = null;
function pCheckEditUsername(val){
  var statusEl = document.getElementById('editUsernameStatus');
  val = val.toLowerCase().replace(/[^a-z0-9.\-_]/g,'');
  var inputEl = document.getElementById('editUsername');
  if(inputEl && inputEl.value !== val) inputEl.value = val;
  if(!val){ if(statusEl) statusEl.innerHTML = ''; return; }
  if(val.length < 5){ if(statusEl) statusEl.innerHTML = '<span style="color:#E05C5C">Mínimo 5 caracteres</span>'; return; }
  if(val.length > 20){ if(statusEl) statusEl.innerHTML = '<span style="color:#E05C5C">Máximo 20 caracteres</span>'; return; }
  if(statusEl) statusEl.innerHTML = '<span style="color:var(--ink4)">Verificando…</span>';
  clearTimeout(_editUsernameCheckTimer);
  _editUsernameCheckTimer = setTimeout(async function(){
    _initSupabase(); if(!sbClient) return;
    var uid = safeLS('get','velo_user_id');
    try{
      var r = await sbClient.from('profiles').select('id').eq('username', val)
        .neq('id', uid||'').limit(1);
      var taken = r.data && r.data.length > 0;
      if(statusEl) statusEl.innerHTML = taken
        ? '<span style="color:#E05C5C">❌ Ya está tomado</span>'
        : '<span style="color:var(--sage2)">✓ Disponible</span>';
    }catch(e){}
  }, 500);
}

// Search users by @username
async function pSearchUsers(query){
  if(!query || query.length < 2) return [];
  _initSupabase();
  if(!sbClient) return [];
  try{
    var r = await sbClient.from('profiles')
      .select('id,nombre,avatar,username')
      .ilike('username', query+'%')
      .limit(10);
    return r.data || [];
  }catch(e){ return []; }
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
  var _delSet = []; try{ _delSet = JSON.parse(safeLS('get','velo_inbox_deleted')||'[]'); }catch(e){}
  msgs = msgs.filter(function(m){ return _delSet.indexOf(m.id) < 0; });
  var mockMsgs = [
    { id:'m1', tipo:'sistema', icon:'💚', remitente:'Equipo Velo', asunto:'¡Bienvenido/a!', extracto:'Gracias por unirte a Velo. Aquí encontrarás apoyo.', leido:false, fecha:'Ahora' },
    { id:'m2', tipo:'sistema', icon:'🌿', remitente:'Velo', asunto:'Consejo del día', extracto:'Recuerda: está bien no estar bien. El primer paso es reconocerlo.', leido:true, fecha:'Hoy' }
  ].filter(function(m){ return _delSet.indexOf(m.id) < 0; });
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
    var _del2 = []; try{ _del2 = JSON.parse(safeLS('get','velo_inbox_deleted')||'[]'); }catch(e){}
    newBcs = newBcs.filter(function(b){ return _del2.indexOf('bc_'+b.id) < 0; });
    var _delBtnStyle = 'flex-shrink:0;background:transparent;border:none;color:var(--ink5);font-size:18px;cursor:pointer;padding:2px 6px;border-radius:8px;line-height:1;align-self:flex-start;opacity:.55';
    var bcMsgs = newBcs.map(function(b){
      var readKey = 'velo_bcast_read_'+b.id;
      var fecha = b.sent_at ? new Date(b.sent_at).toLocaleDateString('es',{day:'2-digit',month:'short'}) : '';
      var senderInfo = null;
      try { senderInfo = JSON.parse(b.sender); } catch(e) {}
      var senderName     = senderInfo && senderInfo.n ? senderInfo.n : (b.sender||'');
      var senderId       = senderInfo && senderInfo.i ? senderInfo.i : '';
      var senderAv       = senderInfo && senderInfo.a ? senderInfo.a : (b.icon||'📢');
      var senderUsername = senderInfo && senderInfo.u ? senderInfo.u : '';
      var iconHtml = senderId
        ? '<div class="p-inbox-ic" style="cursor:pointer" onclick="event.stopPropagation();pQuickProfile('+_jsAttr(senderName)+','+_jsAttr(senderAv)+',\'\',\'\','+_jsAttr(senderId)+')">'+_avInline(senderAv,32)+'</div>'
        : '<div class="p-inbox-ic">'+_escHtml(b.icon||'📢')+'</div>';
      var senderRow = (senderId && senderName)
        ? '<div style="font-size:11px;color:var(--sage);font-weight:600;margin-bottom:2px;cursor:pointer" onclick="event.stopPropagation();pQuickProfile('+_jsAttr(senderName)+','+_jsAttr(senderAv)+',\'\',\'\','+_jsAttr(senderId)+')">'+_escHtml(senderName)+' ›</div>'
        : '';
      var isAlreadyRead = !!safeLS('get',readKey);
      var _xBtn = '<button onclick="event.stopPropagation();pDeleteInboxMsg(\'bc_'+b.id+'\',this)" style="'+_delBtnStyle+'">×</button>';
      // Monthly report special card
      if(b.body && b.body.indexOf('__MONTHLY_REPORT__')===0){
        var rpMonth = b.body.slice('__MONTHLY_REPORT__'.length);
        var rpMon = parseInt((rpMonth.split('-')[1]||'1'))-1;
        var rpMN = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
        var rpMName = rpMN[rpMon]||rpMonth;
        return '<div class="p-inbox-msg'+(isAlreadyRead?'':' unread')+'" data-mid="bc_'+b.id+'" style="cursor:pointer" onclick="pOpenMonthlyReport('+_jsAttr(rpMonth)+','+_jsAttr(readKey)+',this)">'
          +'<div style="display:flex;flex-shrink:0">'+(isAlreadyRead?'':'<div class="p-inbox-dot"></div>')+'</div>'
          +'<div class="p-inbox-ic" style="background:rgba(180,140,220,.14);font-size:18px">📊</div>'
          +'<div style="flex:1;min-width:0">'
          +'<div style="font-size:13px;font-weight:700;color:var(--ink);margin-bottom:2px">Tu resumen de '+rpMName+'</div>'
          +'<div style="font-size:11px;color:var(--ink4);line-height:1.45">Gemini preparó un resumen personalizado de tu mes: ánimos, diario y más.</div>'
          +'<div style="font-size:10px;color:var(--ink5);margin-top:4px">'+fecha+(isAlreadyRead?'':' · <span style="color:rgba(180,140,220,.85)">Ver mi resumen →</span>')+'</div>'
          +'</div>'+_xBtn+'</div>';
      }
      return '<div class="p-inbox-msg'+(isAlreadyRead?'':' unread')+'" data-mid="bc_'+b.id+'" style="cursor:pointer" onclick="pOpenBroadcastMsg('+_jsAttr(readKey)+','+_jsAttr(b.subject||'')+','+_jsAttr(b.body||'')+','+_jsAttr(senderName||'')+','+_jsAttr(fecha||'')+',this,'+_jsAttr(senderId||'')+','+_jsAttr(senderAv||'')+','+_jsAttr(senderUsername||'')+')">'
        +'<div style="display:flex;flex-shrink:0">'+(isAlreadyRead?'':'<div class="p-inbox-dot"></div>')+'</div>'
        +iconHtml
        +'<div style="flex:1;min-width:0">'
        +senderRow
        +'<div style="font-size:13px;font-weight:700;color:var(--ink);margin-bottom:2px">'+_escHtml(b.subject)+'</div>'
        +'<div style="font-size:11px;color:var(--ink4);line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">'+_escHtml(b.body||'')+'</div>'
        +'<div style="font-size:10px;color:var(--ink5);margin-top:4px">'+fecha+(isAlreadyRead?'':' · <span style="color:var(--sage)">Toca para leer →</span>')+'</div>'
        +'</div>'+_xBtn+'</div>';
    }).join('');
    // Prepend broadcasts before existing inbox items, after contact banner
    var banner = el2.querySelector('div[onclick*="contact"]');
    if(banner){ banner.insertAdjacentHTML('afterend', bcMsgs); }
    else { el2.innerHTML = bcMsgs + el2.innerHTML; }
    _updateInboxDot();
  });
  // Load admin replies from Supabase async and inject them
  var userEmail = safeLS('get','velo_user_email');
  if(userEmail){
    sbLoadRepliedContacts(userEmail).then(function(replies){
      if(!replies || !replies.length) return;
      var el3 = document.getElementById('inboxList');
      if(!el3) return;
      var existingIds = [];
      try{ existingIds = JSON.parse(safeLS('get','velo_inbox_reply_ids')||'[]'); }catch(e){}
      var _del3 = []; try{ _del3 = JSON.parse(safeLS('get','velo_inbox_deleted')||'[]'); }catch(e){}
      replies = replies.filter(function(r){ return _del3.indexOf('rp_'+r.id) < 0; });
      var _xBtnRp = function(id){ return '<button onclick="event.stopPropagation();pDeleteInboxMsg(\'rp_'+id+'\',this)" style="flex-shrink:0;background:transparent;border:none;color:var(--ink5);font-size:18px;cursor:pointer;padding:2px 6px;border-radius:8px;line-height:1;align-self:flex-start;opacity:.55">×</button>'; };
      var replyMsgs = replies.map(function(r){
        var readKey = 'velo_reply_read_'+r.id;
        var isRead = !!safeLS('get', readKey);
        var fecha = r.reply_at ? new Date(r.reply_at).toLocaleDateString('es',{day:'2-digit',month:'short'}) : '';
        var allowR = !!r.allow_reply;
        return '<div class="p-inbox-msg'+(isRead?'':' unread')+'" data-mid="rp_'+r.id+'" style="cursor:pointer" onclick="pOpenInboxAdminReply('+_jsAttr(r.id)+','+_jsAttr(r.topic||'Consulta')+','+_jsAttr(r.mensaje||'')+','+_jsAttr(r.reply||'')+','+allowR+','+_jsAttr(fecha)+',this)">'
          +'<div style="display:flex;flex-shrink:0">'+(isRead?'':'<div class="p-inbox-dot"></div>')+'</div>'
          +'<div class="p-inbox-ic" style="background:rgba(200,165,100,.12)">💌</div>'
          +'<div style="flex:1;min-width:0">'
          +'<div style="font-size:13px;font-weight:700;color:var(--ink);margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Re: '+_escHtml(r.topic||'Consulta')+'</div>'
          +'<div style="font-size:11px;color:var(--ink4);line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">'+_escHtml((r.reply||'').slice(0,120))+'</div>'
          +'<div style="font-size:10px;color:var(--ink5);margin-top:4px">'+fecha+' · Equipo Velo</div>'
          +(isRead?'':'<div style="font-size:10px;color:#C8A560;margin-top:4px">Toca para leer →</div>')
          +'</div>'+_xBtnRp(r.id)+'</div>';
      }).join('');
      if(replyMsgs){
        var firstItem = el3.querySelector('.p-inbox-msg');
        if(firstItem) firstItem.insertAdjacentHTML('beforebegin', replyMsgs);
        else el3.innerHTML = replyMsgs + el3.innerHTML;
        _updateInboxDot();
      }
    });
  }

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
      actionBtn = '<button onclick="event.stopPropagation();(function(){var ms=[];try{ms=JSON.parse(safeLS(\'get\',\'velo_inbox\')||\'[]\');}catch(e){}safeLS(\'set\',\'velo_inbox\',JSON.stringify(ms.map(function(x){return x.id===\''+m.id+'\'?Object.assign({},x,{leido:true}):x;})));})();safeLS(\'set\',\'velo_read_'+m.id+'\',\'1\');this.closest(\'.p-inbox-msg\').classList.remove(\'unread\');var d=this.closest(\'.p-inbox-msg\').querySelector(\'.p-inbox-dot\');if(d)d.remove();_updateHomeBell();'+m.accion+'" style="margin-top:6px;font-size:11px;padding:4px 10px;background:var(--sage7);border:1.5px solid var(--sage4);border-radius:100px;color:var(--sage);font-family:\'Jost\',sans-serif;font-weight:700;cursor:pointer">Completar encuesta →</button>';
    }
    var hasCuerpo = !!(m.cuerpo);
    var readKey = 'velo_read_'+m.id;
    var isRead = m.leido || !!safeLS('get', readKey);
    var markReadInline = '(function(el){var ms=[];try{ms=JSON.parse(safeLS(\'get\',\'velo_inbox\')||\'[]\');}catch(e){}safeLS(\'set\',\'velo_inbox\',JSON.stringify(ms.map(function(x){return x.id===\''+m.id+'\'?Object.assign({},x,{leido:true}):x;})));safeLS(\'set\',\'velo_read_'+m.id+'\',\'1\');el.classList.remove(\'unread\');var d=el.querySelector(\'.p-inbox-dot\');if(d)d.remove();_updateHomeBell();})(this)';
    var _xBtnL = '<button onclick="event.stopPropagation();pDeleteInboxMsg(\''+m.id+'\',this)" style="flex-shrink:0;background:transparent;border:none;color:var(--ink5);font-size:18px;cursor:pointer;padding:2px 6px;border-radius:8px;line-height:1;align-self:flex-start;opacity:.55">×</button>';
    return '<div class="p-inbox-msg'+(isRead?'':' unread')+'" data-mid="'+m.id+'" style="cursor:pointer"'
      +' onclick="'+(hasCuerpo ? 'pOpenInboxMsg(\''+m.id+'\',this)' : markReadInline)+'">'
      +'<div style="display:flex;flex-shrink:0">'+(isRead?'':'<div class="p-inbox-dot"></div>')+'</div>'
      +'<div class="p-inbox-ic" style="background:'+(m.tipo==='encuesta'?'rgba(116,198,157,.12)':'var(--sage7)')+'">'+m.icon+'</div>'
      +'<div style="flex:1;min-width:0">'
      +'<div style="font-size:13px;font-weight:700;color:var(--ink);margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+m.asunto+'</div>'
      +'<div style="font-size:11px;color:var(--ink4);line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">'+m.extracto+'</div>'
      +'<div style="font-size:10px;color:var(--ink5);margin-top:4px">'+m.fecha+(hasCuerpo&&!isRead?' · <span style="color:var(--sage)">Toca para leer →</span>':'')+'</div>'
      +actionBtn
      +'</div>'+_xBtnL+'</div>';
  }).join('');
  // Auto-mark all non-cuerpo messages as read after 3s (clears badge after viewing inbox)
  setTimeout(function(){
    try{
      var inbx2 = JSON.parse(safeLS('get','velo_inbox')||'[]');
      var dirty = false;
      inbx2 = inbx2.map(function(m){
        if(!m.leido && !(m.cuerpo && m.cuerpo.trim())){ dirty=true; return Object.assign({},m,{leido:true}); }
        return m;
      });
      if(dirty){ safeLS('set','velo_inbox', JSON.stringify(inbx2)); _updateHomeBell(); }
    }catch(e){}
  }, 3000);
}

function pDeleteInboxMsg(id, el){
  var del = []; try{ del = JSON.parse(safeLS('get','velo_inbox_deleted')||'[]'); }catch(e){}
  if(del.indexOf(id) < 0){ del.push(id); safeLS('set','velo_inbox_deleted', JSON.stringify(del)); }
  var inbox = []; try{ inbox = JSON.parse(safeLS('get','velo_inbox')||'[]'); }catch(e){}
  var newInbox = inbox.filter(function(m){ return m.id !== id; });
  if(newInbox.length !== inbox.length){ safeLS('set','velo_inbox', JSON.stringify(newInbox)); }
  if(el){ var card = el.closest('.p-inbox-msg'); if(card) card.remove(); }
  _updateHomeBell();
}

function pInboxVaciar(){
  if(!confirm('¿Vaciar el buzón? Se eliminarán todos los mensajes visibles.')) return;
  var el = document.getElementById('inboxList');
  if(!el) return;
  var del = []; try{ del = JSON.parse(safeLS('get','velo_inbox_deleted')||'[]'); }catch(e){}
  el.querySelectorAll('.p-inbox-msg[data-mid]').forEach(function(c){
    var id = c.getAttribute('data-mid'); if(id && del.indexOf(id) < 0) del.push(id);
  });
  safeLS('set','velo_inbox_deleted', JSON.stringify(del));
  safeLS('set','velo_inbox', JSON.stringify([]));
  pRenderInbox();
}

function pOpenBroadcastMsg(readKey, subject, body, senderName, fecha, rowEl, senderId, senderAv, senderUsername){
  safeLS('set', readKey, '1');
  if(rowEl){ rowEl.classList.remove('unread'); var dot = rowEl.querySelector('.p-inbox-dot'); if(dot) dot.remove(); }
  _updateHomeBell();
  var existing = document.getElementById('inboxBcOv');
  if(existing) existing.remove();

  var isIdentified = !!(senderId && senderName && senderName !== 'Velo — Al Mar' && senderName.indexOf('Velo') !== 0);
  var uname = senderUsername ? '@'+senderUsername : (isIdentified ? '@'+(senderName||'').toLowerCase().replace(/\s+/g,'_').slice(0,16) : '');
  var isFav = isIdentified && pGetFavs().some(function(f){ return f.id === senderId; });

  var senderCard = isIdentified
    ? '<div style="display:flex;align-items:center;gap:12px;background:var(--cream2);border:1.5px solid var(--border2);border-radius:16px;padding:12px 14px;margin-bottom:16px">'
      +'<div style="position:relative;flex-shrink:0;cursor:pointer" onclick="pQuickProfile('+_jsAttr(senderName)+','+_jsAttr(senderAv||'🧑')+',\'\',\'\','+_jsAttr(senderId)+')">'
      +_avInline(senderAv||'🧑', 48)
      +'</div>'
      +'<div style="flex:1;min-width:0">'
      +'<div style="font-size:14px;font-weight:700;color:var(--ink);cursor:pointer;margin-bottom:2px" onclick="pQuickProfile('+_jsAttr(senderName)+','+_jsAttr(senderAv||'🧑')+',\'\',\'\','+_jsAttr(senderId)+')">'+_escHtml(senderName)+'</div>'
      +(uname ? '<div style="font-size:11px;color:var(--sage3);font-weight:600">'+_escHtml(uname)+'</div>' : '')
      +'<div style="font-size:10px;color:var(--ink5);margin-top:2px">'+_escHtml(fecha||'')+'</div>'
      +'</div>'
      +'<div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">'
      +'<button onclick="pQuickProfile('+_jsAttr(senderName)+','+_jsAttr(senderAv||'🧑')+',\'\',\'\','+_jsAttr(senderId)+')" style="padding:5px 10px;background:var(--sage7);border:1.5px solid var(--sage4);border-radius:100px;font-size:11px;font-weight:700;color:var(--sage);cursor:pointer;font-family:\'Jost\',sans-serif;white-space:nowrap">Ver perfil</button>'
      +'<button id="bcFavBtn" onclick="'+(isFav?'pRemoveFav(\''+_escHtml(senderId)+'\')':'pAddFav('+_jsAttr(senderId)+','+_jsAttr(senderName)+','+_jsAttr(senderAv||'🧑')+')')+';this.textContent=\''+(isFav?'☆ Favorito':'⭐ Guardado')+'\';pToast(\''+(isFav?'☆':'⭐')+'\',\''+(isFav?'Quitado de favoritos':'¡Guardado como favorito!')+'\')" style="padding:5px 10px;background:rgba(255,200,50,'+(isFav?'.18':'.08')+');border:1.5px solid rgba(255,200,50,'+(isFav?'.45':'.25')+');border-radius:100px;font-size:11px;font-weight:700;color:'+(isFav?'#c8a040':'var(--ink4)')+';cursor:pointer;font-family:\'Jost\',sans-serif;white-space:nowrap">'+(isFav?'⭐ Guardado':'☆ Favorito')+'</button>'
      +'</div></div>'
    : '<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">'
      +'<div style="font-size:30px;width:46px;height:46px;border-radius:14px;background:var(--sage7);display:flex;align-items:center;justify-content:center;flex-shrink:0">🌊</div>'
      +'<div><div style="font-size:12px;font-weight:700;color:var(--sage)">Alguien de la comunidad</div>'
      +'<div style="font-size:11px;color:var(--ink5)">'+_escHtml(fecha||'')+'</div></div>'
      +'</div>';

  var replyBtn = isIdentified
    ? '<button class="p-btn p-btn--primary p-btn--md p-btn--full" style="margin-bottom:8px" onclick="document.getElementById(\'inboxBcOv\').remove();pLeaveOfflineMsg('+_jsAttr(senderId)+','+_jsAttr(senderName)+','+_jsAttr(senderAv||'🧑')+')">💌 Responder</button>'
    : '';

  var ov = document.createElement('div');
  ov.className = 'p-modal-ov show';
  ov.id = 'inboxBcOv';
  ov.innerHTML = '<div class="p-sheet" style="max-height:88vh;overflow-y:auto">'
    +'<div class="p-sheet-handle"></div>'
    +senderCard
    +'<h2 style="font-family:\'Cormorant Garamond\',serif;font-size:20px;color:var(--ink);margin-bottom:14px;line-height:1.3">'+_escHtml(subject)+'</h2>'
    +(body ? '<div style="font-size:14px;color:var(--ink3);line-height:1.85;white-space:pre-line;background:var(--cream2);border-radius:12px;padding:16px;margin-bottom:20px">'+_escHtml(body)+'</div>' : '')
    +replyBtn
    +'<button class="p-btn p-btn--secondary p-btn--md p-btn--full" onclick="document.getElementById(\'inboxBcOv\').remove()">Cerrar</button>'
    +'</div>';
  document.body.appendChild(ov);
  ov.addEventListener('click', function(e){ if(e.target===ov) ov.remove(); });
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

function pOpenInboxAdminReply(contactId, topic, originalMsg, replyText, allowReply, fecha, rowEl){
  safeLS('set','velo_reply_read_'+contactId,'1');
  if(rowEl){ rowEl.classList.remove('unread'); var dot = rowEl.querySelector('.p-inbox-dot'); if(dot) dot.remove(); }
  _updateHomeBell();
  var existing = document.getElementById('inboxAdminReplyOv');
  if(existing) existing.remove();
  var ov = document.createElement('div');
  ov.className = 'p-modal-ov show';
  ov.id = 'inboxAdminReplyOv';
  ov.innerHTML = '<div class="p-sheet" style="max-height:88vh;overflow-y:auto">'
    +'<div class="p-sheet-handle"></div>'
    +'<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">'
    +'<div style="font-size:30px;width:46px;height:46px;border-radius:14px;background:rgba(200,165,100,.12);display:flex;align-items:center;justify-content:center;flex-shrink:0">💌</div>'
    +'<div><div style="font-size:12px;font-weight:700;color:#C8A560">Equipo Velo</div>'
    +'<div style="font-size:11px;color:var(--ink5)">'+_escHtml(fecha||'')+'</div></div>'
    +'</div>'
    +'<h2 style="font-family:\'Cormorant Garamond\',serif;font-size:21px;color:var(--ink);margin-bottom:16px;line-height:1.3">Re: '+_escHtml(topic||'')+'</h2>'
    +'<div style="font-size:14px;color:var(--ink3);line-height:1.85;white-space:pre-line;background:var(--cream2);border-radius:12px;padding:16px;margin-bottom:16px">'+_escHtml(replyText||'')+'</div>'
    +(originalMsg ? '<details style="margin-bottom:20px"><summary style="font-size:11px;color:var(--ink5);cursor:pointer">Ver mensaje original</summary><div style="font-size:12px;color:var(--ink4);line-height:1.7;white-space:pre-line;margin-top:8px;padding:10px;background:var(--cream2);border-radius:10px">'+_escHtml(originalMsg)+'</div></details>' : '')
    +(allowReply ? '<button class="p-btn p-btn--primary p-btn--lg p-btn--full" style="margin-bottom:8px" onclick="document.getElementById(\'inboxAdminReplyOv\').remove();pReplyToAdmin('+_jsAttr(topic||'')+')">💬 Responder</button>' : '')
    +'<button class="p-btn p-btn--secondary p-btn--md p-btn--full" onclick="document.getElementById(\'inboxAdminReplyOv\').remove()">Cerrar</button>'
    +'</div>';
  document.body.appendChild(ov);
  ov.addEventListener('click', function(e){ if(e.target===ov) ov.remove(); });
}

function pReplyToAdmin(originalTopic){
  var ov = document.createElement('div');
  ov.className = 'p-modal-ov show';
  ov.id = 'replyToAdminOv';
  ov.innerHTML = '<div class="p-sheet">'
    +'<div class="p-sheet-handle"></div>'
    +'<div style="font-family:\'Cormorant Garamond\',serif;font-size:20px;color:var(--ink);margin-bottom:4px">Responder a Velo</div>'
    +'<p style="font-size:12px;color:var(--ink4);margin-bottom:14px">Tu respuesta llegará al equipo. Asunto: <strong>Re: '+_escHtml(originalTopic)+'</strong></p>'
    +'<textarea class="p-textarea" id="replyToAdminTa" rows="4" placeholder="Escribí tu respuesta..."></textarea>'
    +'<div style="height:12px"></div>'
    +'<button class="p-btn p-btn--primary p-btn--lg p-btn--full" onclick="pSendReplyToAdmin(\''+_escHtml(originalTopic).replace(/'/g,"\\'")+'\')">Enviar 💌</button>'
    +'<div style="height:8px"></div>'
    +'<button class="p-btn p-btn--secondary p-btn--md p-btn--full" onclick="document.getElementById(\'replyToAdminOv\').remove()">Cancelar</button>'
    +'</div>';
  document.body.appendChild(ov);
  ov.addEventListener('click', function(e){ if(e.target===ov) ov.remove(); });
}

async function pSendReplyToAdmin(originalTopic){
  var ta = document.getElementById('replyToAdminTa');
  if(!ta || !ta.value.trim()){ pToast('✍️','Escribí tu respuesta antes de enviar'); return; }
  var texto = ta.value.trim();
  var email = safeLS('get','velo_user_email') || '';
  var name  = safeLS('get','velo_user_name') || '';
  var topic = 'Re: ' + (originalTopic || 'Consulta');
  var btn = document.querySelector('#replyToAdminOv .p-btn--primary');
  if(btn){ btn.disabled = true; btn.textContent = 'Enviando...'; }
  try{
    var ok = await sbSaveContact(topic, texto, email);
    if(ok || !email){
      var existing = document.getElementById('replyToAdminOv');
      if(existing) existing.remove();
      pToast('💌','Respuesta enviada al equipo Velo');
    } else {
      pToast('⚠️','Error al enviar. Intentá de nuevo.');
    }
  } catch(e){ pToast('⚠️','Error de conexión'); }
  finally{ if(btn){ btn.disabled=false; btn.textContent='Enviar 💌'; } }
}

async function pQuickProfile(name, av, bio, guardianId, userId){
  var isAnon = !name || name === 'Usuario Anónimo' || name === 'Anónimo';
  var uid = userId || (guardianId ? guardianId.replace('live_','') : '');

  // Show the sheet immediately with a loading state, then enrich
  var existing = document.getElementById('quickProfileOv');
  if(existing) existing.remove();
  var ov = document.createElement('div');
  ov.className = 'p-modal-ov show';
  ov.id = 'quickProfileOv';
  ov.innerHTML = '<div class="p-sheet" style="max-height:88vh;overflow-y:auto">'
    +'<div class="p-sheet-handle"></div>'
    +'<div id="qpBody" style="text-align:center;padding:30px 0;color:var(--ink5);font-size:13px">Cargando perfil…</div>'
    +'</div>';
  document.body.appendChild(ov);
  ov.addEventListener('click', function(e){ if(e.target===ov) ov.remove(); });

  // Fetch full profile + reviews
  var prof = null, reviews = [];
  if(uid && !isAnon){
    _initSupabase();
    if(sbClient){
      try{
        var pr = await sbClient.from('profiles').select('*').eq('id', uid).limit(1);
        if(pr.data && pr.data.length) prof = pr.data[0];
      }catch(e){}
      reviews = await _loadUserReviews(uid);
    }
  }
  var body = document.getElementById('qpBody');
  if(!body) return; // sheet was closed

  var dispName = isAnon ? 'Usuario Anónimo' : ((prof && prof.nombre) || name || 'Usuario');
  var dispAv   = isAnon ? '👤' : ((prof && prof.avatar) || av || '🧑');
  var motto    = (!isAnon && prof && prof.motto) ? prof.motto : (isAnon ? '' : (bio||''));
  var isFav    = uid ? pIsFav(uid) : false;
  var presence = (uid && !isAnon) ? _presenceInfo(uid) : null;

  var likeRows = (prof && !isAnon) ? [
    prof.status_music  ? '🎵 '+_escHtml(prof.status_music)  : '',
    prof.status_film   ? '🎬 '+_escHtml(prof.status_film)   : '',
    prof.status_book   ? '📖 '+_escHtml(prof.status_book)   : '',
    prof.status_phrase ? '💬 '+_escHtml(prof.status_phrase) : ''
  ].filter(Boolean) : [];
  var likes = likeRows.length
    ? '<div style="text-align:left;background:var(--cream2);border-radius:12px;padding:10px 14px;margin-bottom:12px">'
      +'<div style="font-size:10px;font-weight:700;color:var(--ink5);text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px">Le gusta</div>'
      + likeRows.map(function(r){ return '<div style="font-size:12.5px;color:var(--ink3);padding:3px 0">'+r+'</div>'; }).join('')
      +'</div>'
    : '';
  var helped   = (prof && prof.helped_count)   ? prof.helped_count   : 0;
  var received = (prof && prof.received_count) ? prof.received_count : 0;
  var counters = (!isAnon && prof)
    ? '<div style="display:flex;justify-content:center;gap:24px;margin-bottom:14px">'
      +'<div style="text-align:center"><div style="font-size:19px;font-weight:800;color:var(--sage)">'+helped+'</div><div style="font-size:10px;color:var(--ink5)">Acompañó</div></div>'
      +'<div style="text-align:center"><div style="font-size:19px;font-weight:800;color:var(--sage)">'+received+'</div><div style="font-size:10px;color:var(--ink5)">Recibió apoyo</div></div>'
      +'<div style="text-align:center"><div style="font-size:19px;font-weight:800;color:var(--sage)">'+reviews.length+'</div><div style="font-size:10px;color:var(--ink5)">Reseñas</div></div>'
      +'</div>'
    : '';
  var _qpMyId = _myUserId();
  var revHtml = reviews.length
    ? '<div style="text-align:left;margin-bottom:12px">'
      +'<div style="font-size:10px;font-weight:700;color:var(--ink5);text-transform:uppercase;letter-spacing:.5px;margin-bottom:7px">Reseñas recibidas</div>'
      + _renderReviewsList(reviews, _qpMyId, userId||'')
      +'</div>'
    : '';

  body.style.cssText = '';
  body.innerHTML = '<div style="text-align:center;padding:6px 0 14px">'
    +'<div style="position:relative;display:inline-block;margin-bottom:8px">'
    +'<div style="font-size:60px;display:flex;justify-content:center">'+_avInline(dispAv,68)+'</div>'
    +(presence ? '<span style="position:absolute;bottom:3px;right:3px;width:15px;height:15px;border-radius:50%;background:'+presence.color+';border:2.5px solid var(--cream)"></span>' : '')
    +'</div>'
    +'<div style="font-family:\'Cormorant Garamond\',serif;font-size:22px;color:var(--ink);margin-bottom:3px">'+_escHtml(dispName)+'</div>'
    +(presence ? '<div style="font-size:11px;color:'+(presence.on?presence.color:'var(--ink5)')+';margin-bottom:6px">● '+presence.label+'</div>' : '')
    +(motto ? '<p style="font-size:13px;color:var(--ink3);line-height:1.6;font-style:italic;margin:6px 0 12px">"'+_escHtml(motto)+'"</p>' : '')
    +'</div>'
    + counters + likes + revHtml
    +(guardianId&&!isAnon ? '<button class="p-btn p-btn--primary p-btn--lg p-btn--full" onclick="document.getElementById(\'quickProfileOv\').remove();pOpenGuardian('+_jsAttr(guardianId)+')">Solicitar acompañamiento 💚</button><div style="height:8px"></div>' : '')
    +(!isAnon && uid && uid !== _qpMyId ? '<button id="qpFavBtn" class="p-btn p-btn--'+(isFav?'primary':'secondary')+' p-btn--md p-btn--full" onclick="pToggleFavFromProfile('+_jsAttr(uid)+','+_jsAttr(dispName)+','+_jsAttr(dispAv)+')">'+(isFav?'⭐ En tus favoritos':'☆ Agregar a favoritos')+'</button><div style="height:8px"></div>' : '')
    +(!isAnon && uid ? '<button class="p-btn p-btn--secondary p-btn--sm p-btn--full" onclick="pOpenDM('+_jsAttr(uid)+','+_jsAttr(dispName)+','+_jsAttr(dispAv)+');document.getElementById(\'quickProfileOv\').remove()">💬 Enviar mensaje</button><div style="height:8px"></div>' : '')
    +'<button class="p-btn p-btn--secondary p-btn--md p-btn--full" onclick="document.getElementById(\'quickProfileOv\').remove()">Cerrar</button>';
}

// ── FAVOURITES SYSTEM ─────────────────────────────────────────

function pGetFavs(){
  if(_favsList === null){
    try{ _favsList = JSON.parse(safeLS('get','velo_favs')||'[]'); }catch(e){ _favsList = []; }
  }
  return _favsList;
}

async function _syncFavsFromSupabase(){
  var myId = safeLS('get','velo_user_id')||'';
  if(!myId || !sbClient) return;
  try{
    var {data} = await sbClient.from('user_favorites').select('*').eq('user_id', myId).order('created_at',{ascending:false}).limit(100);
    if(!data || !data.length) return;
    var local = pGetFavs();
    var localIds = local.map(function(f){ return f.id; });
    // Add remote favs not yet in local
    data.forEach(function(r){
      if(localIds.indexOf(r.fav_id) < 0){
        local.push({ id:r.fav_id, name:r.fav_name||'Usuario', av:r.fav_av||'🧑', ts:new Date(r.created_at).getTime() });
      }
    });
    _favsList = local;
    safeLS('set','velo_favs', JSON.stringify(local.slice(0,100)));
    _updateFavBadge();
  }catch(e){}
}

function pIsFav(userId){
  return pGetFavs().some(function(f){ return f.id === userId; });
}

function pAddFav(userId, name, av){
  if(!userId || pIsFav(userId)) return;
  var favs = pGetFavs();
  favs.unshift({ id:userId, name:name||'Usuario', av:av||'🧑', ts:Date.now() });
  _favsList = favs;
  safeLS('set','velo_favs', JSON.stringify(favs.slice(0,100)));
  // Persist to Supabase
  _initSupabase();
  if(sbClient){
    var myId = safeLS('get','velo_user_id')||'';
    if(myId) sbClient.from('user_favorites').upsert(
      { user_id:myId, fav_id:userId, fav_name:name||'', fav_av:av||'' },
      { onConflict:'user_id,fav_id' }
    ).then(function(){}).catch(function(){});
  }
  pToast('⭐',_escHtml(name||'Usuario')+' guardado en favoritos');
  _updateFavBadge();
}

function pRemoveFav(userId){
  var favs = pGetFavs().filter(function(f){ return f.id !== userId; });
  _favsList = favs;
  safeLS('set','velo_favs', JSON.stringify(favs));
  _initSupabase();
  if(sbClient){
    var myId = safeLS('get','velo_user_id')||'';
    if(myId) sbClient.from('user_favorites').delete().eq('user_id',myId).eq('fav_id',userId).then(function(){}).catch(function(){});
  }
  pToast('✓','Eliminado de favoritos');
  _updateFavBadge();
}

function pToggleGuardianFav(){
  if(!_curGuardian) return;
  var uid = (_curGuardian.id||'').replace('live_','');
  var name = _curGuardian.name||'Guardián';
  var av = _curGuardian.av||'🌿';
  if(pIsFav(uid)){ pRemoveFav(uid); } else { pAddFav(uid, name, av); }
  var btn = document.getElementById('gdFavBtn');
  if(btn){ btn.textContent = pIsFav(uid) ? '⭐' : '☆'; btn.style.background = pIsFav(uid) ? 'rgba(255,200,50,.25)' : 'rgba(255,200,50,.15)'; }
}

function pToggleFavFromProfile(userId, name, av){
  if(pIsFav(userId)){ pRemoveFav(userId); } else { pAddFav(userId, name, av); }
  // Update the button in the currently open profile sheet
  var btn = document.getElementById('qpFavBtn');
  if(btn){
    var nowFav = pIsFav(userId);
    btn.className = 'p-btn p-btn--'+(nowFav?'primary':'secondary')+' p-btn--md p-btn--full';
    btn.textContent = nowFav ? '⭐ En tus favoritos' : '☆ ¿Marcar como favorito? Activá la estrella';
  }
}

function pBlockUser(userId, name, av){
  if(!confirm('¿Bloquear a '+(name||'este usuario')+'? Sus publicaciones dejarán de aparecer.')) return;
  var blocked = []; try{ blocked = JSON.parse(safeLS('get','velo_blocked')||'[]'); }catch(e){}
  if(blocked.indexOf(userId)<0){ blocked.push(userId); safeLS('set','velo_blocked', JSON.stringify(blocked)); }
  var bd = []; try{ bd = JSON.parse(safeLS('get','velo_blocked_data')||'[]'); }catch(e){}
  if(!bd.find(function(b){ return b.id===userId; })){
    bd.push({id:userId, name:name||'Usuario', av:av||'🧑'});
    safeLS('set','velo_blocked_data', JSON.stringify(bd));
  }
  // Sync to Supabase so the blocked user silently stops seeing us in their contacts
  var myId = _myUserId();
  if(sbClient && myId && myId !== 'guest'){
    sbClient.from('user_blocks').upsert({blocker_id:myId, blocked_id:userId}, {onConflict:'blocker_id,blocked_id'})
      .then(function(){}).catch(function(){});
  }
  pRemoveFav(userId);
  pToast('🚫','Usuario bloqueado');
}

function pUnblockUser(userId){
  var blocked = []; try{ blocked = JSON.parse(safeLS('get','velo_blocked')||'[]'); }catch(e){}
  blocked = blocked.filter(function(id){ return id !== userId; });
  safeLS('set','velo_blocked', JSON.stringify(blocked));
  var bd = []; try{ bd = JSON.parse(safeLS('get','velo_blocked_data')||'[]'); }catch(e){}
  bd = bd.filter(function(b){ return b.id !== userId; });
  safeLS('set','velo_blocked_data', JSON.stringify(bd));
  // Sync removal to Supabase so the unblocked user can see us again
  var myId = _myUserId();
  if(sbClient && myId && myId !== 'guest'){
    sbClient.from('user_blocks').delete().eq('blocker_id',myId).eq('blocked_id',userId)
      .then(function(){}).catch(function(){});
  }
  pToast('✅','Usuario desbloqueado');
  pRenderContacts();
}

function _isBlocked(userId){
  var blocked = []; try{ blocked = JSON.parse(safeLS('get','velo_blocked')||'[]'); }catch(e){}
  return blocked.indexOf(userId) >= 0;
}

function _updateFavBadge(){
  var total  = parseInt(safeLS('get','velo_fav_me_count')||'0', 10);
  var seen   = parseInt(safeLS('get','velo_fav_me_seen') ||'0', 10);
  var newN   = Math.max(0, total - seen);
  var badge  = document.getElementById('favCountBadge');
  if(badge){ badge.textContent = newN > 0 ? newN : ''; badge.style.display = newN > 0 ? 'inline' : 'none'; }
}

// ── CONTACTS PAGE ─────────────────────────────────────────────

function _contactCard(id, name, av, uname, pInfo, unread, opts){
  var canChat = pInfo.on && pInfo.label !== 'Ocupado/a';
  var sz = opts.small ? 38 : 44;
  return '<div data-fav-name="'+_escHtml(name||'')+'" data-fav-uname="'+_escHtml(uname||'')+'" style="display:flex;align-items:center;gap:10px;padding:'+(opts.small?'10px 12px':'12px')+';background:var(--cream);border-radius:'+(opts.small?'14':'16')+'px;margin-bottom:8px;'+(opts.small?'border:1.5px solid rgba(116,198,157,.18)':'box-shadow:var(--shadow-sm)')+'">'
    +'<div style="position:relative;flex-shrink:0;cursor:pointer" onclick="pQuickProfile('+_jsAttr(name||'Usuario')+','+_jsAttr(av||'🧑')+',\'\',\'\','+_jsAttr(id)+')">'
    +_avInline(av||'🧑', sz)
    +'<span style="position:absolute;bottom:0;right:0;width:'+(opts.small?'10':'11')+'px;height:'+(opts.small?'10':'11')+'px;border-radius:50%;background:'+pInfo.color+';border:2px solid var(--cream)"></span>'
    +'</div>'
    +'<div style="flex:1;min-width:0">'
    +'<div style="font-size:'+(opts.small?'13':'14')+'px;font-weight:700;color:var(--ink)">'+_escHtml(name||'Usuario')+'</div>'
    +(uname?'<div style="font-size:10px;color:var(--sage3);font-weight:600;margin-bottom:1px">'+_escHtml(uname)+'</div>':'')
    +'<div style="font-size:11px;color:'+(pInfo.on?pInfo.color:'var(--ink5)')+'">'+(pInfo.on?'● ':'○ ')+pInfo.label+'</div>'
    +'</div>'
    +'<div style="display:flex;gap:5px;flex-shrink:0">'
    +(canChat
      ?'<button onclick="pOpenDM('+_jsAttr(id)+','+_jsAttr(name)+','+_jsAttr(av)+')" style="padding:6px 11px;background:var(--sage7);border:1.5px solid var(--sage4);border-radius:10px;font-size:12px;font-weight:700;color:var(--sage);cursor:pointer">💬</button>'
      :'<button disabled style="padding:6px 10px;background:var(--cream2);border:1.5px solid var(--border2);border-radius:10px;font-size:12px;color:var(--ink5);cursor:not-allowed;opacity:.4">💬</button>')
    +(opts.showMail?'<button onclick="pLeaveOfflineMsg('+_jsAttr(id)+','+_jsAttr(name)+','+_jsAttr(av)+')" style="padding:6px 9px;background:rgba(200,165,100,.08);border:1px solid rgba(200,165,100,.25);border-radius:10px;font-size:12px;cursor:pointer" title="Buzón">✉️</button>':'')
    +(opts.showRemove?'<button onclick="pRemoveFav(\''+id+'\');pRenderContacts()" style="padding:6px 9px;background:rgba(255,200,50,.1);border:1px solid rgba(255,200,50,.3);border-radius:10px;font-size:12px;cursor:pointer">⭐</button>':'')
    +(opts.showBlock?'<button onclick="pBlockUser('+_jsAttr(id)+','+_jsAttr(name)+','+_jsAttr(av||'🧑')+');pRenderContacts()" style="padding:6px 9px;background:rgba(200,50,50,.06);border:1px solid rgba(200,50,50,.15);border-radius:10px;font-size:12px;cursor:pointer" title="Bloquear">🚫</button>':'')
    +(opts.showAddFav?'<button onclick="pAddFav('+_jsAttr(id)+','+_jsAttr(name)+','+_jsAttr(av||'🧑')+');pRenderContacts()" style="padding:6px 9px;background:rgba(116,198,157,.1);border:1px solid rgba(116,198,157,.3);border-radius:10px;font-size:12px;cursor:pointer" title="Agregar favorito">⭐</button>':'')
    +'</div></div>';
}

async function pRenderContacts(){
  var _tok = _navToken;
  var el = document.getElementById('contactsContent');
  if(!el) return;

  var favs = pGetFavs();
  var myId = safeLS('get','velo_user_id')||'';

  _initSupabase();
  var favMeRows = [];
  if(sbClient && myId){
    try{
      var fmRes = await sbClient.from('user_favorites').select('user_id,created_at').eq('fav_id', myId).order('created_at',{ascending:false}).limit(50);
      if(_navToken !== _tok) return;
      favMeRows = fmRes.data || [];
      safeLS('set','velo_fav_me_count', String(favMeRows.length));
      safeLS('set','velo_fav_me_seen',  String(favMeRows.length));
      _updateFavBadge();
    }catch(e){}
  }

  // Batch-fetch real usernames + names + avatars for all contacts
  var usernameMap = {};
  var profileMap  = {};  // id → {name, av}
  if(sbClient){
    var _allIds = favs.map(function(f){ return f.id; }).concat(favMeRows.map(function(r){ return r.user_id; })).filter(Boolean);
    var _uniqIds = _allIds.filter(function(id,i){ return _allIds.indexOf(id)===i; });
    if(_uniqIds.length){
      try{
        var profRes = await sbClient.from('profiles').select('id,username,nombre,avatar').in('id', _uniqIds);
        if(_navToken !== _tok) return;
        (profRes.data||[]).forEach(function(p){
          if(p.id && p.username){ usernameMap[p.id] = p.username; _uFill(p.id, p.username); }
          if(p.id) profileMap[p.id] = { name: p.nombre || (p.username ? '@'+p.username : ''), av: p.avatar||'' };
        });
      }catch(e){}
    }
  }

  // Cross-user block filter — silently hide contacts who have blocked me
  if(sbClient && myId && (favs.length || favMeRows.length)){
    try{
      var _cIds = favs.map(function(f){ return f.id; }).concat(favMeRows.map(function(r){ return r.user_id; })).filter(function(id,i,a){ return id&&a.indexOf(id)===i; });
      if(_cIds.length){
        var blRes = await sbClient.from('user_blocks').select('blocker_id').eq('blocked_id', myId).in('blocker_id', _cIds);
        if(_navToken !== _tok) return;
        var _hid = {}; (blRes.data||[]).forEach(function(r){ _hid[r.blocker_id]=1; });
        favs = favs.filter(function(f){ return !_hid[f.id]; });
        favMeRows = favMeRows.filter(function(r){ return !_hid[r.user_id]; });
      }
    }catch(e){}
  }

  await _refreshPresenceCache();
  if(_navToken !== _tok) return;

  var unreadIds = {}; try{ unreadIds = JSON.parse(safeLS('get','velo_dm_unread')||'{}'); }catch(e){}

  // Build online list (favs + fans, deduped, only online)
  var _onlineMap = {};
  favs.forEach(function(f){ var pi=_presenceInfo(f.id); if(pi.on) _onlineMap[f.id]={id:f.id,name:f.name,av:f.av||'🧑',uname:usernameMap[f.id]||f.username||'',pInfo:pi,unread:unreadIds[f.id]||0,isFav:true}; });
  favMeRows.forEach(function(r){ var pi=_presenceInfo(r.user_id); if(pi.on&&!_onlineMap[r.user_id]){ var _fp=profileMap[r.user_id]||{}; _onlineMap[r.user_id]={id:r.user_id,name:_fp.name||usernameMap[r.user_id]||'Usuario',av:_fp.av||'🧑',uname:usernameMap[r.user_id]||'',pInfo:pi,unread:0,isFav:false}; } });
  var onlineList = Object.keys(_onlineMap).map(function(k){ return _onlineMap[k]; });

  // Blocked list
  var _bIds = []; try{ _bIds=JSON.parse(safeLS('get','velo_blocked')||'[]'); }catch(e){}
  var _bData = []; try{ _bData=JSON.parse(safeLS('get','velo_blocked_data')||'[]'); }catch(e){}
  var blockedList = _bIds.map(function(id){ return _bData.find(function(b){ return b.id===id; })||{id:id,name:'Usuario',av:'🧑'}; });

  var tabs = [
    {id:'favs',    label:'⭐ Favoritos',     count:favs.length},
    {id:'online',  label:'● Online',         count:onlineList.length},
    {id:'fans',    label:'♥ Me agregaron',   count:favMeRows.length}
  ];
  tabs.push({id:'blocked', label:'🚫 Bloqueados', count:blockedList.length});

  // ── Tab bar ──
  var tabsHtml = '<div class="r-contacts-tabs">'
    +tabs.map(function(t,i){
      return '<button class="r-ctab'+(i===0?' active':'')+'" id="ctab-'+t.id+'" onclick="pContactsTab(\''+t.id+'\')">'
        +(t.id==='online'?'<span style="color:#5BBF87;font-size:11px">●</span> Online':'')
        +(t.id!=='online'?t.label:'')
        +'<span class="r-ctab-count">'+t.count+'</span>'
        +'</button>';
    }).join('')
    +'</div>';

  // ── Favs content ──
  var favsHtml = '<div id="contacts-favs">'
    +(!favs.length
      ? '<div class="p-empty"><span class="p-empty-emoji">⭐</span><div class="p-empty-title">Sin favoritos aún</div><div class="p-empty-sub">Agregá personas como favoritas para verlas aquí.</div></div>'
      : favs.map(function(f){
          var pi=_presenceInfo(f.id); var uname=usernameMap[f.id]?'@'+usernameMap[f.id]:(f.username?'@'+f.username:'');
          return _contactCard(f.id,f.name,f.av||'🧑',uname,pi,unreadIds[f.id]||0,{showMail:true,showRemove:true,showBlock:true});
        }).join(''))
    +'</div>';

  // ── Online content ──
  var onlineHtml = '<div id="contacts-online" style="display:none">'
    +(!onlineList.length
      ? '<div class="p-empty"><span class="p-empty-emoji">💤</span><div class="p-empty-title">Nadie conectado ahora</div><div class="p-empty-sub">Aquí verás a tus favoritos y fans cuando estén online.</div></div>'
      : onlineList.map(function(u){
          var uname=u.uname?'@'+u.uname:'';
          return _contactCard(u.id,u.name,u.av,uname,u.pInfo,u.unread,{showMail:true,showAddFav:!u.isFav,showBlock:u.isFav,showRemove:u.isFav});
        }).join(''))
    +'</div>';

  // ── Fans content ──
  var fansHtml = '<div id="contacts-fans" style="display:none">'
    +(!favMeRows.length
      ? '<div class="p-empty"><span class="p-empty-emoji">♥</span><div class="p-empty-title">Nadie te agregó aún</div></div>'
      : favMeRows.map(function(r){
          var pi=_presenceInfo(r.user_id);
          var uname=usernameMap[r.user_id]?'@'+usernameMap[r.user_id]:'';
          var prof=profileMap[r.user_id]||{};
          var dName = prof.name || uname.replace('@','') || 'Usuario';
          var dAv   = prof.av  || '🧑';
          return _contactCard(r.user_id,dName,dAv,uname,pi,0,{small:true,showAddFav:!pIsFav(r.user_id)});
        }).join(''))
    +'</div>';

  // ── Blocked content ──
  var blockedHtml = '<div id="contacts-blocked" style="display:none">'
    +(!blockedList.length
      ? '<div class="p-empty"><span class="p-empty-emoji">🚫</span><div class="p-empty-title">Sin usuarios bloqueados</div><div class="p-empty-sub">Cuando bloqueés a alguien aparecerá aquí y podrás desbloquearlo.</div></div>'
      : '<div style="font-size:11px;color:var(--ink5);margin-bottom:12px;font-style:italic">Podés desbloquear a cualquier persona en cualquier momento.</div>'
        +blockedList.map(function(b){
          return '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--cream);border-radius:14px;margin-bottom:8px;border:1.5px solid rgba(200,50,50,.15);opacity:.75">'
            +'<div style="flex-shrink:0;filter:grayscale(1);opacity:.7">'+_avInline(b.av||'🧑',36)+'</div>'
            +'<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:700;color:var(--ink)">'+_escHtml(b.name||'Usuario')+'</div>'
            +'<div style="font-size:11px;color:var(--ink5)">Bloqueado/a</div></div>'
            +'<button onclick="pUnblockUser('+_jsAttr(b.id)+')" style="padding:6px 12px;background:rgba(116,198,157,.12);border:1.5px solid rgba(116,198,157,.35);border-radius:10px;font-size:12px;font-weight:700;color:var(--sage);cursor:pointer;flex-shrink:0">Desbloquear</button>'
            +'</div>';
        }).join('')
    )
    +'</div>';

  el.innerHTML = tabsHtml + favsHtml + onlineHtml + fansHtml + blockedHtml;
}

function pContactsTab(tab){
  ['favs','online','fans','blocked'].forEach(function(t){
    var c=document.getElementById('contacts-'+t); var b=document.getElementById('ctab-'+t);
    if(c) c.style.display = t===tab?'':'none';
    if(b) b.classList.toggle('active', t===tab);
  });
}

function pFilterContacts(q){
  // Search within the currently visible tab
  var lq = (q||'').toLowerCase().replace(/^@/,'');
  document.querySelectorAll('#contactsContent [data-fav-name]').forEach(function(c){
    if(c.closest('[style*="display:none"]')) return; // skip hidden tabs
    var nm=(c.dataset.favName||'').toLowerCase().indexOf(lq)>-1;
    var un=(c.dataset.favUname||'').toLowerCase().replace(/^@/,'').indexOf(lq)>-1;
    c.style.display=(!lq||nm||un)?'':'none';
  });
}

function pLeaveOfflineMsg(toId, toName, toAv){
  var existing = document.getElementById('offlineMsgOv');
  if(existing) existing.remove();
  var ov = document.createElement('div');
  ov.className = 'p-modal-ov show';
  ov.id = 'offlineMsgOv';
  ov.innerHTML = '<div class="p-sheet">'
    +'<div class="p-sheet-handle"></div>'
    +'<div style="text-align:center;padding:4px 0 16px">'
    +'<div style="font-size:36px;margin-bottom:8px">'+_avInline(toAv||'🧑',48)+'</div>'
    +'<div style="font-family:\'Cormorant Garamond\',serif;font-size:19px;color:var(--ink);margin-bottom:4px">Mensaje para '+_escHtml(toName||'Usuario')+'</div>'
    +'<p style="font-size:12px;color:var(--ink4);margin:0 0 14px;line-height:1.5">Le llegará en su Buzón Velo cuando esté disponible.</p>'
    +'</div>'
    +'<textarea id="offlineMsgTa" class="feed-textarea" rows="4" placeholder="Escribí tu mensaje…" style="width:100%;box-sizing:border-box;border-radius:12px;padding:12px;font-size:14px;border:1.5px solid var(--border2);background:var(--cream2);font-family:\'Jost\',sans-serif;resize:none;margin-bottom:12px"></textarea>'
    +'<button class="p-btn p-btn--primary p-btn--lg p-btn--full" onclick="_sendOfflineMsg('+_jsAttr(toId)+','+_jsAttr(toName)+','+_jsAttr(toAv||'🧑')+')">📬 Enviar mensaje</button>'
    +'<div style="height:8px"></div>'
    +'<button class="p-btn p-btn--secondary p-btn--md p-btn--full" onclick="document.getElementById(\'offlineMsgOv\').remove()">Cancelar</button>'
    +'</div>';
  document.body.appendChild(ov);
  ov.addEventListener('click', function(e){ if(e.target===ov) ov.remove(); });
  setTimeout(function(){ var ta=document.getElementById('offlineMsgTa'); if(ta) ta.focus(); }, 100);
}

function _sendOfflineMsg(toId, toName, toAv){
  var ta = document.getElementById('offlineMsgTa');
  if(!ta || !ta.value.trim()){ pToast('✍️','Escribí algo antes de enviar'); return; }
  var text = ta.value.trim();
  var myId   = safeLS('get','velo_user_id')||'';
  var myName = safeLS('get','velo_user_name')||'';
  var myAv   = safeLS('get','velo_user_av')||'🧑';
  document.getElementById('offlineMsgOv').remove();
  _initSupabase();
  if(sbClient && myId){
    // Route through broadcasts so recipient receives an inbox notification
    sbClient.from('broadcasts').insert({
      target: 'user:'+toId,
      subject: myName + ' te envió un mensaje',
      body: text,
      icon: myAv||'💌',
      sender: JSON.stringify({ n:myName, i:myId, a:myAv||'🧑' }),
      sent_at: new Date().toISOString()
    }).then(function(){}).catch(function(){});
  }
  pToast('📬','Mensaje enviado a '+_escHtml(toName||'Usuario')+'  💌');
}

// ── FAVORITES MINI WIDGET (shown in sections) ──────────────────
async function _renderFavWidget(containerId){
  var el = document.getElementById(containerId);
  if(!el) return;
  var favs = pGetFavs();
  if(!favs.length){ el.innerHTML = ''; return; }

  var onlineIds = {};
  _initSupabase();
  if(sbClient){
    try{
      var cutoff = new Date(Date.now()-5*60*1000).toISOString();
      var {data:gd} = await sbClient.from('guardian_presence').select('user_id').gte('last_seen',cutoff);
      if(gd) gd.forEach(function(r){ onlineIds[r.user_id]=true; });
    }catch(e){}
  }

  var onlineFavs = favs.filter(function(f){ return onlineIds[f.id]; });
  var shownFavs  = onlineFavs.length ? onlineFavs : favs.slice(0,5);
  var label      = onlineFavs.length ? '🟢 Favoritos en línea' : '⭐ Mis favoritos';

  el.innerHTML = '<div style="margin-bottom:14px">'
    +'<div style="font-size:10px;font-weight:700;letter-spacing:1.5px;color:var(--sage3);text-transform:uppercase;margin-bottom:8px">'+label+'</div>'
    +'<div style="display:flex;gap:10px;overflow-x:auto;padding-bottom:4px;scrollbar-width:none;-ms-overflow-style:none">'
    +shownFavs.map(function(f){
      var isOnline = !!onlineIds[f.id];
      return '<div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0;cursor:pointer" onclick="pOpenDM('+_jsAttr(f.id)+','+_jsAttr(f.name)+','+_jsAttr(f.av||'🧑')+')">'
        +'<div style="position:relative">'
        +_avInline(f.av||'🧑', 38)
        +'<span style="position:absolute;bottom:0;right:0;width:10px;height:10px;border-radius:50%;background:'+(isOnline?'var(--st-on)':'rgba(150,150,150,.35)')+';border:2px solid var(--cream)"></span>'
        +'</div>'
        +'<div style="font-size:10px;color:var(--ink3);font-weight:600;max-width:48px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+_escHtml((f.name||'Usuario').split(' ')[0])+'</div>'
        +'</div>';
    }).join('')
    +'<div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0;cursor:pointer" onclick="pGoTo(\'contacts\')">'
    +'<div style="width:38px;height:38px;border-radius:50%;background:var(--cream2);border:1.5px dashed var(--border2);display:flex;align-items:center;justify-content:center;font-size:16px">👥</div>'
    +'<div style="font-size:10px;color:var(--ink3);font-weight:600">Ver todos</div>'
    +'</div>'
    +'</div>'
    +'</div>';
}

// ── CLEAR CHAT HELPERS ────────────────────────────────────────

function pClearHelpChat(){
  if(!confirm('¿Limpiar el historial de este chat?')) return;
  var el = document.getElementById('helpChatMessages');
  if(el) el.innerHTML = '';
}

function pClearGuardianChat(){
  if(!confirm('¿Limpiar la vista local de este chat?')) return;
  var el = document.getElementById('gcMessages');
  if(el) el.innerHTML = '';
}

function pClearCircleChat(){
  if(!confirm('¿Limpiar la vista local? Los mensajes del círculo seguirán visibles para el resto.')) return;
  var el = document.getElementById('feedMessages');
  if(el) el.innerHTML = '';
}

async function pClearDMChat(){
  if(!_dmPeer) return;
  if(!confirm('¿Borrar toda la conversación con '+_dmPeer.name+'? Esta acción es permanente.')) return;
  var myId = safeLS('get','velo_user_id')||'';
  var el = document.getElementById('dmMessages');
  if(el) el.innerHTML = '<div style="text-align:center;padding:30px 0;color:var(--ink5);font-size:13px">Conversación eliminada</div>';
  _initSupabase();
  if(sbClient && myId && _dmPeer){
    sbClient.from('direct_messages').delete()
      .or('and(from_id.eq.'+myId+',to_id.eq.'+_dmPeer.id+'),and(from_id.eq.'+_dmPeer.id+',to_id.eq.'+myId+')')
      .then(function(){}).catch(function(){});
  }
  safeLS('del','velo_dm_req_sent_'+_dmPeer.id);
  safeLS('del','velo_dm_accepted_'+_dmPeer.id);
  pToast('🗑️','Conversación eliminada');
}

function pClearAIChat(){
  if(!confirm('¿Limpiar la conversación con Velo IA?')) return;
  var el = document.getElementById('calmAIMessages');
  if(el) el.innerHTML = '';
  pToast('✨','Chat limpiado');
}

// ── DIRECT MESSAGES ───────────────────────────────────────────

var _dmPeer = null; // { id, name, av }

function _dmOpenPeerProfile(){
  if(_dmPeer) pQuickProfile(_dmPeer.name, _dmPeer.av, '', '', _dmPeer.id);
}

// Internal: enter DM chat without busy-check (used when accepting a request)
function _enterDMChat(toId, toName, toAv){
  _prevChatStatus = _presenceStatus();
  _inActiveChat = true;
  _updateGuardianPresence('ocupado');
  _dmPeer = { id:toId, name:toName||'Usuario', av:toAv||'🧑' };
  _dmLastMsgId = null; // reset so first render is a clean full load
  var unread = {}; try{ unread = JSON.parse(safeLS('get','velo_dm_unread')||'{}'); }catch(e){}
  delete unread[toId];
  safeLS('set','velo_dm_unread', JSON.stringify(unread));
  _updateFavBadge();
  var hdr = document.getElementById('dmPeerName');
  if(hdr) hdr.textContent = toName||'Usuario';
  var hdrAv = document.getElementById('dmPeerAv');
  if(hdrAv) hdrAv.innerHTML = _avInline(toAv||'🧑',36);
  pGoTo('dm-chat');
  setTimeout(function(){ _renderDMThread(); _subscribeToDMThread(); }, 100);
}

function pOpenDM(toId, toName, toAv){
  // Block if target user is currently busy in another chat
  var tp = _presenceCache[toId];
  if(tp && tp.status === 'ocupado' && tp.last_seen && (Date.now() - new Date(tp.last_seen).getTime()) < 5*60*1000){
    pToast('⏳', (toName||'Este usuario') + ' está ocupado/a en otro chat, intentá más tarde');
    return;
  }
  // Send chat request sentinel to the other user if never accepted before
  var alreadyAccepted = safeLS('get','velo_dm_accepted_'+toId) === '1';
  if(!alreadyAccepted){
    var myId   = safeLS('get','velo_user_id')||'';
    var myName = safeLS('get','velo_user_name')||'';
    var myAv   = safeLS('get','velo_user_av')||'🧑';
    if(myId && toId && sbClient){
      sbClient.from('direct_messages').insert({
        from_id:myId, from_name:myName, from_av:myAv, to_id:toId, text:'__velo_chat_req__'
      }).then(function(){}).catch(function(){});
    }
  }
  _enterDMChat(toId, toName, toAv);
}

async function _renderDMThread(){
  var el = document.getElementById('dmMessages');
  if(!el || !_dmPeer) return;
  var myId = safeLS('get','velo_user_id')||'';
  _initSupabase();
  if(!sbClient){ el.innerHTML = '<div class="p-empty" style="padding:30px 0">Sin conexión</div>'; return; }
  try{
    var {data} = await sbClient.from('direct_messages')
      .select('*')
      .or('and(from_id.eq.'+myId+',to_id.eq.'+_dmPeer.id+'),and(from_id.eq.'+_dmPeer.id+',to_id.eq.'+myId+')')
      .order('created_at',{ascending:true}).limit(100);
    var sentinels = ['__velo_chat_req__','__velo_chat_acc__','__velo_chat_rej__','__velo_chat_busy__'];
    var msgs = (data||[]).filter(function(m){ var t=m.text||''; return sentinels.indexOf(t)<0&&!t.startsWith('__velo_guardian_req__:')&&!t.startsWith('__velo_guardian_acc__:')&&!t.startsWith('__velo_guardian_rej__:')&&!t.startsWith('__velo_guardian_bye__:')&&!t.startsWith('__velo_dm_bye__:')&&!t.startsWith('__velo_help_bye__:'); });
    if(!msgs.length){
      if(!el.querySelector('.dm-empty-state')){
        el.innerHTML = '<div class="dm-empty-state" style="text-align:center;padding:40px 16px 20px">'
          +'<div style="margin-bottom:12px">'+_avInline((_dmPeer&&_dmPeer.av)||'🧑',56)+'</div>'
          +'<div style="font-family:\'Cormorant Garamond\',serif;font-size:18px;color:var(--ink);margin-bottom:8px">'+_escHtml((_dmPeer&&_dmPeer.name)||'Usuario')+'</div>'
          +'<div style="font-size:12px;color:var(--ink5);line-height:1.6">Tu conversación es privada 🔒<br>Solo vos y '+_escHtml(((_dmPeer&&_dmPeer.name)||'esta persona').split(' ')[0])+' pueden leer estos mensajes.</div>'
          +'</div>';
        _dmLastMsgId = null;
      }
      return;
    }
    var lastId = msgs[msgs.length-1].id;
    // Nothing changed — skip re-render (prevents flicker)
    if(lastId === _dmLastMsgId) return;
    var wasAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    // Incremental append if possible
    if(_dmLastMsgId){
      var lastIdx = msgs.findIndex(function(m){ return m.id === _dmLastMsgId; });
      if(lastIdx >= 0 && lastIdx < msgs.length - 1){
        var emptyEl = el.querySelector('.dm-empty-state');
        if(emptyEl) emptyEl.remove();
        msgs.slice(lastIdx + 1).forEach(function(m){
          var tmp = document.createElement('div');
          var isOwn = m.from_id === myId;
          tmp.innerHTML = _buildMsgBubble(m.text||'', isOwn, isOwn?'':(m.from_av||'🧑'), isOwn?'':(m.from_name||''), 'dmInput', 'dmReplyBar', '', m.reactions||{}, 'direct_messages:'+m.id, isOwn?'':(m.from_id||''));
          while(tmp.firstChild) el.appendChild(tmp.firstChild);
        });
        _dmLastMsgId = lastId;
        if(wasAtBottom) el.scrollTop = el.scrollHeight;
        return;
      }
    }
    // Full render (first load or reaction update)
    el.innerHTML = msgs.map(function(m){
      var isOwn = m.from_id === myId;
      return _buildMsgBubble(m.text||'', isOwn, isOwn?'':(m.from_av||'🧑'), isOwn?'':(m.from_name||''), 'dmInput', 'dmReplyBar', '', m.reactions||{}, 'direct_messages:'+m.id, isOwn?'':(m.from_id||''));
    }).join('');
    _dmLastMsgId = lastId;
    el.scrollTop = el.scrollHeight;
  }catch(e){ el.innerHTML = '<div class="p-empty" style="padding:30px 0">Error al cargar mensajes</div>'; }
}

function _subscribeToDMThread(){
  if(_dmRtCh && sbClient){ try{ sbClient.removeChannel(_dmRtCh); }catch(e){} _dmRtCh = null; }
  if(!sbClient || !_dmPeer) return;
  var myId = safeLS('get','velo_user_id')||'';
  var _dmRel = function(m){ return (m.from_id===myId&&m.to_id===_dmPeer.id)||(m.from_id===_dmPeer.id&&m.to_id===myId); };
  _dmRtCh = sbClient.channel('velo:dm:'+myId+':'+_dmPeer.id)
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'direct_messages'},function(payload){
      if(_dmRel(payload.new||{})) _renderDMThread();
    })
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'direct_messages'},function(payload){
      var m = payload.new||{};
      if(!_dmRel(m) || !m.id) return;
      // Inline reaction chip update — avoids full re-render and scroll jump
      var bubble = document.querySelector('[data-sb-id="direct_messages:'+m.id+'"]');
      if(!bubble){ _renderDMThread(); return; } // fallback if bubble not found
      var oldBar = bubble.querySelector('.msg-rx-bar');
      if(oldBar) oldBar.remove();
      if(m.reactions && typeof m.reactions === 'object'){
        var chips = Object.keys(m.reactions).map(function(e){
          var cnt = m.reactions[e]||1;
          return '<span class="msg-reaction" data-emoji="'+e+'" data-cnt="'+cnt+'" onclick="_msgReact(\''+e+'\')">'+e+' '+cnt+'</span>';
        }).join('');
        if(chips){
          var newBar = document.createElement('div');
          newBar.className = 'msg-rx-bar';
          newBar.innerHTML = chips;
          bubble.appendChild(newBar);
        }
      }
    }).subscribe();
}

function pLeaveDM(){
  var _dmMyName = safeLS('get','velo_user_name') || 'Alguien';
  var _dmMyAv   = safeLS('get','velo_user_av')   || '🧑';
  var _dmMyId   = safeLS('get','velo_user_id') || '';
  _initSupabase();
  // Notify peer with sentinel (deleted on receipt — never shows in history)
  if(sbClient && _dmPeer && _dmPeer.id && _dmMyId){
    sbClient.from('direct_messages').insert({
      from_id: _dmMyId, from_name: _dmMyName, from_av: _dmMyAv, to_id: _dmPeer.id,
      text: '__velo_dm_bye__:'+JSON.stringify({ name:_dmMyName, av:_dmMyAv })
    }).then(function(){}).catch(function(){});
  }
  if(_dmRtCh && sbClient){ try{ sbClient.removeChannel(_dmRtCh); }catch(e){} _dmRtCh = null; }
  // Clear accepted flag so a new session requires a fresh chat request
  if(_dmPeer && _dmPeer.id) safeLS('del', 'velo_dm_accepted_'+_dmPeer.id);
  _dmPeer = null;
  _dmLastMsgId = null;
  _inActiveChat = false;
  _updateGuardianPresence(_prevChatStatus || _presenceStatus());
  _prevChatStatus = null;
  pGoTo('contacts');
}

async function pSendDM(){
  var ta = document.getElementById('dmInput');
  if(!ta || !ta.value.trim() || !_dmPeer) return;
  var text = ta.value.trim();
  if(text.length > 2000){ pToast('⚠️','Mensaje demasiado largo (máx 2000 caracteres)'); return; }
  ta.value = '';
  var dmQuote = _getReplyQuote('dmReplyBar');
  pClearReplyBar('dmReplyBar');
  var myId   = safeLS('get','velo_user_id')||'';
  var myName = safeLS('get','velo_user_name')||'';
  var myAv   = safeLS('get','velo_user_av')||'';
  var fullText = dmQuote ? '↩ "'+dmQuote.slice(0,60)+(dmQuote.length>60?'…':'')+'"  \n'+text : text;
  // Optimistic render
  var el = document.getElementById('dmMessages');
  if(el){
    var div = document.createElement('div');
    div.innerHTML = _buildMsgBubble(text, true, '', '', 'dmInput', 'dmReplyBar', dmQuote);
    el.appendChild(div.firstChild);
    el.scrollTop = el.scrollHeight;
  }
  _initSupabase();
  if(sbClient){
    sbClient.from('direct_messages').insert({
      from_id:myId, from_name:myName, from_av:myAv, to_id:_dmPeer.id, text:fullText
    }).then(function(){}).catch(function(){});
  }
}

function _showDMChatRequest(fromId, fromName, fromAv){
  var existing = document.getElementById('dmChatReqOv');
  if(existing) existing.remove();
  var ov = document.createElement('div');
  ov.className = 'p-modal-ov show';
  ov.id = 'dmChatReqOv';
  ov.innerHTML = '<div class="p-sheet">'
    +'<div class="p-sheet-handle"></div>'
    +'<div style="text-align:center;padding:8px 0 16px">'
    +'<div style="font-size:50px;margin-bottom:10px">'+_avInline(fromAv||'🧑',56)+'</div>'
    +'<div style="font-family:\'Cormorant Garamond\',serif;font-size:20px;color:var(--ink);margin-bottom:6px">'+_escHtml(fromName)+'</div>'
    +'<p style="font-size:13px;color:var(--ink3);margin:0 0 20px;line-height:1.5">quiere iniciar un chat privado contigo.<br>¿Querés aceptar?</p>'
    +'</div>'
    +'<button class="p-btn p-btn--primary p-btn--lg p-btn--full" onclick="_acceptDMRequest('+_jsAttr(fromId)+','+_jsAttr(fromName)+','+_jsAttr(fromAv||'🧑')+');document.getElementById(\'dmChatReqOv\').remove()" style="margin-bottom:8px">💬 Aceptar y chatear</button>'
    +'<button class="p-btn p-btn--secondary p-btn--md p-btn--full" onclick="_rejectDMRequest('+_jsAttr(fromId)+','+_jsAttr(fromName)+');document.getElementById(\'dmChatReqOv\').remove()">No por ahora</button>'
    +'</div>';
  document.body.appendChild(ov);
  ov.addEventListener('click', function(e){ if(e.target===ov) ov.remove(); });
}

function _acceptDMRequest(fromId, fromName, fromAv){
  var myId = safeLS('get','velo_user_id')||'';
  var myName = safeLS('get','velo_user_name')||'';
  var myAv = safeLS('get','velo_user_av')||'🧑';
  safeLS('set','velo_dm_accepted_'+fromId,'1');
  _initSupabase();
  if(sbClient && myId){
    sbClient.from('direct_messages').insert({
      from_id:myId, from_name:myName, from_av:myAv, to_id:fromId, text:'__velo_chat_acc__'
    }).then(function(){}).catch(function(){});
  }
  pToast('💬','Aceptaste el chat con '+_escHtml(fromName));
  setTimeout(function(){ _enterDMChat(fromId, fromName, fromAv); }, 300);
}

function _rejectDMRequest(fromId, fromName){
  var myId = safeLS('get','velo_user_id')||'';
  var myName = safeLS('get','velo_user_name')||'';
  var myAv = safeLS('get','velo_user_av')||'🧑';
  _initSupabase();
  if(sbClient && myId){
    sbClient.from('direct_messages').insert({
      from_id:myId, from_name:myName, from_av:myAv, to_id:fromId, text:'__velo_chat_rej__'
    }).then(function(){}).catch(function(){});
  }
  pToast('✓','Solicitud rechazada');
}

// Global DM listener — shows popup toast when a new DM arrives while in another section
var _dmLastChecked = null; // ISO timestamp of last poll (so we only surface new messages)
function _startGlobalDMListener(){
  if(_dmInboxCh) return; // already subscribed
  var myId = safeLS('get','velo_user_id')||'';
  if(!myId || !sbClient) return;
  _dmLastChecked = new Date().toISOString();

  function _handleDMPayload(m, myId){
      if(m.to_id !== myId) return;
      var curPage = document.querySelector('.p-page.active');
      var curId = curPage ? curPage.id : '';
      // Handle sentinel messages
      if(m.text === '__velo_chat_req__'){
        // Auto-reject if current user is in another active chat
        if(_inActiveChat){
          var busyMyId = safeLS('get','velo_user_id')||'';
          var busyMyName = safeLS('get','velo_user_name')||'';
          var busyMyAv = safeLS('get','velo_user_av')||'🧑';
          _initSupabase();
          if(sbClient && busyMyId){
            sbClient.from('direct_messages').insert({
              from_id:busyMyId, from_name:busyMyName, from_av:busyMyAv,
              to_id:m.from_id, text:'__velo_chat_busy__'
            }).then(function(){}).catch(function(){});
          }
          return;
        }
        _showDMChatRequest(m.from_id, m.from_name||'Usuario', m.from_av||'🧑');
        return;
      }
      if(m.text === '__velo_chat_acc__'){
        safeLS('set','velo_dm_accepted_'+m.from_id,'1');
        // If already in an active chat, notify but don't overwrite the current session
        if(_inActiveChat){
          pToast('💬',(m.from_name||'Usuario')+' aceptó tu chat — terminá el actual primero');
          return;
        }
        pToast('💬',(m.from_name||'Usuario')+' aceptó tu solicitud de chat 🎉');
        // Use _enterDMChat (not pOpenDM) to bypass the busy-check — accepter just became 'ocupado'
        setTimeout(function(){ _enterDMChat(m.from_id, m.from_name||'Usuario', m.from_av||'🧑'); }, 400);
        return;
      }
      if(m.text === '__velo_chat_rej__'){
        safeLS('del','velo_dm_req_sent_'+m.from_id);
        pToast('💬',(m.from_name||'Usuario')+' no puede chatear ahora');
        return;
      }
      if(m.text === '__velo_chat_busy__'){
        safeLS('del','velo_dm_req_sent_'+m.from_id);
        pToast('⏳',(m.from_name||'Este usuario')+' está ocupado/a en otro chat, intentá más tarde');
        return;
      }
      if(m.text && m.text.startsWith('__velo_guardian_req__:')){
        // Always delete sentinel from DB so it never contaminates chat history
        if(m.id && sbClient){
          sbClient.from('direct_messages').delete().eq('id',m.id).then(function(){}).catch(function(){});
        }
        try{
          var _gReqParsed = JSON.parse(m.text.slice('__velo_guardian_req__:'.length));
          // Show popup only if I am the target guardian
          if(_gReqParsed && _gReqParsed.kind === 'direct' && _gReqParsed.guardian_id === myId){
            _showGuardianRequest(_gReqParsed);
          }
        }catch(e){}
        return;
      }
      if(m.text && m.text.startsWith('__velo_guardian_acc__:')){
        if(m.id && sbClient) sbClient.from('direct_messages').delete().eq('id',m.id).then(function(){}).catch(function(){});
        try{
          var _gAccData = JSON.parse(m.text.slice('__velo_guardian_acc__:'.length));
          if(document.getElementById('gdWaitOv') && _gAccData){
            _closeGuardianWaitSheet();
            if(_seekerPollTmr){ clearInterval(_seekerPollTmr); _seekerPollTmr = null; }
            if(_gcSeekerCh && sbClient){ try{ sbClient.removeChannel(_gcSeekerCh); }catch(e2){} _gcSeekerCh = null; }
            _openGuardianChat(_gAccData.guardian_id, _gAccData.guardian_name||'Guardián', _gAccData.guardian_av||'🌿', _gAccData.req_id, 'seeker');
          }
        }catch(e){}
        return;
      }
      if(m.text && m.text.startsWith('__velo_guardian_rej__:') && !(m.text||'').startsWith('__velo_guardian_bye__:')){
        if(m.id && sbClient) sbClient.from('direct_messages').delete().eq('id',m.id).then(function(){}).catch(function(){});
        if(document.getElementById('gdWaitOv')){
          _closeGuardianWaitSheet();
          if(_seekerPollTmr){ clearInterval(_seekerPollTmr); _seekerPollTmr = null; }
          if(_gcSeekerCh && sbClient){ try{ sbClient.removeChannel(_gcSeekerCh); }catch(e2){} _gcSeekerCh = null; }
          pToast('🌿','El guardián no puede acompañarte ahora. Probá con otro 💚');
        }
        return;
      }
      if(m.text && m.text.startsWith('__velo_guardian_bye__:')){
        if(m.id && sbClient) sbClient.from('direct_messages').delete().eq('id',m.id).then(function(){}).catch(function(){});
        if(curId === 'pg-guardian-chat' && _gcPeer && _gcPeer.id === m.from_id){
          var _byeParsed = {}; try{ _byeParsed = JSON.parse(m.text.slice('__velo_guardian_bye__:'.length)); }catch(e){}
          _showGuardianExitBanner(_byeParsed.name || m.from_name || 'El otro usuario');
        }
        return;
      }
      if(m.text && m.text.startsWith('__velo_dm_bye__:')){
        if(m.id && sbClient) sbClient.from('direct_messages').delete().eq('id',m.id).then(function(){}).catch(function(){});
        if(curId === 'pg-dm-chat' && _dmPeer && _dmPeer.id === m.from_id){
          var _dmByeParsed = {}; try{ _dmByeParsed = JSON.parse(m.text.slice('__velo_dm_bye__:'.length)); }catch(e){}
          _showDMExitBanner(_dmByeParsed.name || m.from_name || 'El otro usuario');
        }
        return;
      }
      if(m.text && m.text.startsWith('__velo_help_bye__:')){
        if(m.id && sbClient) sbClient.from('direct_messages').delete().eq('id',m.id).then(function(){}).catch(function(){});
        if(curId === 'pg-help-chat'){
          var _helpByeParsed = {}; try{ _helpByeParsed = JSON.parse(m.text.slice('__velo_help_bye__:'.length)); }catch(e){}
          _showHelpExitBanner(_helpByeParsed.name || m.from_name || 'El otro usuario');
        }
        return;
      }
      if(curId === 'pg-dm-chat' && _dmPeer && _dmPeer.id === m.from_id) return; // already in DM chat
      if(curId === 'pg-guardian-chat' && _gcPeer && _gcPeer.id === m.from_id) return; // already in guardian chat
      // Show floating notification
      _showDMToast(m.from_id, m.from_name||'Usuario', m.from_av||'🧑', m.text||'');
      // Update unread count
      var unread = {}; try{ unread = JSON.parse(safeLS('get','velo_dm_unread')||'{}'); }catch(e){}
      unread[m.from_id] = (unread[m.from_id]||0)+1;
      safeLS('set','velo_dm_unread', JSON.stringify(unread));
      _updateFavBadge();
  }

  _dmInboxCh = sbClient.channel('velo:dm:inbox:'+myId)
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'direct_messages'},function(payload){
      _handleDMPayload(payload.new||{}, myId);
    })
    .subscribe(function(status, err){
      if(status !== 'SUBSCRIBED') console.warn('[dm inbox listener] status:', status, err||'');
    });

  // Polling fallback every 15s — surfaces unread DMs if Realtime drops
  if(_dmPollTmr){ clearInterval(_dmPollTmr); _dmPollTmr = null; }
  _dmPollTmr = setInterval(function(){
    if(!sbClient || !myId) return;
    var since = _dmLastChecked || new Date(Date.now()-30000).toISOString();
    _dmLastChecked = new Date().toISOString();
    sbClient.from('direct_messages').select('*')
      .eq('to_id', myId).eq('read', false)
      .gte('created_at', since)
      .order('created_at',{ascending:true}).limit(20)
      .then(function(res){
        if(!res || !res.data) return;
        res.data.forEach(function(m){ _handleDMPayload(m, myId); });
      }).catch(function(){});
  }, 15000);
}

function _showDMToast(fromId, fromName, fromAv, text){
  var existing = document.getElementById('dmToastBanner');
  if(existing) existing.remove();
  var banner = document.createElement('div');
  banner.id = 'dmToastBanner';
  banner.style.cssText = 'position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:9999;background:#fff;border-radius:18px;box-shadow:0 4px 24px rgba(0,0,0,.18);padding:12px 16px;display:flex;align-items:center;gap:12px;max-width:340px;width:calc(100% - 32px);cursor:pointer;border:1.5px solid var(--border2);animation:slideDown .25s ease';
  banner.innerHTML = '<div style="font-size:32px;flex-shrink:0">'+_avInline(fromAv,38)+'</div>'
    +'<div style="flex:1;min-width:0">'
    +'<div style="font-size:12px;font-weight:700;color:var(--ink);margin-bottom:2px">'+_escHtml(fromName)+' te escribió 💬</div>'
    +'<div style="font-size:12px;color:var(--ink4);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+_escHtml(text.slice(0,60))+'</div>'
    +'</div>'
    +'<button onclick="event.stopPropagation();document.getElementById(\'dmToastBanner\').remove()" style="font-size:16px;background:none;border:none;cursor:pointer;color:var(--ink4);padding:4px;flex-shrink:0">✕</button>';
  banner.onclick = function(){
    banner.remove();
    pOpenDM(fromId, fromName, fromAv);
  };
  document.body.appendChild(banner);
  setTimeout(function(){ if(document.getElementById('dmToastBanner')) banner.remove(); }, 7000);
}

// ── CONTACT ────────────────────────────────────────────────────
function pContactBack(){
  pGoTo(_authenticated ? 'home' : 'landing');
}

function _initContactPage(){
  var emailEl = document.getElementById('contactEmail');
  var nameEl  = document.getElementById('contactName');
  var storedEmail = safeLS('get','velo_user_email') || '';
  var storedName  = safeLS('get','velo_user_name')  || '';
  if(emailEl){
    if(storedEmail){
      emailEl.value = storedEmail;
      emailEl.readOnly = true;
      emailEl.style.opacity = '.7';
      emailEl.style.cursor  = 'default';
    } else {
      emailEl.value = '';
      emailEl.readOnly = false;
      emailEl.style.opacity = '';
      emailEl.style.cursor  = '';
    }
  }
  if(nameEl){
    if(storedName){
      nameEl.value = storedName;
      nameEl.readOnly = true;
      nameEl.style.opacity = '.7';
      nameEl.style.cursor  = 'default';
    } else {
      nameEl.value = '';
      nameEl.readOnly = false;
      nameEl.style.opacity = '';
      nameEl.style.cursor  = '';
    }
  }
}

async function pSendContact(){
  var subject  = document.getElementById('contactSubject');
  var msg      = document.getElementById('contactMsg');
  var emailEl  = document.getElementById('contactEmail');
  var nameEl   = document.getElementById('contactName');
  var email    = (emailEl ? emailEl.value.trim() : '') || safeLS('get','velo_user_email') || '';
  var name     = (nameEl  ? nameEl.value.trim()  : '') || safeLS('get','velo_user_name')  || '';

  if(!name){ pToast('👤','Ingresá tu nombre para que podamos dirigirnos a vos'); return; }
  if(!email || !email.includes('@')){ pToast('📧','Ingresá un correo válido para poder responderte'); return; }
  if(!subject||!msg||!msg.value.trim()){ pToast('✍️','Escribí tu mensaje'); return; }

  var text   = msg.value.trim();
  var topic  = subject ? subject.value||'General' : 'General';
  var userId = safeLS('get','velo_user_id') || '';
  var source = _authenticated ? 'logged-in' : 'pre-login';

  // Save to Supabase (primary) with localStorage fallback
  var saved = await sbSaveContact(topic, text, email, name, userId, source);
  if(!saved){
    var msgs = []; try{ msgs = JSON.parse(safeLS('get','velo_admin_contacts')||'[]'); }catch(e){}
    msgs.unshift({ id:'c-'+Date.now(), topic:topic, mensaje:text, user_email:email, user_name:name, user_id:userId, source:source, fecha:new Date().toISOString(), leido:false });
    safeLS('set','velo_admin_contacts', JSON.stringify(msgs.slice(0,100)));
  }

  // Notify admin via email (fire-and-forget)
  fetch('/api/send-email', { method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({ email:_ADMIN_EMAIL, name:name, type:'new-contact', topic:topic, message:text })
  }).catch(function(){});

  // Also add to admin buzón inside the app
  sbSaveBroadcast('admin', '📬 Nueva consulta: '+topic, name+' ('+email+'): '+text.slice(0,120), '📬', 'Sistema').catch(function(){});

  if(subject) subject.value = 'General';
  if(msg) msg.value = '';
  if(nameEl  && !safeLS('get','velo_user_name'))  nameEl.value  = '';
  if(emailEl && !safeLS('get','velo_user_email')) emailEl.value = '';

  pToast('💌','Mensaje enviado, '+name+'. Te respondemos pronto a '+email+' 🌿');
  setTimeout(function(){ pContactBack(); }, 2000);
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

function pShowDailyLimitModal(type){
  var labels = {
    guardian: { icon:'🛡️', name:'sesiones con guardianes', limit:'4' },
    help:     { icon:'💙', name:'pedidos de ayuda',         limit:'4' },
    bottle:   { icon:'🌊', name:'mensajes al Mar',           limit:'4' }
  };
  var l = labels[type] || { icon:'⏰', name:'usos', limit:'4' };
  var isDark = document.body.classList.contains('r-dark');
  var existing = document.getElementById('dailyLimitOv');
  if(existing) existing.remove();
  var ov = document.createElement('div');
  ov.className = 'p-modal-ov show';
  ov.id = 'dailyLimitOv';
  ov.innerHTML = '<div class="p-sheet">'
    +'<div class="p-sheet-handle"></div>'
    +'<div style="text-align:center;padding:8px 4px 4px">'
    +'<div style="font-size:44px;margin-bottom:10px">'+l.icon+'</div>'
    +'<div style="font-family:\'Cormorant Garamond\',\'Crimson Pro\',serif;font-size:22px;font-weight:600;color:var(--ink);margin-bottom:10px;line-height:1.2">¡Llegaste al límite de hoy!</div>'
    +'<p style="font-size:13.5px;color:var(--ink3);margin:0 0 6px;line-height:1.65;padding:0 8px">'
    +'Se acabaron tus <strong>'+l.limit+' '+l.name+'</strong> gratis de hoy.'
    +'</p>'
    +'<p style="font-size:13px;color:var(--ink4);margin:0 0 22px;line-height:1.6;padding:0 8px">'
    +'Volvé mañana para continuar, o suscribite a <strong>Velo Plus</strong> para acceso ilimitado a todo.'
    +'</p>'
    +'<div style="display:flex;flex-direction:column;gap:10px">'
    +'<button onclick="document.getElementById(\'dailyLimitOv\').remove();pShowPlusModal()" '
    +'style="padding:13px;background:linear-gradient(135deg,#C8A560,#A07840);border:none;border-radius:14px;font-size:14px;font-weight:700;color:#fff;cursor:pointer;font-family:\'Jost\',sans-serif;width:100%;letter-spacing:.02em">⭐ Suscribirme a Velo Plus</button>'
    +'<button onclick="document.getElementById(\'dailyLimitOv\').remove()" '
    +'style="padding:12px;background:var(--cream2);border:1.5px solid var(--border2);border-radius:14px;font-size:13px;font-weight:600;color:var(--ink3);cursor:pointer;font-family:\'Jost\',sans-serif;width:100%">Volver mañana 👋</button>'
    +'</div></div></div>';
  document.body.appendChild(ov);
  ov.addEventListener('click', function(e){ if(e.target===ov) ov.remove(); });
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
    +'<li>✅ 4 mensajes al Mar/día</li>'
    +'<li>✅ 4 pedidos de ayuda/día</li>'
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
  var stars = document.querySelectorAll('#postChatStars .star-btn.on').length;
  if(!stars){ pToast('⭐','Elegí una valoración con estrellas'); return; }
  var tags = [];
  document.querySelectorAll('#postChatTags .p-tag-chip.on').forEach(function(c){ tags.push(c.textContent.trim()); });
  var noteEl = document.getElementById('postChatNote');
  var note = noteEl ? noteEl.value.trim() : '';
  var texto = (tags.length ? tags.join(' · ') : '') + (note ? (tags.length?' — ':'')+note : '');

  var guardian = null;
  try{ guardian = JSON.parse(safeLS('get','velo_postchat_guardian')||'null'); }catch(e){}
  var myId   = _myUserId();
  var myName = _myDisplayName();
  var myAv   = safeLS('get','velo_user_av') || '🌿';

  _initSupabase();
  if(sbClient && guardian && guardian.id){
    // Save the review about the guardian (ensure session so RLS allows insert)
    _ensureSbSession().then(function(){
      sbClient.from('reviews').insert({
        kind:'guardian', pro_id:guardian.id, user_id:myId,
        reviewer_name:myName, reviewee_name:guardian.name||'Guardián',
        stars:stars, texto:texto
      }).then(function(){}).catch(function(e){ console.error('[review insert]', e); });
    });
    // Deliver the review to the guardian's Buzón Velo — sender as JSON so the buzón shows reviewer's name/avatar
    var reviewSender = JSON.stringify({ n: myName, i: myId, a: myAv });
    sbSaveBroadcast('user:'+guardian.id,
      'Recibiste una reseña '+'⭐'.repeat(stars),
      myName+' valoró tu acompañamiento con '+stars+' estrella'+(stars>1?'s':'')+'.'+(texto?'\n\n"'+texto+'"':''),
      '⭐', reviewSender);
  }
  // Store locally so the seeker keeps a record of reviews they gave
  if(noteEl) noteEl.value = '';
  safeLS('set','velo_postchat_guardian','');

  pToast('💚','¡Gracias por tu reseña! 🌿');
  if(!_isPremium()){
    setTimeout(function(){ pToast('💚','¿Querés donar para ayudar a la comunidad? 🌻'); }, 3000);
  }
  setTimeout(function(){ pGoTo('donate-cta'); }, 1700);
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
async function pProRegNext(){
  var name    = document.getElementById('prName');
  var spec    = document.getElementById('prSpec');
  var email   = document.getElementById('prEmail');
  var pass    = document.getElementById('prPass');
  var tcEl    = document.getElementById('proTcCheck');
  var dpaEl   = document.getElementById('proDpaCheck');
  var tcErrEl = document.getElementById('proTcErr');
  var dpaErrEl= document.getElementById('proDpaErr');
  if(!name||!name.value.trim()){ pToast('⚠️','Ingresá tu nombre'); return; }
  if(!spec||!spec.value.trim()){ pToast('⚠️','Ingresá tu especialidad'); return; }
  if(!email||!email.value.trim()){ pToast('⚠️','Ingresá tu correo'); return; }
  if(!pass||!pass.value||pass.value.length<6){ pToast('⚠️','Contraseña mínima de 6 caracteres'); return; }
  if(tcEl && !tcEl.checked){ if(tcErrEl) tcErrEl.style.display='block'; return; }
  if(tcErrEl) tcErrEl.style.display='none';
  if(dpaEl && !dpaEl.checked){ if(dpaErrEl) dpaErrEl.style.display='block'; return; }
  if(dpaErrEl) dpaErrEl.style.display='none';
  if(!_botGuardCheck()) return;
  safeLS('set','velo_pro_name', name.value.trim());
  safeLS('set','velo_pro_spec', spec.value.trim());
  safeLS('set','velo_user_email', email.value.trim());
  safeLS('set','velo_sb_pass', pass.value);
  safeLS('set','velo_user_type','pro');
  safeLS('set','velo_user_name', name.value.trim());
  await _recordTC(name.value.trim(), email.value.trim(), 'TOS-v1');
  await _recordTC(name.value.trim(), email.value.trim(), 'DPA-v1');
  pOpenPayPalPro();
  pGoTo('pro-pending');
}

// ── ADMIN ──────────────────────────────────────────────────────
var _ADMIN_EMAILS = ['consultas@heyvelo.app', 'wearevelo.app@gmail.com'];

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
  var resp;

  if(sbClient){
    try{
      resp = await sbClient.auth.signInWithPassword({ email: email, password: pass });
      var data = resp.data; var error = resp.error;
      if(!error && data && data.user){
        if(_ADMIN_EMAILS.indexOf(data.user.email.toLowerCase()) >= 0){
          granted = true;
        } else {
          authError = 'Tu cuenta no tiene acceso de administrador';
        }
      } else if(error){
        var em = error.message || '';
        if(/email.*not.*confirm/i.test(em) || /not confirmed/i.test(em))
          authError = 'El correo admin no está confirmado.';
        else if(/invalid.*credentials/i.test(em) || /invalid login/i.test(em))
          authError = 'Credenciales incorrectas. Verificá el correo y la contraseña.';
        else
          authError = 'Error: ' + em;
      }
    }catch(e){
      authError = 'Error de red · Verificá tu conexión';
    }
  } else {
    // Supabase JS didn't load — no local fallback, require real connection
    // (never grant admin access without server-side verification)
    authError = 'Sin conexión a Supabase. Verificá tu internet e intentá de nuevo.';
  }

  if(granted){
    _clearSession(); // wipe any prior user/pro data so sessions never mix
    safeLS('set','velo_user_type','admin');
    safeLS('set','velo_admin_session','1');
    safeLS('set','velo_session','1');
    safeLS('set','velo_user_email', email);
    if(resp && resp.data && resp.data.user && resp.data.user.id) safeLS('set','velo_user_id', resp.data.user.id);
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
  if(sbClient){ try{ sbClient.auth.signOut(); }catch(e){} }
  _clearSession();
  _authenticated = false;
  _userType = 'user';
  pGoTo('landing');
  _updateNavState('landing', false);
}

async function _renderAdmin(){
  // Gate: only an authenticated admin session may render the panel
  if(safeLS('get','velo_admin_session') !== '1'){ pGoTo('admin-login'); return; }
  var metrics = document.getElementById('adminMetrics');
  var content = document.getElementById('adminContent');

  // Show loading skeleton while Supabase queries run
  if(metrics) metrics.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:18px;font-size:12px;color:rgba(255,255,255,.35)">Cargando datos en tiempo real…</div>';

  // ── Live Supabase queries ──────────────────────────────────
  _initSupabase();
  var totalUsers = 0, totalPros = 0, totalPlus = 0, recentReg = [];
  var openReports = 0, crisisOpen = 0;

  if(sbClient){
    // Profiles: real registration count
    try{
      var profRes = await sbClient.from('profiles').select('id,role,created_at,nombre,email,terms_accepted_at').order('created_at',{ascending:false}).limit(500);
      if(!profRes.error && profRes.data){
        var profiles = profRes.data;
        totalPros  = profiles.filter(function(p){ return p.role==='pro'; }).length;
        totalPlus  = profiles.filter(function(p){ return p.role==='plus'; }).length;
        totalUsers = profiles.length; // total registered (all roles)
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
            var tcDate = p.terms_accepted_at ? new Date(p.terms_accepted_at).toLocaleString('es',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : null;
            var roleBadge = p.role==='pro' ? '<span style="font-size:9px;color:#74c6d0;border:1px solid rgba(116,198,210,.3);border-radius:4px;padding:1px 5px">PRO</span>'
                          : p.role==='plus' ? '<span style="font-size:9px;color:#c8a23e;border:1px solid rgba(200,162,62,.3);border-radius:4px;padding:1px 5px">PLUS</span>'
                          : '<span style="font-size:9px;color:rgba(255,255,255,.25);border:1px solid rgba(255,255,255,.1);border-radius:4px;padding:1px 5px">USER</span>';
            var em = (p.email||'').replace(/'/g,"\\'");
            return '<div style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05)">'
              +'<div style="display:flex;align-items:center;gap:8px">'
              +'<div style="flex:1;min-width:0">'
              +'<div style="font-size:12px;font-weight:600;color:rgba(255,255,255,.7);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+_escHtml(p.nombre||p.email||'Usuario')+'</div>'
              +'<div style="font-size:10px;color:rgba(255,255,255,.3)">'+_escHtml(p.email||'')+'</div>'
              +'</div>'
              +roleBadge
              +'<div style="font-size:10px;color:rgba(255,255,255,.25);white-space:nowrap">'+fecha+'</div>'
              +'</div>'
              +(tcDate?'<div style="font-size:9px;color:rgba(116,198,157,.5);margin-top:2px">📜 Términos aceptados: '+tcDate+'</div>':'')
              +'<div style="display:flex;gap:6px;margin-top:5px">'
              +(p.email?'<button onclick="pAdminSendPasswordReset(\''+em+'\')" style="font-size:9px;padding:2px 7px;background:rgba(116,198,157,.12);border:1px solid rgba(116,198,157,.25);color:rgba(116,198,157,.8);border-radius:5px;cursor:pointer">🔑 Reset</button>':'')
              +(p.id?'<button onclick="pAdminDeleteUser(\''+p.id+'\',\''+em+'\')" style="font-size:9px;padding:2px 7px;background:rgba(231,76,60,.12);border:1px solid rgba(231,76,60,.25);color:rgba(231,120,110,.85);border-radius:5px;cursor:pointer">🗑️ Eliminar</button>':'')
              +'</div>'
              +'</div>';
          }).join('')
        +'</div>'
      );
    }
  }

  // ── Admin content panels — tab-based ─────────────────────────
  if(content){

    content.innerHTML = _adminTabBarHtml() + '<div id="adminTabPanel"></div>';
    _switchAdminTab(_adminActiveTab || 'moderacion');

    // ── DEAD CODE GUARD (unreachable — kept for linter) ──
    if(false){
      sbClient.from('moderation_flags').select('*').eq('resolved',false).order('created_at',{ascending:false}).limit(20)
        .then(function(res){
          if(!res.data || !res.data.length) return;
          var alertsHtml = '<div style="background:rgba(220,50,50,.08);border:1px solid rgba(220,50,50,.2);border-radius:12px;padding:14px;margin-bottom:14px">'
            +'<div style="font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(220,100,100,.8);margin-bottom:10px">🚨 ALERTAS DE MODERACIÓN IA ('+res.data.length+')</div>'
            + res.data.map(function(f){
                var t = new Date(f.created_at).toLocaleString('es',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
                var isPro = (f.section||'').indexOf('pro') > -1 || (f.section||'').indexOf('profesional') > -1;
                var targetLabel = isPro ? 'profesional' : 'usuario';
                return '<div id="modflag-'+f.id+'" style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,.05)">'
                  +'<div style="font-size:11px;font-weight:700;color:rgba(255,150,150,.9)">'+_escHtml(f.tipo||'abuso')+' · '+_escHtml(f.section||'')+'</div>'
                  +'<div style="font-size:11px;color:rgba(255,255,255,.45);margin-top:2px">"'+_escHtml((f.content||'').slice(0,100))+'"</div>'
                  +'<div style="font-size:10px;color:rgba(255,255,255,.25);margin-top:2px">'+t+(f.user_id?' · uid:'+String(f.user_id).slice(0,8):'')+'</div>'
                  +'<div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:7px">'
                  +'<button onclick="pAdminModerateFlag(\''+f.id+'\',\'accept\')" style="font-size:10px;padding:4px 9px;background:rgba(116,198,157,.15);border:1px solid rgba(116,198,157,.3);border-radius:6px;color:rgba(116,198,157,.85);cursor:pointer">✓ Aceptar</button>'
                  +'<button onclick="pAdminModerateFlag(\''+f.id+'\',\'alert\')" style="font-size:10px;padding:4px 9px;background:rgba(230,180,40,.15);border:1px solid rgba(230,180,40,.3);border-radius:6px;color:rgba(240,200,90,.9);cursor:pointer">⚠️ Alertar '+targetLabel+'</button>'
                  +'<button onclick="pAdminModerateFlag(\''+f.id+'\',\'delete\')" style="font-size:10px;padding:4px 9px;background:rgba(231,76,60,.15);border:1px solid rgba(231,76,60,.3);border-radius:6px;color:rgba(231,120,110,.9);cursor:pointer">🗑️ Eliminar</button>'
                  +'<button onclick="pAdminModerateFlag(\''+f.id+'\',\'alertdelete\')" style="font-size:10px;padding:4px 9px;background:rgba(231,76,60,.1);border:1px solid rgba(231,76,60,.25);border-radius:6px;color:rgba(231,120,110,.75);cursor:pointer">⚠️+🗑️</button>'
                  +'</div>'
                  +'</div>';
              }).join('')
            +'</div>';
          content.insertAdjacentHTML('afterbegin', alertsHtml);
        }).catch(function(){});
    }

  }
}

// ── ADMIN TAB SYSTEM ─────────────────────────────────────────────────────
var _adminActiveTab = 'moderacion';

function _adminTabBarHtml(){
  var tabs = [
    { id:'moderacion', icon:'🚨', label:'Moderación' },
    { id:'mensajes',   icon:'📢', label:'Mensajes' },
    { id:'usuarios',   icon:'👥', label:'Usuarios' },
    { id:'finanzas',   icon:'💰', label:'Finanzas' },
    { id:'privacidad', icon:'🔒', label:'Privacidad' },
    { id:'gestion',    icon:'⚙️', label:'Gestión' },
  ];
  return '<div id="adminTabBar" style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,.1)">'
    + tabs.map(function(t){
        var active = _adminActiveTab === t.id;
        return '<button class="admin-tab-btn" data-tab="'+t.id+'" onclick="_switchAdminTab(\''+t.id+'\')" style="font-size:11px;padding:6px 13px;border-radius:100px;cursor:pointer;font-family:\'Jost\',sans-serif;font-weight:700;white-space:nowrap;transition:all .18s;'
          +(active
            ? 'background:rgba(116,198,157,.22);border:1.5px solid rgba(116,198,157,.48);color:rgba(255,255,255,.9)'
            : 'background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.4)')
          +'">'+t.icon+' '+t.label+'</button>';
      }).join('')
    +'</div>';
}

function _switchAdminTab(tab){
  _adminActiveTab = tab;
  document.querySelectorAll('.admin-tab-btn').forEach(function(b){
    var act = b.dataset.tab === tab;
    b.style.background  = act ? 'rgba(116,198,157,.22)' : 'rgba(255,255,255,.05)';
    b.style.borderColor = act ? 'rgba(116,198,157,.48)'  : 'rgba(255,255,255,.1)';
    b.style.color       = act ? 'rgba(255,255,255,.9)'   : 'rgba(255,255,255,.4)';
  });
  var panel = document.getElementById('adminTabPanel');
  if(!panel) return;
  panel.innerHTML = '<div style="text-align:center;padding:20px;font-size:12px;color:rgba(255,255,255,.25)">Cargando…</div>';
  var map = {
    moderacion: _adminTabModeracion,
    mensajes:   _adminTabMensajes,
    usuarios:   _adminTabUsuarios,
    finanzas:   _adminTabFinanzas,
    privacidad: _adminTabPrivacidad,
    gestion:    _adminTabGestion,
  };
  if(map[tab]) map[tab](panel);
}

// ── TAB: MODERACIÓN ───────────────────────────────────────────────────
async function _adminTabModeracion(panel){
  _initSupabase();
  var flags = [], reports = [];
  if(sbClient){
    try{ var fRes = await sbClient.from('moderation_flags').select('*').eq('resolved',false).order('created_at',{ascending:false}).limit(50); flags = (!fRes.error&&fRes.data)?fRes.data:[]; }catch(e){}
    try{ var rRes = await sbClient.from('reportes').select('*').eq('estado','abierto').order('created_at',{ascending:false}).limit(50); reports = (!rRes.error&&rRes.data)?rRes.data:[]; }catch(e){}
  }
  var audit = []; try{ audit = JSON.parse(safeLS('get','velo_audit_log')||'[]'); }catch(e){}
  var crisisLocal = audit.filter(function(a){ return a.tipo==='crisis_detect'; });
  var html = '';

  if(flags.length){
    html += '<div style="background:rgba(220,50,50,.07);border:1px solid rgba(220,50,50,.2);border-radius:14px;padding:14px;margin-bottom:14px">'
      +'<div style="font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(220,100,100,.85);margin-bottom:10px">🤖 ALERTAS IA ('+flags.length+')</div>'
      + flags.map(function(f){
          var t = new Date(f.created_at).toLocaleString('es',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
          var uid = _escHtml(f.user_id||'');
          return '<div id="modflag-'+f.id+'" style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,.05)">'
            +'<div style="font-size:11px;font-weight:700;color:rgba(255,150,150,.9)">'+_escHtml(f.tipo||'abuso')+' · '+_escHtml(f.section||'')+'</div>'
            +'<div style="font-size:11px;color:rgba(255,255,255,.5);margin:3px 0;font-style:italic">"'+_escHtml((f.content||'').slice(0,180))+'"</div>'
            +'<div style="font-size:10px;color:rgba(255,255,255,.25)">'+t+(uid?' · uid:'+uid.slice(0,8):'')+'</div>'
            +'<div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:7px">'
            +'<button onclick="pAdminModerateFlag(\''+f.id+'\',\'accept\')" style="font-size:10px;padding:4px 9px;background:rgba(116,198,157,.15);border:1px solid rgba(116,198,157,.3);border-radius:6px;color:rgba(116,198,157,.85);cursor:pointer">✓ Resolver</button>'
            +(uid?'<button onclick="pAdminWarnUser(\''+uid+'\',\'\')" style="font-size:10px;padding:4px 9px;background:rgba(230,180,40,.15);border:1px solid rgba(230,180,40,.3);border-radius:6px;color:rgba(240,200,90,.9);cursor:pointer">⚠️ Advertir</button>':'')
            +'<button onclick="pAdminModerateFlag(\''+f.id+'\',\'delete\')" style="font-size:10px;padding:4px 9px;background:rgba(231,76,60,.15);border:1px solid rgba(231,76,60,.3);border-radius:6px;color:rgba(231,120,110,.9);cursor:pointer">🗑️ Eliminar</button>'
            +'<button onclick="pAdminModerateFlag(\''+f.id+'\',\'alertdelete\')" style="font-size:10px;padding:4px 9px;background:rgba(231,76,60,.1);border:1px solid rgba(231,76,60,.25);border-radius:6px;color:rgba(231,120,110,.75);cursor:pointer">⚠️+🗑️</button>'
            +'</div></div>';
        }).join('')+'</div>';
  }

  if(reports.length){
    html += '<div style="background:rgba(230,130,40,.07);border:1px solid rgba(230,130,40,.2);border-radius:14px;padding:14px;margin-bottom:14px">'
      +'<div style="font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(240,160,80,.85);margin-bottom:10px">🚩 REPORTADOS POR USUARIOS ('+reports.length+')</div>'
      + reports.map(function(r){
          var t = new Date(r.created_at||r.fecha||Date.now()).toLocaleString('es',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
          var ruid = _escHtml(r.reported_user_id||r.user_id||'');
          var cid  = _escHtml(r.content_id||'');
          var ctype= _escHtml(r.content_type||r.categoria||'');
          return '<div id="report-'+r.id+'" style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,.05)">'
            +'<div style="font-size:11px;font-weight:700;color:rgba(255,190,100,.9)">'+_escHtml(r.categoria||r.tipo||'reporte')+'</div>'
            +'<div style="font-size:11px;color:rgba(255,255,255,.5);margin:3px 0">'+_escHtml((r.descripcion||r.motivo||r.texto||'').slice(0,180))+'</div>'
            +'<div style="font-size:10px;color:rgba(255,255,255,.25)">'+t+(ruid?' · uid:'+ruid.slice(0,8):'')+'</div>'
            +'<div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:7px">'
            +'<button onclick="pAdminResolveReport(\''+r.id+'\')" style="font-size:10px;padding:4px 9px;background:rgba(116,198,157,.15);border:1px solid rgba(116,198,157,.3);border-radius:6px;color:rgba(116,198,157,.85);cursor:pointer">✓ Resolver</button>'
            +(ruid?'<button onclick="pAdminWarnUser(\''+ruid+'\',\'\')" style="font-size:10px;padding:4px 9px;background:rgba(230,180,40,.15);border:1px solid rgba(230,180,40,.3);border-radius:6px;color:rgba(240,200,90,.9);cursor:pointer">⚠️ Advertir</button>':'')
            +(cid?'<button onclick="pAdminDeleteContent(\''+cid+'\',\''+ctype+'\')" style="font-size:10px;padding:4px 9px;background:rgba(231,76,60,.15);border:1px solid rgba(231,76,60,.3);border-radius:6px;color:rgba(231,120,110,.9);cursor:pointer">🗑️ Eliminar</button>':'')
            +'</div></div>';
        }).join('')+'</div>';
  }

  if(!flags.length && !reports.length){
    html += '<div style="text-align:center;padding:28px;font-size:13px;color:rgba(116,198,157,.7)">✅ Sin alertas ni reportes pendientes</div>';
  }

  html += '<div id="adminCrisisSupabase" style="margin-bottom:14px"><p style="font-size:11px;color:rgba(255,255,255,.3)">Cargando alertas de crisis…</p></div>';

  if(crisisLocal.length){
    html += '<div style="font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(255,80,80,.85);margin-bottom:10px">🆘 CRISIS (local)</div>'
      + crisisLocal.slice(0,10).map(function(a,i){
          var ds = new Date(a.ts).toLocaleDateString('es',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
          var nc = a.nivel==='alto'?'#ff4444':'#ffbb33';
          return '<div style="background:rgba(220,50,50,.08);border:1px solid rgba(220,50,50,.25);border-radius:10px;padding:12px;margin-bottom:8px">'
            +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">'
            +'<span style="font-size:11px;font-weight:700;color:'+nc+'">'+(a.nivel==='alto'?'🔴 ALTO':'🟡 MEDIO')+'</span>'
            +'<span style="font-size:10px;color:rgba(255,255,255,.3)">'+ds+'</span></div>'
            +(a.motivo?'<div style="font-size:11px;color:rgba(255,255,255,.55);margin-bottom:4px">'+_escHtml(a.motivo)+'</div>':'')
            +(a.detail?'<div style="font-size:11px;color:rgba(255,255,255,.35);font-style:italic;margin-bottom:8px">"'+_escHtml(a.detail)+'"</div>':'')
            +(a.resolved?'<span style="font-size:10px;color:rgba(116,198,157,.7);font-weight:700">✓ Atendida</span>'
              :'<button onclick="pResolveCrisis('+i+')" style="font-size:10px;padding:4px 10px;background:rgba(116,198,157,.15);border:1px solid rgba(116,198,157,.3);color:rgba(116,198,157,.85);border-radius:6px;cursor:pointer;font-family:\'Jost\',sans-serif">Marcar atendida</button>')
            +'</div>';
        }).join('');
  }

  if(audit.length){
    html += '<div style="margin-top:14px;font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(220,80,80,.7);margin-bottom:10px">🛡️ AUDITORÍA IA</div>'
      + audit.slice(0,30).map(function(a,i){
          var typeLabel = {report_circle:'Reporte en círculo',ban_user:'Usuario baneado',abuse_detect:'Detección IA',flag_bottle:'Botella reportada',flag_help:'Ayuda reportada'}[a.tipo]||a.tipo;
          var ds = new Date(a.ts).toLocaleDateString('es',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
          return '<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.06)">'
            +'<div style="font-size:18px;flex-shrink:0">'+(a.tipo==='report_circle'?'⚠️':a.tipo==='abuse_detect'?'🤖':'🚩')+'</div>'
            +'<div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:700;color:rgba(255,255,255,.82)">'+typeLabel+'</div>'
            +(a.motivo?'<div style="font-size:11px;color:rgba(255,255,255,.38)">'+_escHtml(a.motivo)+'</div>':'')
            +(a.detail?'<div style="font-size:11px;color:rgba(255,255,255,.3);font-style:italic">'+_escHtml(a.detail)+'</div>':'')
            +'<div style="font-size:10px;color:rgba(255,255,255,.28)">'+ds+'</div></div>'
            +'<div>'+(a.resolved?'<span style="font-size:10px;color:rgba(116,198,157,.7);font-weight:700">✓</span>'
              :'<button onclick="pResolveAudit('+i+')" style="font-size:10px;padding:3px 8px;background:rgba(116,198,157,.15);border:1px solid rgba(116,198,157,.3);color:rgba(116,198,157,.8);border-radius:6px;cursor:pointer;font-family:\'Jost\',sans-serif">Resolver</button>')
            +'</div></div>';
        }).join('');
  }

  html += '<div style="margin-top:14px;background:rgba(180,140,220,.07);border:1px solid rgba(180,140,220,.2);border-radius:14px;padding:14px">'
    +'<div style="font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(180,140,220,.7);margin-bottom:10px">🤖 HERRAMIENTAS IA</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">'
    +'<button onclick="pRunAiScan()" style="padding:10px;background:rgba(116,198,157,.1);border:1px solid rgba(116,198,157,.2);border-radius:10px;color:rgba(116,198,157,.8);font-size:11px;font-weight:700;font-family:\'Jost\',sans-serif;cursor:pointer">🔍 Escanear</button>'
    +'<button onclick="pViewPatterns()" style="padding:10px;background:rgba(200,150,80,.1);border:1px solid rgba(200,150,80,.2);border-radius:10px;color:rgba(200,150,80,.8);font-size:11px;font-weight:700;font-family:\'Jost\',sans-serif;cursor:pointer">📊 Patrones</button>'
    +'</div>'
    +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">'
    +'<div><div style="font-size:12px;font-weight:700;color:rgba(255,255,255,.7)">🧠 Análisis de situación</div>'
    +'<div style="font-size:11px;color:rgba(255,255,255,.35)">Gemini revisa el estado general</div></div>'
    +'<button id="adminSituationBtn" onclick="pAdminAiSituationAnalysis()" style="padding:7px 13px;background:rgba(180,140,220,.2);border:1px solid rgba(180,140,220,.35);border-radius:9px;color:rgba(180,140,220,.95);font-size:11px;font-weight:700;font-family:\'Jost\',sans-serif;cursor:pointer">Analizar</button>'
    +'</div><div id="adminSituationResult"></div></div>';

  panel.innerHTML = html;
  _loadAdminCrisisFromSupabase();
}

// ── TAB: MENSAJES ─────────────────────────────────────────────────────
function _adminTabMensajes(panel){
  var broadcasts = []; try{ broadcasts = JSON.parse(safeLS('get','velo_broadcasts')||'[]'); }catch(e){}
  panel.innerHTML = '<div style="font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(200,162,0,.7);margin-bottom:10px">🔑 CONTRASEÑAS PROVISIONALES</div>'
    +'<div style="background:rgba(200,162,0,.06);border:1px solid rgba(200,162,0,.18);border-radius:12px;padding:14px;margin-bottom:16px">'
    +'<p style="font-size:11px;color:rgba(255,255,255,.4);margin-bottom:10px;line-height:1.5">Contraseña temporal para usuario que no puede recuperar su cuenta. Válida 72 horas.</p>'
    +'<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">'
    +'<input class="p-input" id="adminProvEmail" type="email" placeholder="correo@usuario.com" style="flex:1;background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.15);color:#fff" />'
    +'<button onclick="pCreateProvisionalPass()" style="padding:8px 14px;background:rgba(200,162,0,.2);border:1px solid rgba(200,162,0,.35);color:rgba(200,162,0,.9);border-radius:8px;cursor:pointer;font-family:\'Jost\',sans-serif;font-size:12px;font-weight:700;white-space:nowrap">Crear</button>'
    +'</div><div id="adminProvResult" style="font-size:12px;color:rgba(116,198,157,.8)"></div></div>'

    +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">'
    +'<div style="font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(116,198,157,.6)">💌 MENSAJES DE CONTACTO</div>'
    +'<button onclick="sbLoadContacts().then(function(d){ _renderAdminContactsList(d||[]); })" style="font-size:10px;padding:3px 8px;background:rgba(116,198,157,.08);border:1px solid rgba(116,198,157,.2);border-radius:6px;color:rgba(116,198,157,.6);cursor:pointer;font-family:\'Jost\',sans-serif">↻ Actualizar</button>'
    +'</div>'
    +'<div id="adminContactsList"><p style="font-size:12px;color:rgba(255,255,255,.3);padding:12px 0">Cargando mensajes…</p></div>'

    +'<div style="margin-top:20px;font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(116,198,157,.6);margin-bottom:10px">📢 MENSAJES MASIVOS</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">'
    +'<button onclick="pAdminMassMessage(\'users\')" style="padding:14px;background:rgba(116,198,157,.1);border:1.5px solid rgba(116,198,157,.25);border-radius:14px;color:rgba(116,198,157,.9);font-family:\'Jost\',sans-serif;font-size:13px;font-weight:700;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px"><span style="font-size:24px">👥</span>Usuarios</button>'
    +'<button onclick="pAdminMassMessage(\'pros\')" style="padding:14px;background:rgba(200,162,0,.08);border:1.5px solid rgba(200,162,0,.2);border-radius:14px;color:rgba(200,162,0,.9);font-family:\'Jost\',sans-serif;font-size:13px;font-weight:700;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px"><span style="font-size:24px">🩺</span>Profesionales</button>'
    +'</div>'
    +(broadcasts.length
      ? '<div style="font-size:10px;font-weight:700;color:rgba(255,255,255,.3);letter-spacing:1px;margin-bottom:8px">HISTORIAL</div>'
        + broadcasts.slice(0,8).map(function(b){
            var ds = new Date(b.ts).toLocaleDateString('es',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
            var imgTag = b.imageUrl ? '<img src="'+_escHtml(b.imageUrl)+'" style="width:100%;max-height:80px;object-fit:cover;border-radius:6px;margin-top:4px" onerror="this.remove()">' : '';
            return '<div style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05)">'
              +'<div style="display:flex;align-items:flex-start;gap:8px"><span style="font-size:16px;flex-shrink:0">'+(b.target==='pros'?'🩺':'👥')+'</span>'
              +'<div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:600;color:rgba(255,255,255,.75)">'+_escHtml(b.subject)+'</div>'
              +'<div style="font-size:10px;color:rgba(255,255,255,.3)">'+ds+' · '+(b.target==='pros'?'Profesionales':'Usuarios')+'</div>'
              +imgTag+'</div></div></div>';
          }).join('')
      : '');

  sbLoadContacts().then(function(sbMsgs){
    if(sbMsgs) _renderAdminContactsList(sbMsgs);
    else{ var local=[]; try{local=JSON.parse(safeLS('get','velo_admin_contacts')||'[]');}catch(e){} _renderAdminContactsList(local); }
  });
}

// ── TAB: USUARIOS ────────────────────────────────────────────────────
async function _adminTabUsuarios(panel){
  panel.innerHTML = '<p style="font-size:11px;color:rgba(255,255,255,.3);padding:10px 0">Cargando registros…</p>';
  _initSupabase();
  var allProfiles = [], deletedCount = 0;
  if(sbClient){
    try{ var pRes=await sbClient.from('profiles').select('id,role,created_at,nombre,email,username,terms_accepted_at').order('created_at',{ascending:false}).limit(500); if(!pRes.error&&pRes.data) allProfiles=pRes.data; }catch(e){}
    try{ var dRes=await sbClient.from('deleted_accounts').select('id',{count:'exact',head:true}); if(!dRes.error) deletedCount=dRes.count||0; }catch(e){}
  }
  var users = allProfiles.filter(function(p){ return p.role!=='pro'; });
  var pros  = allProfiles.filter(function(p){ return p.role==='pro'; });

  function profileRow(p){
    var fecha = p.created_at?new Date(p.created_at).toLocaleString('es',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
    var tc = p.terms_accepted_at?new Date(p.terms_accepted_at).toLocaleDateString('es',{day:'2-digit',month:'short',year:'numeric'}):'—';
    var em = (p.email||'').replace(/'/g,"\\'");
    var roleBadge = p.role==='pro'?'<span style="font-size:9px;color:#74c6d0;border:1px solid rgba(116,198,210,.35);border-radius:4px;padding:1px 5px">PRO</span>'
                  :p.role==='plus'?'<span style="font-size:9px;color:#c8a23e;border:1px solid rgba(200,162,62,.35);border-radius:4px;padding:1px 5px">PLUS</span>'
                  :'<span style="font-size:9px;color:rgba(255,255,255,.25);border:1px solid rgba(255,255,255,.1);border-radius:4px;padding:1px 5px">USER</span>';
    return '<div style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,.06)">'
      +'<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><div style="flex:1;min-width:0">'
      +'<div style="font-size:12px;font-weight:600;color:rgba(255,255,255,.8)">'+_escHtml(p.nombre||p.email||'—')+'</div>'
      +'<div style="font-size:10px;color:rgba(255,255,255,.35)">@'+_escHtml(p.username||'—')+' · '+_escHtml(p.email||'')+'</div>'
      +'<div style="font-size:9px;color:rgba(255,255,255,.22);margin-top:1px">Registro: '+fecha+' · 📜 T&C: '+tc+'</div>'
      +'</div>'+roleBadge+'</div>'
      +'<div style="display:flex;gap:5px;margin-top:6px;flex-wrap:wrap">'
      +(p.email?'<button onclick="pAdminSendPasswordReset(\''+em+'\')" style="font-size:9px;padding:2px 7px;background:rgba(116,198,157,.12);border:1px solid rgba(116,198,157,.25);color:rgba(116,198,157,.8);border-radius:5px;cursor:pointer">🔑 Reset</button>':'')
      +(p.id?'<button onclick="pAdminWarnUser(\''+p.id+'\',\''+em+'\')" style="font-size:9px;padding:2px 7px;background:rgba(230,180,40,.12);border:1px solid rgba(230,180,40,.25);color:rgba(240,200,90,.8);border-radius:5px;cursor:pointer">⚠️ Advertir</button>':'')
      +(p.id?'<button onclick="pAdminDeleteUser(\''+p.id+'\',\''+em+'\')" style="font-size:9px;padding:2px 7px;background:rgba(231,76,60,.12);border:1px solid rgba(231,76,60,.25);color:rgba(231,120,110,.85);border-radius:5px;cursor:pointer">🗑️ Eliminar</button>':'')
      +'</div></div>';
  }

  var html = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px">'
    +'<div class="a-card"><div style="font-size:20px;margin-bottom:2px">👥</div><div class="a-card-n">'+users.length+'</div><div class="a-card-l">Usuarios</div></div>'
    +'<div class="a-card"><div style="font-size:20px;margin-bottom:2px">🩺</div><div class="a-card-n" style="color:rgba(116,198,200,.8)">'+pros.length+'</div><div class="a-card-l">Profesionales</div></div>'
    +'<div class="a-card"><div style="font-size:20px;margin-bottom:2px">🗑️</div><div class="a-card-n" style="color:rgba(220,80,80,.7)">'+deletedCount+'</div><div class="a-card-l">Eliminadas</div></div>'
    +'</div>'
    +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:8px 12px">'
    +'<span style="font-size:15px">🔍</span>'
    +'<input id="userSearch" type="text" placeholder="Buscar por nombre, @usuario o email…" oninput="_filterUserList(this.value)" style="flex:1;background:none;border:none;outline:none;color:#fff;font-size:12px;font-family:\'Jost\',sans-serif" />'
    +'</div>'
    +'<div style="font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(116,198,157,.6);margin-bottom:8px">👥 USUARIOS ('+users.length+')</div>'
    +'<div id="adminUserList">'+(users.length?users.map(profileRow).join(''):'<p style="font-size:12px;color:rgba(255,255,255,.3);font-style:italic">Sin usuarios</p>')+'</div>'
    +'<div style="margin-top:18px;font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(116,198,200,.7);margin-bottom:8px">🩺 PROFESIONALES ('+pros.length+')</div>'
    +'<div id="adminProList">'+(pros.length?pros.map(profileRow).join(''):'<p style="font-size:12px;color:rgba(255,255,255,.3);font-style:italic">Sin profesionales</p>')+'</div>'
    +'<div style="margin-top:20px"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">'
    +'<div style="font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(116,198,157,.6)">📜 ACEPTACIÓN DE TÉRMINOS</div>'
    +'<button onclick="pAdminLoadConsent()" style="font-size:10px;padding:3px 8px;background:rgba(116,198,157,.08);border:1px solid rgba(116,198,157,.2);border-radius:6px;color:rgba(116,198,157,.6);cursor:pointer;font-family:\'Jost\',sans-serif">↻ Actualizar</button>'
    +'</div>'
    +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:8px 12px">'
    +'<span style="font-size:15px">🔍</span>'
    +'<input id="consentSearch" type="text" placeholder="Buscar por nombre o email…" oninput="_filterConsentLog(this.value)" style="flex:1;background:none;border:none;outline:none;color:#fff;font-size:12px;font-family:\'Jost\',sans-serif" />'
    +'</div>'
    +'<div id="adminConsentLog"><p style="font-size:12px;color:rgba(255,255,255,.3)">Cargando registros…</p></div>'
    +'</div>'
    +'<div style="margin-top:16px;text-align:center">'
    +'<button onclick="_switchAdminTab(\'privacidad\')" style="padding:10px 18px;background:rgba(180,140,220,.15);border:1.5px solid rgba(180,140,220,.3);border-radius:12px;color:rgba(180,140,220,.9);font-size:12px;font-weight:700;font-family:\'Jost\',sans-serif;cursor:pointer">🔒 Solicitudes GDPR / Ley 25.326 →</button>'
    +'</div>';

  panel.innerHTML = html;
  panel._allProfiles = allProfiles;
  pAdminLoadConsent();
}

function _filterUserList(q){
  var panel = document.getElementById('adminTabPanel');
  if(!panel||!panel._allProfiles) return;
  var all = panel._allProfiles;
  q = (q||'').toLowerCase().trim();
  function match(p){ return !q||(p.nombre||'').toLowerCase().includes(q)||(p.email||'').toLowerCase().includes(q)||(p.username||'').toLowerCase().includes(q); }
  function row(p){
    var fecha = p.created_at?new Date(p.created_at).toLocaleString('es',{day:'2-digit',month:'short',year:'numeric'}):'—';
    var tc = p.terms_accepted_at?new Date(p.terms_accepted_at).toLocaleDateString('es',{day:'2-digit',month:'short',year:'numeric'}):'—';
    var em = (p.email||'').replace(/'/g,"\\'");
    return '<div style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,.06)">'
      +'<div style="font-size:12px;font-weight:600;color:rgba(255,255,255,.8)">'+_escHtml(p.nombre||p.email||'—')+'</div>'
      +'<div style="font-size:10px;color:rgba(255,255,255,.35)">@'+_escHtml(p.username||'—')+' · '+_escHtml(p.email||'')+'</div>'
      +'<div style="font-size:9px;color:rgba(255,255,255,.22)">Registro: '+fecha+' · 📜 T&C: '+tc+'</div>'
      +'<div style="display:flex;gap:5px;margin-top:5px">'
      +(p.email?'<button onclick="pAdminSendPasswordReset(\''+em+'\')" style="font-size:9px;padding:2px 7px;background:rgba(116,198,157,.12);border:1px solid rgba(116,198,157,.25);color:rgba(116,198,157,.8);border-radius:5px;cursor:pointer">🔑 Reset</button>':'')
      +(p.id?'<button onclick="pAdminWarnUser(\''+p.id+'\',\''+em+'\')" style="font-size:9px;padding:2px 7px;background:rgba(230,180,40,.12);border:1px solid rgba(230,180,40,.25);color:rgba(240,200,90,.8);border-radius:5px;cursor:pointer">⚠️ Advertir</button>':'')
      +(p.id?'<button onclick="pAdminDeleteUser(\''+p.id+'\',\''+em+'\')" style="font-size:9px;padding:2px 7px;background:rgba(231,76,60,.12);border:1px solid rgba(231,76,60,.25);color:rgba(231,120,110,.85);border-radius:5px;cursor:pointer">🗑️ Eliminar</button>':'')
      +'</div></div>';
  }
  var users = all.filter(function(p){ return p.role!=='pro' && match(p); });
  var pros  = all.filter(function(p){ return p.role==='pro'  && match(p); });
  var uEl=document.getElementById('adminUserList'); var pEl=document.getElementById('adminProList');
  if(uEl) uEl.innerHTML=users.length?users.map(row).join(''):'<p style="font-size:12px;color:rgba(255,255,255,.3);font-style:italic">Sin resultados</p>';
  if(pEl) pEl.innerHTML=pros.length ?pros.map(row).join(''):'<p style="font-size:12px;color:rgba(255,255,255,.3);font-style:italic">Sin resultados</p>';
}

// ── TAB: FINANZAS ────────────────────────────────────────────────────
function _adminPageViewStats(){
  var data = {}; try{ data = JSON.parse(safeLS('get','velo_page_views')||'{}'); }catch(e){}
  var labels = {
    home:'🏠 Inicio', guardians:'🛡️ Guardianes', 'calm-ai':'🌿 Acompañante IA',
    bottle:'🌊 Al Mar', help:'🤝 Sala de Ayuda', diary:'📔 Diario', news:'📰 Noticias',
    circles:'⭕ Círculos', profile:'👤 Perfil', professionals:'🩺 Profesionales',
    sos:'🆘 SOS', 'happy-wall':'☀️ Muro Felicidad'
  };
  var entries = Object.keys(data).filter(function(k){ return k !== '__total' && k !== '__lastSeen'; });
  entries.sort(function(a,b){ return (data[b]||0)-(data[a]||0); });
  if(!entries.length) return '<p style="font-size:11px;color:rgba(255,255,255,.3)">Sin datos aún — los registros se acumulan con el uso de la app.</p>';
  var total = data.__total || 1;
  var lastSeen = data.__lastSeen ? new Date(data.__lastSeen).toLocaleString('es',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '—';
  return '<div style="font-size:10px;color:rgba(255,255,255,.3);margin-bottom:10px">Última actividad: '+lastSeen+' · Total navegaciones: '+total+'</div>'
    +'<div style="display:flex;flex-direction:column;gap:6px">'
    +entries.map(function(k){
      var v = data[k]||0;
      var pct = Math.round(v/total*100);
      var label = labels[k]||k;
      return '<div style="background:rgba(255,255,255,.04);border-radius:10px;padding:8px 12px">'
        +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">'
        +'<span style="font-size:12px;color:rgba(255,255,255,.7)">'+label+'</span>'
        +'<span style="font-size:12px;font-weight:700;color:rgba(116,198,157,.9)">'+v+' <span style="font-size:10px;color:rgba(255,255,255,.3)">('+pct+'%)</span></span>'
        +'</div>'
        +'<div style="height:4px;background:rgba(255,255,255,.08);border-radius:2px">'
        +'<div style="height:4px;background:rgba(116,198,157,.6);border-radius:2px;width:'+Math.min(pct,100)+'%"></div>'
        +'</div></div>';
    }).join('')
    +'</div>';
}

function _adminTabFinanzas(panel){
  panel.innerHTML = '<div style="font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(116,198,157,.7);margin-bottom:10px">📊 TRÁFICO WEB · VERCEL ANALYTICS</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">'
    +'<a href="https://vercel.com/dashboard" target="_blank" rel="noopener noreferrer" style="display:block;padding:12px 14px;background:rgba(0,0,0,.4);border:1.5px solid rgba(255,255,255,.12);border-radius:12px;color:#fff;text-decoration:none;text-align:center">'
    +'<div style="font-size:20px;margin-bottom:4px">📈</div>'
    +'<div style="font-size:11px;font-weight:700">Ver Analytics</div>'
    +'<div style="font-size:9px;color:rgba(255,255,255,.4);margin-top:2px">Visitas · Países · Dispositivos</div>'
    +'</a>'
    +'<a href="https://vercel.com/dashboard" target="_blank" rel="noopener noreferrer" style="display:block;padding:12px 14px;background:rgba(0,0,0,.4);border:1.5px solid rgba(255,255,255,.12);border-radius:12px;color:#fff;text-decoration:none;text-align:center">'
    +'<div style="font-size:20px;margin-bottom:4px">⚡</div>'
    +'<div style="font-size:11px;font-weight:700">Speed Insights</div>'
    +'<div style="font-size:9px;color:rgba(255,255,255,.4);margin-top:2px">Core Web Vitals · LCP · CLS</div>'
    +'</a>'
    +'</div>'
    +'<div style="font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(116,198,157,.7);margin-bottom:10px">🗺️ SECCIONES MÁS VISITADAS (este dispositivo)</div>'
    +'<div id="adminPageStats">'+_adminPageViewStats()+'</div>'
    +'<div style="margin-top:18px;font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(200,162,0,.7);margin-bottom:10px">💰 INGRESOS Y DONACIONES</div>'
    +'<div id="adminDonations"><p style="font-size:11px;color:rgba(255,255,255,.3);padding:8px 0">Cargando…</p></div>'
    +'<div style="margin-top:18px;font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(200,162,0,.7);margin-bottom:10px">💳 TRANSFERENCIAS PENDIENTES</div>'
    +'<div id="adminTransferList">'+_adminTransferHtml()+'</div>'
    +'<div style="margin-top:18px">'+_adminMonthlyReportTracker()+'</div>'
    +'<div style="margin-top:18px;font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(116,198,157,.6);margin-bottom:10px">📊 ENCUESTAS DE SATISFACCIÓN</div>'
    +_renderSurveyResults();
  _renderAdminDonations();
}

function _adminTransferHtml(){
  var transfers=[]; try{transfers=JSON.parse(safeLS('get','velo_pending_transfers')||'[]');}catch(e){}
  var pending=transfers.filter(function(t){ return t.ended&&!t.paid; });
  if(!pending.length) return '<p style="font-size:12px;color:rgba(255,255,255,.3);padding:8px 0">Sin transferencias pendientes.</p>';
  return pending.map(function(t,i){
    var pro=_proData.find(function(p){ return p.id===t.proId; });
    var proAmt=Math.round((t.amount||0)*0.8*100)/100;
    var veloAmt=Math.round((t.amount||0)*0.2*100)/100;
    return '<div style="background:rgba(200,162,0,.07);border:1px solid rgba(200,162,0,.2);border-radius:12px;padding:14px;margin-bottom:8px">'
      +'<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px"><div style="font-size:22px">'+(pro?pro.av:'🩺')+'</div>'
      +'<div style="flex:1"><div style="font-size:13px;font-weight:700;color:rgba(255,255,255,.82)">'+(pro?pro.name:'Profesional')+'</div>'
      +'<div style="font-size:11px;color:rgba(255,255,255,.4)">'+new Date(t.ts).toLocaleDateString('es',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})+'</div></div>'
      +'<div style="text-align:right"><div style="font-size:16px;font-weight:800;color:rgba(200,162,0,.9)">$'+t.amount+' '+(t.currency||'USD')+'</div>'
      +'<div style="font-size:10px;color:rgba(255,255,255,.3)">Pro: $'+proAmt+' · Velo: $'+veloAmt+'</div></div></div>'
      +'<button onclick="pApproveTransfer('+i+')" style="width:100%;padding:8px;background:rgba(200,162,0,.2);border:1px solid rgba(200,162,0,.35);color:rgba(200,162,0,.9);border-radius:8px;cursor:pointer;font-family:\'Jost\',sans-serif;font-size:12px;font-weight:700">✅ Aprobar transferencia</button></div>';
  }).join('');
}

function _adminMonthlyReportTracker(){
  var history=[]; try{history=JSON.parse(safeLS('get','velo_monthly_reports')||'[]');}catch(e){}
  var now=new Date();
  var months=[];
  for(var i=0;i<12;i++){
    var d=new Date(now.getFullYear(),now.getMonth()-i,1);
    var key=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    var sent=history.find(function(r){ return r.month===key; });
    months.push({key:key,label:d.toLocaleString('es',{month:'long',year:'numeric'}),sent:sent});
  }
  return '<div style="font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(116,198,157,.6);margin-bottom:10px">📅 INFORME MENSUAL — HISTORIAL</div>'
    +'<p style="font-size:11px;color:rgba(255,255,255,.4);margin-bottom:12px;line-height:1.5">El resumen mensual se envía el 1° de cada mes. Marcá manualmente cuando lo enviaste.</p>'
    +'<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px">'
    +months.map(function(m){
        return '<div style="background:'+(m.sent?'rgba(116,198,157,.1)':'rgba(255,255,255,.04)')+';border:1px solid '+(m.sent?'rgba(116,198,157,.3)':'rgba(255,255,255,.1)')+';border-radius:10px;padding:10px;display:flex;align-items:center;justify-content:space-between">'
          +'<div><div style="font-size:11px;font-weight:600;color:rgba(255,255,255,'+(m.sent?'.8':'.45')+')">'+m.label+'</div>'
          +(m.sent?'<div style="font-size:9px;color:rgba(116,198,157,.6)">✓ Enviado '+new Date(m.sent.ts).toLocaleDateString('es',{day:'2-digit',month:'short'})+'</div>'
            :'<div style="font-size:9px;color:rgba(255,255,255,.25)">Pendiente</div>')+'</div>'
          +(m.sent?'<span style="font-size:16px">✅</span>'
            :'<button onclick="pAdminMarkMonthlyReport(\''+m.key+'\')" style="font-size:9px;padding:3px 7px;background:rgba(116,198,157,.12);border:1px solid rgba(116,198,157,.25);color:rgba(116,198,157,.75);border-radius:5px;cursor:pointer">Marcar OK</button>')
          +'</div>';
      }).join('')+'</div>';
}

function pAdminMarkMonthlyReport(monthKey){
  var history=[]; try{history=JSON.parse(safeLS('get','velo_monthly_reports')||'[]');}catch(e){}
  if(!history.find(function(r){ return r.month===monthKey; })){
    history.unshift({month:monthKey,ts:Date.now(),sentBy:_ADMIN_EMAIL||'admin'});
    safeLS('set','velo_monthly_reports',JSON.stringify(history.slice(0,24)));
  }
  pToast('✅','Informe de '+monthKey+' marcado como enviado');
  _switchAdminTab('finanzas');
}

async function pAdminSendMonthlyReport(){
  var d = new Date();
  var month = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  var mn = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  var mLabel = mn[d.getMonth()]+' '+d.getFullYear();
  if(!confirm('¿Enviar el resumen personalizado de '+mLabel+' a todos los usuarios?\n\nCada usuario recibirá un análisis individual en su buzón generado con sus propios datos.')) return;
  _initSupabase();
  var saved = await sbSaveBroadcast('users','📊 Tu resumen de '+mLabel,'__MONTHLY_REPORT__'+month,'📊','Velo — Resumen Mensual','');
  var history=[]; try{history=JSON.parse(safeLS('get','velo_monthly_reports')||'[]');}catch(e){}
  if(!history.find(function(r){ return r.month===month; })){
    history.unshift({month:month,ts:Date.now(),sentBy:_ADMIN_EMAIL||'admin'});
    safeLS('set','velo_monthly_reports',JSON.stringify(history.slice(0,24)));
  }
  pToast('📊', saved ? 'Resumen de '+mLabel+' enviado a todos los usuarios ✅' : 'Guardado localmente (sin conexión)');
  _switchAdminTab('gestion');
}

// ── TAB: PRIVACIDAD (GDPR / Ley 25.326) ──────────────────────────────
function _adminTabPrivacidad(panel){
  panel.innerHTML = '<div style="font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(180,140,220,.85);margin-bottom:12px">🔒 SOLICITUDES DE DATOS PERSONALES</div>'
    +'<p style="font-size:12px;color:rgba(255,255,255,.45);margin-bottom:16px;line-height:1.6">Cuando un usuario pide sus datos (Ley 25.326 / GDPR), Gemini prepara el informe. Lo revisás antes de confirmar el envío.</p>'
    +'<div style="background:rgba(180,140,220,.07);border:1px solid rgba(180,140,220,.2);border-radius:14px;padding:14px;margin-bottom:16px">'
    +'<label style="font-size:11px;font-weight:700;color:rgba(255,255,255,.5);display:block;margin-bottom:6px">CORREO DEL USUARIO SOLICITANTE</label>'
    +'<div style="display:flex;gap:8px">'
    +'<input type="email" id="gdprEmail" placeholder="usuario@email.com" style="flex:1;padding:10px 14px;background:rgba(255,255,255,.07);border:1.5px solid rgba(255,255,255,.12);border-radius:12px;color:#fff;font-size:13px;font-family:\'Jost\',sans-serif;box-sizing:border-box">'
    +'<button onclick="pAdminPrepareGDPR()" id="gdprBtn" style="padding:10px 16px;background:rgba(180,140,220,.2);border:1.5px solid rgba(180,140,220,.35);border-radius:12px;color:rgba(180,140,220,.95);font-size:12px;font-weight:700;font-family:\'Jost\',sans-serif;cursor:pointer;white-space:nowrap;flex-shrink:0">🔍 Preparar informe</button>'
    +'</div></div>'
    +'<div id="gdprResult"></div>'
    +'<div style="margin-top:20px"><div style="font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,.3);margin-bottom:10px">📋 HISTORIAL DE SOLICITUDES</div>'
    +'<div id="gdprHistory">'+_renderGDPRHistory()+'</div></div>';
}

async function pAdminPrepareGDPR(){
  var emailEl=document.getElementById('gdprEmail');
  if(!emailEl||!emailEl.value.trim()){ pToast('⚠️','Ingresá el correo del usuario'); return; }
  var email=emailEl.value.trim().toLowerCase();
  var btn=document.getElementById('gdprBtn'); var resultEl=document.getElementById('gdprResult');
  if(btn){btn.disabled=true;btn.textContent='🔍 Preparando…';}
  if(resultEl) resultEl.innerHTML='<p style="font-size:11px;color:rgba(255,255,255,.4);font-style:italic;padding:8px 0">Gemini está preparando el informe…</p>';

  _initSupabase();
  var userData={email:email,perfil:null,diarioCount:0,estadosCount:0};
  if(sbClient){
    try{ var pRes=await sbClient.from('profiles').select('*').eq('email',email).limit(1); if(pRes.data&&pRes.data[0]) userData.perfil=pRes.data[0]; }catch(e){}
    if(userData.perfil){
      var uid=userData.perfil.id;
      try{ var dRes=await sbClient.from('diary_entries').select('id',{count:'exact',head:true}).eq('user_id',uid); userData.diarioCount=dRes.count||0; }catch(e){}
      try{ var mRes=await sbClient.from('moods').select('id',{count:'exact',head:true}).eq('user_id',uid); userData.estadosCount=mRes.count||0; }catch(e){}
    }
  }
  var p=userData.perfil;
  var context='Datos del usuario en Velo:\n'
    +'Email: '+email+'\nNombre: '+(p?p.nombre||'—':'No encontrado')+'\nUsuario: @'+(p?p.username||'—':'—')
    +'\nRol: '+(p?p.role||'user':'—')+'\nRegistro: '+(p&&p.created_at?new Date(p.created_at).toLocaleDateString('es'):'—')
    +'\nTérminos: '+(p&&p.terms_accepted_at?new Date(p.terms_accepted_at).toLocaleDateString('es'):'No registrado')
    +'\nEntradas diario: '+userData.diarioCount+'\nRegistros de ánimo: '+userData.estadosCount+'\n';

  var prompt='Sos el sistema de compliance de Velo, app de salud mental argentina.\n'
    +'Un usuario solicitó sus datos bajo la Ley 25.326 / GDPR.\n'
    +'Redactá un informe formal con:\n'
    +'1. Responsable del tratamiento (Heyvelo / Velo App)\n'
    +'2. Datos almacenados (con los datos reales del contexto)\n'
    +'3. Finalidad del tratamiento\n'
    +'4. Base legal\n'
    +'5. Derechos: rectificación, cancelación, oposición, portabilidad\n'
    +'6. Contacto: consultas@heyvelo.app\n'
    +'Español formal, sin código, máximo 350 palabras.\n\n'+context;

  var report=await _geminiCall(prompt,{maxOutputTokens:600});
  if(btn){btn.disabled=false;btn.textContent='🔍 Preparar informe';}
  if(!report){ if(resultEl) resultEl.innerHTML='<p style="font-size:11px;color:rgba(255,100,100,.6);padding:6px 0">No se pudo preparar. Verificá la conexión.</p>'; return; }

  if(resultEl){
    var encoded=encodeURIComponent(report).slice(0,2000);
    resultEl.innerHTML='<div style="background:rgba(180,140,220,.07);border:1.5px solid rgba(180,140,220,.3);border-radius:14px;padding:16px;margin-top:8px">'
      +'<div style="font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(180,140,220,.8);margin-bottom:10px">📋 INFORME — REVISÁ ANTES DE CONFIRMAR</div>'
      +'<div style="font-size:12px;color:rgba(255,255,255,.8);line-height:1.7;white-space:pre-line;max-height:300px;overflow-y:auto;margin-bottom:14px;padding-right:4px">'+_escHtml(report)+'</div>'
      +'<p style="font-size:11px;color:rgba(255,255,255,.4);margin-bottom:12px">⚠️ Enviá este informe manualmente al usuario: <strong>'+_escHtml(email)+'</strong></p>'
      +'<div style="display:flex;gap:8px">'
      +'<button onclick="pAdminConfirmGDPR(\''+_escHtml(email)+'\',\''+encoded+'\')" style="flex:1;padding:10px;background:rgba(116,198,157,.2);border:1.5px solid rgba(116,198,157,.4);border-radius:12px;color:#fff;font-size:12px;font-weight:700;font-family:\'Jost\',sans-serif;cursor:pointer">✅ Confirmar — registrar envío</button>'
      +'<button onclick="document.getElementById(\'gdprResult\').innerHTML=\'\'" style="padding:10px 16px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);border-radius:12px;color:rgba(255,255,255,.6);font-size:12px;font-family:\'Jost\',sans-serif;cursor:pointer">Cancelar</button>'
      +'</div></div>';
  }
}

async function pAdminConfirmGDPR(email, encoded){
  var report=''; try{report=decodeURIComponent(encoded);}catch(e){report=encoded;}
  _initSupabase();
  if(sbClient){ try{await sbClient.from('data_requests').insert({email:email,report_summary:report.slice(0,500),sent_at:new Date().toISOString(),sent_by:_ADMIN_EMAIL||'admin'});}catch(e){} }
  var history=[]; try{history=JSON.parse(safeLS('get','velo_gdpr_requests')||'[]');}catch(e){}
  history.unshift({email:email,ts:Date.now(),sentBy:_ADMIN_EMAIL||'admin'});
  safeLS('set','velo_gdpr_requests',JSON.stringify(history.slice(0,100)));
  var resultEl=document.getElementById('gdprResult');
  if(resultEl) resultEl.innerHTML='<div style="background:rgba(116,198,157,.08);border:1px solid rgba(116,198,157,.2);border-radius:10px;padding:12px;font-size:12px;color:rgba(116,198,157,.9)">✅ Registrado. Enviá el informe manualmente a: <strong>'+_escHtml(email)+'</strong></div>';
  var histEl=document.getElementById('gdprHistory');
  if(histEl) histEl.innerHTML=_renderGDPRHistory();
  pToast('🔒','Solicitud GDPR registrada');
}

function _renderGDPRHistory(){
  var history=[]; try{history=JSON.parse(safeLS('get','velo_gdpr_requests')||'[]');}catch(e){}
  if(!history.length) return '<p style="font-size:11px;color:rgba(255,255,255,.25);font-style:italic">Sin solicitudes previas</p>';
  return history.slice(0,20).map(function(r){
    var d=new Date(r.ts).toLocaleString('es',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
    return '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05)">'
      +'<span style="font-size:15px">📤</span>'
      +'<div style="flex:1"><div style="font-size:12px;color:rgba(255,255,255,.65)">'+_escHtml(r.email)+'</div>'
      +'<div style="font-size:10px;color:rgba(255,255,255,.25)">'+d+'</div></div>'
      +'<span style="font-size:10px;color:rgba(116,198,157,.7);font-weight:700">✓ Enviado</span></div>';
  }).join('');
}

// ── TAB: GESTIÓN ─────────────────────────────────────────────────────
function _adminTabGestion(panel){
  panel.innerHTML = '<div style="font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(116,198,157,.6);margin-bottom:10px">📋 TAREAS PENDIENTES</div>'
    +'<div id="adminAITasks"><div style="font-size:12px;color:rgba(255,255,255,.3);padding:10px 0">Gemini está revisando las tareas…</div></div>'
    +'<div style="margin-top:18px;font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(200,162,0,.7);margin-bottom:10px">⭐ ACTIVAR VELO PLUS GRATIS (30 DÍAS)</div>'
    +'<div style="background:rgba(200,162,0,.06);border:1px solid rgba(200,162,0,.18);border-radius:12px;padding:14px;margin-bottom:18px">'
    +'<p style="font-size:11px;color:rgba(255,255,255,.4);margin-bottom:10px;line-height:1.5">Activá Velo Plus 30 días para un usuario.</p>'
    +'<div style="display:flex;gap:8px;align-items:center">'
    +'<input class="p-input" id="adminGrantPlusEmail" type="email" placeholder="correo@usuario.com" style="flex:1;background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.15);color:#fff" />'
    +'<button onclick="pAdminGrantPlus()" style="padding:8px 14px;background:rgba(200,162,0,.2);border:1px solid rgba(200,162,0,.35);color:rgba(200,162,0,.9);border-radius:8px;cursor:pointer;font-family:\'Jost\',sans-serif;font-size:12px;font-weight:700;white-space:nowrap">⭐ Activar Plus</button>'
    +'</div></div>'
    +(function(){
        var d=new Date(); var mn=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
        var mLabel=mn[d.getMonth()]+' '+d.getFullYear();
        var history=[]; try{history=JSON.parse(safeLS('get','velo_monthly_reports')||'[]');}catch(e){}
        var sentThis=history.find(function(r){ return r.month===(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')); });
        return '<div style="margin-top:18px;font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(180,140,220,.7);margin-bottom:10px">📊 RESUMEN MENSUAL IA</div>'
          +'<div style="background:rgba(180,140,220,.06);border:1px solid rgba(180,140,220,.18);border-radius:12px;padding:14px;margin-bottom:18px">'
          +'<p style="font-size:11px;color:rgba(255,255,255,.4);margin-bottom:12px;line-height:1.6">Gemini genera un resumen personalizado para cada usuario con sus propios estados de ánimo y diario del mes. Cada uno ve el suyo en su buzón.</p>'
          +(sentThis
            ? '<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:rgba(116,198,157,.08);border:1px solid rgba(116,198,157,.2);border-radius:10px;font-size:11px;color:rgba(116,198,157,.85)">✅ Resumen de '+mLabel+' ya enviado el '+new Date(sentThis.ts).toLocaleDateString('es',{day:'2-digit',month:'short'})+'</div>'
            : '<button onclick="pAdminSendMonthlyReport()" style="width:100%;padding:10px;background:rgba(180,140,220,.15);border:1px solid rgba(180,140,220,.3);color:rgba(180,140,220,.9);border-radius:10px;cursor:pointer;font-family:\'Jost\',sans-serif;font-size:12px;font-weight:700">📊 Enviar resumen de '+mLabel+' a todos los usuarios</button>')
          +'</div>';
      }())
    +'<div style="font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(116,198,157,.6);margin-bottom:10px">📰 NOTICIAS MANUALES</div>'
    +'<div style="background:rgba(116,198,157,.06);border:1px solid rgba(116,198,157,.15);border-radius:12px;padding:14px;margin-bottom:18px">'
    +'<p style="font-size:11px;color:rgba(255,255,255,.4);margin-bottom:10px;line-height:1.5">Publicá noticias con título, resumen y link.</p>'
    +'<button onclick="pOpenAdminNews()" style="width:100%;padding:9px;background:rgba(116,198,157,.15);border:1px solid rgba(116,198,157,.3);color:rgba(116,198,157,.9);border-radius:8px;cursor:pointer;font-family:\'Jost\',sans-serif;font-size:12px;font-weight:700;margin-bottom:10px">+ Publicar noticia</button>'
    +'<label style="display:flex;align-items:center;gap:8px;font-size:11px;color:rgba(255,255,255,.55);cursor:pointer;margin-bottom:12px">'
    +'<input type="checkbox" id="adminNewsOnlyToggle" '+(safeLS('get','velo_admin_news_only')==='1'?'checked':'')+' onchange="pAdminToggleNewsOnly(this.checked)" style="width:15px;height:15px;cursor:pointer">'
    +'Mostrar solo noticias manuales hoy</label>'
    +'<div id="adminNewsList"></div></div>';
  pAdminRenderNewsList();
  _renderAdminAITasks();
}

// ── NEW: Warn user ────────────────────────────────────────────────────
function pAdminWarnUser(userId, email){
  var ov=document.createElement('div'); ov.className='p-modal-ov show'; ov.id='adminWarnOv'; ov.style.zIndex='9999';
  ov.innerHTML='<div class="p-sheet" style="background:#0F2016;border:1px solid rgba(230,180,40,.2);overflow-y:auto;max-height:90vh">'
    +'<div style="font-size:28px;margin-bottom:8px">⚠️</div>'
    +'<div style="font-family:\'Cormorant Garamond\',serif;font-size:20px;color:#fff;margin-bottom:6px">Advertencia formal</div>'
    +'<p style="font-size:12px;color:rgba(255,255,255,.45);margin-bottom:16px;line-height:1.5">El mensaje llegará al buzón del usuario como advertencia oficial de Velo.</p>'
    +(email?'<p style="font-size:11px;color:rgba(255,255,255,.3);margin-bottom:12px">Usuario: '+_escHtml(email)+'</p>':'')
    +'<div style="margin-bottom:12px"><label style="font-size:11px;font-weight:700;color:rgba(255,255,255,.5);display:block;margin-bottom:6px">MOTIVO</label>'
    +'<select id="warnReason" style="width:100%;padding:9px;background:rgba(255,255,255,.07);border:1.5px solid rgba(255,255,255,.15);border-radius:10px;color:#fff;font-size:13px;font-family:\'Jost\',sans-serif">'
    +'<option value="acoso">Acoso o bullying hacia otro usuario</option>'
    +'<option value="spam">Spam o autopromocción</option>'
    +'<option value="lenguaje">Lenguaje agresivo o inapropiado</option>'
    +'<option value="contenido">Contenido dañino o inapropiado</option>'
    +'<option value="otro">Otro</option></select></div>'
    +'<div style="margin-bottom:14px"><label style="font-size:11px;font-weight:700;color:rgba(255,255,255,.5);display:block;margin-bottom:6px">MENSAJE ADICIONAL (opcional)</label>'
    +'<textarea id="warnMessage" rows="3" placeholder="Detalle adicional…" maxlength="400" style="width:100%;padding:10px 14px;background:rgba(255,255,255,.07);border:1.5px solid rgba(255,255,255,.12);border-radius:12px;color:#fff;font-size:13px;font-family:\'Jost\',sans-serif;resize:vertical;box-sizing:border-box"></textarea></div>'
    +'<div style="display:flex;gap:8px">'
    +'<button onclick="pAdminSendWarning(\''+_escHtml(userId||'')+'\',\''+_escHtml(email||'')+'\')" style="flex:1;padding:11px;background:rgba(230,180,40,.2);border:1.5px solid rgba(230,180,40,.4);border-radius:14px;color:#fff;font-size:13px;font-weight:700;font-family:\'Jost\',sans-serif;cursor:pointer">⚠️ Enviar advertencia</button>'
    +'<button onclick="document.getElementById(\'adminWarnOv\').remove()" style="padding:11px 16px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);border-radius:14px;color:rgba(255,255,255,.6);font-size:13px;font-family:\'Jost\',sans-serif;cursor:pointer">Cancelar</button>'
    +'</div></div>';
  document.body.appendChild(ov);
}

async function pAdminSendWarning(userId, email){
  var reasonEl=document.getElementById('warnReason'); var msgEl=document.getElementById('warnMessage');
  var reason=reasonEl?reasonEl.value:'otro'; var extra=msgEl?msgEl.value.trim():'';
  var labels={acoso:'acoso o bullying',spam:'spam o autopromocción',lenguaje:'lenguaje agresivo',contenido:'contenido inapropiado',otro:'comportamiento contrario a las normas'};
  var warnText='⚠️ Tu cuenta recibió una advertencia formal de Velo por '+(labels[reason]||reason)+'. '+(extra?extra+' ':'')+'Si el comportamiento continúa, tu cuenta puede ser suspendida. Consultas: consultas@heyvelo.app.';
  var target=userId?'user:'+userId:(email?'email:'+email:'user');
  var saved=await sbSaveBroadcast(target,'⚠️ Advertencia formal de Velo',warnText,'⚠️','Velo — Moderación');
  var ov=document.getElementById('adminWarnOv'); if(ov) ov.remove();
  pToast('⚠️',saved?'Advertencia enviada al usuario':'Guardado localmente (sin conexión)');
}

async function pAdminResolveReport(id){
  _initSupabase();
  if(!sbClient){ pToast('⚠️','Sin conexión'); return; }
  try{
    await sbClient.from('reportes').update({estado:'resuelto',resolved_at:new Date().toISOString()}).eq('id',id);
    var card=document.getElementById('report-'+id); if(card) card.remove();
    pToast('✅','Reporte resuelto');
  }catch(e){ pToast('⚠️','Error al resolver el reporte'); }
}

async function pAdminDeleteContent(contentId, contentType){
  if(!contentId){ pToast('⚠️','Sin ID de contenido'); return; }
  if(!window.confirm('¿Eliminar este contenido? Esta acción no se puede deshacer.')) return;
  _initSupabase();
  if(!sbClient){ pToast('⚠️','Sin conexión'); return; }
  var tableMap={post:'posts',circle_message:'circle_messages',bottle:'bottles',help_post:'help_posts',review:'reviews'};
  var table=tableMap[contentType]||contentType;
  if(!table){ pToast('⚠️','Tipo desconocido: '+contentType); return; }
  try{ await sbClient.from(table).delete().eq('id',contentId); pToast('🗑️','Contenido eliminado'); }
  catch(e){ pToast('⚠️','Error: '+e.message); }
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

var _adminContactsCache = [];
var _adminReplyTarget = null;
var _adminContactFilter = 'all';

function _renderAdminContactsList(msgs){
  _adminContactsCache = msgs || [];
  var el = document.getElementById('adminContactsList');
  if(!el) return;

  var unread = (msgs||[]).filter(function(m){ return !m.leido; }).length;
  var preLogin = (msgs||[]).filter(function(m){ return m.source === 'pre-login'; }).length;
  var loggedIn = (msgs||[]).filter(function(m){ return m.source === 'logged-in'; }).length;

  // Tab bar
  var tabs = [
    { id:'all',      label:'Todos',          count:(msgs||[]).length },
    { id:'unread',   label:'Sin leer',       count:unread },
    { id:'pre-login',label:'Pre-login',      count:preLogin },
    { id:'logged-in',label:'Usuarios',       count:loggedIn }
  ];
  var tabsHtml = '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">'
    + tabs.map(function(t){
        var active = _adminContactFilter === t.id;
        return '<button onclick="pAdminFilterContacts(\''+t.id+'\')" style="font-size:10px;padding:4px 10px;border-radius:20px;cursor:pointer;font-family:\'Jost\',sans-serif;font-weight:700;transition:all .15s;'
          +(active ? 'background:rgba(116,198,157,.25);border:1.5px solid rgba(116,198,157,.5);color:rgba(116,198,157,.9)'
                   : 'background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.45)')
          +'">'+t.label+(t.count ? ' <span style="opacity:.7">('+t.count+')</span>' : '')+'</button>';
      }).join('')
    +'</div>';

  var filtered = (msgs||[]).filter(function(m){
    if(_adminContactFilter === 'unread')    return !m.leido;
    if(_adminContactFilter === 'pre-login') return m.source === 'pre-login';
    if(_adminContactFilter === 'logged-in') return m.source === 'logged-in';
    return true;
  });

  if(!filtered.length){
    el.innerHTML = tabsHtml + '<p style="font-size:12px;color:rgba(255,255,255,.3);padding:12px 0">Sin mensajes en esta categoría.</p>';
    return;
  }

  el.innerHTML = tabsHtml + filtered.map(function(m, idx){
    var realIdx = _adminContactsCache.indexOf(m);
    var texto    = m.mensaje || m.msg || '';
    var mid      = m.id || '';
    var fecha    = m.fecha ? new Date(m.fecha).toLocaleString('es',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
    var email    = m.user_email || m.email || '';
    var name     = m.user_name  || '';
    var hasEmail = email && email !== 'anónimo';
    var isPreLogin = m.source === 'pre-login';
    var sourceBadge = isPreLogin
      ? '<span style="font-size:9px;padding:2px 6px;background:rgba(200,162,0,.15);border:1px solid rgba(200,162,0,.3);border-radius:20px;color:rgba(200,162,0,.8);font-weight:700">Pre-login</span>'
      : '<span style="font-size:9px;padding:2px 6px;background:rgba(116,198,157,.12);border:1px solid rgba(116,198,157,.25);border-radius:20px;color:rgba(116,198,157,.7);font-weight:700">Usuario</span>';

    return '<div class="a-row" style="flex-direction:column;align-items:flex-start;gap:8px;border-left:3px solid '+(m.leido?'rgba(255,255,255,.06)':'rgba(116,198,157,.5)')+';padding-left:10px;margin-bottom:2px">'
      // Header row
      +'<div style="display:flex;width:100%;align-items:flex-start;gap:10px">'
      +'<div style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.06);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">'+(m.leido?'✉️':'📬')+'</div>'
      +'<div style="flex:1;min-width:0">'
        +'<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:3px">'
          +'<span style="font-size:13px;font-weight:700;color:rgba(255,255,255,.9)">'+_escHtml(name || email.split('@')[0] || 'Sin nombre')+'</span>'
          + sourceBadge
          +(m.leido ? '' : '<span style="font-size:9px;padding:2px 6px;background:rgba(255,160,50,.15);border:1px solid rgba(255,160,50,.3);border-radius:20px;color:rgba(255,180,80,.9);font-weight:700">NUEVO</span>')
        +'</div>'
        +(hasEmail ? '<div style="font-size:11px;color:rgba(255,255,255,.4);margin-bottom:2px">📧 '+_escHtml(email)+'</div>' : '')
        +'<div style="display:flex;align-items:center;gap:8px">'
          +'<span style="font-size:11px;font-weight:700;color:rgba(180,150,255,.7)">'+_escHtml(m.topic||'Consulta')+'</span>'
          +'<span style="font-size:10px;color:rgba(255,255,255,.25)">'+fecha+'</span>'
        +'</div>'
      +'</div>'
      +'</div>'
      // Message preview
      +(texto ? '<div style="font-size:12px;color:rgba(255,255,255,.55);line-height:1.55;padding:9px 12px;background:rgba(255,255,255,.03);border-radius:8px;border:1px solid rgba(255,255,255,.06);width:100%;box-sizing:border-box">'+_escHtml(texto.slice(0,300))+(texto.length>300?'…':'')+'</div>' : '')
      // Admin reply preview
      +(m.reply ? '<div style="font-size:11px;color:rgba(116,198,157,.7);padding:7px 10px;background:rgba(116,198,157,.06);border-radius:8px;width:100%;box-sizing:border-box"><strong>Tu respuesta:</strong> '+_escHtml(m.reply.slice(0,150))+'</div>' : '')
      // Action buttons
      +'<div style="display:flex;gap:6px;flex-wrap:wrap">'
      +(!m.leido ? '<button onclick="pAdminMarkContactRead(\''+mid+'\')" style="font-size:10px;padding:4px 9px;background:rgba(116,198,157,.1);border:1px solid rgba(116,198,157,.2);color:rgba(116,198,157,.7);border-radius:6px;cursor:pointer;font-family:\'Jost\',sans-serif">✓ Marcar leído</button>' : '')
      +(hasEmail ? '<button onclick="pAdminOpenReply('+realIdx+')" style="font-size:10px;padding:4px 9px;background:rgba(200,162,0,.12);border:1px solid rgba(200,162,0,.25);color:rgba(220,185,60,.85);border-radius:6px;cursor:pointer;font-family:\'Jost\',sans-serif;font-weight:600">📧 Responder</button>' : '<span style="font-size:10px;color:rgba(255,255,255,.2);padding:4px 0">Sin email de respuesta</span>')
      +'<button onclick="pAdminDeleteContact(\''+mid+'\')" style="font-size:10px;padding:4px 9px;background:rgba(220,50,50,.08);border:1px solid rgba(220,50,50,.18);color:rgba(220,100,100,.7);border-radius:6px;cursor:pointer;font-family:\'Jost\',sans-serif">🗑️</button>'
      +'</div>'
      +'</div>';
  }).join('');
}

function pAdminFilterContacts(filter){
  _adminContactFilter = filter;
  _renderAdminContactsList(_adminContactsCache);
}

async function pAdminDeleteContact(id){
  if(!confirm('¿Eliminar este mensaje de contacto?')) return;
  _initSupabase();
  if(sbClient){ sbClient.from('contacts').delete().eq('id',id).then(function(){}).catch(function(){}); }
  _adminContactsCache = _adminContactsCache.filter(function(m){ return m.id !== id; });
  // Also remove from localStorage
  var local = []; try{ local = JSON.parse(safeLS('get','velo_admin_contacts')||'[]'); }catch(e){}
  safeLS('set','velo_admin_contacts', JSON.stringify(local.filter(function(m){ return m.id !== id; })));
  _renderAdminContactsList(_adminContactsCache);
}

function pAdminOpenReply(idx){
  var m = _adminContactsCache[idx];
  if(!m) return;
  _adminReplyTarget = m;
  var preview = document.getElementById('adminReplyPreview');
  var txt     = document.getElementById('adminReplyText');
  var toggle  = document.getElementById('adminReplyAllowToggle');
  var name    = m.user_name || '';
  var email   = m.user_email || m.email || 'anónimo';
  var isPreLogin = m.source === 'pre-login';
  if(preview) preview.innerHTML =
    '<div style="margin-bottom:6px"><strong style="color:var(--ink)">Destinatario:</strong> '
      +_escHtml(name ? name+' &lt;'+email+'&gt;' : email)
      +' <span style="font-size:10px;background:'+(isPreLogin?'rgba(200,162,0,.15)':'rgba(116,198,157,.12)')+';border-radius:10px;padding:2px 6px;color:'+(isPreLogin?'#b8920a':'var(--sage)')+';">'+(isPreLogin?'Pre-login':'Usuario')+'</span></div>'
    +'<div style="margin-bottom:6px"><strong style="color:var(--ink)">Asunto:</strong> '+_escHtml(m.topic||'Consulta')+'</div>'
    +'<div style="border-top:1px solid var(--border2);padding-top:8px;margin-top:6px"><em style="font-size:11px;color:var(--ink4)">Mensaje original:</em><br>'
      +'<span style="font-size:12px;color:var(--ink3)">'+_escHtml((m.mensaje||m.msg||'').slice(0,300))+'</span></div>';
  if(txt)    txt.value = name ? 'Hola '+name+',\n\n' : '';
  if(toggle) toggle.checked = false;
  openModal('adminReplyOv');
}

async function pAdminSendReply(){
  if(!_adminReplyTarget){ pToast('⚠️','Sin destinatario'); return; }
  var txt    = document.getElementById('adminReplyText');
  var toggle = document.getElementById('adminReplyAllowToggle');
  if(!txt || !txt.value.trim()){ pToast('✍️','Escribí tu respuesta'); return; }
  var toEmail = _adminReplyTarget.user_email || _adminReplyTarget.email;
  var toName  = _adminReplyTarget.user_name  || '';
  if(!toEmail || toEmail === 'anónimo'){ pToast('⚠️','Este usuario no tiene email registrado'); return; }
  var btn = document.querySelector('#adminReplyOv .p-btn--primary');
  if(btn){ btn.disabled = true; btn.textContent = 'Enviando...'; }
  try{
    var r = await fetch('/api/send-email',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ email:toEmail, name:toName, type:'admin-reply',
        topic:_adminReplyTarget.topic||'Consulta', reply:txt.value.trim(), allowReply:!!(toggle&&toggle.checked) })
    });
    var json = await r.json();
    if(json.ok){
      pToast('💌','Respuesta enviada');
      closeModal('adminReplyOv');
      if(_adminReplyTarget.id){
        sbUpdateContactReply(_adminReplyTarget.id, txt.value.trim(), !!(toggle&&toggle.checked));
        pAdminMarkContactRead(_adminReplyTarget.id);
      }
    } else {
      pToast('⚠️','Error: '+(json.error||'desconocido'));
    }
  } catch(e){ pToast('⚠️','Error de conexión'); }
  finally{ if(btn){ btn.disabled=false; btn.textContent='Enviar respuesta 💌'; } }
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

function pAdminResolveFlag(id){ pAdminModerateFlag(id, 'accept'); }

// ── CONSENT LOG ─────────────────────────────────────────────
var _consentAllRecords = [];

async function pAdminLoadConsent(){
  _initSupabase();
  var el = document.getElementById('adminConsentLog');
  if(!el) return;
  if(!sbClient){ el.innerHTML = '<p style="font-size:12px;color:rgba(255,80,80,.5)">Sin conexión a Supabase.</p>'; return; }
  el.innerHTML = '<p style="font-size:12px;color:rgba(255,255,255,.3)">Cargando…</p>';
  try{
    var res = await sbClient.from('terms_acceptance').select('*').order('accepted_at',{ascending:false}).limit(500);
    _consentAllRecords = res.data || [];
    var inp = document.getElementById('consentSearch');
    _filterConsentLog(inp ? inp.value : '');
  }catch(e){
    el.innerHTML = '<p style="font-size:12px;color:rgba(255,80,80,.5)">Error al cargar: '+_escHtml(String(e))+'</p>';
  }
}

function _filterConsentLog(query){
  var el = document.getElementById('adminConsentLog');
  if(!el) return;
  var q = (query||'').toLowerCase().trim();
  var rows = q
    ? _consentAllRecords.filter(function(r){
        return (r.nombre||'').toLowerCase().includes(q) || (r.email||'').toLowerCase().includes(q);
      })
    : _consentAllRecords;
  if(!rows.length){
    el.innerHTML = '<p style="font-size:12px;color:rgba(255,255,255,.3);padding:8px 0">'+(q?'Sin resultados para "'+_escHtml(q)+'"':'Sin registros aún.')+'</p>';
    return;
  }
  var rolColor = { pro:'rgba(116,198,210,.8)', plus:'#c8a23e', user:'rgba(255,255,255,.3)' };
  el.innerHTML = '<div style="font-size:10px;color:rgba(255,255,255,.3);margin-bottom:8px">'+rows.length+' registro'+(rows.length!==1?'s':'')+'</div>'
    + rows.map(function(r){
      var d   = r.accepted_at ? new Date(r.accepted_at) : null;
      var dateStr = d ? (d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')
        +' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')+':'+String(d.getSeconds()).padStart(2,'0')+' UTC') : '—';
      var rol = r.rol||'user';
      var ver = r.version||'TOS-v1';
      return '<div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:10px;padding:11px 13px;margin-bottom:7px">'
        +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">'
        +'<span style="font-size:12px;font-weight:700;color:rgba(255,255,255,.8);flex:1">'+_escHtml(r.nombre||'—')+'</span>'
        +'<span style="font-size:9px;border:1px solid;border-radius:5px;padding:1px 6px;color:'+(rolColor[rol]||rolColor.user)+';border-color:'+(rolColor[rol]||rolColor.user)+'">'+rol.toUpperCase()+'</span>'
        +'<span style="font-size:9px;background:rgba(116,198,157,.1);color:rgba(116,198,157,.7);border-radius:5px;padding:1px 6px">'+ver+'</span>'
        +'<span style="font-size:10px;color:rgba(116,198,157,.7);font-weight:700">✓</span>'
        +'</div>'
        +'<div style="font-size:11px;color:rgba(255,255,255,.4);margin-bottom:3px">✉ '+_escHtml(r.email||'—')+'</div>'
        +'<div style="font-size:10px;color:rgba(255,255,255,.22);font-family:monospace">🕐 '+dateStr+'</div>'
        +'</div>';
    }).join('');
}

// action: 'accept' (contenido OK) · 'alert' (alertar al usuario) · 'delete' (eliminar) · 'alertdelete'
function pAdminModerateFlag(id, action){
  _initSupabase();
  if(!sbClient) return;
  var labels = { accept:'Reporte aceptado — contenido OK', alert:'Usuario alertado ⚠️',
    'delete':'Contenido eliminado 🗑️', alertdelete:'Usuario alertado y contenido eliminado' };
  sbClient.from('moderation_flags').update({ resolved:true, resolution:action }).eq('id',id)
    .then(function(){
      var card = document.getElementById('modflag-'+id);
      if(card) card.remove();
      pToast('✅', labels[action] || 'Reporte resuelto');
    }).catch(function(){ pToast('⚠️','Error — ¿corriste el SQL de Fase 2?'); });
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
    +'<div style="margin-bottom:10px">'
    +'<label style="font-size:11px;font-weight:700;color:rgba(255,255,255,.5);letter-spacing:.5px;display:block;margin-bottom:6px">IMAGEN (URL opcional)</label>'
    +'<input type="url" id="massImageUrl" placeholder="https://… (banner o foto de encabezado)" style="width:100%;padding:10px 14px;background:rgba(255,255,255,.07);border:1.5px solid rgba(255,255,255,.12);border-radius:12px;color:#fff;font-size:13px;font-family:\'Jost\',sans-serif;box-sizing:border-box" oninput="_previewMassImage()">'
    +'<div id="massImgPreview" style="margin-top:6px"></div>'
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

// ── MONTHLY REPORT: open modal & generate per-user ────────────────────
async function pOpenMonthlyReport(month, readKey, cardEl){
  if(readKey) safeLS('set',readKey,'1');
  if(cardEl){ cardEl.classList.remove('unread'); var dot=cardEl.querySelector('.p-inbox-dot'); if(dot) dot.remove(); }
  _updateInboxDot();
  var parts=month.split('-'); var year=parseInt(parts[0]); var mon=parseInt(parts[1])-1;
  var MN=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  var mName=MN[mon]||month;
  var name=safeLS('get','velo_user_name')||''; var firstName=name.split(' ')[0]||'';
  var ov=document.createElement('div'); ov.className='p-modal-ov show'; ov.id='monthlyReportOv'; ov.style.zIndex='9999';
  ov.innerHTML='<div class="p-sheet p-sheet-dark" style="-webkit-overflow-scrolling:touch;overflow-y:scroll;max-height:92vh;touch-action:pan-y;padding-bottom:32px">'
    +'<div style="font-size:9px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:rgba(180,140,220,.75);margin-bottom:6px">📊 RESUMEN MENSUAL VELO</div>'
    +'<div style="font-family:\'Cormorant Garamond\',serif;font-size:26px;color:#fff;font-weight:300;margin-bottom:4px">Tu '+mName+' '+year+(firstName?' — '+firstName:'')+'</div>'
    +'<div style="height:1px;background:rgba(255,255,255,.08);margin:12px 0"></div>'
    +'<div id="monthlyReportBody"><div style="display:flex;align-items:center;gap:8px;color:rgba(255,255,255,.35);font-size:12px;padding:20px 0"><span class="live-dot" style="background:rgba(180,140,220,.8)"></span>Gemini está analizando tu mes…</div></div>'
    +'<button onclick="document.getElementById(\'monthlyReportOv\').remove();_syncBodyScroll()" style="width:100%;padding:11px;background:rgba(180,140,220,.15);border:1.5px solid rgba(180,140,220,.3);border-radius:14px;color:rgba(180,140,220,.9);font-size:13px;font-weight:700;font-family:\'Jost\',sans-serif;cursor:pointer;margin-top:8px">Cerrar</button>'
    +'</div>';
  document.body.appendChild(ov); _syncBodyScroll();
  var data=await _generateMonthlySummary(month,mName,year);
  var bodyEl=document.getElementById('monthlyReportBody');
  if(!bodyEl) return;
  var html='';

  // ── Mood breakdown bar ──
  if(data.happy||data.neutral||data.sad){
    var total=data.happy+data.neutral+data.sad;
    var pHappy=Math.round(data.happy/total*100); var pNeutral=Math.round(data.neutral/total*100); var pSad=100-pHappy-pNeutral;
    html+='<div style="margin-bottom:18px">'
      +'<div style="font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,.4);margin-bottom:10px">😊 TUS ÁNIMOS EN '+mName.toUpperCase()+'</div>'
      +'<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px">'
      +_mrStatCard('☀️','Días felices',data.happy,'positivos')
      +_mrStatCard('🌤️','Días tranquilos',data.neutral,'neutrales')
      +_mrStatCard('🌧️','Días difíciles',data.sad,'con peso')
      +'</div>'
      +'<div style="height:8px;border-radius:8px;overflow:hidden;display:flex;background:rgba(255,255,255,.06)">'
      +(data.happy?'<div style="width:'+pHappy+'%;background:rgba(116,198,157,.7);transition:width .8s"></div>':'')
      +(data.neutral?'<div style="width:'+pNeutral+'%;background:rgba(200,162,56,.5);transition:width .8s"></div>':'')
      +(pSad>0?'<div style="flex:1;background:rgba(180,140,220,.4);transition:width .8s"></div>':'')
      +'</div>'
      +'<div style="display:flex;gap:12px;margin-top:5px;font-size:9px;color:rgba(255,255,255,.35)">'
      +'<span>■ Feliz</span><span style="color:rgba(200,162,56,.7)">■ Tranquilo</span><span style="color:rgba(180,140,220,.7)">■ Difícil</span>'
      +'</div>'
      +'</div>';
  }

  // ── Community stats ──
  if(data.helped||data.received){
    html+='<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:18px">';
    if(data.helped)   html+=_mrStatCard('💙','Personas que ayudaste',data.helped,'como guardián/a');
    if(data.received) html+=_mrStatCard('🌿','Veces que recibiste apoyo',data.received,'acompañamientos');
    html+='</div>';
  }

  // ── AI narrative ──
  html+='<div style="font-size:14px;color:rgba(255,255,255,.82);line-height:1.85;white-space:pre-line;margin-bottom:20px;border-left:2px solid rgba(180,140,220,.35);padding-left:14px">'+_escHtml(data.narrative||'')+'</div>';

  // ── Recommendations ──
  if(data.recs && data.recs.length){
    html+='<div style="font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(116,198,157,.75);margin-bottom:10px">✨ PARA ESTE MES</div>';
    html+='<div style="display:flex;flex-direction:column;gap:7px;margin-bottom:18px">';
    data.recs.forEach(function(r){
      html+='<div style="display:flex;align-items:flex-start;gap:10px;background:rgba(116,198,157,.06);border:1px solid rgba(116,198,157,.15);border-radius:12px;padding:10px 12px">'
        +'<span style="font-size:20px;flex-shrink:0;line-height:1.2">'+(r.icon||'✨')+'</span>'
        +'<span style="font-size:13px;color:rgba(255,255,255,.75);line-height:1.55">'+_escHtml(r.text||'')+'</span>'
        +'</div>';
    });
    html+='</div>';
  }

  // ── Books ──
  if(data.books && data.books.length){
    html+='<div style="font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(200,162,56,.8);margin-bottom:10px">📚 LECTURAS RECOMENDADAS</div>';
    html+='<div style="display:flex;flex-direction:column;gap:7px;margin-bottom:18px">';
    data.books.forEach(function(b){
      html+='<div style="background:rgba(200,162,56,.06);border:1px solid rgba(200,162,56,.2);border-radius:12px;padding:10px 14px">'
        +'<div style="font-size:13px;font-weight:700;color:rgba(255,255,255,.85)">📖 '+_escHtml(b.title||'')+'</div>'
        +'<div style="font-size:11px;color:rgba(200,162,56,.8);margin-top:2px">'+_escHtml(b.author||'')+'</div>'
        +(b.why?'<div style="font-size:11px;color:rgba(255,255,255,.45);margin-top:4px;line-height:1.5">'+_escHtml(b.why)+'</div>':'')
        +'</div>';
    });
    html+='</div>';
  }

  // ── Reviews ──
  if(data.reviews && data.reviews.length){
    html+='<div style="font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(200,162,0,.8);margin-bottom:10px">⭐ LO QUE LA COMUNIDAD DICE DE VOS'+(data.totalReviews?' ('+data.totalReviews+' reseñas)':'')+'</div>';
    data.reviews.forEach(function(r){
      html+='<div style="background:rgba(200,162,0,.07);border:1px solid rgba(200,162,0,.18);border-radius:12px;padding:12px 14px;margin-bottom:8px">'
        +'<div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">'
        +'<span style="font-size:12px;letter-spacing:1px">'+'⭐'.repeat(Math.min(r.stars||5,5))+'</span>'
        +'<span style="font-size:11px;color:rgba(255,255,255,.35)">'+_escHtml(r.reviewer_name||'Usuario')+'</span>'
        +'</div>'
        +(r.texto?'<div style="font-size:13px;color:rgba(255,255,255,.78);line-height:1.6;font-style:italic">"'+_escHtml(r.texto)+'"</div>':'')
        +'</div>';
    });
    html+='<div style="height:1px;background:rgba(255,255,255,.06);margin:4px 0 18px"></div>';
  }

  // ── Medals ──
  if(data.medals && data.medals.length){
    html+='<div style="font-size:9px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(116,198,157,.7);margin-bottom:8px">🏅 MEDALLAS GANADAS</div>';
    html+='<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:18px">'
      +data.medals.map(function(m){ return '<span style="padding:5px 12px;background:rgba(116,198,157,.1);border:1px solid rgba(116,198,157,.25);border-radius:20px;font-size:12px;color:rgba(116,198,157,.9)">'+_escHtml(m.name||m.label||'🏅')+'</span>'; }).join('')
      +'</div>';
  }

  // ── Help hint (if many sad days) ──
  if(data.help_hint){
    html+='<div style="background:rgba(116,198,157,.07);border:1.5px solid rgba(116,198,157,.25);border-radius:14px;padding:14px;margin-bottom:14px">'
      +'<div style="font-size:14px;font-weight:700;color:rgba(116,198,157,.9);margin-bottom:6px">💚 Un espacio para vos</div>'
      +'<div style="font-size:13px;color:rgba(255,255,255,.7);line-height:1.65">'+_escHtml(data.help_hint)+'</div>'
      +'<button onclick="document.getElementById(\'monthlyReportOv\').remove();_syncBodyScroll();pGoTo(\'guardianes\')" style="margin-top:10px;padding:8px 16px;background:rgba(116,198,157,.15);border:1px solid rgba(116,198,157,.3);border-radius:10px;color:rgba(116,198,157,.9);font-size:12px;font-weight:700;font-family:\'Jost\',sans-serif;cursor:pointer">Hablar con alguien →</button>'
      +'</div>';
  }

  // ── Gratitude footer ──
  html+='<div style="background:rgba(180,140,220,.07);border:1px solid rgba(180,140,220,.15);border-radius:14px;padding:16px;text-align:center">'
    +'<div style="font-size:22px;margin-bottom:8px">💜</div>'
    +'<div style="font-size:14px;font-weight:600;color:rgba(255,255,255,.75);margin-bottom:6px">Gracias por ser parte de Velo</div>'
    +'<div style="font-size:12px;color:rgba(255,255,255,.45);line-height:1.6">Tu presencia en esta comunidad importa y hace la diferencia para alguien que todavía no lo sabe. Nos vemos el próximo mes. 🌱</div>'
    +'</div>'
  // ── Velo logo watermark ──
  +'<div style="margin-top:22px;display:flex;flex-direction:column;align-items:center;gap:6px;opacity:.35">'
  +'<div style="font-family:\'Cormorant Garamond\',serif;font-size:22px;font-weight:300;letter-spacing:3px;color:#fff">VELO</div>'
  +'<div style="font-size:9px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:rgba(255,255,255,.6)">Bienestar colectivo</div>'
  +'</div>';

  bodyEl.innerHTML=html;
}

function _mrStatCard(icon, label, value, sub){
  return '<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:12px;text-align:center">'
    +'<div style="font-size:20px;margin-bottom:4px">'+icon+'</div>'
    +'<div style="font-size:26px;font-weight:800;color:#fff;line-height:1">'+value+'</div>'
    +'<div style="font-size:10px;font-weight:700;color:rgba(255,255,255,.55);margin-top:3px">'+label+'</div>'
    +'<div style="font-size:9px;color:rgba(255,255,255,.28);margin-top:1px">'+sub+'</div>'
    +'</div>';
}

async function _generateMonthlySummary(month, mName, year){
  var cacheKey='velo_monthly_summary_'+month;
  try{ var c=safeLS('get',cacheKey); if(c){ var p=JSON.parse(c); if(p&&p.narrative) return p; } }catch(e){}
  var name=safeLS('get','velo_user_name')||''; var firstName=name.split(' ')[0]||'vos';
  var mon=parseInt(month.split('-')[1]); var yr=parseInt(month.split('-')[0]);
  var cutStart=new Date(yr,mon-1,1).toISOString(); var cutEnd=new Date(yr,mon,0,23,59,59).toISOString();

  // ── Classify moods ──
  var moodLog=[]; try{moodLog=JSON.parse(safeLS('get','velo_mood_log')||'[]');}catch(e){}
  var monthMoods=moodLog.filter(function(m){ var d=new Date(m.ts||0); return d.getFullYear()===yr&&d.getMonth()===(mon-1); });
  var positiveSet={'😊':1,'😄':1,'🥰':1,'😎':1,'🌈':1,'☀️':1,'🔥':1,'✨':1,'🌻':1};
  var negativeSet={'😔':1,'😢':1,'😰':1,'😤':1,'🌧️':1,'😞':1,'😟':1,'😭':1,'😣':1};
  var happy=0,sad=0,neutral=0;
  monthMoods.forEach(function(m){
    if(positiveSet[m.emoji]) happy++;
    else if(negativeSet[m.emoji]) sad++;
    else neutral++;
  });

  // ── Medals ──
  var medals=[]; try{medals=JSON.parse(safeLS('get','velo_medals')||'[]');}catch(e){}
  var monthMedals=medals.filter(function(m){ var d=new Date(m.ts||0); return d.getFullYear()===yr&&d.getMonth()===(mon-1); });

  // ── Supabase ──
  var reviewsData=[],totalReviews=0,helpedOthers=0,helpReceived=0;
  _initSupabase(); var myId=_myUserId();
  if(sbClient&&myId&&myId!=='guest'){
    try{
      await _ensureSbSession();
      var rvRes=await sbClient.from('reviews').select('stars,texto,reviewer_name')
        .eq('pro_id',myId).gte('created_at',cutStart).lte('created_at',cutEnd)
        .order('stars',{ascending:false}).limit(20);
      if(rvRes.data&&rvRes.data.length){
        totalReviews=rvRes.data.length;
        reviewsData=rvRes.data.filter(function(r){ return r.texto&&r.texto.trim(); }).slice(0,4);
        if(!reviewsData.length) reviewsData=rvRes.data.slice(0,3);
      }
    }catch(e){}
    try{ var gh=await sbClient.from('guardian_requests').select('id',{count:'exact',head:true}).eq('guardian_id',myId).eq('status','ended').gte('created_at',cutStart).lte('created_at',cutEnd); helpedOthers=gh.count||0; }catch(e){}
    try{ var gs=await sbClient.from('guardian_requests').select('id',{count:'exact',head:true}).eq('seeker_id',myId).eq('status','ended').gte('created_at',cutStart).lte('created_at',cutEnd); helpReceived=gs.count||0; }catch(e){}
  }

  var sadPct=monthMoods.length?Math.round(sad/monthMoods.length*100):0;

  if(!monthMoods.length&&!reviewsData.length){
    return {narrative:'No encontramos registros de '+mName+'. Para el próximo mes, registrá cómo te sentís cada día — así Gemini puede prepararte tu resumen personal. 💚',
      happy:0,neutral:0,sad:0,helped:helpedOthers,received:helpReceived,reviews:reviewsData,totalReviews:totalReviews,medals:monthMedals,recs:[],books:[],help_hint:null};
  }

  // ── Gemini prompt → structured JSON ──
  var moodCtx=monthMoods.length
    ?'Datos de ánimo de '+mName+' '+yr+':\n- Días felices/positivos: '+happy+'\n- Días tranquilos/neutrales: '+neutral+'\n- Días difíciles/tristes: '+sad+'\n- Total registrado: '+monthMoods.length+' días\n\n'
    :'';
  var actCtx=(helpedOthers?'- Acompañó a '+helpedOthers+' personas como guardián/a\n':'')+(helpReceived?'- Recibió apoyo en '+helpReceived+' ocasiones\n':'');
  var rvCtx=totalReviews?'- Recibió '+totalReviews+' reseña'+(totalReviews>1?'s':'')+' de la comunidad\n':'';
  var medalCtx=monthMedals.length?'- Medallas ganadas: '+monthMedals.map(function(m){return m.name||m.label||'🏅';}).join(', ')+'\n':'';
  var prompt='Sos el sistema de bienestar de Velo, una app de salud mental peer-to-peer.\n'
    +'Generá el resumen mensual personalizado para '+firstName+' sobre '+mName+' '+yr+'.\n\n'
    +moodCtx+(actCtx||rvCtx||medalCtx?'Actividad en la comunidad:\n'+actCtx+rvCtx+medalCtx+'\n':'')
    +'Devolvé ÚNICAMENTE un JSON válido con esta estructura (sin markdown, sin explicación):\n'
    +'{\n'
    +'"narrative": "4-6 oraciones cálidas y empáticas sobre el mes. Analizá el balance de ánimos con honestidad y compasión. '+(sadPct>=50?'IMPORTANTE: tuvo muchos días difíciles, sé muy empático/a y reconfortante. ':'')+'Celebrá los logros. Terminá con aliento para el mes siguiente. Español rioplatense, usá \'vos\'.",\n'
    +'"recs": [\n'
    +'  {"icon":"emoji","text":"actividad recomendada concreta y cotidiana (ej: escuchar música que levante el ánimo, juntarse con una persona querida, ver una película que te haga reír, salir a caminar al sol, respirar profundo 5 minutos antes de dormir)"},\n'
    +'  ... (3 o 4 recomendaciones breves y prácticas, del día a día)\n'
    +'],\n'
    +'"books": [\n'
    +'  {"title":"Título del libro","author":"Autor","why":"Una oración de por qué es bueno para este usuario este mes"},\n'
    +'  ... (2 libros de autoayuda, motivación o experiencias de vida, reales y conocidos)\n'
    +'],\n'
    +'"help_hint": '+(sadPct>=50?'"Una oración muy gentil y sin alarmismo que invite al usuario a hablar con alguien de la comunidad si lo necesita. No menciones terapia ni profesionales."':'null')+'\n'
    +'}\n'
    +'Todos los textos en español rioplatense (usá \'vos\', no \'tú\').';

  var raw=await _geminiCall(prompt,{temperature:0.82,maxOutputTokens:800});
  var parsed=null;
  if(raw){ try{ var m=raw.replace(/```json\n?|```/g,'').trim().match(/\{[\s\S]*\}/); if(m) parsed=JSON.parse(m[0]); }catch(e){} }

  if(!parsed) parsed={
    narrative:firstName+', '+mName+' tuvo '+(happy?happy+' días positivos':'')+(sad?' y '+sad+' días más difíciles':'')+'. Cada día que registrás tu ánimo es un acto de cuidado hacia vos mismo/a. ¡Seguí adelante! 💚',
    recs:[{icon:'🎵',text:'Escuchá música que te eleve el ánimo cuando llegues a casa'},{icon:'🫂',text:'Escribile a alguien querido esta semana'}],
    books:[{title:'El poder del ahora',author:'Eckhart Tolle',why:'Para soltar el peso del pasado y el futuro'},{title:'Hábitos atómicos',author:'James Clear',why:'Para construir pequeños cambios que se acumulan'}],
    help_hint:sadPct>=50?'Recordá que en Velo siempre hay alguien dispuesto a escucharte sin juzgarte.':null
  };

  var result={
    narrative:parsed.narrative||'',
    happy:happy,neutral:neutral,sad:sad,
    helped:helpedOthers,received:helpReceived,
    reviews:reviewsData,totalReviews:totalReviews,
    medals:monthMedals,
    recs:Array.isArray(parsed.recs)?parsed.recs.slice(0,4):[],
    books:Array.isArray(parsed.books)?parsed.books.slice(0,3):[],
    help_hint:parsed.help_hint||null
  };
  safeLS('set',cacheKey,JSON.stringify(result));
  return result;
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

function _previewMassImage(){
  var el=document.getElementById('massImageUrl');
  var prev=document.getElementById('massImgPreview');
  if(!prev) return;
  var url=(el&&el.value.trim())||'';
  prev.innerHTML=url?'<img src="'+_escHtml(url)+'" style="width:100%;max-height:120px;object-fit:cover;border-radius:8px;border:1px solid rgba(255,255,255,.1)" onerror="this.parentElement.innerHTML=\'<span style=font-size:11px;color:rgba(255,100,100,.6)>URL de imagen no válida</span>\'">':'';
}

async function pSendMassMessage(target){
  var subj = document.getElementById('massSubject');
  var body = document.getElementById('massBody');
  var imgEl= document.getElementById('massImageUrl');
  if(!subj || !subj.value.trim()){ pToast('⚠️','Ingresá un asunto'); return; }
  if(!body || !body.value.trim()){ pToast('⚠️','Escribí el mensaje'); return; }
  var subject  = subj.value.trim();
  var message  = body.value.trim();
  var imageUrl = imgEl ? imgEl.value.trim() : '';
  var icon     = target === 'pros' ? '🩺' : '📢';
  var sender   = 'Velo — Comunicado '+(target === 'pros' ? 'Profesionales' : 'Comunidad');

  var saved = await sbSaveBroadcast(target, subject, message, icon, sender, imageUrl);

  var broadcasts = []; try{ broadcasts = JSON.parse(safeLS('get','velo_broadcasts')||'[]'); }catch(e){}
  broadcasts.unshift({ id:'mass-'+Date.now(), ts:Date.now(), target:target, subject:subject, body:message, icon:icon, sender:sender, sentBy:_ADMIN_EMAIL, imageUrl:imageUrl||undefined });
  safeLS('set','velo_broadcasts', JSON.stringify(broadcasts.slice(0,200)));

  var ov = document.getElementById('massMessageOv');
  if(ov) ov.remove();
  var recipientLabel = target === 'pros' ? 'profesionales' : 'usuarios';
  pToast('📤', saved ? 'Mensaje enviado a todos los '+recipientLabel+' ✅' : 'Enviado localmente (sin conexión)');
  _renderAdmin();
}

async function sbSaveBroadcast(target, subject, body, icon, sender, imageUrl){
  if(!sbClient) return false;
  try{
    var row = { target:target, subject:subject, body:body, icon:icon||'📢', sender:sender||'Velo', sent_at:new Date().toISOString() };
    if(imageUrl) row.image_url = imageUrl;
    var {error} = await sbClient.from('broadcasts').insert(row);
    return !error;
  }catch(e){ return false; }
}

async function sbLoadBroadcasts(userType){
  if(!sbClient) return null;
  try{
    var since = new Date(Date.now() - 90*24*3600*1000).toISOString();
    var myId  = safeLS('get','velo_user_id') || '';
    // Load role-based broadcasts AND personal ones (bottle replies, etc.)
    var targets = [userType, 'all'];
    if(myId) targets.push('user:'+myId);
    var {data,error} = await sbClient.from('broadcasts')
      .select('*')
      .in('target', targets)
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
    try{ await sbClient.from('profiles').insert({ id:data.user.id, nombre:nombre, email:email, role:'user', created_at:new Date().toISOString() }); }catch(e){}
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

async function sbSaveContact(topic, mensaje, email, userName, userId, source){
  if(!sbClient) return false;
  try{
    var {error} = await sbClient.from('contacts').insert({
      topic: topic||'General',
      mensaje: mensaje,
      user_email: email||'anónimo',
      user_name: userName||'',
      user_id: userId||null,
      source: source||'web',
      leido: false,
      fecha: new Date().toISOString()
    });
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

async function sbSaveAdminNews(item){
  if(!sbClient) return false;
  try{
    var {error} = await sbClient.from('admin_news').insert({
      titulo: item.titulo, cuerpo: item.cuerpo, emoji: item.emoji||'📰',
      source_url: item.sourceUrl||'', source_name: item.sourceName||'', active: true
    });
    return !error;
  }catch(e){ return false; }
}

async function sbLoadAdminNews(){
  if(!sbClient) return [];
  try{
    var {data,error} = await sbClient.from('admin_news')
      .select('*').eq('active',true).order('created_at',{ascending:false}).limit(20);
    return error ? [] : (data||[]);
  }catch(e){ return []; }
}

async function sbToggleAdminNews(id, active){
  if(!sbClient) return;
  try{ await sbClient.from('admin_news').update({active:active}).eq('id',id); }catch(e){}
}

async function sbDeleteAdminNews(id){
  if(!sbClient) return;
  try{ await sbClient.from('admin_news').delete().eq('id',id); }catch(e){}
}

// ── ADMIN: NOTICIAS MANUALES ──────────────────────────────────
function pOpenAdminNews(){ openModal('adminNewsOv'); }

async function pAdminPublishNews(){
  var titulo = (document.getElementById('adminNewsTitulo')||{}).value||'';
  var cuerpo = (document.getElementById('adminNewsCuerpo')||{}).value||'';
  var url    = (document.getElementById('adminNewsUrl')||{}).value||'';
  var source = (document.getElementById('adminNewsSource')||{}).value||'';
  var emoji  = (document.getElementById('adminNewsEmoji')||{}).value||'📰';
  if(!titulo.trim()){ pToast('⚠️','Escribí un título'); return; }
  if(!cuerpo.trim()){ pToast('⚠️','Escribí un resumen'); return; }
  var btn = document.querySelector('#adminNewsOv .p-btn--primary');
  if(btn){ btn.disabled=true; btn.textContent='Publicando...'; }
  _initSupabase();
  var ok = await sbSaveAdminNews({ titulo:titulo.trim(), cuerpo:cuerpo.trim(), emoji:emoji.trim()||'📰', sourceUrl:url.trim(), sourceName:source.trim() });
  if(btn){ btn.disabled=false; btn.textContent='Publicar noticia 🌟'; }
  if(ok){
    pToast('🌟','Noticia publicada');
    closeModal('adminNewsOv');
    ['adminNewsTitulo','adminNewsCuerpo','adminNewsUrl','adminNewsSource'].forEach(function(id){ var e=document.getElementById(id); if(e) e.value=''; });
    safeLS('del','velo_goodnews_'+new Date().toISOString().slice(0,10));
    pAdminRenderNewsList();
  } else {
    pToast('⚠️','Error al publicar — ¿corriste el SQL de Fase 2?');
  }
}

async function pAdminRenderNewsList(){
  var el = document.getElementById('adminNewsList');
  if(!el) return;
  el.innerHTML = '<div style="font-size:11px;color:rgba(255,255,255,.3)">Cargando...</div>';
  _initSupabase();
  var items = await sbLoadAdminNews();
  if(!items.length){ el.innerHTML = '<div style="font-size:11px;color:rgba(255,255,255,.3);font-style:italic">Sin noticias publicadas aún.</div>'; return; }
  el.innerHTML = items.map(function(n){
    return '<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:10px 12px;margin-bottom:8px;display:flex;align-items:flex-start;gap:10px">'
      +'<div style="font-size:20px;flex-shrink:0">'+_escHtml(n.emoji||'📰')+'</div>'
      +'<div style="flex:1;min-width:0">'
      +'<div style="font-size:12px;font-weight:700;color:rgba(255,255,255,.8);margin-bottom:2px">'+_escHtml(n.titulo)+'</div>'
      +(n.source_url?'<a href="'+_escHtml(n.source_url)+'" target="_blank" style="font-size:10px;color:rgba(116,198,157,.8)">'+_escHtml(n.source_name||n.source_url)+'</a>':'')
      +'</div>'
      +'<button onclick="pAdminDeleteNews(\''+n.id+'\')" style="font-size:11px;padding:3px 8px;background:rgba(231,76,60,.15);border:1px solid rgba(231,76,60,.3);color:rgba(231,120,110,.9);border-radius:6px;cursor:pointer;flex-shrink:0">🗑️</button>'
      +'</div>';
  }).join('');
}

function pAdminDeleteNews(id){
  sbDeleteAdminNews(id).then(function(){
    safeLS('del','velo_goodnews_'+new Date().toISOString().slice(0,10));
    pAdminRenderNewsList();
    pToast('🗑️','Noticia eliminada');
  });
}

function _adminFinCard(label, value){
  return '<div style="background:rgba(200,162,0,.06);border:1px solid rgba(200,162,0,.18);border-radius:10px;padding:10px 12px">'
    +'<div style="font-size:18px;font-weight:800;color:rgba(200,162,0,.95)">'+value+'</div>'
    +'<div style="font-size:10px;color:rgba(255,255,255,.4);margin-top:2px">'+label+'</div>'
    +'</div>';
}

async function _renderAdminDonations(){
  var el = document.getElementById('adminDonations');
  if(!el) return;
  _initSupabase();
  if(!sbClient){ el.innerHTML = '<p style="font-size:11px;color:rgba(255,255,255,.3)">Sin conexión</p>'; return; }
  try{
    var res = await sbClient.from('donations').select('*').order('created_at',{ascending:false}).limit(200);
    var data = res.data || [];
    var totalDon = 0, totalPlus = 0, totalPro = 0;
    data.forEach(function(d){
      var a = parseFloat(d.amount)||0;
      if(d.tipo==='plus') totalPlus += a;
      else if(d.tipo==='pro-sub') totalPro += a;
      else totalDon += a;
    });
    // 20% commission on professional consultations (from bookings)
    var commission = 0, pendingTransfer = 0;
    try{
      var bk = await sbClient.from('bookings').select('amount,commission,paid');
      (bk.data||[]).forEach(function(b){
        commission += parseFloat(b.commission)||0;
        if(!b.paid) pendingTransfer += (parseFloat(b.amount)||0) - (parseFloat(b.commission)||0);
      });
    }catch(e){}
    var grand = totalDon + totalPlus + totalPro + commission;
    el.innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">'
      + _adminFinCard('💚 Donaciones', '$'+totalDon.toFixed(2))
      + _adminFinCard('⭐ Suscripciones Plus', '$'+totalPlus.toFixed(2))
      + _adminFinCard('💼 Comisión 20% consultas', '$'+commission.toFixed(2))
      + _adminFinCard('🏦 Pendiente transferir a pros', '$'+pendingTransfer.toFixed(2))
      + _adminFinCard('💰 Ingreso total', '$'+grand.toFixed(2))
      +'</div>'
      + (data.length
        ? '<div style="font-size:10px;font-weight:700;color:rgba(255,255,255,.3);letter-spacing:1px;margin-bottom:6px">ÚLTIMOS MOVIMIENTOS</div>'
          + data.slice(0,10).map(function(d){
              var fecha = d.created_at ? new Date(d.created_at).toLocaleDateString('es',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '';
              var icon = d.tipo==='plus'?'⭐':d.tipo==='pro-sub'?'🩺':'💚';
              return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.05)">'
                +'<span style="font-size:15px">'+icon+'</span>'
                +'<div style="flex:1;min-width:0"><div style="font-size:11px;color:rgba(255,255,255,.6);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+_escHtml(d.user_email||'anónimo')+'</div>'
                +'<div style="font-size:9px;color:rgba(255,255,255,.25)">'+fecha+'</div></div>'
                +'<span style="font-size:12px;font-weight:700;color:rgba(200,162,0,.9)">$'+(parseFloat(d.amount)||0).toFixed(2)+'</span>'
                +'</div>';
            }).join('')
        : '<p style="font-size:11px;color:rgba(255,255,255,.3);font-style:italic">Sin movimientos aún. Se registran automáticamente con cada donación o suscripción.</p>');
  }catch(e){
    el.innerHTML = '<p style="font-size:11px;color:rgba(255,255,255,.3)">Sin datos — ¿corriste el SQL de Fase 2?</p>';
  }
}

function pAdminToggleNewsOnly(checked){
  if(checked) safeLS('set','velo_admin_news_only','1');
  else safeLS('del','velo_admin_news_only');
  safeLS('del','velo_goodnews_'+new Date().toISOString().slice(0,10));
  pToast(checked?'📰':'🤖', checked?'Hoy se muestran solo noticias manuales':'Noticias automáticas reactivadas');
}

// ── ADMIN: GESTIÓN DE USUARIOS ────────────────────────────────
async function pAdminGrantPlus(){
  var el = document.getElementById('adminGrantPlusEmail');
  if(!el || !el.value.trim()){ pToast('⚠️','Ingresá el correo del usuario'); return; }
  var email = el.value.trim().toLowerCase();
  _initSupabase();
  if(!sbClient){ pToast('⚠️','Sin conexión a Supabase'); return; }
  var expires = new Date(Date.now()+30*24*3600*1000).toISOString();
  try{
    var profRes = await sbClient.from('profiles').select('id').eq('email',email).limit(1);
    if(profRes.data && profRes.data[0]){
      await sbClient.from('profiles').update({ role:'plus', plus_expires_at:expires }).eq('id',profRes.data[0].id);
    }
    await sbClient.from('plus_grants').insert({ email:email, expires_at:expires });
    pToast('⭐','Velo Plus activado 30 días para '+email);
    el.value = '';
  }catch(e){ pToast('⚠️','Error al activar Plus'); }
}

async function pAdminDeleteUser(id, email){
  if(!window.confirm('¿Eliminar al usuario '+(email||id)+'?\nEsta acción no se puede deshacer.')) return;
  _initSupabase();
  if(!sbClient){ pToast('⚠️','Sin conexión'); return; }
  try{
    await sbClient.from('profiles').delete().eq('id', id);
    pToast('🗑️','Usuario eliminado');
    _renderAdmin();
  }catch(e){ pToast('⚠️','Error al eliminar'); }
}

async function pAdminSendPasswordReset(email){
  if(!email){ pToast('⚠️','Sin correo'); return; }
  _initSupabase();
  if(!sbClient){ pToast('⚠️','Sin conexión'); return; }
  try{
    await sbClient.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname });
    pToast('📧','Email de recuperación enviado a '+email);
  }catch(e){ pToast('⚠️','Error al enviar recuperación'); }
}

async function sbMarkContactRead(id){
  if(!sbClient) return;
  try{ await sbClient.from('contacts').update({leido:true}).eq('id',id); }catch(e){}
}

async function sbUpdateContactReply(id, replyText, allowReply){
  if(!sbClient) return false;
  try{
    var {error} = await sbClient.from('contacts').update({
      reply: replyText,
      allow_reply: !!allowReply,
      reply_at: new Date().toISOString()
    }).eq('id', id);
    return !error;
  }catch(e){ return false; }
}

async function sbLoadRepliedContacts(email){
  if(!sbClient || !email) return [];
  try{
    var {data,error} = await sbClient.from('contacts')
      .select('*')
      .eq('user_email', email)
      .not('reply', 'is', null)
      .order('reply_at', {ascending:false})
      .limit(20);
    return error ? [] : (data||[]);
  }catch(e){ return []; }
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
  var displayName = encodeURIComponent(safeLS('get','velo_user_name')||'Usuario Velo');
  var url = 'https://meet.jit.si/'+room+'#userInfo.displayName='+displayName+'&config.startWithAudioMuted=false&config.prejoinPageEnabled=false&config.toolbarButtons=["microphone","camera","hangup","fullscreen","chat","tileview"]';

  // Embed in iframe inside the session room
  var container = document.getElementById('jitsiContainer');
  var frame     = document.getElementById('jitsiFrame');
  var btn       = document.getElementById('jitsiStartBtn');
  if(frame && container){
    frame.src = url;
    container.style.display = 'block';
    if(btn){ btn.textContent = '📹 Videollamada activa'; btn.style.opacity = '.6'; btn.disabled = true; }
    pToast('📹','Videollamada iniciada — usá auriculares 🎧');
  } else {
    // Fallback: new tab
    window.open('https://meet.jit.si/'+room, '_blank', 'noopener');
    pToast('📹','Videollamada abierta en nueva pestaña');
  }

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

function _recordDonation(tipo, amount){
  _initSupabase();
  if(!sbClient) return;
  try{
    sbClient.from('donations').insert({
      user_email: safeLS('get','velo_user_email')||'anónimo',
      amount: parseFloat(amount)||0, currency:'USD', tipo: tipo
    }).then(function(){}).catch(function(){});
  }catch(e){}
}

function _checkPayPalReturn(){
  var params = new URLSearchParams(window.location.search);
  var ppParam = params.get('pp');
  var ppTok = params.get('token') || params.get('paymentId') || params.get('subscription_id') || ppParam;
  if(!ppTok) return;
  // Handle cancel before reading pending — avoids accidental Plus activation on cancelled payment
  if(ppParam === 'cancel'){
    safeLS('del','velo_pp_pending');
    window.history.replaceState({}, '', window.location.pathname);
    return;
  }
  var pending = null; try{ pending = JSON.parse(safeLS('get','velo_pp_pending')||'null'); }catch(e){}
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
    _recordDonation('plus', 2.99);
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
    _recordDonation('pro-sub', 0);
    pToast('🩺','¡Registro profesional completado! 💚');
    window.history.replaceState({}, '', window.location.pathname);
    pGoTo('pro-panel');
  } else {
    // donation
    pToast('💚','¡Donación recibida! Gracias por apoyar Velo 🌿');
    // Send donation thank-you email (fire-and-forget)
    var _ppEmail = safeLS('get','velo_user_email');
    var _ppName  = safeLS('get','velo_user_name') || '';
    var _ppAmt   = pending && pending.amount ? pending.amount : '';
    _recordDonation('donation', _ppAmt);
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
var _rptPreview = '';
function pReportContent(type, id, preview){
  _rptPreview = preview || '';
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

  // AI review: verify if content truly violates rules, using preview stored at open time
  _aiReviewReport(type, id, detail || _rptPreview, checked.value);

  // Mark content as hidden until admin resolves
  var hidden = []; try{ hidden = JSON.parse(safeLS('get','velo_hidden_content')||'[]'); }catch(e){}
  if(hidden.indexOf(reportId) < 0){ hidden.push(reportId); safeLS('set','velo_hidden_content', JSON.stringify(hidden)); }

  // Hide the reported content from UI
  if(type === 'bottle'){
    safeLS('set','velo_reported_bottle_'+id,'1');
    var bottleCard = document.getElementById('bottle-'+id) || document.querySelector('[data-id="'+id+'"]');
    if(bottleCard){ bottleCard.style.transition='opacity .35s'; bottleCard.style.opacity='0'; setTimeout(function(){ pRenderBottle(); }, 380); }
  } else if(type === 'happy'){
    var happyCard = document.querySelector('.happy-card[data-id="'+id+'"]');
    if(happyCard){ happyCard.style.transition='opacity .35s'; happyCard.style.opacity='0'; setTimeout(function(){ happyCard.remove(); }, 380); }
  } else if(type === 'help'){
    var helpCard = document.getElementById('help-'+id) || document.querySelector('[data-id="'+id+'"]');
    if(helpCard){ helpCard.style.transition='opacity .35s'; helpCard.style.opacity='0'; setTimeout(function(){ helpCard.remove(); }, 380); }
  }

  pToast('✅','Reporte enviado. El contenido quedó oculto hasta que lo revise el equipo de Velo 🙏');
}

function pReportDMChat(){
  if(!_dmPeer) return;
  pReportContent('dm', 'dm-'+_dmPeer.id, 'Chat con '+(_dmPeer.name||'usuario'));
}

async function _aiReviewReport(type, id, content, userReason){
  if(!content || content.length < 5) return;
  var prompt = 'Sos el sistema de moderación de Velo, una app de salud mental peer-to-peer.\n'
    +'Un usuario reportó este contenido con el motivo: "'+userReason+'".\n'
    +'Analizá el contenido y determiná si realmente viola las normas de la comunidad.\n'
    +'Normas violadas: acoso, agresión, discriminación, spam, información médica peligrosa, incitación a autolesiones.\n'
    +'NO es violación: expresiones de dolor, tristeza, crisis personal, pedidos de ayuda genuinos.\n'
    +'Respondé SOLO con JSON: {"viola": true/false, "tipo": "acoso|spam|contenido_peligroso|ninguno", "gravedad": "alta|media|baja", "justificacion": "breve razon"}\n\n'
    +'Contenido reportado: "'+content.replace(/"/g,"'").slice(0,300)+'"';
  try{
    var result = await _geminiCall(prompt);
    if(!result) return;
    var match = result.match(/\{[\s\S]*\}/);
    if(!match) return;
    var data = JSON.parse(match[0]);
    _initSupabase();
    if(data.viola && sbClient){
      sbClient.from('moderation_flags').insert({
        section: type, tipo: data.tipo, gravedad: data.gravedad||'media',
        content: content.slice(0,300), user_id: safeLS('get','velo_user_id')||'',
        resolved: false, resolution: null
      }).then(function(){}).catch(function(){});
    }
    var audit = []; try{ audit = JSON.parse(safeLS('get','velo_audit_log')||'[]'); }catch(e){}
    audit[0] = Object.assign(audit[0]||{}, { aiVerdict: data.viola ? 'VIOLA:'+data.tipo : 'ok', aiJustif: data.justificacion });
    safeLS('set','velo_audit_log', JSON.stringify(audit.slice(0,500)));
  }catch(e){}
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
  var userEmail = safeLS('get','velo_user_email') || '';
  var userName  = safeLS('get','velo_user_name')  || '';
  var ov = document.createElement('div');
  ov.className = 'p-modal-ov show';
  ov.innerHTML = '<div class="p-sheet">'
    +'<div class="p-sheet-handle"></div>'
    +'<div style="font-family:\'Cormorant Garamond\',serif;font-size:22px;color:var(--ink);margin-bottom:8px">Contactanos 💚</div>'
    +'<p style="font-size:12px;color:var(--ink4);margin-bottom:16px;line-height:1.6">¿Tenés alguna pregunta, sugerencia o problema técnico? Escribinos y te respondemos a la brevedad.</p>'
    +(userName && userEmail
      ? '<div style="font-size:12px;color:var(--ink3);background:var(--cream2);border-radius:10px;padding:8px 12px;margin-bottom:12px">👤 <strong>'+_escHtml(userName)+'</strong> · 📧 '+_escHtml(userEmail)+'</div>'
      : '<div class="p-field"><label class="p-field-label">Tu nombre <span style="color:var(--sos)">*</span></label><input class="p-input" type="text" data-cus-name placeholder="¿Cómo te llamás?" maxlength="60"></div>'
        +'<div class="p-field"><label class="p-field-label">Tu correo <span style="color:var(--sos)">*</span></label><input class="p-input" type="email" data-cus-email placeholder="para enviarte la respuesta"></div>')
    +'<div class="p-field"><label class="p-field-label">Asunto</label>'
    +'<select class="p-input" data-cus-topic style="appearance:none">'
    +'<option>Consulta general</option><option>Problema técnico</option><option>Sugerencia de mejora</option><option>Reporte de seguridad</option><option>Solicitud de datos</option>'
    +'</select></div>'
    +'<div class="p-field"><label class="p-field-label">Mensaje</label>'
    +'<textarea class="p-textarea" data-cus-msg rows="4" placeholder="Contanos qué necesitás..."></textarea></div>'
    +'<div style="display:flex;gap:8px">'
    +'<button class="p-btn p-btn--primary p-btn--md p-btn--full" onclick="pSendContactModal(this.closest(\'.p-modal-ov\'))">Enviar mensaje</button>'
    +'<button class="p-btn p-btn--secondary p-btn--md p-btn--full" onclick="this.closest(\'.p-modal-ov\').remove()">Cancelar</button>'
    +'</div>'
    +'<div style="height:8px"></div>'
    +'<p style="font-size:11px;color:var(--ink5);text-align:center">También podés escribirnos a <strong>consultas@heyvelo.app</strong></p>'
    +'</div>';
  document.body.appendChild(ov);
}

function pSendContactModal(ov){
  var msg        = ov ? ov.querySelector('[data-cus-msg]')   : null;
  var topic      = ov ? ov.querySelector('[data-cus-topic]') : null;
  var emailInput = ov ? ov.querySelector('[data-cus-email]') : null;
  var nameInput  = ov ? ov.querySelector('[data-cus-name]')  : null;
  var email = safeLS('get','velo_user_email') || (emailInput ? emailInput.value.trim() : '');
  var name  = safeLS('get','velo_user_name')  || (nameInput  ? nameInput.value.trim()  : '');
  if(nameInput  && !name){ pToast('👤','Ingresá tu nombre'); return; }
  if(emailInput && (!email || !email.includes('@'))){ pToast('📧','Ingresá un correo válido para responderte'); return; }
  if(!msg || !msg.value.trim()){ pToast('✍️','Escribí tu mensaje'); return; }
  var text     = msg.value.trim();
  var topicVal = topic ? topic.value : 'Consulta general';
  var userId   = safeLS('get','velo_user_id') || '';
  var source   = _authenticated ? 'logged-in' : 'pre-login';
  var ts = Date.now();
  var msgs = []; try{ msgs = JSON.parse(safeLS('get','velo_admin_contacts')||'[]'); }catch(e){}
  msgs.unshift({ id:'c-'+ts, topic:topicVal, mensaje:text, user_email:email||'anónimo', user_name:name, user_id:userId, source:source, fecha:new Date().toISOString(), leido:false });
  safeLS('set','velo_admin_contacts', JSON.stringify(msgs.slice(0,200)));
  sbSaveContact(topicVal, text, email||'anónimo', name, userId, source).catch(function(){});
  if(ov) ov.remove();
  pToast('💌','¡Mensaje enviado'+(name ? ', '+name:'')+'! Te respondemos pronto 💚');
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
    case 'register':    _botGuardInit(); break;
    case 'pro-reg':     _botGuardInit(); break;
    case 'home':        _loadHomeData(); break;
    case 'guardians':
      _initSupabase();
      if(sbClient && !_guardianRtCh) _guardianRtCh = _sbSub('velo:guardians', 'guardian_presence', function(){ pRenderGuardians(); });
      pRenderGuardians();
      break;
    case 'professionals': pRenderProfessionals(); break;
    case 'help':
      _initSupabase();
      if(sbClient && !_helpRtCh) _helpRtCh = _sbSub('velo:help', 'help_posts', function(){ pRenderHelp(); });
      pRenderHelp();
      _checkPendingSupportMessages();
      break;
    case 'help-chat':   /* initialized by pAccompanyHelp */ break;
    case 'bottle':
      _initSupabase();
      if(sbClient && !_bottleRtCh) _bottleRtCh = _sbSub('velo:bottles', 'bottles', function(){ pRenderBottle(); });
      pRenderBottle();
      break;
    case 'diary':       pInitDiary(); break;
    case 'mood':        pInitMood(); break;
    case 'respira':     pInitRespira(); break;
    case 'vela':        pInitVela(); break;
    case 'circles':     pRenderCircles(); break;
    case 'feed':        _renderCircleMessages(); break;
    case 'happy':
      _initSupabase();
      if(sbClient && !_happyRtCh) _happyRtCh = _sbSub('velo:happy', 'happy_posts', function(){ pRenderHappy(); });
      pRenderHappy();
      break;
    case 'profile':     pLoadProfile(); break;
    case 'inbox':       pRenderInbox(); break;
    case 'contacts':    pRenderContacts(); break;
    case 'dm-chat':     /* initialized by pOpenDM */ break;
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
    case 'pick-username':
      // Reset form state when entering pick-username page
      var puInp = document.getElementById('pickUsernameInput');
      var puSt  = document.getElementById('pickUsernameStatus');
      var puBtn = document.getElementById('pickUsernameBtn');
      if(puInp) puInp.value = '';
      if(puSt)  puSt.innerHTML = '';
      if(puBtn){ puBtn.disabled = true; puBtn.style.opacity = '.5'; }
      break;
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

function pShowMsgActions(btn, msgId, text, inputId, replyBarId, senderName){
  _initMsgActions();
  _msgPopupData = { msgId:msgId, text:text, inputId:inputId, replyBarId:replyBarId, senderName:senderName||'' };
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
  var msgId = _msgPopupData ? _msgPopupData.msgId : null;
  // Also allow clicking existing reaction chips (msgId comes from data-sb-id parent)
  if(!msgId) return;
  var msgEl = document.getElementById(msgId);
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
    chip.onclick = function(){ _msgReactFromChip(chip, msgId); };
    rxBar.appendChild(chip);
  }
  // Save to Supabase (circle_messages or direct_messages)
  var sbId = msgEl.getAttribute('data-sb-id');
  if(sbId && sbClient){
    var updatedReactions = {};
    rxBar.querySelectorAll('.msg-reaction').forEach(function(ch){
      var e2 = ch.getAttribute('data-emoji');
      var c2 = parseInt(ch.getAttribute('data-cnt')||'1',10);
      if(e2) updatedReactions[e2] = c2;
    });
    var sbParts = sbId.split(':');
    var sbTable = sbParts.length > 1 ? sbParts[0] : 'circle_messages';
    var sbRowId = sbParts.length > 1 ? sbParts.slice(1).join(':') : sbId;
    sbClient.from(sbTable).update({ reactions: updatedReactions }).eq('id', sbRowId)
      .then(function(){}).catch(function(){});
  }
  _msgPopupData = null;
}

function _msgReactFromChip(chip, msgId){
  var cc = parseInt(chip.getAttribute('data-cnt')||'1',10)+1;
  chip.setAttribute('data-cnt',cc);
  chip.textContent = chip.getAttribute('data-emoji')+' '+cc;
  var msgEl = document.getElementById(msgId);
  var sbId = msgEl ? msgEl.getAttribute('data-sb-id') : null;
  if(sbId && sbClient){
    var updatedReactions = {};
    var rxBar = msgEl.querySelector('.msg-rx-bar');
    if(rxBar) rxBar.querySelectorAll('.msg-reaction').forEach(function(ch){
      var e2 = ch.getAttribute('data-emoji');
      var c2 = parseInt(ch.getAttribute('data-cnt')||'1',10);
      if(e2) updatedReactions[e2] = c2;
    });
    var sbParts2 = sbId.split(':');
    var sbTable2 = sbParts2.length > 1 ? sbParts2[0] : 'circle_messages';
    var sbRowId2 = sbParts2.length > 1 ? sbParts2.slice(1).join(':') : sbId;
    sbClient.from(sbTable2).update({ reactions: updatedReactions }).eq('id', sbRowId2)
      .then(function(){}).catch(function(){});
  }
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
    var namePrefix = _msgPopupData.senderName ? _msgPopupData.senderName+': ' : '';
    if(textEl) textEl.textContent = '↩  '+namePrefix+preview;
    bar.setAttribute('data-reply-text', _msgPopupData.text);
    bar.setAttribute('data-reply-name', _msgPopupData.senderName||'');
  }
  var inp = document.getElementById(_msgPopupData.inputId);
  if(inp){ inp.focus(); }
}

function pClearReplyBar(barId){
  var bar = document.getElementById(barId);
  if(!bar) return;
  bar.style.display = 'none';
  bar.removeAttribute('data-reply-text');
  bar.removeAttribute('data-reply-name');
}

function _getReplyQuote(barId){
  var bar = document.getElementById(barId);
  if(!bar || bar.style.display === 'none') return '';
  var text = bar.getAttribute('data-reply-text') || '';
  var name = bar.getAttribute('data-reply-name') || '';
  if(!text) return '';
  return name ? name+': '+text : text;
}

function _highlightMentions(text){
  var escaped = _escHtml(text);
  return escaped.replace(/@([\wÀ-ɏ]+)/g, '<span class="msg-mention">@$1</span>');
}

function _buildMsgBubble(text, isUser, av, senderName, inputId, replyBarId, quoteText, reactions, sbId, senderId){
  var id  = _nextMsgId();
  var t   = new Date();
  var ts  = t.getHours()+':'+(t.getMinutes()<10?'0':'')+t.getMinutes();
  var quotePart = quoteText ? '<div class="reply-quote">'+_escHtml(quoteText.slice(0,80)+(quoteText.length>80?'…':''))+'</div>' : '';
  var actionBtn = '<button class="msg-action-btn" onclick="pShowMsgActions(this,'+_jsAttr(id)+','+_jsAttr(text)+','+_jsAttr(inputId)+','+_jsAttr(replyBarId)+','+_jsAttr(isUser?'':senderName||'')+',\'\')" aria-label="Acciones">•••</button>';
  var sbAttr = sbId ? ' data-sb-id="'+sbId+'"' : '';
  var rxHtml = '';
  if(reactions && typeof reactions === 'object'){
    var chips = Object.keys(reactions).map(function(e){
      var cnt = reactions[e]||1;
      return '<span class="msg-reaction" data-emoji="'+e+'" data-cnt="'+cnt+'" onclick="_msgReact(\''+e+'\')">'+e+' '+cnt+'</span>';
    }).join('');
    if(chips) rxHtml = '<div class="msg-rx-bar">'+chips+'</div>';
  }
  if(isUser){
    safeLS('set','velo_total_msgs', String(parseInt(safeLS('get','velo_total_msgs')||'0',10)+1));
    return '<div class="feed-msg feed-msg--own" id="'+id+'"'+sbAttr+' style="position:relative">'
      +'<div class="msg-wrap">'
      +actionBtn
      +'<div class="feed-bubble feed-bubble--own">'+quotePart+_highlightMentions(text)+'<span class="feed-time">'+ts+'</span></div>'
      +'</div>'+rxHtml+'</div>';
  } else {
    var canProfile = !!(senderName && senderName !== 'Usuario Anónimo' && senderName !== 'Anónimo');
    var avClickAttr = canProfile
      ? ' style="cursor:pointer" onclick="pQuickProfile('+_jsAttr(senderName)+','+_jsAttr(av||'🌿')+',\'\',\'\','+_jsAttr(senderId||'')+')"'
      : '';
    var _sUname = senderId ? _uLook(senderId) : '';
    var _sUnameTag = _sUname ? '<span style="font-size:9px;display:block;color:var(--ink5);font-weight:500;margin-top:0px;line-height:1.2">@'+_escHtml(_sUname)+'</span>' : '';
    var senderHtml = canProfile
      ? '<div class="feed-sender" style="font-size:11px;color:var(--ink4);cursor:pointer;line-height:1.2" onclick="pQuickProfile('+_jsAttr(senderName)+','+_jsAttr(av||'🌿')+',\'\',\'\','+_jsAttr(senderId||'')+')">'+_escHtml(senderName)+_sUnameTag+'</div>'
      : '<div class="feed-sender" style="font-size:11px;color:var(--ink4)">'+(senderName||'')+'</div>';
    return '<div class="feed-msg" id="'+id+'"'+sbAttr+' style="position:relative">'
      +'<div class="feed-av"'+avClickAttr+'>'+_avInline(av||'🌿',36)+'</div>'
      +'<div>'+senderHtml
      +'<div class="msg-wrap">'
      +'<div class="feed-bubble">'+quotePart+_highlightMentions(text)+'<span class="feed-time">'+ts+'</span></div>'
      +actionBtn
      +'</div>'+rxHtml+'</div></div>';
  }
}

document.addEventListener('DOMContentLoaded', function(){
  _initSupabase();
  _initMsgActions();
  _botGuardStartListeners();
  setTimeout(_restoreSeekerSubscription, 2000);
});

window.addEventListener('load', function(){
  _initSupabase();
  _checkStripeReturn();
  _checkPayPalReturn();

  // Detect Supabase auth redirect type from both hash and query params
  // (Supabase v2 may use either format depending on flow/version)
  var _urlRaw = (window.location.hash || '') + '&' + (window.location.search || '');
  var _urlAuthType = _urlRaw.includes('type=recovery')    ? 'recovery'
                   : _urlRaw.includes('type=signup')      ? 'signup'
                   : _urlRaw.includes('type=email_change') ? 'email_change'
                   : null;

  // Handle Supabase email confirmation redirect (type=signup)
  if(_urlAuthType === 'signup'){
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

  // Handle password recovery link (type=recovery)
  // SECURITY: always destroy any admin session before allowing password change
  if(_urlAuthType === 'recovery'){
    safeLS('set','velo_user_type','user');
    safeLS('del','velo_admin_session');
    _userType = 'user';
    safeLS('set','velo_needs_pw_change','1');
    _initSupabase();
    if(sbClient){
      sbClient.auth.onAuthStateChange(function(event, session){
        // Handle both PASSWORD_RECOVERY and SIGNED_IN (Supabase may emit either)
        if(event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN'){
          if(session && session.user){
            safeLS('set','velo_user_email', session.user.email||'');
            safeLS('set','velo_session','1');
            _authenticated = true;
          }
          safeLS('set','velo_user_type','user');
          safeLS('del','velo_admin_session');
          _userType = 'user';
          safeLS('set','velo_needs_pw_change','1');
          pGoTo('change-password');
        }
      });
    } else {
      pGoTo('change-password');
    }
    return;
  }

  // Handle email change confirmation link (type=email_change)
  if(_urlAuthType === 'email_change'){
    safeLS('set','velo_user_type','user');
    safeLS('del','velo_admin_session');
    _userType = 'user';
    _initSupabase();
    if(sbClient){
      sbClient.auth.onAuthStateChange(function(event, session){
        if((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session && session.user){
          safeLS('set','velo_user_email', session.user.email||'');
          safeLS('set','velo_session','1');
          safeLS('set','velo_user_type','user');
          safeLS('del','velo_admin_session');
          _authenticated = true;
          pToast('✅','Email actualizado correctamente');
          setTimeout(function(){ pGoTo('home'); }, 600);
        }
      });
    } else {
      pToast('✅','Email actualizado');
      pGoTo('home');
    }
    return;
  }

  // Check auth state
  var session = safeLS('get','velo_session');
  var type = safeLS('get','velo_user_type') || 'user';
  _userType = type;

  if(session === '1'){
    _authenticated = true;
    _trackVisitDay(); // Record today — runs on every app open, not just explicit login
    // Sync profile from Supabase on every app start so name/avatar stay current
    setTimeout(function(){ _sbSyncProfile(safeLS('get','velo_user_id')); }, 1500);
    // Pull visit count from Supabase to sync across devices / after localStorage clear
    setTimeout(_pullVisitCountFromSB, 2500);
    setTimeout(_startGuardianHeartbeat, 2000);
    setTimeout(_startGlobalDMListener, 3000);
    setTimeout(_startBuzónListener, 3200);
    setTimeout(_syncFavsFromSupabase, 3500);
    if(type === 'admin' && safeLS('get','velo_admin_session') === '1'){
      pGoTo('admin');
    } else if(type === 'pro'){
      var approved = safeLS('get','velo_pro_approved');
      pGoTo(approved ? 'pro-panel' : 'pro-pending');
    } else {
      // Restore last visited screen on refresh; fall back to home
      var _lastScreen = '';
      try{ _lastScreen = sessionStorage.getItem('velo_last_screen') || ''; }catch(e){}
      var _restoreTo = (_lastScreen && _NO_RESTORE.indexOf(_lastScreen) < 0 && document.getElementById('pg-'+_lastScreen))
        ? _lastScreen : 'home';
      pGoTo(_restoreTo);
      setTimeout(function(){ _loadHomeData(); _updateSidebarUser(); }, 100);
    }
  } else {
    pGoTo('landing');
    setTimeout(_initReveal, 100);
  }


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
