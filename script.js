// ═══════════════════════════════════════════════════════════
//  SUPABASE INTEGRATION — Velo App
//  1. Crear proyecto en https://supabase.com
//  2. Reemplazar las dos constantes de abajo con tus valores
//     (Settings → API → Project URL y anon/public key)
// ═══════════════════════════════════════════════════════════
const SUPABASE_URL  = 'https://yuravtnjvvztsxdtggod.supabase.co';
const SUPABASE_ANON = 'sb_publishable_mBoqW2t3QoJvp5jFecEGgQ_1wrPiT9C';

// Cargar cliente Supabase (cargado desde CDN en index.html)
var supabase = null;
function _initSupabase(){
  if(typeof window.supabase !== 'undefined' && window.supabase.createClient){
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
  }
}

// ── AUTH: REGISTRO ───────────────────────────────────────
async function sbSignUp(email, password, nombre){
  if(!supabase) return {error:{message:'Supabase no inicializado'}};
  var {data, error} = await supabase.auth.signUp({
    email: email,
    password: password,
    options: { data: { nombre: nombre, role: 'user' } }
  });
  if(!error && data.user){
    await supabase.from('profiles').insert({
      id: data.user.id,
      nombre: nombre,
      email: email,
      role: 'user',
      created_at: new Date().toISOString(),
      last_login: new Date().toISOString()
    });
  }
  return {data, error};
}

// ── AUTH: INICIO DE SESIÓN ────────────────────────────────
async function sbSignIn(email, password){
  if(!supabase) return {error:{message:'Supabase no inicializado'}};
  var {data, error} = await supabase.auth.signInWithPassword({email, password});
  if(!error && data.user){
    await supabase.from('profiles').update({last_login: new Date().toISOString()}).eq('id', data.user.id);
  }
  return {data, error};
}

// ── AUTH: CERRAR SESIÓN ───────────────────────────────────
async function sbSignOut(){
  if(!supabase) return;
  await supabase.auth.signOut();
}

// ── AUTH: RECUPERACIÓN DE CONTRASEÑA ─────────────────────
async function sbResetPassword(email){
  if(!supabase) return {error:{message:'Supabase no inicializado'}};
  var {data, error} = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + '/reset'
  });
  return {data, error};
}

// ── AUTH: OBTENER USUARIO ACTUAL ──────────────────────────
async function sbGetCurrentUser(){
  if(!supabase) return null;
  var {data} = await supabase.auth.getUser();
  return data.user || null;
}

// ── AUTH: ROL DEL USUARIO ─────────────────────────────────
async function sbGetUserRole(userId){
  if(!supabase) return 'user';
  var {data} = await supabase.from('profiles').select('role').eq('id', userId).single();
  return (data && data.role) || 'user';
}

// ── ADMIN: LISTAR USUARIOS ────────────────────────────────
async function sbAdminListUsers(){
  if(!supabase) return [];
  var {data, error} = await supabase.from('profiles').select('*').order('created_at', {ascending: false});
  return error ? [] : (data || []);
}

// ── ADMIN: SUSPENDER USUARIO ──────────────────────────────
async function sbAdminSuspendUser(userId){
  if(!supabase) return {error:{message:'No autorizado'}};
  return await supabase.from('profiles').update({suspended: true, suspended_at: new Date().toISOString()}).eq('id', userId);
}

// ── ADMIN: ELIMINAR USUARIO ───────────────────────────────
async function sbAdminDeleteUser(userId){
  if(!supabase) return {error:{message:'No autorizado'}};
  return await supabase.from('profiles').delete().eq('id', userId);
}

// ── SOPORTE/REPORTES: ENVIAR REPORTE ─────────────────────
async function sbEnviarReporte(mensaje, categoria){
  if(!supabase) return {error:{message:'Supabase no inicializado'}};
  var user = await sbGetCurrentUser();
  return await supabase.from('reportes').insert({
    user_id: user ? user.id : null,
    mensaje: mensaje,
    categoria: categoria || 'bug',
    estado: 'abierto',
    created_at: new Date().toISOString()
  });
}

// ── SOPORTE/REPORTES: LISTAR REPORTES (ADMIN) ────────────
async function sbAdminListReportes(){
  if(!supabase) return [];
  var {data, error} = await supabase.from('reportes').select('*, profiles(nombre, email)').order('created_at', {ascending: false});
  return error ? [] : (data || []);
}

// ── SOPORTE/REPORTES: RESOLVER REPORTE ───────────────────
async function sbAdminResolverReporte(reporteId){
  if(!supabase) return;
  await supabase.from('reportes').update({estado: 'resuelto', resolved_at: new Date().toISOString()}).eq('id', reporteId);
}

// ── STORAGE: URL DE IMAGEN ────────────────────────────────
function sbImageUrl(bucket, path){
  if(!SUPABASE_URL || SUPABASE_URL.includes('TU_PROYECTO')) return null;
  return SUPABASE_URL + '/storage/v1/object/public/' + bucket + '/' + path;
}

// ── INICIALIZAR SUPABASE AL CARGAR ────────────────────────
document.addEventListener('DOMContentLoaded', _initSupabase);
window.addEventListener('load', function(){ _initSupabase(); _checkPayPalReturn(); _checkStripeReturn(); });

// ═══════════════════════════════════════════════════════════
//  FIN BLOQUE SUPABASE
// ═══════════════════════════════════════════════════════════

function _tryLoadImg(el, primary, fallback){
  if(!el) return;
  el.onerror = function(){
    if(this.src !== fallback){ this.src = fallback; }
    else { this.onerror = null; }
  };
  el.src = primary;
}

function loadLogos(){
  var BASE = SUPABASE_URL + '/storage/v1/object/public/velo-assets/';
  var primary = BASE + 'IMG_2184.PNG';
  var fallback = BASE + 'IMG_2184.png';
  ['splashLogoImg','homeLogo','regLogo','wbLogo','luLogo','lpLogo'].forEach(function(id){
    _tryLoadImg(document.getElementById(id), primary, fallback);
  });
}

function initSplashTheme(){
  var h = new Date().getHours();
  var isNight = h >= 20 || h < 7;
  var BASE = SUPABASE_URL + '/storage/v1/object/public/velo-assets/';

  var logoPrimary = BASE + 'IMG_2184.PNG';
  var logoFallback = BASE + 'IMG_2184.png';
  _tryLoadImg(document.getElementById('splashLogoImg'), logoPrimary, logoFallback);
  var logoImg = document.getElementById('splashLogoImg');
  if(logoImg){
    logoImg.style.background = 'transparent';
    logoImg.style.mixBlendMode = 'normal';
    logoImg.style.filter = isNight
      ? 'drop-shadow(0 6px 28px rgba(255,255,255,.45)) drop-shadow(0 0 60px rgba(100,220,160,.25))'
      : 'drop-shadow(0 8px 30px rgba(0,0,0,.35)) drop-shadow(0 0 50px rgba(45,106,79,.5))';
  }
  var tagline = document.getElementById('splashTagline');
  if(tagline){
    if(isNight){
      tagline.style.color = 'rgba(255,255,255,.92)';
      tagline.style.textShadow = '0 1px 18px rgba(0,0,0,.8), 0 0 40px rgba(100,200,160,.4)';
    } else {
      tagline.style.color = 'rgba(255,255,255,1)';
      tagline.style.textShadow = '0 2px 12px rgba(0,0,0,.7), 0 4px 28px rgba(0,0,0,.5), 0 0 50px rgba(30,80,50,.6)';
    }
  }

  // Fondos desde Supabase Storage (con fallback a canvas)
  var bgDay    = document.getElementById('splashBgDay');
  var bgNight  = document.getElementById('splashBgNight');
  var birds    = document.getElementById('splashBirds');
  var clouds   = document.getElementById('splashClouds');

  if(isNight){
    if(bgNight){
      bgNight.onerror = function(){ this.style.display='none'; buildParticlesNight(); };
      bgNight.onload  = function(){ this.style.opacity='1'; };
      bgNight.src = BASE+'bg-nigth.jpg.PNG';
    }
    if(birds) birds.style.display='none';
    if(clouds) clouds.style.opacity='.4';
    buildParticlesNight();
  } else {
    if(bgDay){
      bgDay.onerror = function(){ this.style.display='none'; buildParticlesDay(); };
      bgDay.onload  = function(){ this.style.opacity='1'; };
      bgDay.src = BASE+'bg-day.jpg.PNG';
    }
    if(birds) birds.style.display='block';
    if(clouds) clouds.style.opacity='1';
    buildParticlesDay();
  }
}

function drawDay(ctx,W,H){
  // ── SKY ──
  var sky = ctx.createLinearGradient(0,0,0,H*.65);
  sky.addColorStop(0,'#5BB8D4');
  sky.addColorStop(.18,'#7ECDE8');
  sky.addColorStop(.35,'#C8E8F0');
  sky.addColorStop(.5,'#F0D870');
  sky.addColorStop(.62,'#F8C840');
  sky.addColorStop(.72,'#EDA830');
  ctx.fillStyle=sky; ctx.fillRect(0,0,W,H*.72);

  // ── SUN GLOW ──
  var sg = ctx.createRadialGradient(W*.5,H*.28,0,W*.5,H*.28,W*.55);
  sg.addColorStop(0,'rgba(255,252,200,.95)');
  sg.addColorStop(.15,'rgba(255,235,100,.75)');
  sg.addColorStop(.35,'rgba(255,200,50,.4)');
  sg.addColorStop(.6,'rgba(255,180,0,.15)');
  sg.addColorStop(1,'rgba(255,160,0,0)');
  ctx.fillStyle=sg; ctx.fillRect(0,0,W,H*.72);

  // ── SUN ──
  var sun = ctx.createRadialGradient(W*.5,H*.28,0,W*.5,H*.28,32);
  sun.addColorStop(0,'#FFFEF0');
  sun.addColorStop(.4,'#FFF060');
  sun.addColorStop(.75,'#FFD020');
  sun.addColorStop(1,'rgba(255,200,0,0)');
  ctx.fillStyle=sun;
  ctx.beginPath(); ctx.arc(W*.5,H*.28,32,0,Math.PI*2); ctx.fill();

  // ── MOUNTAINS BACK ──
  ctx.fillStyle='#3A7828';
  ctx.beginPath(); ctx.moveTo(0,H*.62);
  ctx.bezierCurveTo(W*.1,H*.38,W*.2,H*.45,W*.3,H*.52);
  ctx.bezierCurveTo(W*.4,H*.58,W*.45,H*.42,W*.5,H*.36);
  ctx.bezierCurveTo(W*.55,H*.3,W*.6,H*.44,W*.7,H*.52);
  ctx.bezierCurveTo(W*.82,H*.6,W*.9,H*.48,W,H*.58);
  ctx.lineTo(W,H*.72); ctx.lineTo(0,H*.72); ctx.closePath(); ctx.fill();

  // ── MOUNTAINS MID ──
  ctx.fillStyle='#2D6020';
  ctx.beginPath(); ctx.moveTo(0,H*.68);
  ctx.bezierCurveTo(W*.12,H*.5,W*.22,H*.56,W*.32,H*.62);
  ctx.bezierCurveTo(W*.42,H*.68,W*.48,H*.54,W*.52,H*.48);
  ctx.bezierCurveTo(W*.58,H*.42,W*.65,H*.56,W*.75,H*.62);
  ctx.bezierCurveTo(W*.88,H*.7,W*.94,H*.6,W,H*.66);
  ctx.lineTo(W,H*.72); ctx.lineTo(0,H*.72); ctx.closePath(); ctx.fill();

  // ── LAKE ──
  var lake = ctx.createLinearGradient(0,H*.72,0,H);
  lake.addColorStop(0,'#5A9AB8');
  lake.addColorStop(.3,'#4A88A8');
  lake.addColorStop(.6,'#3A7898');
  lake.addColorStop(1,'#2A6888');
  ctx.fillStyle=lake; ctx.fillRect(0,H*.72,W,H*.28);

  // ── SUN REFLECTION ──
  var ref = ctx.createLinearGradient(0,H*.72,0,H);
  ref.addColorStop(0,'rgba(255,230,100,.55)');
  ref.addColorStop(.5,'rgba(255,200,60,.25)');
  ref.addColorStop(1,'rgba(255,180,0,.05)');
  ctx.fillStyle=ref;
  ctx.beginPath();
  ctx.ellipse(W*.5,H*.75,W*.12,H*.22,0,0,Math.PI*2);
  ctx.fill();

  // ── WATER SHIMMER LINES ──
  ctx.strokeStyle='rgba(255,255,255,.18)';
  ctx.lineWidth=1.5;
  for(var i=0;i<8;i++){
    var y=H*.76+i*H*.027;
    var ww=W*.08+Math.random()*W*.14;
    var x=W*.25+Math.random()*W*.5;
    ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+ww,y); ctx.stroke();
  }

  // ── TREES LEFT ──
  drawTree(ctx, W*.04, H*.72, 0.95, H);
  drawTree(ctx, W*.12, H*.72, 0.85, H);
  drawTree(ctx, W*.0,  H*.74, 0.75, H);

  // ── TREES RIGHT ──
  drawTree(ctx, W*.96, H*.72, 0.95, H);
  drawTree(ctx, W*.88, H*.72, 0.85, H);
  drawTree(ctx, W*1.0, H*.74, 0.75, H);

  // ── FOREGROUND GRASS ──
  var fg = ctx.createLinearGradient(0,H*.88,0,H);
  fg.addColorStop(0,'rgba(40,90,20,0)');
  fg.addColorStop(.4,'rgba(40,90,20,.45)');
  fg.addColorStop(1,'rgba(20,60,10,.7)');
  ctx.fillStyle=fg; ctx.fillRect(0,H*.88,W,H*.12);

  // ── LEAVES FRAME ──
  drawLeaves(ctx,W,H,'day');

  // ── ATMOSPHERE HAZE ──
  var haze = ctx.createLinearGradient(0,H*.55,0,H*.72);
  haze.addColorStop(0,'rgba(255,255,255,0)');
  haze.addColorStop(.5,'rgba(255,250,200,.12)');
  haze.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=haze; ctx.fillRect(0,H*.55,W,H*.17);
}

function drawNight(ctx,W,H){
  // ── SKY ──
  var sky = ctx.createLinearGradient(0,0,0,H*.65);
  sky.addColorStop(0,'#020810');
  sky.addColorStop(.2,'#071326');
  sky.addColorStop(.45,'#0D1B3D');
  sky.addColorStop(.65,'#102038');
  ctx.fillStyle=sky; ctx.fillRect(0,0,W,H*.68);

  // ── MOON GLOW ──
  var mg = ctx.createRadialGradient(W*.75,H*.15,0,W*.75,H*.15,W*.35);
  mg.addColorStop(0,'rgba(240,235,180,.38)');
  mg.addColorStop(.3,'rgba(200,190,130,.18)');
  mg.addColorStop(.6,'rgba(150,140,90,.06)');
  mg.addColorStop(1,'rgba(100,90,50,0)');
  ctx.fillStyle=mg; ctx.fillRect(0,0,W,H*.65);

  // ── MOON ──
  var moon = ctx.createRadialGradient(W*.73,H*.14,0,W*.75,H*.15,42);
  moon.addColorStop(0,'#FEFDF8');
  moon.addColorStop(.35,'#F0ECD0');
  moon.addColorStop(.65,'#D8D0A8');
  moon.addColorStop(.85,'#B8B090');
  moon.addColorStop(1,'rgba(160,150,100,0)');
  ctx.fillStyle=moon;
  ctx.beginPath(); ctx.arc(W*.75,H*.15,42,0,Math.PI*2); ctx.fill();
  // Moon craters
  ctx.fillStyle='rgba(180,170,120,.25)';
  ctx.beginPath(); ctx.arc(W*.75+8,H*.15-8,7,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(W*.75-10,H*.15+10,5,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(W*.75+14,H*.15+12,4,0,Math.PI*2); ctx.fill();

  // ── CLOUDS ──
  drawNightCloud(ctx, W*.15, H*.22, W*.2, 0.6);
  drawNightCloud(ctx, W*.6,  H*.1,  W*.18, 0.5);
  drawNightCloud(ctx, W*.05, H*.12, W*.14, 0.4);

  // ── MOUNTAINS ──
  ctx.fillStyle='#060E08';
  ctx.beginPath(); ctx.moveTo(0,H*.65);
  ctx.bezierCurveTo(W*.08,H*.36,W*.2,H*.44,W*.28,H*.5);
  ctx.bezierCurveTo(W*.38,H*.56,W*.44,H*.38,W*.5,H*.32);
  ctx.bezierCurveTo(W*.57,H*.26,W*.62,H*.42,W*.72,H*.5);
  ctx.bezierCurveTo(W*.84,H*.58,W*.92,H*.44,W,H*.54);
  ctx.lineTo(W,H*.68); ctx.lineTo(0,H*.68); ctx.closePath(); ctx.fill();

  ctx.fillStyle='#040A05';
  ctx.beginPath(); ctx.moveTo(0,H*.68);
  ctx.bezierCurveTo(W*.1,H*.52,W*.2,H*.58,W*.3,H*.63);
  ctx.bezierCurveTo(W*.42,H*.68,W*.48,H*.54,W*.52,H*.48);
  ctx.bezierCurveTo(W*.58,H*.43,W*.65,H*.56,W*.75,H*.63);
  ctx.bezierCurveTo(W*.87,H*.7,W*.94,H*.6,W,H*.66);
  ctx.lineTo(W,H*.68); ctx.lineTo(0,H*.68); ctx.closePath(); ctx.fill();

  // ── LAKE ──
  var lake = ctx.createLinearGradient(0,H*.68,0,H);
  lake.addColorStop(0,'#071828');
  lake.addColorStop(.3,'#0A2038');
  lake.addColorStop(.7,'#0D2848');
  lake.addColorStop(1,'#0A1E38');
  ctx.fillStyle=lake; ctx.fillRect(0,H*.68,W,H*.32);

  // ── MOON REFLECTION ──
  var mref = ctx.createLinearGradient(0,H*.68,0,H);
  mref.addColorStop(0,'rgba(230,220,160,.22)');
  mref.addColorStop(.4,'rgba(200,190,130,.12)');
  mref.addColorStop(1,'rgba(180,170,110,.02)');
  ctx.fillStyle=mref;
  ctx.beginPath();
  ctx.ellipse(W*.75,H*.75,W*.06,H*.2,0,0,Math.PI*2);
  ctx.fill();

  // ── WATER SHIMMER ──
  ctx.strokeStyle='rgba(200,200,255,.1)';
  ctx.lineWidth=1;
  for(var i=0;i<10;i++){
    var y=H*.73+i*H*.025;
    var ww=W*.06+Math.random()*W*.1;
    var x=W*.2+Math.random()*W*.6;
    ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+ww,y); ctx.stroke();
  }

  // ── TREES ──
  drawTreeNight(ctx, W*.04, H*.68, 0.95, H);
  drawTreeNight(ctx, W*.13, H*.68, 0.88, H);
  drawTreeNight(ctx, W*.0,  H*.70, 0.72, H);
  drawTreeNight(ctx, W*.96, H*.68, 0.95, H);
  drawTreeNight(ctx, W*.87, H*.68, 0.88, H);
  drawTreeNight(ctx, W*1.0, H*.70, 0.72, H);

  // ── LEAVES FRAME ──
  drawLeaves(ctx,W,H,'night');

  // ── AMBIENT GLOW WATER ──
  var ag = ctx.createRadialGradient(W*.5,H*.82,0,W*.5,H*.82,W*.4);
  ag.addColorStop(0,'rgba(30,60,140,.15)');
  ag.addColorStop(1,'rgba(30,60,140,0)');
  ctx.fillStyle=ag; ctx.fillRect(0,H*.68,W,H*.32);
}

function drawTree(ctx,cx,baseY,scale,H){
  var h1=H*.22*scale, h2=H*.18*scale, h3=H*.14*scale;
  var w1=H*.09*scale, w2=H*.07*scale, w3=H*.055*scale;
  var tx=cx, ty=baseY;
  ctx.fillStyle='#1A4010';
  ctx.beginPath(); ctx.ellipse(tx,ty-h1,w1,h1,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#225018';
  ctx.beginPath(); ctx.ellipse(tx,ty-h1-h2*.6,w2,h2,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#2A6020';
  ctx.beginPath(); ctx.ellipse(tx,ty-h1-h2-h3*.5,w3,h3,0,0,Math.PI*2); ctx.fill();
}

function drawTreeNight(ctx,cx,baseY,scale,H){
  var h1=H*.22*scale, h2=H*.18*scale, h3=H*.14*scale;
  var w1=H*.09*scale, w2=H*.07*scale, w3=H*.055*scale;
  ctx.fillStyle='#020804';
  ctx.beginPath(); ctx.ellipse(cx,baseY-h1,w1,h1,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#030A05';
  ctx.beginPath(); ctx.ellipse(cx,baseY-h1-h2*.6,w2,h2,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#040C06';
  ctx.beginPath(); ctx.ellipse(cx,baseY-h1-h2-h3*.5,w3,h3,0,0,Math.PI*2); ctx.fill();
}

function drawNightCloud(ctx,cx,cy,r,op){
  ctx.globalAlpha=op;
  ctx.fillStyle='#1A2A4A';
  ctx.beginPath(); ctx.ellipse(cx,cy,r,r*.38,0,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx-r*.4,cy+r*.1,r*.55,r*.3,0,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx+r*.45,cy+r*.1,r*.5,r*.28,0,0,Math.PI*2); ctx.fill();
  ctx.globalAlpha=1;
}

function drawLeaves(ctx,W,H,mode){
  var c = mode==='night' ? 'rgba(10,28,10,' : 'rgba(20,60,10,';
  // Top left branch
  ctx.fillStyle=c+'0.9)';
  for(var i=0;i<6;i++){
    var x=W*(.02+i*.04), y=H*(.02+i*.015);
    var r=W*(.025+Math.random()*.015);
    ctx.beginPath(); ctx.ellipse(x,y,r,r*.55,-.4+i*.15,0,Math.PI*2); ctx.fill();
  }
  // Top right branch
  for(var i=0;i<6;i++){
    var x=W*(.98-i*.04), y=H*(.02+i*.015);
    var r=W*(.022+Math.random()*.014);
    ctx.beginPath(); ctx.ellipse(x,y,r,r*.55,.4-i*.15,0,Math.PI*2); ctx.fill();
  }
}

function buildParticlesDay(){
  var el=document.getElementById('splashParticleLayer');
  if(!el) return;
  el.innerHTML='';
  for(var i=0;i<14;i++){
    var d=document.createElement('div');
    var sz=(Math.random()*3+1.5).toFixed(1);
    d.style.cssText='position:absolute;border-radius:50%;width:'+sz+'px;height:'+sz+'px;left:'+(Math.random()*100).toFixed(1)+'%;top:'+(Math.random()*65).toFixed(1)+'%;background:rgba(255,230,100,.55);box-shadow:0 0 8px 3px rgba(255,210,50,.35);animation:starPulse '+(2+i*.22).toFixed(2)+'s '+(i*.14).toFixed(2)+'s ease-in-out infinite';
    el.appendChild(d);
  }
}

function buildParticlesNight(){
  var el=document.getElementById('splashParticleLayer');
  if(!el) return;
  el.innerHTML='';
  // Shooting star
  var ss=document.createElement('div');
  ss.style.cssText='position:absolute;top:22%;right:8%;width:110px;height:1.5px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.9) 55%,transparent);border-radius:2px;opacity:0;animation:shootingStarAnim 2.2s 5s ease-in infinite;transform-origin:right center';
  el.appendChild(ss);
  // Fireflies
  [[14,60],[22,68],[34,57],[47,71],[59,64],[71,59],[80,67],[87,55],[19,54],[55,74]].forEach(function(p,i){
    var d=document.createElement('div');
    d.style.cssText='position:absolute;width:3px;height:3px;border-radius:50%;background:rgba(200,255,100,.9);box-shadow:0 0 7px 3px rgba(170,255,70,.65);left:'+p[0]+'%;top:'+p[1]+'%;animation:fireflyGlow '+(2.6+i*.42).toFixed(2)+'s '+(i*.58).toFixed(2)+'s ease-in-out infinite';
    el.appendChild(d);
  });
}

function openEntrarModal(){
  var m=document.getElementById('entrarModal');
  if(m) m.style.display='flex';
}
function closeEntrarModal(){
  var m=document.getElementById('entrarModal');
  if(m) m.style.display='none';
}
function splashBtnTap(btn){
  btn.style.transform='scale(.97)';
  setTimeout(function(){ btn.style.transform='scale(1)'; },160);
}
function selLang(el,lang){
  document.querySelectorAll('.lang-pill').forEach(function(p){ p.classList.remove('lang-active'); });
  el.classList.add('lang-active');
  toast('🌍',lang+' seleccionado');
}

loadLogos();
initSplashTheme();
renderHappyWall();
renderSessionPayQueue();
// IA: generar resumen mensual si corresponde
setTimeout(iaGenerateMonthlySummary, 2000);

// Toast
var tT;
function toast(ico,txt){
  clearTimeout(tT);
  document.getElementById('tIco').textContent=ico;
  document.getElementById('tTxt').textContent=txt;
  var t=document.getElementById('toast');
  t.classList.add('show');
  tT=setTimeout(function(){ t.classList.remove('show'); },3500);
}

// Register flow
function rgStep(step){
  document.getElementById('rgs'+step).style.display='none';
  document.getElementById('rgs'+(step+1)).style.display='flex';
  ['rg1','rg2','rg3'].forEach(function(id,i){
    var el=document.getElementById(id);
    if(!el)return;
    el.classList.remove('done','now');
    if(i<step)el.classList.add('done');
    else if(i===step)el.classList.add('now');
  });
}
function validateRgStep1(){
  var pwd=document.getElementById('rgPwd');
  if(!pwd)return rgStep(1);
  var v=pwd.value;
  var ok8=v.length>=8;
  var okCase=/[a-z]/.test(v)&&/[A-Z]/.test(v);
  var okSpec=/[^a-zA-Z0-9]/.test(v);
  var rules=[ok8,okCase,okSpec];
  var ids=['r1','r2','r3'];
  var allOk=true;
  rules.forEach(function(ok,i){
    var el=document.getElementById(ids[i]);
    if(!el)return;
    if(ok){el.style.color='var(--sage2)';el.querySelector('span').textContent='✓';}
    else{el.style.color='#C03028';el.querySelector('span').textContent='○';allOk=false;}
  });
  if(!allOk){toast('⚠️','La contraseña necesita cumplir todos los requisitos');return;}
  var pwd2=document.getElementById('rgPwd2');
  if(pwd2&&pwd2.value!==v){toast('⚠️','Las contraseñas no coinciden');return;}
  rgStep(1);
}
function finishRegister(){
  var tc=document.getElementById('tcVelo');
  var tc2=document.getElementById('tcMay');
  if(!tc||!tc.classList.contains('on')){toast('⚠️','Aceptá los términos para continuar');return;}
  if(!tc2||!tc2.classList.contains('on')){toast('⚠️','Confirmá que sos mayor de 18 años');return;}
  // Guardar nombre y email del usuario para auto-completar formularios
  var nameEl=document.getElementById('rgName');
  var emailEl=document.getElementById('rgEmail');
  var uName = (nameEl&&nameEl.value.trim()) ? nameEl.value.trim() : '';
  var uEmail = (emailEl&&emailEl.value.trim()) ? emailEl.value.trim() : '';
  if(uName) safeLS('set','velo_user_name', uName);
  if(uEmail) safeLS('set','velo_user_email', uEmail);
  recordTCAcceptance(uName, uEmail);
  loginAndWelcome();
  setTimeout(function(){ toast('🌿','¡Bienvenido/a a Velo! Tu cuenta fue creada 💚'); }, 400);
  setTimeout(function(){ deliverInboxMsg('bienvenida-usuario'); }, 2200);
}

// Nav — include register + groups in noNav = false (show nav), but not for register
var noNav=['splash','onboarding','register-type','pro-onboarding','guardian-chat','guardian-detail','post-chat','login-user','login-pro','pro-reg','pro-register','register','diary','circles','aiSummary','pro-panel','pro-panel-agenda','pro-panel-pacientes','pro-panel-notas','pro-panel-finanzas','pro-panel-sesion-sol','pro-panel-perfil','pro-panel-config','pro-session','inbox','inbox-detail','admin','admin-login','respira','caminar','pro-pending','contact','vela','buzon-detail','all-reviews','donation-exit','groups'];

// ── MOOD CHECK-IN ────────────────────────────────────────
var todayMood=null;
function selMood(el,emoji,label){
  document.querySelectorAll('.mood-opt').forEach(function(m){m.style.background='rgba(255,255,255,.8)';m.style.borderColor='var(--border)';});
  el.style.background='var(--sage7)';el.style.borderColor='var(--sage2)';
  todayMood={emoji,label};
  document.getElementById('moodNote').style.display='block';
  document.getElementById('moodSaveBtn').style.display='flex';
}
function saveMood(){
  if(!todayMood) return;
  var txt=document.getElementById('moodTxt').value||'';
  var today=new Date().toLocaleDateString('es-AR',{day:'numeric',month:'long'});
  var key='velo_mood_'+new Date().toISOString().slice(0,10);
  safeLS('set',key,JSON.stringify({emoji:todayMood.emoji,label:todayMood.label,note:txt,date:today}));
  // Update home greeting
  updateHomeGreeting(todayMood.emoji,todayMood.label);
  document.getElementById('moodNote').style.display='none';
  document.getElementById('moodSaveBtn').style.display='none';
  document.getElementById('moodDone').style.display='block';
  document.getElementById('moodDoneEmoji').textContent=todayMood.emoji;
  toast('💚','Estado de hoy registrado. Gracias por cuidarte 🌿');
  // Check if end of month — offer AI summary
  var d=new Date();
  if(d.getDate()>=28) setTimeout(offerAISummary,2000);
}
function updateHomeGreeting(emoji,label){
  var eg=document.getElementById('homeGreetEmoji');
  var tg=document.getElementById('homeGreetTxt');
  var sg=document.getElementById('homeGreetSub');
  var mg=document.getElementById('homeGreetMood');
  if(eg)eg.textContent=emoji;
  if(tg)tg.textContent='Hoy te sentís: '+label;
  if(sg)sg.textContent='Check-in registrado · tocá para ver tu bienestar';
  if(mg)mg.textContent=emoji;
}
// Load today's mood on startup
function loadTodayMood(){
  var key='velo_mood_'+new Date().toISOString().slice(0,10);
  var saved=safeLS('get',key);
  if(saved){try{var m=JSON.parse(saved);updateHomeGreeting(m.emoji,m.label);todayMood=m;document.getElementById('moodDone').style.display='block';document.getElementById('moodDoneEmoji').textContent=m.emoji;}catch(e){}}
}
// Set diary date
function initDiary(){
  var el=document.getElementById('diaryDate');
  if(el)el.textContent=new Date().toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'});
  loadDiaryEntries();
}
function addDiaryEmoji(em){
  var ta=document.getElementById('diaryEntry');
  if(ta)ta.value+=em;
}
function saveDiaryEntry(){
  var ta=document.getElementById('diaryEntry');
  if(!ta||!ta.value.trim()){toast('📓','Escribí algo antes de guardar');return;}
  var text = ta.value.trim();
  var entries=getDiaryEntries();
  entries.unshift({text:text,date:new Date().toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}),ts:Date.now()});
  safeLS('set','velo_diary',JSON.stringify(entries.slice(0,50)));
  ta.value='';
  loadDiaryEntries();
  toast('📓','Entrada guardada. Solo vos podés verla. 🔒');
  // El diario es completamente privado — la IA no lo lee ni analiza
}
function getDiaryEntries(){try{var s=safeLS('get','velo_diary');return s?JSON.parse(s):[];}catch(e){return[];}}
function loadDiaryEntries(){
  var list=document.getElementById('diaryList');
  var empty=document.getElementById('diaryEmpty');
  if(!list)return;
  var entries=getDiaryEntries();
  if(!entries.length){if(empty)empty.style.display='block';return;}
  if(empty)empty.style.display='none';
  var existing=list.querySelectorAll('.diary-entry');
  existing.forEach(function(e){ e.remove(); });
  entries.forEach(function(e,i){
    var div=document.createElement('div');
    div.className='diary-entry';
    div.style.cssText='background:rgba(255,255,255,.82);border:1.5px solid rgba(196,181,232,.2);border-radius:18px;padding:14px;margin-bottom:9px;animation:waveIn .35s ease both';
    div.innerHTML='<div style="font-size:10px;color:#6E56A8;margin-bottom:7px;font-weight:600">'+e.date+'<\/div><div style="font-size:14px;color:#2A2050;line-height:1.65">'+e.text.replace(/\n/g,'<br>')+'<\/div><button onclick="deleteDiaryEntry('+i+')" style="margin-top:8px;background:none;border:1px solid rgba(196,181,232,.3);border-radius:100px;padding:4px 10px;font-size:10px;color:#6E56A8;cursor:pointer">Eliminar<\/button>';
    list.insertBefore(div,list.firstChild.nextSibling||null);
  });
}
function deleteDiaryEntry(i){
  var entries=getDiaryEntries();entries.splice(i,1);
  safeLS('set','velo_diary',JSON.stringify(entries));
  loadDiaryEntries();
  toast('🗑️','Entrada eliminada');
}

// ── CIRCLES ─────────────────────────────────────────────
function openNewCircle(){toast('📡','Creando tu círculo...');}
function joinCircle(name){showSuc('🌿','¡Bienvenido/a al círculo!','Entraste a "'+name+'". La IA modera el espacio. Si detecta algo fuera de los términos, actuará de forma automática. 💚');}

// ── AI MONTHLY SUMMARY ──────────────────────────────────
function offerAISummary(){
  var months=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  var m=months[new Date().getMonth()];
  if(document.getElementById('aiMonth'))document.getElementById('aiMonth').textContent=m;
  // Only offer if we have at least 5 mood records this month
  var prefix='velo_mood_'+new Date().getFullYear()+'-'+(String(new Date().getMonth()+1).padStart(2,'0'));
  // Show offer
  toast('🤖','Tu resumen de '+m+' está listo. Miralo en Bienestar y Calma.');
}
async function showAISummary(){
  var overlay=document.getElementById('aiSummary');
  if(!overlay)return;
  overlay.style.display='flex';
  document.getElementById('aiLoading').style.display='block';
  document.getElementById('aiContent').style.display='none';
  // Collect this month's moods
  var moods=[];
  var now=new Date();
  for(var d=1;d<=now.getDate();d++){
    var key='velo_mood_'+now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    var s=safeLS('get',key);
    if(s){try{moods.push(JSON.parse(s));}catch(e){}}
  }
  if(!moods.length){
    document.getElementById('aiLoading').style.display='none';
    document.getElementById('aiContent').style.display='block';
    document.getElementById('aiText').textContent='No registraste estados de ánimo este mes todavía. ¡Empezá hoy en Bienestar y Calma!';
    document.getElementById('aiInsights').textContent='';
    document.getElementById('aiMoodChart').innerHTML='';
    return;
  }
  // Count moods
  var counts={};
  moods.forEach(function(m){counts[m.emoji]=(counts[m.emoji]||0)+1;});
  // Build chart
  var chart=document.getElementById('aiMoodChart');
  if(chart){
    chart.innerHTML='';
    var keys_=Object.keys(counts);keys_.sort(function(a,b){return counts[b]-counts[a];});keys_.forEach(function(em){var n=counts[em];
      var d=document.createElement('div');
      d.style.cssText='display:flex;align-items:center;gap:5px;padding:5px 10px;background:var(--sage7);border:1px solid rgba(116,198,157,.18);border-radius:100px;font-size:12px';
        d.innerHTML='<span style="font-size:16px">'+em+'<\/span><span style="color:var(--sage2);font-weight:600">'+n+' '+(n>1?'días':'día')+'<\/span>';
      chart.appendChild(d);
    });
  }
  // Call Claude AI API for summary
  try{
    var moodSummary=moods.map(function(m){return m.date+': '+m.emoji+' '+m.label+(m.note?' - '+m.note:'');}).join('\n');
    var resp=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':'','anthropic-version':'2023-06-01'},
      body:JSON.stringify({
        model:'claude-3-5-sonnet-20241022',
        max_tokens:500,
        messages:[{role:'user',content:'Escribe un resumen breve y empático en español sobre estos estados de ánimo registrados este mes:\n'+moodSummary}]
      })
    });
    var aiData=await resp.json();
    var txt=(aiData.content&&aiData.content[0])?aiData.content[0].text:'';
    var parts=txt.split('\n\n');
    document.getElementById('aiText').textContent=parts[0]||txt;
    document.getElementById('aiInsights').textContent=parts.slice(1).join(' ')||'Seguí registrando tus emociones para recibir más insights.';
  }catch(e){
    document.getElementById('aiText').textContent='Este mes tuviste '+moods.length+' registros emocionales. '+(counts['😊']||0)+' días te sentiste bien, '+(counts['😔']||0)+' días con algo de tristeza. Cada día que te chequeás es un acto de amor propio. 💚';
    document.getElementById('aiInsights').textContent='Seguí registrando tu estado día a día para recibir un análisis más completo.';
  }
  document.getElementById('aiLoading').style.display='none';
  document.getElementById('aiContent').style.display='block';
}

// ── ADMIN SECRET TAP ─────────────────────────────────────
var _adminTapCount=0, _adminTapTimer=null, _adminTapLast=0;
function handleAdminTap(e){
  if(e && e.type==='click' && _adminTapLast && (Date.now()-_adminTapLast)<500) return;
  var now=Date.now();
  if(now-_adminTapLast<80) return;
  _adminTapLast=now;
  _adminTapCount++;
  if(_adminTapTimer) clearTimeout(_adminTapTimer);
  if(_adminTapCount>=4){
    _adminTapCount=0;
    goTo('admin-login');
  } else {
    if(_adminTapCount>=2) toast('👑',_adminTapCount+'/4 — seguí tocando el logo');
    _adminTapTimer=setTimeout(function(){_adminTapCount=0;},4000);
  }
}

// ── ADMIN MODERATION QUEUE ───────────────────────────────
var adminReportQueue=[];
var _adminReportId=0;
function flagForAdmin(texto, categoria, detalles){
  var report={
    id:'rep-'+(++_adminReportId),
    texto:texto,
    categoria:categoria,
    detalles:detalles||'',
    fecha:new Date().toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'}),
    resuelto:false
  };
  adminReportQueue.unshift(report);
  renderAdminQueue();
}
function resolveAdminReport(id){
  for(var i=0;i<adminReportQueue.length;i++){
    if(adminReportQueue[i].id===id){adminReportQueue[i].resuelto=true;break;}
  }
  renderAdminQueue();
  toast('✅','Reporte resuelto');
}
function renderAdminQueue(){
  var el=document.getElementById('adminQueueList');
  var badge=document.getElementById('adminQueueBadge');
  var pending=adminReportQueue.filter(function(r){return!r.resuelto;});
  if(badge){badge.textContent=pending.length;badge.style.display=pending.length>0?'flex':'none';}
  if(!el) return;
  if(!pending.length){el.innerHTML='<div style="text-align:center;padding:14px;font-size:12px;color:rgba(116,198,157,.35)">Sin alertas pendientes ✓</div>';return;}
  el.innerHTML=pending.map(function(r){
    var col=r.categoria==='crisis'?'#F87070':r.categoria==='abuso'?'#FF9C5B':'#FFD859';
    var ic=r.categoria==='crisis'?'🆘':r.categoria==='abuso'?'🚩':'⚠️';
    return '<div class="admin-alert" style="border-left:3px solid '+col+'">'+
      '<div style="font-size:17px;flex-shrink:0">'+ic+'</div>'+
      '<div style="flex:1">'+
        '<div class="admin-alert-t">'+r.categoria.toUpperCase()+' · '+r.fecha+'</div>'+
        '<div class="admin-alert-s" style="margin-top:3px;font-style:italic">"'+r.texto.slice(0,80)+(r.texto.length>80?'…':'')+'"</div>'+
        (r.detalles?'<div style="font-size:10px;color:rgba(255,210,100,.65);margin-top:2px">'+r.detalles+'</div>':'')+
        '<div style="display:flex;gap:6px;margin-top:7px">'+
          '<button class="a-btn-g" onclick="resolveAdminReport(\''+r.id+'\')">Resolver</button>'+
          '<button class="a-btn-r" onclick="toast(\'🚫\',\'Contenido bloqueado\');resolveAdminReport(\''+r.id+'\')">Bloquear</button>'+
        '</div>'+
      '</div>'+
    '</div>';
  }).join('');
}

// ── AI CONTENT MODERATION (enhanced) ────────────────────
// ══════════════════════════════════════════════════════════
// VELO IA — Moderación + Análisis de bienestar personalizado
// 100% client-side. Sin API externa. Sin costos.
// ══════════════════════════════════════════════════════════

var _veloIA = {
  crisis: ['suicidio','matarme','quiero morir','no quiero vivir','hacerme daño','cortarme','acabar con mi vida','quitarme la vida','mejor muerto','quitarme la existencia','no puedo más con esto','ya no quiero estar','lastimarme','hacerme daño'],
  odio:   ['te voy a matar','te voy a encontrar','me las vas a pagar','eres una puta','eres un puto','maricón','perra','prostituta','escoria','basura de persona','hijo de puta','pelotudo del orto','andate a la mierda','te reviento','te voy a cagar','imbécil','retardado','subnormal'],
  sexual: ['mándame una foto','foto desnuda','sexo contigo','qué buena estás','qué bueno estás','te deseo sexualmente','quiero hacerte','vení a mi casa','te quiero conocer en persona','soy mayor que vos','tengo años más','manda foto'],
  spam:   ['dato bancario','número de tarjeta','instagram.com','wa.me','whatsapp.com','compra ahora','oferta especial','link de pago','transferime','alias de mercadopago','paypal.me','bit.ly','tinyurl','telegram.me','t.me/'],

  // Detectores de emoción para análisis de diario
  emocionesPositivas: ['bien','contento','feliz','alegre','tranquilo','tranquila','paz','esperanza','mejoré','mejor','agradecido','agradecida','logré','pude','orgulloso','orgullosa','disfruté','emocionado','emocionada','sonreí','amor','cariño','motivado','motivada','energía','descansé'],
  emocionesNegativas: ['mal','triste','cansado','cansada','ansioso','ansiosa','agotado','agotada','frustrado','frustrada','solo','sola','lloré','asustado','asustada','miedo','angustia','culpa','vergüenza','enojado','enojada','no puedo','difícil','duro','pesado','desbordado','desbordada'],
  emocionesAnsiedad:  ['ansiedad','pánico','ataque','nervios','temblé','corazón acelerado','respirar','nudo','pecho','no podía','paralizado','paralizada'],

  scoreToxicity: function(text){
    var t = text.toLowerCase();
    var score = 0;
    this.odio.forEach(function(k){ if(t.indexOf(k)>=0) score+=3; });
    this.sexual.forEach(function(k){ if(t.indexOf(k)>=0) score+=3; });
    this.spam.forEach(function(k){ if(t.indexOf(k)>=0) score+=2; });
    // Mayúsculas excesivas = agresividad
    var upper = (text.match(/[A-ZÁÉÍÓÚ]{3,}/g)||[]).length;
    score += Math.min(upper, 3);
    // Signos excesivos
    var excl = (text.match(/!{2,}/g)||[]).length;
    score += Math.min(excl, 2);
    return score;
  },

  analyzeEmotion: function(text){
    var t = text.toLowerCase();
    var pos = 0, neg = 0, anx = 0;
    this.emocionesPositivas.forEach(function(k){ if(t.indexOf(k)>=0) pos++; });
    this.emocionesNegativas.forEach(function(k){ if(t.indexOf(k)>=0) neg++; });
    this.emocionesAnsiedad.forEach(function(k){ if(t.indexOf(k)>=0) anx++; });
    if(anx>=2) return 'ansiedad';
    if(neg>pos+1) return 'negativo';
    if(pos>neg) return 'positivo';
    return 'neutro';
  }
};

async function moderateContent(text){
  var t = text.toLowerCase();

  // 1. CRISIS — máxima prioridad
  if(_veloIA.crisis.some(function(k){ return t.indexOf(k)>=0; })){
    openModal('sosModal');
    toast('🆘','Detectamos algo importante. Estamos aquí contigo.');
    flagForAdmin(text,'crisis','IA Velo: palabras de crisis/ideación');
    addBuzonMsg({id:'ia-crisis-'+Date.now(),tipo:'sistema',icon:'🆘',remitente:'Velo IA',titulo:'Estamos contigo',cuerpo:'Detectamos que podés estar pasando un momento muy difícil. No estás solo/a.\n\nPodés llamar al Centro de Asistencia al Suicida: 135 (Argentina, 24hs, gratis).\n\nVelo está aquí para acompañarte. 💚',leido:false,fecha:new Date().toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})});
    updateBuzonDot(); updateInboxBadge();
    return false;
  }

  // 2. ODIO / ACOSO
  if(_veloIA.odio.some(function(k){ return t.indexOf(k)>=0; })){
    toast('🚫','Contenido con lenguaje agresivo. No toleramos el acoso en Velo.');
    flagForAdmin(text,'abuso','IA Velo: lenguaje de odio/acoso detectado');
    return false;
  }

  // 3. CONTENIDO SEXUAL / PREDATORIO
  if(_veloIA.sexual.some(function(k){ return t.indexOf(k)>=0; })){
    toast('⚠️','Este contenido podría ser inapropiado para la comunidad.');
    flagForAdmin(text,'abuso','IA Velo: posible contenido sexual/predatorio');
    return false;
  }

  // 4. SPAM / LINKS / DATOS PERSONALES
  if(_veloIA.spam.some(function(k){ return t.indexOf(k)>=0; })){
    toast('⚠️','No se permite compartir datos personales o enlaces externos.');
    flagForAdmin(text,'spam','IA Velo: spam/datos privados detectados');
    return false;
  }

  // 5. TOXICIDAD GENERAL (score compuesto)
  var toxScore = _veloIA.scoreToxicity(text);
  if(toxScore >= 5){
    toast('⚠️','Este mensaje podría no ser apropiado para la comunidad de Velo.');
    flagForAdmin(text,'abuso','IA Velo: puntuación de toxicidad alta ('+toxScore+')');
    return false;
  }

  return true;
}

// ── ANÁLISIS DE DIARIO CON IA ─────────────────────────────
function iaAnalyzeDiary(text){
  var emotion = _veloIA.analyzeEmotion(text);
  var tips = {
    ansiedad: ['Notamos ansiedad en tu entrada. Probá 2 minutos de respiración 4-7-8 en Velo. 🌬️','La ansiedad avisa que algo importa. ¿Podés nombrar qué es lo que te preocupa? ✍️'],
    negativo: ['Está bien no estar bien. Escribirlo ya es un paso. Seguí anotando. 💚','Días difíciles también pasan. Mañana podés releer esto con otros ojos. 🌿'],
    positivo: ['¡Qué bien leer esto! Guardá esta sensación — te va a servir en días difíciles. ⭐','Tu energía positiva de hoy es un recurso real. 🌟'],
    neutro:   ['Escribir sin filtros es la forma más honesta de conocerse. Seguí así. 📓','Cada entrada suma. Tu diario es tu mapa emocional. 🗺️']
  };
  var arr = tips[emotion] || tips.neutro;
  return arr[Math.floor(Math.random()*arr.length)];
}

// ── RESUMEN MENSUAL DE IA ─────────────────────────────────
function iaGenerateMonthlySummary(){
  var lastKey = 'velo_ia_summary_last';
  var last = safeLS('get', lastKey);
  var now = Date.now();
  // Solo generar si nunca se generó o pasaron 30 días
  if(last && (now - parseInt(last)) < 30*24*60*60*1000) return;
  safeLS('set', lastKey, String(now));

  // Leer check-ins de estado de ánimo de los últimos 30 días (NUNCA el diario)
  var moodCounts = {positivo:0, negativo:0, ansiedad:0, neutro:0};
  var moodCheckIns = 0;
  var today = new Date();
  for(var d=0; d<30; d++){
    var dd = new Date(today); dd.setDate(today.getDate()-d);
    var mKey = 'velo_mood_'+dd.getFullYear()+'-'+String(dd.getMonth()+1).padStart(2,'0')+'-'+String(dd.getDate()).padStart(2,'0');
    var mRaw = safeLS('get', mKey);
    if(mRaw){ try{
      var mObj = JSON.parse(mRaw);
      var lbl = mObj.label||'';
      moodCheckIns++;
      if(lbl==='Muy bien'||lbl==='Bien') moodCounts.positivo++;
      else if(lbl==='Triste') moodCounts.negativo++;
      else if(lbl==='Ansioso/a') moodCounts.ansiedad++;
      else moodCounts.neutro++;
    }catch(e){} }
  }
  // Emoción dominante según los check-ins
  var dominantEmotion = 'neutro';
  var maxCount = 0;
  Object.keys(moodCounts).forEach(function(k){ if(moodCounts[k]>maxCount){ maxCount=moodCounts[k]; dominantEmotion=k; } });

  var breathSessions = parseInt(safeLS('get','velo_breath_sessions')||'0');
  var helpSessions   = parseInt(safeLS('get','velo_help_sessions')||'0');
  var bottlesSent    = parseInt(safeLS('get','velo_bottles_sent')||'0');

  var emotionLabel = {positivo:'positiva y con energía 🌟',negativo:'con altibajos — y eso es normal 🌊',ansiedad:'procesando momentos difíciles con valentía 💪',neutro:'equilibrada y reflexiva ✨'}[dominantEmotion] || 'en proceso 🌿';

  var insights = [];
  if(moodCheckIns>=10) insights.push('• 😊 Registraste tu estado de ánimo '+moodCheckIns+' veces — eso es autoconciencia real.');
  else if(moodCheckIns>=3) insights.push('• 😊 Hiciste '+moodCheckIns+' check-ins de cómo te sentías. Cada registro cuenta.');
  else insights.push('• 😊 El check-in diario de ánimo te ayuda a ver tus patrones emocionales. Intentá hacerlo cada día.');

  if(breathSessions>=3) insights.push('• 🌬️ Completaste '+breathSessions+' sesiones de respiración — tu sistema nervioso lo nota.');
  else insights.push('• 🌬️ La respiración guiada es la herramienta más rápida para bajar la ansiedad. Probala esta semana.');

  if(helpSessions>=1) insights.push('• 🤝 Pediste acompañamiento '+helpSessions+' vez/veces — pedir ayuda es un acto de valentía.');
  if(bottlesSent>=1)  insights.push('• 🍾 Lanzaste '+bottlesSent+' botella(s) al mar. Tu voz llegó a alguien.');

  var recomendacion = {
    positivo: 'Tu energía positiva es contagiosa. Considerá compartirla en los Círculos de Paz — podrías hacer la diferencia en alguien más.',
    negativo: 'Los meses difíciles enseñan mucho. Si sentís que necesitás más apoyo, los Guardianes de Velo están disponibles para vos.',
    ansiedad: 'La ansiedad que registraste merece atención. Probá hacer 3 sesiones de respiración esta semana y notá si algo cambia.',
    neutro:   'La regularidad es tu mejor aliada. Seguí haciendo tu check-in diario y conectando con la comunidad.'
  }[dominantEmotion] || 'Seguís adelante — eso ya es mucho. 💚';

  var cuerpo = '¡Hola! Soy la IA de Velo y analicé tu actividad del último mes. 🤖\n\n'
    +'📊 TU MES EN VELO\n'
    +insights.join('\n')
    +'\n\n💡 CÓMO TE VEO\n'
    +'Tu energía este mes fue '+emotionLabel+'.\n\n'
    +'🎯 MI RECOMENDACIÓN\n'
    +recomendacion+'\n\n'
    +'Velo está aquí cada vez que lo necesitás. 💚';

  setTimeout(function(){
    addBuzonMsg({
      id:'ia-summary-'+now,
      tipo:'sistema',
      icon:'🤖',
      remitente:'Velo IA',
      asunto:'Tu resumen de bienestar — '+new Date().toLocaleDateString('es-AR',{month:'long',year:'numeric'}),
      titulo:'Tu resumen de bienestar — '+new Date().toLocaleDateString('es-AR',{month:'long',year:'numeric'}),
      cuerpo:cuerpo,
      extracto:'Analicé tu actividad este mes. Aquí tus insights personalizados...',
      leido:false,
      prioritario:false,
      fecha:new Date().toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})
    });
    updateBuzonDot(); updateInboxBadge();
    toast('🤖','Velo IA generó tu resumen mensual 📊');
  }, 3000);
}

// ── CONTADOR DE SESIONES PARA IA ─────────────────────────
function iaTrackBreathSession(){
  var n = parseInt(safeLS('get','velo_breath_sessions')||'0') + 1;
  safeLS('set','velo_breath_sessions', String(n));
}
function iaTrackHelpSession(){
  var n = parseInt(safeLS('get','velo_help_sessions')||'0') + 1;
  safeLS('set','velo_help_sessions', String(n));
}
function iaTrackBottleSent(){
  var n = parseInt(safeLS('get','velo_bottles_sent')||'0') + 1;
  safeLS('set','velo_bottles_sent', String(n));
}

// ── ONBOARDING ───────────────────────────────────────────
var _obSlide=0;
var _obTotal=5;
function obReset(){_obSlide=0;setTimeout(_obRenderSlide,50);}
function obNext(){
  if(_obSlide<_obTotal-1){_obSlide++;_obRenderSlide();}
  else{_obSlide=0;goTo('register-type');}
}
function obBack(){if(_obSlide>0){_obSlide--;_obRenderSlide();}}
function obSkip(){_obSlide=0;goTo('register-type');}
function _obRenderSlide(){
  for(var i=0;i<_obTotal;i++){
    var d=document.getElementById('ob-dot-'+i);
    if(d){d.className='ob-dot'+(_obSlide===i?' ob-dot-a':'');}
    var sl=document.getElementById('ob-slide-'+i);
    if(sl){
      if(i===_obSlide){sl.style.display='flex';sl.style.animation='none';void sl.offsetWidth;sl.style.animation='onboardSlide .35s ease both';}
      else sl.style.display='none';
    }
  }
  var btn=document.getElementById('obNextBtn');
  if(btn)btn.textContent=_obSlide===_obTotal-1?'Comenzar 🌿':'Siguiente →';
  var back=document.getElementById('obBackBtn');
  if(back)back.style.visibility=_obSlide>0?'visible':'hidden';
}

// ── PRO ONBOARDING ───────────────────────────────────────
var _pobSlide=0;
var _pobTotal=5;
function pobReset(){_pobSlide=0;setTimeout(_pobRenderSlide,50);}
function pobNext(){
  if(_pobSlide<_pobTotal-1){_pobSlide++;_pobRenderSlide();}
  else{_pobSlide=0;goTo('pro-register');}
}
function pobBack(){if(_pobSlide>0){_pobSlide--;_pobRenderSlide();}}
function pobSkip(){_pobSlide=0;goTo('pro-register');}
function _pobRenderSlide(){
  for(var i=0;i<_pobTotal;i++){
    var d=document.getElementById('pob-dot-'+i);
    if(d){d.className='ob-dot'+(_pobSlide===i?' ob-dot-a':'');}
    var sl=document.getElementById('pob-slide-'+i);
    if(sl){
      if(i===_pobSlide){sl.style.display='flex';sl.style.animation='none';void sl.offsetWidth;sl.style.animation='onboardSlide .35s ease both';}
      else sl.style.display='none';
    }
  }
  var btn=document.getElementById('pobNextBtn');
  if(btn)btn.textContent=_pobSlide===_pobTotal-1?'Registrarme 🌿':'Siguiente →';
  var back=document.getElementById('pobBackBtn');
  if(back)back.style.visibility=_pobSlide>0?'visible':'hidden';
}

function togProSpec(el){
  var on=el.style.borderColor.indexOf('198')>=0;
  el.style.borderColor=on?'rgba(200,200,200,.3)':'var(--sage2)';
  el.style.background=on?'rgba(255,255,255,.7)':'var(--sage7)';
  el.style.color=on?'var(--ink4)':'var(--sage2)';
}
function proDocSelected(inp,nameId,prevId){
  var f=inp.files&&inp.files[0];
  var nm=document.getElementById(nameId);
  var pv=document.getElementById(prevId);
  if(f&&nm){
    nm.textContent='✅ '+f.name;
    nm.style.color='var(--sage2)';
    nm.style.fontWeight='600';
    if(pv){pv.style.borderColor='rgba(116,198,157,.5)';pv.style.background='var(--sage7)';}
  }
}

// ── CUSTOM DONATION ──────────────────────────────────────
var selectedDonAmt='10';
function selDonAmt(el,amt){
  document.querySelectorAll('#donModalGrid > div').forEach(function(d){
    d.style.background='rgba(255,255,255,.82)';d.style.borderColor='rgba(212,168,100,.2)';
    var sub=d.querySelector('div:last-child');if(sub){sub.style.color='var(--ink5)';sub.style.fontWeight='400';}
  });
  el.style.background='var(--sage7)';el.style.borderColor='var(--sage2)';
  var sub=el.querySelector('div:last-child');if(sub){sub.style.color='var(--sage3)';sub.style.fontWeight='600';}
  selectedDonAmt=amt;
  var inp=document.getElementById('customDonAmt');if(inp)inp.value='';
  var err=document.getElementById('customAmtError');if(err)err.style.display='none';
}
function clearGridSel(){
  document.querySelectorAll('#donModalGrid > div').forEach(function(d){
    d.style.background='rgba(255,255,255,.82)';d.style.borderColor='rgba(212,168,100,.2)';
  });
}
function onCustomAmt(inp){
  selectedDonAmt=inp.value;
  var err=document.getElementById('customAmtError');
  if(err)err.style.display=parseFloat(inp.value)<5?'block':'none';
}
function confirmDon(){
  var custom=document.getElementById('customDonAmt');
  if(custom&&custom.value){
    if(parseFloat(custom.value)<5){
      var err=document.getElementById('customAmtError');if(err)err.style.display='block';
      return;
    }
    selectedDonAmt=custom.value;
  }
  closeModal('donModal');
  var desc = isMonthlyDon ? 'Donación mensual Velo' : 'Donación Velo';
  openPayPalDonate(selectedDonAmt, isMonthlyDon, desc);
  toast('💳','Redirigiendo a PayPal… completá el pago y volvé 🌿');
}

var darkSc=['help','bottle'];
var prevScreen='home';
var contactFrom='home';
function goTo(id){
  // Track origin for contact back button
  var cur=document.querySelector('.sc.on');
  if(cur&&cur.id&&cur.id!==id) prevScreen=cur.id;
  if(id==='contact') contactFrom=prevScreen;

  document.querySelectorAll('.sc').forEach(function(s){ s.classList.remove('on'); });
  var _sc=document.getElementById(id);if(!_sc)return;_sc.classList.add('on');
  var bn=document.getElementById('bnav');if(!bn)return;
  bn.style.display=(noNav.indexOf(id)>=0||id==='admin')?'none':'flex';
  if(darkSc.indexOf(id)>=0){
    bn.style.background='rgba(10,22,12,.9)';
    bn.style.borderTopColor='rgba(116,198,157,.09)';
  } else {
    bn.style.background='rgba(255,255,255,.94)';
    bn.style.borderTopColor='rgba(180,215,195,.28)';
  }
  document.querySelectorAll('.ni').forEach(function(n){ n.classList.remove('on','on-dark'); });
  var nv=document.getElementById('nv-'+id);
  if(nv)nv.classList.add(darkSc.indexOf(id)>=0?'on-dark':'on');

  // Show welcome banner the first time user reaches home after login
  if(id==='home'){
    var shown=safeLS('get','velo_banner_shown');
    setTimeout(updatePlanBadge, 50);
  }
  if(id==='onboarding') setTimeout(obReset,30);
  if(id==='pro-onboarding') setTimeout(pobReset,30);
  if(id==='pro-panel') setTimeout(renderProPendingBanner,50);
  if(id==='admin') setTimeout(renderAdminContacts,50);
  if(id==='profile') setTimeout(checkMonthlyDonorUI,50);
  if(id==='bottle'){ setTimeout(renderBottleWall,50); setTimeout(updateBottleCounter,60); }
  if(id==='happy') setTimeout(renderHappyWall,50);
  if(id==='help') setTimeout(renderSolicitudes,50);
  if(id==='buzon') setTimeout(renderBuzon,50);
  if(id==='feed') setTimeout(renderMyCircles,50);
  if(id==='pro') setTimeout(function(){ document.querySelectorAll('.pro-card').forEach(function(c){ c.style.display='block'; }); },50);
  if(id==='diary') setTimeout(initDiary,50);
  if(id==='calm') setTimeout(loadCalmData,50);
  if(id==='profile') setTimeout(loadProfileData,100);
  if(id==='pro-panel-perfil') setTimeout(initProAvailEditor,50);
  // Reset contact form when leaving
  if(id!=='contact'){var f=document.getElementById('contactForm');if(f)f.style.display='none';}
}
function openModal(id){
  document.getElementById(id).classList.add('show');
  if(id==='sosModal') setTimeout(renderSOSCountry,30);
}
function closeModal(id){document.getElementById(id).classList.remove('show');}

// Request help flow
function openReq(){document.getElementById('reqModal').classList.add('show');}
function closeReq(){document.getElementById('reqModal').classList.remove('show');}
// Simulate: 70% accepted, 30% declined
function sendReq(){
  closeReq();
  if(Math.random()<.3){
    document.getElementById('declinedModal').classList.add('show');
  } else {
    var nm = (document.getElementById('reqName')||{}).textContent || 'Guardián';
    var av = (document.getElementById('reqAv')||{}).textContent || '🌿';
    openGuardianChat(nm, av, 'helped');
  }
}
function sendReqDetail(){
  document.getElementById('reqModalDetail').classList.remove('show');
  if(Math.random()<.35){
    document.getElementById('declinedDetail').classList.add('show');
  } else {
    openGuardianChat('Luna Verde', '🌙', 'helped');
  }
}
function closeDeclined(){document.getElementById('declinedModal').classList.remove('show');}

// ── CHAT INVITATION SYSTEM ────────────────────────────────────
var _chatInviteGuardian = {name:'Guardián', av:'🌿'};
var _chatInviteTimer = null;
function requestChatInvite(name, av){
  _chatInviteGuardian = {name:name||'Guardián', av:av||'🌿'};
  var el = document.getElementById('crsGuardianName');
  if(el) el.textContent = name||'Guardián';
  document.getElementById('chatRequestSent').classList.add('show');
  _chatInviteTimer = setTimeout(function(){
    document.getElementById('chatRequestSent').classList.remove('show');
    var nEl = document.getElementById('cipGuardianName');
    var aEl = document.getElementById('cipGuardianAv');
    if(nEl) nEl.textContent = _chatInviteGuardian.name;
    if(aEl) aEl.textContent = _chatInviteGuardian.av;
    document.getElementById('chatInvitePopup').classList.add('show');
  }, 2500);
}
function cancelChatRequest(){
  if(_chatInviteTimer){ clearTimeout(_chatInviteTimer); _chatInviteTimer=null; }
  document.getElementById('chatRequestSent').classList.remove('show');
}
function acceptChatInvite(){
  document.getElementById('chatInvitePopup').classList.remove('show');
  setStatus('busy');
  openGuardianChat(_chatInviteGuardian.name, _chatInviteGuardian.av, 'helped');
}
function rejectChatInvite(){
  document.getElementById('chatInvitePopup').classList.remove('show');
  showSuc('🙏','No estaba disponible',''+_chatInviteGuardian.name+' no pudo atenderte en este momento. Podés intentar con otro Guardián o volver más tarde. 💙');
}

// Status
var curStatus='active';
function setStatus(s){
  curStatus=s;
  var classes={active:'active-on',busy:'active-busy',off:'active-off'};
  var keys={active:'a',busy:'b',off:'o'};
  ['a','b','o'].forEach(function(k){
    var el=document.getElementById('som-'+k);
    if(el){el.className='stbtn';if(k===keys[s])el.classList.add(classes[s]);}
  });
  var labels={active:'Disponible',busy:'Ocupado/a',off:'Desconectado'};
  var dotC={active:'st-on',busy:'st-busy',off:'st-off'};
  document.getElementById('hdrTxt').textContent=labels[s];
  var hd=document.getElementById('hdrDot');
  hd.className='st-dot '+dotC[s];
  var pd=document.getElementById('profileDot');
  if(pd)pd.className='profile-av-st '+dotC[s];
  toast('✅',labels[s]+' como guardián');
}
function togSt(){
  var el=document.getElementById('profileStatusTag');
  if(!el) return;
  var states=[{label:'🟢 Disponible',key:'active'},{label:'🟡 Ocupado/a',key:'busy'},{label:'⭕ No disponible',key:'off'}];
  var cur=el.getAttribute('data-st')||'active';
  var idx=states.findIndex(function(s){return s.key===cur;});
  var next=states[(idx+1)%states.length];
  el.textContent=next.label;
  el.setAttribute('data-st',next.key);
  setStatus(next.key);
}
function setSt(s){
  var map={a:'active',b:'busy',o:'off'};
  var classes={active:'active-on',busy:'active-busy',off:'active-off'};
  ['a','b','o'].forEach(function(k){
    var el=document.getElementById('sto-'+k);
    if(el){el.className='stbtn';if(k===s)el.classList.add(classes[map[s]]);}
  });
  setStatus(map[s]);
}
function ssSet(s){
  var map={on:'active',busy:'busy',off:'off'};
  var stClasses={on:'active-on',busy:'active-busy',off:'active-off'};
  ['ssA','ssB','ssO'].forEach(function(id){
    var el=document.getElementById(id);
    if(el)el.className='stbtn';
  });
  var elMap={on:'ssA',busy:'ssB',off:'ssO'};
  var el=document.getElementById(elMap[s]);
  if(el)el.classList.add(stClasses[s]);
  setStatus(map[s]);
  var t={on:'Disponible como guardián',busy:'Ocupado/a · en charla',off:'No disponible ahora'};
  var sub={on:'La comunidad puede pedirte ayuda',busy:'Volvés pronto',off:'No aparecés como guardián activo'};
  document.getElementById('ssT').textContent=t[s];
  document.getElementById('ssS').textContent=sub[s];
}
function togIncog(){
  var now=safeLS('get','velo_incognito')==='1';
  var next=!now;
  safeLS('set','velo_incognito',next?'1':'0');
  applyIncognitoUI(next);
  toast(next?'Modo incognito activado. Apareceran como Anonima/o.':'Modo incognito desactivado.');
}

function isIncognitoActive(){
  return safeLS('get','velo_incognito')==='1';
}

function applyIncognitoUI(active){
  try{
    var ids=['incogSw','incogSwP'];
    for(var si=0;si<ids.length;si++){
      var sw=document.getElementById(ids[si]);
      if(!sw)continue;
      try{
        var k=sw.querySelector('.tog-k');
        if(active){sw.classList.add('on');if(k)k.style.transform='translateX(18px)';}
        else{sw.classList.remove('on');if(k)k.style.transform='';}
      }catch(e2){}
    }
    var badge=document.getElementById('incogBadge');
    if(badge)badge.style.display=active?'block':'none';
    var incogToggle=document.getElementById('incogToggle');
    if(incogToggle)incogToggle.style.background=active?'#2d6a4f':'#ccc';
    var incogKnob=document.getElementById('incogKnob');
    if(incogKnob)incogKnob.style.left=active?'22px':'3px';
    var profName=document.getElementById('profileNameDisplay');
    if(profName)profName.style.opacity=active?'0.4':'1';
  }catch(e){}
}

function getDisplayName(){
  if(isIncognitoActive()) return 'Anonima/o';
  return safeLS('get','velo_user_name')||'Velo User';
}

// Avatar
function setAv(el,em){
  if(!el||!em){ toast('✏️','Tocá un emoji abajo para cambiar tu avatar'); return; }
  var grid = el.closest('.av-grid') || el.parentElement;
  if(grid) grid.querySelectorAll('.av-opt').forEach(function(a){ a.classList.remove('sel'); })
  el.classList.add('sel');
  safeLS('set','velo_user_avatar',em);
  var d=document.getElementById('profileAvDisplay');
  if(d){d.textContent=em;var dot=document.getElementById('profileDot');if(dot)d.appendChild(dot);}
  var userPrev=document.getElementById('userAvatarPreview');
  if(userPrev && !userPrev.querySelector('img')){ userPrev.textContent=em; }
  var regPrev=document.getElementById('regAvatarPreview');
  if(regPrev && !regPrev.querySelector('img')){ regPrev.textContent=em; }
  toast('✨','Avatar actualizado');
}
// ── FOTO DE PERFIL — usuario, registro y profesional ─────
function previewPhoto(inputEl, previewId){
  var file = inputEl.files[0];
  if(!file) return;
  if(file.size > 5*1024*1024){toast('⚠️','La foto no puede superar 5MB');return;}
  var reader = new FileReader();
  reader.onload = function(e){
    var prev = document.getElementById(previewId);
    if(prev){
      prev.innerHTML = '';
      var img = document.createElement('img');
      img.src = e.target.result;
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:inherit';
      prev.appendChild(img);
      toast('✅','Foto de perfil actualizada 🌿');
    }
  };
  reader.readAsDataURL(file);
}
function previewUserPhoto(inp){ previewPhoto(inp,'userAvatarPreview'); }
function previewProPhoto(inp){ previewPhoto(inp,'proAvatarPreview'); }
function previewRegPhoto(inp){ previewPhoto(inp,'regAvatarPreview'); }
function setProAv(el,emoji){
  var grid = el.closest('div[style*="flex-wrap:wrap"]') || el.parentElement;
  if(grid) grid.querySelectorAll('.av-opt').forEach(function(o){ o.classList.remove('sel'); })
  el.classList.add('sel');
  var prev = document.getElementById('proAvatarPreview');
  if(prev && !prev.querySelector('img')){ prev.textContent = emoji; }
}

// Rejection bar update
setTimeout(function(){
  var bar=document.getElementById('rejBar');
  if(bar)bar.style.width='30%';
},800);

// Helpers
function tChk(id){
  var b=document.getElementById(id);
  b.classList.toggle('on');
  b.textContent=b.classList.contains('on')?'✓':'';
}
// ── PRO REGISTRATION — TIPO DE PERFIL ────────────────────
var proTypeSelected = '';
function setProType(type){
  proTypeSelected = type;
  var yesEl = document.getElementById('prCliYes');
  var noEl  = document.getElementById('prCliNo');
  var cliBlock = document.getElementById('prBlockClinico');
  var ncBlock  = document.getElementById('prBlockNoCli');
  if(type === 'clinico'){
    yesEl.style.borderColor = 'var(--sage2)';
    yesEl.style.background  = 'var(--sage7)';
    noEl.style.borderColor  = 'var(--border)';
    noEl.style.background   = 'rgba(255,255,255,.7)';
    if(cliBlock) cliBlock.style.display = 'block';
    if(ncBlock)  ncBlock.style.display  = 'none';
  } else {
    noEl.style.borderColor  = 'rgba(196,181,232,.5)';
    noEl.style.background   = 'rgba(196,181,232,.08)';
    yesEl.style.borderColor = 'var(--border)';
    yesEl.style.background  = 'rgba(255,255,255,.7)';
    if(cliBlock) cliBlock.style.display = 'none';
    if(ncBlock)  ncBlock.style.display  = 'block';
  }
}
function selProType(el){
  var parent = el.parentElement;
  parent.querySelectorAll('span').forEach(function(s){
    s.style.borderColor = 'var(--border)';
    s.style.background  = 'rgba(255,255,255,.7)';
    s.style.color       = 'var(--ink4)';
  });
  if(proTypeSelected === 'clinico'){
    el.style.borderColor = 'var(--sage2)';
    el.style.background  = 'var(--sage7)';
    el.style.color       = 'var(--sage2)';
  } else {
    el.style.borderColor = 'rgba(196,181,232,.5)';
    el.style.background  = 'rgba(196,181,232,.1)';
    el.style.color       = '#7B65B8';
  }
}
function previewProDoc(inp, labelId){
  var file = inp.files[0];
  if(!file) return;
  var el = document.getElementById(labelId);
  if(el){ el.textContent = '✅ ' + file.name; el.style.display = 'block'; }
  toast('📄', 'Documento adjunto: ' + file.name);
}
function togSpec(el){
  var on=el.style.borderColor==='var(--sage2)';
  el.style.borderColor=on?'var(--border)':'var(--sage2)';
  el.style.background=on?'rgba(255,255,255,.7)':'var(--sage7)';
  el.style.color=on?'var(--ink4)':'var(--sage2)';
}
function selPlan(el){
  el.parentElement.querySelectorAll('div').forEach(function(p){p.style.borderColor='var(--border)';p.style.background='rgba(255,255,255,.82)';});
  el.style.borderColor='var(--sage2)';el.style.background='var(--sage7)';
  toast('✅','Plan seleccionado');
}
function prStep(step){
  // Step 4 = final confirmation → trigger PayPal $15/month first
  if(step===4){
    openPayPalPro();
  }
  var steps=['prs1','prs2','prs3','prs4-contract','prs4'];
  steps.forEach(function(id){
    var el=document.getElementById(id);
    if(el) el.style.display='none';
  });
  var nextId=steps[step];
  if(nextId){
    var next=document.getElementById(nextId);
    if(next) next.style.display='flex';
  }
  document.querySelectorAll('.prs').forEach(function(d,i){
    d.classList.remove('done','now');
    if(i<step) d.classList.add('done');
    else if(i===step) d.classList.add('now');
  });
}
function activarSesionSolidaria(){
  var badge = document.getElementById('solActivoBadge');
  if(badge) badge.style.display='flex';
  showSuc('🕊️','¡Sesión solidaria activada!','Gracias por tu generosidad. Velo asignará tu sesión al usuario que más lo necesite. Ganaste la insignia Profesional Solidario 🕊️ y mayor visibilidad en búsquedas. 💚');
}
function cancelarSesionSolidaria(){
  var badge = document.getElementById('solActivoBadge');
  if(badge) badge.style.display='none';
  showSuc('💙','Sesión solidaria desactivada','Podés volver a activarla en cualquier momento desde tu panel. Gracias por haber participado en el programa. Tu historial solidario se mantiene. 🕊️');
}
function selSolSesion(el, val){
  var opts=['solOpt45','solOpt60','solOptNo'];
  opts.forEach(function(id){
    var d=document.getElementById(id);
    if(d){
      d.style.borderColor='rgba(168,212,232,.3)';
      d.style.background='rgba(255,255,255,.7)';
    }
  });
  if(val==='no'){
    el.style.borderColor='var(--sage2)';
    el.style.background='var(--sage7)';
  } else {
    el.style.borderColor='rgba(168,212,232,.5)';
    el.style.background='rgba(168,212,232,.12)';
    toast('🕊️','Sesión solidaria de '+val+' min seleccionada. Gracias 💚');
  }
}
function selAmt(el){
  document.querySelectorAll('#amountGrid .amt-o').forEach(function(a){ a.classList.remove('on'); });
  el.classList.add('on');
  var txt = el.querySelector('div');
  if(txt) selectedDonAmt = txt.textContent.replace(/[^0-9.]/g,'') || '10';
}
function confirmDonExit(){
  var on = document.querySelector('#amountGrid .amt-o.on');
  var amt = selectedDonAmt || '10';
  if(on){ var t=on.querySelector('div'); if(t) amt=t.textContent.replace(/[^0-9.]/g,'')||'10'; }
  openPayPalDonate(amt, false, 'Donación Velo');
  toast('💳','Redirigiendo a PayPal… completá el pago y volvé 🌿');
}
function selStar(el,n){
  var stars=el.parentElement.querySelectorAll('.star-btn');
  stars.forEach(function(s,i){s.classList.toggle('on',i<n);});
  var lbl=['','Puede mejorar','Regular','Buena ayuda','Muy buena','¡Excelente!'];
  toast('⭐',lbl[n]||'');
}
function showSuc(em,t,s){
  document.getElementById('sucEm').textContent=em;
  document.getElementById('sucT').textContent=t;
  document.getElementById('sucS').textContent=s;
  document.getElementById('sucOv').classList.add('show');
}
function closeSuc(){document.getElementById('sucOv').classList.remove('show');}

// Live counters
var lH=36,lW=247;
setInterval(function(){
  lH=Math.max(22,Math.min(52,lH+(Math.random()>.5?1:-1)));
  lW=Math.max(200,Math.min(295,lW+Math.floor(Math.random()*3)-1));
  var h=document.getElementById('hLive');if(h)h.textContent=lH;
  var g=document.getElementById('gOnline');if(g)g.textContent=lH;
  var g2=document.getElementById('gOnline2');if(g2)g2.textContent=lH;
  var w=document.getElementById('wLive');if(w)w.textContent=lW;
  var hc=document.getElementById('helpCount');if(hc)hc.textContent=Math.floor(Math.random()*3+1)+' ahora';
},5000);

var _bn=document.getElementById('bnav');if(_bn)_bn.style.display='none';
// Init notifications from storage
setTimeout(function(){ _loadNotifStorage(); updateBuzonDot(); updateInboxBadge(); },100);
setTimeout(function(){ toast('🌿','Velo — Acompañamos emociones'); },5000);

// ── DONATION MODAL ──────────────────────────────────────
var isMonthlyDon=false;
function openContactForm(type){
  var form=document.getElementById('contactForm');
  var title=document.getElementById('contactFormTitle');
  var topicRow=document.getElementById('cTopicRow');
  var attach=document.getElementById('cAttach');
  if(!form)return;
  form.style.display='block';
  form.scrollIntoView({behavior:'smooth',block:'start'});
  var labels={
    reporte:'🐛 Reportar un problema en la app',
    sugerencia:'💡 Sugerencia para mejorar Velo',
    profesional:'🌿 Consulta de profesional',
    patrocinador:'🤝 Patrocinio y alianzas',
    prensa:'📰 Prensa y medios',
    general:'📧 Consulta general'
  };
  var placeholders={
    reporte:'Describí el problema con el mayor detalle posible: ¿qué pantalla? ¿qué hiciste antes de que fallara?',
    sugerencia:'¿Qué mejorarías? ¿Qué función te gustaría ver en Velo?',
    profesional:'¿Cuál es tu especialidad? ¿Qué dudas tenés sobre el registro?',
    patrocinador:'¿Cómo te gustaría apoyar a Velo? Contanos sobre tu organización o empresa.',
    prensa:'Contanos sobre el medio o proyecto para el que trabajás y en qué podemos colaborar.',
    general:'¿En qué podemos ayudarte?'
  };
  if(title) title.textContent='✍️ '+(labels[type]||'Mensaje');
  if(topicRow) topicRow.textContent='📌 Tema: '+(labels[type]||type);
  var ta=document.getElementById('cMsg');
  if(ta) ta.placeholder=placeholders[type]||'Contanos...';
  if(attach) attach.style.display=type==='reporte'?'block':'none';
  // Auto-rellenar email si el usuario ya está registrado
  var emailEl=document.getElementById('cEmail');
  if(emailEl && !emailEl.value){
    var storedEmail=safeLS('get','velo_user_email')||'';
    if(storedEmail) emailEl.value=storedEmail;
  }
}
function sendContactForm(){
  var msg=document.getElementById('cMsg');
  var emailEl=document.getElementById('cEmail');
  if(!msg||!msg.value.trim()){toast('✍️','Escribí tu mensaje antes de enviar');return;}
  if(!emailEl||!emailEl.value.trim()){toast('📧','Ingresá tu email para que podamos responderte');return;}
  var emailVal=emailEl.value.trim();
  // Validación básica de email
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailVal)){toast('📧','Revisá que el email esté bien escrito');return;}
  var topicEl=document.getElementById('cTopicRow');
  var topic=topicEl?topicEl.textContent.replace('📌 Tema: ','').trim():'Consulta general';
  var texto=msg.value.trim();
  var ts=Date.now();
  // Save to admin inbox (localStorage)
  var adminMsgs=JSON.parse(safeLS('get','velo_admin_contacts')||'[]');
  adminMsgs.unshift({id:'c-'+ts,topic:topic,mensaje:texto,email:emailVal,fecha:new Date().toLocaleString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}),leido:false});
  safeLS('set','velo_admin_contacts',JSON.stringify(adminMsgs.slice(0,100)));
  // Confirm to user in their buzón
  addBuzonMsg({
    id:'contact-'+ts,
    tipo:'sistema',
    icon:'💌',
    remitente:'Equipo Velo',
    asunto:'Recibimos tu mensaje',
    titulo:'Recibimos tu mensaje',
    cuerpo:'Hola! Recibimos tu consulta sobre "'+topic+'".\n\nEl equipo de Velo te responderá'+(emailVal?' a '+emailVal:' por aquí')+' a la mayor brevedad. 🌿\n\nGracias por escribirnos.',
    extracto:'Tu consulta fue recibida. Te responderemos pronto.',
    leido:false,
    prioritario:false,
    fecha:new Date().toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})
  });
  updateBuzonDot(); updateInboxBadge();
  sbEnviarReporte(texto, topic);
  var form=document.getElementById('contactForm');
  if(form)form.style.display='none';
  if(msg) msg.value='';
  if(emailEl) emailEl.value='';
  showSuc('💌','¡Mensaje enviado!','Te responderemos en tu buzón de Velo a la mayor brevedad. 🌿');
}

function renderAdminContacts(){
  var list=document.getElementById('adminContactList');
  if(!list) return;
  var msgs=JSON.parse(safeLS('get','velo_admin_contacts')||'[]');
  if(!msgs.length){list.innerHTML='<div style="text-align:center;padding:24px;color:var(--ink4);font-size:13px">No hay mensajes de contacto aún.</div>';return;}
  list.innerHTML=msgs.map(function(m){
    var body='Hola!%0A%0AGracias por escribirnos a Velo.%0A%0AEn respuesta a tu consulta sobre "'+encodeURIComponent(m.topic)+'"%3A%0A%0A[Escribí tu respuesta aquí]%0A%0ASaludos,%0AEquipo Velo%0A'+VELO_EMAIL;
    var gmailUrl='https://mail.google.com/mail/?view=cm&fs=1&to='+encodeURIComponent(m.email||'')+'&su='+encodeURIComponent('Re: '+m.topic+' — Velo')+'&body='+body+'&cc='+encodeURIComponent(VELO_EMAIL);
    var mailtoUrl='mailto:'+encodeURIComponent(m.email||'')+'?subject='+encodeURIComponent('Re: '+m.topic+' — Velo')+'&body='+body+'&cc='+encodeURIComponent(VELO_EMAIL);
    return '<div style="background:rgba(255,255,255,.85);border:1.5px solid rgba(116,198,157,.2);border-radius:16px;padding:13px;margin-bottom:9px">'+
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px">'+
        '<div style="font-size:11px;font-weight:700;color:var(--sage2)">'+m.topic+'</div>'+
        '<div style="font-size:10px;color:var(--ink5)">'+m.fecha+'</div>'+
      '</div>'+
      (m.email?'<div style="font-size:10px;color:var(--ink4);margin-bottom:7px">📩 '+m.email+'</div>':'')+
      '<div style="font-size:12px;color:var(--ink3);line-height:1.55;margin-bottom:10px;padding:9px 11px;background:rgba(0,0,0,.03);border-radius:10px">'+m.mensaje+'</div>'+
      (m.email?
        '<div style="display:flex;gap:8px;flex-wrap:wrap">'+
          '<a href="'+gmailUrl+'" target="_blank" style="display:inline-flex;align-items:center;gap:5px;padding:7px 14px;background:linear-gradient(135deg,var(--sage),var(--sage2));border-radius:100px;font-size:11px;font-weight:700;color:#fff;text-decoration:none">📧 Responder por Gmail</a>'+
          '<a href="'+mailtoUrl+'" style="display:inline-flex;align-items:center;gap:5px;padding:7px 14px;background:var(--sage7);border:1.5px solid rgba(116,198,157,.3);border-radius:100px;font-size:11px;font-weight:700;color:var(--sage2);text-decoration:none">✉️ Otro cliente</a>'+
        '</div>'+
        '<div style="font-size:10px;color:var(--ink5);margin-top:6px">Con copia a '+VELO_EMAIL+'</div>':
        '<div style="font-size:11px;color:var(--ink5);font-style:italic">Sin email de contacto — respondé por el buzón de la app</div>')+
    '</div>';
  }).join('');
}
function safeLS(action,key,val){
  try{
    if(action==='get') return localStorage.getItem(key);
    if(action==='set') localStorage.setItem(key,val);
  }catch(e){return null;}
}
function loginAndWelcome(){
  try{localStorage.removeItem('velo_banner_shown');}catch(e){}
  goTo('home');
  setTimeout(function(){ loadTodayMood(); _loadNotifStorage(); updateInboxBadge(); updateBuzonDot(); }, 200);
}
function mockGoogleLogin(type){
  // Existing user: go directly to home or pro panel
  toast('🔍','Verificando con Google...');
  setTimeout(function(){
    if(type === 'pro'){
      safeLS('set','velo_user_type','pro');
      safeLS('set','velo_pro_approved','true');
      goTo('pro-panel');
      setTimeout(function(){ toast('👑','Bienvenido al panel profesional 💚'); }, 400);
    } else {
      try{ localStorage.removeItem('velo_banner_shown'); }catch(e){}
      safeLS('set','velo_user_type','user');
      goTo('home');
      setTimeout(function(){ toast('💚','Bienvenido/a a Velo! 🌿'); }, 400);
    }
  }, 700);
}
function googleRegisterNewUser(){
  // New user via Google: pre-fill name and skip to step 2
  toast('🔍','Conectando con Google...');
  setTimeout(function(){
    var nameEl = document.getElementById('rgName');
    var emailEl = document.getElementById('rgEmail');
    if(nameEl) nameEl.value = 'Usuario Google';
    if(emailEl) emailEl.value = 'usuario@gmail.com';
    // Go to step 2 (complete missing info)
    rgStep(1);
    setTimeout(function(){ toast('✅','Cuenta Google vinculada. Completá tu perfil 🌿'); }, 400);
  }, 700);
}
function loginProAndGo(){
  safeLS('set','velo_user_type','pro');
  safeLS('set','velo_pro_approved','true'); // test mode: always approved
  goTo('pro-panel');
}
function logoutPro(){
  safeLS('set','velo_user_type','user');
  goTo('splash');
  toast('🌿','Sesión cerrada');
}
// Pro status
function setProStatus(st, el){
  var labels={disponible:'🟢 Disponible',ocupado:'🟡 Ocupado',vacaciones:'🏖️ Vacaciones',descanso:'⏸️ Descanso'};
  var colors={disponible:'rgba(58,158,96,.25)',ocupado:'rgba(212,165,0,.25)',vacaciones:'rgba(0,140,210,.25)',descanso:'rgba(170,100,190,.25)'};
  document.querySelectorAll('#pro-panel [onclick^="setProStatus"]').forEach(function(b){
    b.style.background='rgba(255,255,255,.1)';b.style.borderColor='rgba(255,255,255,.2)';b.style.color='rgba(255,255,255,.7)';
  });
  if(el){el.style.background=colors[st];el.style.borderColor='rgba(255,255,255,.4)';el.style.color='#fff';}
  var badge=document.getElementById('proStatusBadge');
  if(badge)badge.textContent=labels[st]||'🟢 Disponible';
  toast('✅','Estado: '+labels[st]);
}
// Pro agenda day toggle
function togDay(el){
  var on=el.style.borderColor.indexOf('sage')>=0||el.style.borderColor.indexOf('116')>=0;
  if(on){el.style.background='rgba(255,255,255,.7)';el.style.borderColor='var(--border)';el.style.color='var(--ink5)';}
  else{el.style.background='var(--sage7)';el.style.borderColor='var(--sage2)';el.style.color='var(--sage2)';}
}
// Solidaria session toggle
function selSol(el, min){
  document.querySelectorAll('#pro-panel-sesion-sol [onclick^="selSol"]').forEach(function(d){
    d.style.borderColor='var(--border)';d.style.background='rgba(255,255,255,.8)';
    var chk=d.querySelector('span:last-child');if(chk&&chk.textContent==='✓')chk.textContent='';
  });
  el.style.borderColor='var(--sage2)';el.style.background='var(--sage7)';
  var chk=el.querySelector('span:last-child');if(chk)chk.textContent='✓';
}
// Pro notif toggle
function toggleProNotif(el){
  var dot=el.querySelector('div');
  var isOn=dot.style.right==='2px';
  if(isOn){dot.style.right='18px';el.style.background='#CCC';}
  else{dot.style.right='2px';el.style.background='var(--sage2)';}
}
function addProTag(el, tag){
  var ta=document.querySelector('#pro-panel-notas .ta');
  if(ta)ta.value+=(ta.value?' ':'')+'['+tag+']';
}
function confirmDeleteAccount(){
  showSuc('🗑️','¿Eliminar tu cuenta?','Se borrarán todos tus datos, historial y configuración de forma permanente. Esta acción NO se puede deshacer. Si confirmás, te enviamos un email para verificar antes de proceder.');
}
function confirmDeleteAccountPro(){
  showSuc('🗑️','¿Eliminar tu cuenta profesional?','Se eliminarán tus datos, historial de sesiones, notas y perfil público. Las sesiones pendientes serán canceladas. Esta acción NO se puede deshacer.');
}
function selProfileDon(el, amt){
  var parent=document.getElementById('profileDonAmounts');
  if(parent) parent.querySelectorAll('div').forEach(function(d){
    d.style.borderColor='var(--border)';
    d.style.background='rgba(255,255,255,.7)';
  });
  el.style.borderColor='var(--sage2)';
  el.style.background='var(--sage7)';
  var wrap=document.getElementById('profileDonCustomWrap');
  if(wrap) wrap.style.display=amt==='otro'?'block':'none';
}
function activateProfileDon(monthly){
  var amtEl = document.getElementById('profileDonAmounts');
  var selEl = amtEl ? amtEl.querySelector('[style*="sage7"]') : null;
  var customEl = document.getElementById('profileDonCustom');
  var amt = 10;
  if(selEl){
    var txt = selEl.querySelector('div');
    if(txt) amt = parseFloat(txt.textContent.replace(/[^0-9.]/g,''))||10;
  }
  if(customEl && customEl.value && parseFloat(customEl.value)>=5) amt = parseFloat(customEl.value);
  var desc = monthly ? 'Donación mensual Velo' : 'Donación Velo';
  openPayPalDonate(amt, monthly, desc);
  toast('💳','Redirigiendo a PayPal… completá el pago y volvé 🌿');
}
function cancelDonSub(){
  try{localStorage.removeItem('velo_monthly_donor');localStorage.removeItem('velo_monthly_start');}catch(e){}
  var active=document.getElementById('profileDonActiveBlock');
  var inactive=document.getElementById('profileDonInactiveBlock');
  if(active) active.style.display='none';
  if(inactive) inactive.style.display='block';
  isMonthlyDon=false;
  showSuc('💙','Donación mensual cancelada','Tu donación se mantiene activa hasta el final del período actual. Gracias por tu apoyo a Velo. 💚');
}
function checkMonthlyDonorUI(){
  var isMonthly=safeLS('get','velo_monthly_donor')==='true';
  var active=document.getElementById('profileDonActiveBlock');
  var inactive=document.getElementById('profileDonInactiveBlock');
  if(active) active.style.display=isMonthly?'block':'none';
  if(inactive) inactive.style.display=isMonthly?'none':'block';
  if(isMonthly){
    var start=safeLS('get','velo_monthly_start');
    var dateEl=document.getElementById('profileDonStartDate');
    if(dateEl&&start){
      var d=new Date(parseInt(start));
      dateEl.textContent='Activa desde '+d.toLocaleDateString('es-ES',{month:'long',year:'numeric'});
    }
  }
}

// ── CÍRCULOS DE PAZ ──────────────────────────────────────
var hasGoldBadge = (safeLS('get','velo_can_create_group')==='1') || false;

function sendCircleMsg(){
  var inp = document.getElementById('circleMsgInput');
  if(!inp || !inp.value.trim()) return;
  var msgs = document.getElementById('circleMsgs');
  if(msgs){
    var outer = document.createElement('div');
    outer.style.cssText = 'display:flex;flex-direction:row-reverse;gap:8px;align-items:flex-end;margin-bottom:4px';
    var av = document.createElement('div');
    av.style.cssText = 'width:30px;height:30px;border-radius:9px;background:var(--sage7);display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0';
    av.textContent = '🌙';
    var wrap = document.createElement('div');
    wrap.style.textAlign = 'right';
    var bubble = document.createElement('div');
    bubble.style.cssText = 'max-width:240px;padding:11px 13px;background:linear-gradient(135deg,var(--sage7),var(--sage6));border:1.5px solid rgba(116,198,157,.22);border-radius:18px 18px 4px 18px;font-size:13px;color:var(--ink2);line-height:1.55';
    bubble.textContent = inp.value;
    var t = document.createElement('div');
    t.style.cssText = 'font-size:9px;color:var(--ink5);margin-top:3px;padding-right:2px';
    t.textContent = 'ahora';
    wrap.appendChild(bubble); wrap.appendChild(t);
    outer.appendChild(wrap); outer.appendChild(av);
    msgs.appendChild(outer);
    msgs.scrollTop = msgs.scrollHeight;
  }
  inp.value = '';
}
function addEmoji(e){
  var inp = document.getElementById('circleMsgInput');
  if(inp){ inp.value += e; inp.focus(); }
}
function tryCreateCircle(){
  if(hasGoldBadge){
    document.getElementById('createCircleModal').style.display = 'flex';
  } else {
    showSuc('🥇','Insignia de Oro requerida','Aún no tienes el rango necesario. Te falta participar un poco más para obtener la Insignia de Oro y poder crear tu propio círculo. ¡Sigue apoyando a la comunidad! 💚');
  }
}


function openCircleReport(){
  var m = document.getElementById('circleReportModal');
  if(m){ m.style.display = 'flex'; }
}
function closeCircleReport(){
  var m = document.getElementById('circleReportModal');
  if(m) m.style.display = 'none';
}
function sendCircleReport(){
  closeCircleReport();
  showSuc('🚩','Reporte recibido','El equipo de Velo revisará la situación de este círculo. Gracias por cuidar la comunidad. 🛡️');
}
function filterCircles(q){
  q = q.toLowerCase();
  var cards = document.querySelectorAll('.circle-card');
  var anyVisible = false;
  cards.forEach(function(c){
    var name = (c.getAttribute('data-name')||'').toLowerCase();
    var show = !q || name.indexOf(q) >= 0;
    c.style.display = show ? '' : 'none';
    if(show) anyVisible = true;
  });
  var noRes = document.getElementById('circlesNoResults');
  if(noRes) noRes.style.display = anyVisible ? 'none' : 'block';
  var oSec = document.getElementById('circlesOfficialSection');
  var cSec = document.getElementById('circlesCommunitySection');
  if(q){
    if(oSec) oSec.querySelector('div:first-child').style.display = 'none';
    if(cSec) cSec.querySelector('div:first-child').style.display = 'none';
  } else {
    if(oSec) oSec.querySelector('div:first-child').style.display = '';
    if(cSec) cSec.querySelector('div:first-child').style.display = '';
  }
}
function openSosModal(){
  var count = parseInt(safeLS('get','velo_sos_count')||'0') + 1;
  safeLS('set','velo_sos_count', String(count));
  openModal('sosModal');
}

// ── PROFESIONALES — FILTROS ──────────────────────────────
function selProCat(el, cat){
  document.querySelectorAll('[id^="procat-"]').forEach(function(d){
    d.style.borderColor='var(--border)';
    d.style.background='rgba(255,255,255,.7)';
    d.style.color='var(--ink4)';
  });
  el.style.borderColor='var(--sage2)';
  el.style.background='var(--sage7)';
  el.style.color='var(--sage2)';
  document.querySelectorAll('.pro-card').forEach(function(c){
    c.style.display = (cat==='todos' || c.dataset.cat===cat) ? 'block' : 'none';
  });
}
function selProFilter(el, filter){
  var isOn = el.style.borderColor === 'var(--sage2)';
  el.style.borderColor = isOn ? 'var(--border)' : 'var(--sage2)';
  el.style.background  = isOn ? 'rgba(255,255,255,.7)' : 'var(--sage7)';
  el.style.color       = isOn ? 'var(--ink4)' : 'var(--sage2)';
  toast('🔍', 'Filtro: '+filter);
}
function filterPros(){
  var q = (document.getElementById('proSearch').value||'').toLowerCase();
  document.querySelectorAll('.pro-card').forEach(function(c){
    var text = c.textContent.toLowerCase();
    c.style.display = text.indexOf(q) >= 0 ? 'block' : 'none';
  });
}
function reportPro(name){
  var modal=document.getElementById('reportProModal');
  var nameEl=document.getElementById('reportProName');
  if(nameEl) nameEl.textContent=name;
  var motivo=document.getElementById('reportProMotivo');
  var detalle=document.getElementById('reportProDetalle');
  if(motivo) motivo.value='';
  if(detalle) detalle.value='';
  document.querySelectorAll('.report-chip').forEach(function(c){
    c.style.borderColor='var(--border)';
    c.style.background='rgba(255,255,255,.7)';
    c.style.color='var(--ink4)';
  });
  if(modal) modal.style.display='flex';
}
function closeReportPro(){
  var modal=document.getElementById('reportProModal');
  if(modal) modal.style.display='none';
}
function selReportMotivo(el){
  document.querySelectorAll('.report-chip').forEach(function(c){
    c.style.borderColor='var(--border)';
    c.style.background='rgba(255,255,255,.7)';
    c.style.color='var(--ink4)';
  });
  el.style.borderColor='var(--sos)';
  el.style.background='rgba(192,48,40,.08)';
  el.style.color='var(--sos)';
  var motivo=document.getElementById('reportProMotivo');
  if(motivo) motivo.value=el.textContent.trim();
}
function sendReportPro(){
  var motivo=document.getElementById('reportProMotivo');
  var name=document.getElementById('reportProName');
  if(!motivo||!motivo.value.trim()){toast('⚠️','Seleccioná o escribí el motivo');return;}
  closeReportPro();
  showSuc('🛡️','Reporte recibido','Velo investigará el caso de '+(name?name.textContent:'este profesional')+'. Tu identidad es confidencial. Gracias por cuidar la comunidad. 💙');
}
// Datos del profesional seleccionado para la reserva
// ── SISTEMA DE RESERVAS CON CALENDARIO ───────────────────
var ALL_SLOTS   = ['08:00','09:00','10:00','11:00','12:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00'];
var DAY_SHORT   = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
var DAY_FULL    = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
var MONTH_SHORT = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

// Disponibilidad por defecto (índice 0=Lun…6=Dom)
var _defaultAvail = {
  0:['09:00','10:00','11:00','15:00','16:00'],
  1:['09:00','10:00','14:00','15:00'],
  2:['11:00','15:00','16:00','17:00'],
  3:['09:00','10:00','11:00'],
  4:['14:00','15:00','16:00'],
  5:[], 6:[]
};

// Perfiles demo — override-ables por datos reales en Supabase/localStorage
var _proProfiles = {
  ana:    {nombre:'Dra. Ana Martínez',  emoji:'👩‍⚕️', tarifa:50, especialidad:'Psicóloga clínica · 8 años',   rating:'4.9', reviews:87},
  carlos: {nombre:'Dr. Carlos Fuentes', emoji:'👨‍⚕️', tarifa:65, especialidad:'Terapeuta familiar · 12 años',  rating:'4.8', reviews:64},
  lucia:  {nombre:'Lucía Herrera',       emoji:'🧘',   tarifa:35, especialidad:'Coach emocional · 6 años',       rating:'4.7', reviews:42},
  sofia:  {nombre:'Sofía Navarro',       emoji:'🎨',   tarifa:30, especialidad:'Arte-terapia · 5 años',          rating:'4.8', reviews:31}
};

function _loadProData(proId){
  try{
    var raw = localStorage.getItem('velo_pro_data_'+proId);
    if(raw) return JSON.parse(raw);
  }catch(e){}
  return {tarifa: (_proProfiles[proId]||{}).tarifa||0, availability: _defaultAvail};
}
function _saveProData(proId, data){
  try{ localStorage.setItem('velo_pro_data_'+proId, JSON.stringify(data)); }catch(e){}
}

// Estado de la reserva actual
var _currentPro = {id:'', nombre:'', emoji:'👤', tarifa:0, especialidad:'', rating:'', reviews:0, availability:{}};
var _selectedBookingDay = null;  // { date:Date, dayOfWeek:0-6, label:'' }
var _selectedSlot = null;        // '10:00'

function reservarSesion(proId, nombre, emoji, tarifaDefault, especialidad, rating, reviews){
  var stored = _loadProData(proId);
  _currentPro = {
    id:           proId,
    nombre:       nombre        || '',
    emoji:        emoji         || '👤',
    tarifa:       stored.tarifa || parseFloat(tarifaDefault) || 0,
    especialidad: especialidad  || '',
    rating:       rating        || '5.0',
    reviews:      reviews       || 0,
    availability: stored.availability || _defaultAvail
  };
  _selectedBookingDay = null;
  _selectedSlot       = null;

  // Rellenar encabezado
  var set = function(id, v){ var el=document.getElementById(id); if(el) el.textContent=v; };
  set('psProNombre', _currentPro.nombre);
  set('psProEsp',    _currentPro.especialidad);
  set('psProEmoji',  _currentPro.emoji);
  set('psProTarifa', '$'+_currentPro.tarifa+' USD');
  set('psProRating', '⭐ '+_currentPro.rating+(_currentPro.reviews?' ('+_currentPro.reviews+')':''));

  renderBookingDayStrip();
  _resetBookingBtn();
  goTo('pro-session');
}

function _resetBookingBtn(){
  var btn = document.getElementById('psProTarifaBtn');
  if(!btn) return;
  btn.textContent = 'Elegí un horario para continuar';
  btn.style.opacity = '.45';
  btn.style.pointerEvents = 'none';
}

function renderBookingDayStrip(){
  var strip = document.getElementById('bookingDayStrip');
  if(!strip) return;
  var today = new Date();
  var html = '';
  for(var i=0; i<7; i++){
    var d = new Date(today);
    d.setDate(today.getDate()+i);
    var dow = (d.getDay()+6)%7; // 0=Lun…6=Dom
    var hasSlots = (_currentPro.availability[dow]||[]).length > 0;
    var label = i===0 ? 'Hoy' : i===1 ? 'Mañana' : DAY_SHORT[dow];
    var dayNum = d.getDate();
    var mon = MONTH_SHORT[d.getMonth()];
    html += '<div onclick="selectBookingDay('+i+')" id="bday-'+i+'" style="'+
      'flex-shrink:0;width:52px;padding:9px 5px;border-radius:14px;text-align:center;cursor:'+(hasSlots?'pointer':'default')+';'+
      'background:'+(hasSlots?'rgba(255,255,255,.82)':'rgba(255,255,255,.3)')+';'+
      'border:1.5px solid '+(hasSlots?'rgba(116,198,157,.2)':'rgba(200,200,200,.2)')+';'+
      'opacity:'+(hasSlots?'1':'.4')+'">'+
      '<div style="font-size:9px;font-weight:700;color:var(--sage2);margin-bottom:2px">'+label+'</div>'+
      '<div style="font-size:17px;font-weight:800;color:var(--ink)">'+dayNum+'</div>'+
      '<div style="font-size:9px;color:var(--ink5)">'+mon+'</div>'+
      (hasSlots?'<div style="width:5px;height:5px;border-radius:50%;background:var(--sage2);margin:3px auto 0"></div>':'<div style="height:8px"></div>')+
    '</div>';
  }
  strip.innerHTML = html;
}

function selectBookingDay(dayOffset){
  var today = new Date();
  var d = new Date(today);
  d.setDate(today.getDate() + dayOffset);
  var dow = (d.getDay()+6)%7;
  var slots = (_currentPro.availability[dow]||[]);
  if(!slots.length){ toast('📅','No hay horarios disponibles este día'); return; }

  _selectedBookingDay = {date:d, dow:dow, offset:dayOffset};
  _selectedSlot = null;

  // Highlight selected day
  for(var i=0; i<7; i++){
    var el = document.getElementById('bday-'+i);
    if(!el) continue;
    el.style.background = i===dayOffset ? 'linear-gradient(135deg,var(--sage),var(--sage2))' : 'rgba(255,255,255,.82)';
    el.style.borderColor = i===dayOffset ? 'transparent' : 'rgba(116,198,157,.2)';
    var texts = el.querySelectorAll('div');
    texts.forEach(function(t){ t.style.color = i===dayOffset ? '#fff' : ''; });
  }

  // Render time slots
  var ts = document.getElementById('bookingTimeSlots');
  if(!ts) return;
  ts.style.display = 'block';
  var dayLabel = (dayOffset===0?'Hoy':dayOffset===1?'Mañana':DAY_FULL[dow])+', '+d.getDate()+' '+MONTH_SHORT[d.getMonth()];
  ts.innerHTML = '<div style="font-size:11px;font-weight:700;color:var(--ink4);margin-bottom:8px">'+dayLabel+'</div>'+
    '<div style="display:flex;flex-wrap:wrap;gap:7px">'+
    slots.map(function(s){
      return '<button id="bslot-'+s.replace(':','')+'" onclick="selectTimeSlot(\''+s+'\')" style="'+
        'padding:9px 14px;border-radius:100px;background:rgba(255,255,255,.9);'+
        'border:1.5px solid rgba(116,198,157,.25);font-size:13px;font-weight:700;'+
        'color:var(--sage);cursor:pointer;font-family:Jost,sans-serif">'+s+' hs</button>';
    }).join('')+
    '</div>';
  _resetBookingBtn();
}

function selectTimeSlot(time){
  _selectedSlot = time;
  document.querySelectorAll('#bookingTimeSlots button').forEach(function(b){
    var isThis = b.id === 'bslot-'+time.replace(':','');
    b.style.background   = isThis ? 'linear-gradient(135deg,var(--sage),var(--sage2))' : 'rgba(255,255,255,.9)';
    b.style.color        = isThis ? '#fff' : 'var(--sage)';
    b.style.borderColor  = isThis ? 'transparent' : 'rgba(116,198,157,.25)';
  });
  var btn = document.getElementById('psProTarifaBtn');
  if(btn){
    btn.textContent    = 'Reservar '+time+' hs · $'+_currentPro.tarifa+' USD 💳';
    btn.style.opacity  = '1';
    btn.style.pointerEvents = 'auto';
  }
}

function confirmarReservaStripe(){
  if(!_currentPro.tarifa){ toast('⚠️','No se pudo obtener el precio'); return; }
  if(!_selectedSlot)      { toast('📅','Elegí un horario primero');     return; }
  var slotLabel = _selectedSlot+' hs';
  if(_selectedBookingDay){
    var d=_selectedBookingDay.date;
    slotLabel = DAY_FULL[_selectedBookingDay.dow]+' '+d.getDate()+' '+MONTH_SHORT[d.getMonth()]+' · '+_selectedSlot+' hs';
  }
  safeLS('set','velo_booking_slot', slotLabel);
  openStripeCheckout(_currentPro.tarifa, _currentPro.nombre+' — '+slotLabel, 'videollamada');
}

// ── EDITOR DE DISPONIBILIDAD (panel pro) ─────────────────
var _editingAvail = {};

function initProAvailEditor(){
  var myId = safeLS('get','velo_pro_id') || 'ana';
  var stored = _loadProData(myId);
  _editingAvail = JSON.parse(JSON.stringify(stored.availability || _defaultAvail));
  // Load tarifa
  var inp = document.getElementById('proTarifaInput');
  if(inp) inp.value = stored.tarifa || '';
  renderProAvailEditor();
}

function renderProAvailEditor(){
  var el = document.getElementById('proAvailEditor');
  if(!el) return;
  var html = '';
  for(var d=0; d<7; d++){
    var daySlots = _editingAvail[d] || [];
    html += '<div style="margin-bottom:10px">'+
      '<div style="font-size:10px;font-weight:700;color:var(--sage3);margin-bottom:5px">'+DAY_FULL[d]+'</div>'+
      '<div style="display:flex;flex-wrap:wrap;gap:5px">'+
      ALL_SLOTS.map(function(s){
        var on = daySlots.indexOf(s) >= 0;
        return '<button onclick="toggleAvailSlot('+d+',\''+s+'\')" id="aslot-'+d+'-'+s.replace(':','')+'" style="'+
          'padding:5px 10px;border-radius:100px;font-size:11px;font-weight:700;cursor:pointer;font-family:Jost,sans-serif;'+
          'background:'+(on?'var(--sage7)':'rgba(255,255,255,.6)')+';'+
          'border:1.5px solid '+(on?'var(--sage2)':'rgba(200,200,200,.3)')+';'+
          'color:'+(on?'var(--sage2)':'var(--ink5)')+'">'+s+'</button>';
      }).join('')+
      '</div></div>';
  }
  el.innerHTML = html;
}

function toggleAvailSlot(dayNum, time){
  if(!_editingAvail[dayNum]) _editingAvail[dayNum]=[];
  var idx = _editingAvail[dayNum].indexOf(time);
  if(idx>=0) _editingAvail[dayNum].splice(idx,1);
  else _editingAvail[dayNum].push(time);
  _editingAvail[dayNum].sort();
  // Update button style
  var btn = document.getElementById('aslot-'+dayNum+'-'+time.replace(':',''));
  if(btn){
    var on = _editingAvail[dayNum].indexOf(time)>=0;
    btn.style.background  = on?'var(--sage7)':'rgba(255,255,255,.6)';
    btn.style.borderColor = on?'var(--sage2)':'rgba(200,200,200,.3)';
    btn.style.color       = on?'var(--sage2)':'var(--ink5)';
  }
}

function saveProAvailability(){
  var myId = safeLS('get','velo_pro_id') || 'ana';
  var tarifaInp = document.getElementById('proTarifaInput');
  var tarifa = tarifaInp ? (parseFloat(tarifaInp.value)||0) : 0;
  if(!tarifa){ toast('⚠️','Ingresá tu tarifa por sesión'); return; }
  _saveProData(myId, {tarifa:tarifa, availability:_editingAvail});
  // Update the demo profile in memory too
  if(_proProfiles[myId]){
    _proProfiles[myId].tarifa = tarifa;
  }
  toast('✅','Disponibilidad y tarifa guardadas 🌿');
}

function openProProfile(name){
  toast('👤','Ver perfil de '+name+' (próximamente)');
}

// ── PRO REGISTRATION & APPROVAL ──────────────────────────────────────────────
var _proApprovalStatus = safeLS('get','velo_pro_approval') || 'approved'; // 'pending'|'approved'|'rejected'

function submitProRegistration(){
  var name = document.getElementById('proRegName');
  var license = document.getElementById('proLicenseInput');
  if(!name||!name.value.trim()){ toast('⚠️','Ingresá tu nombre completo'); return; }
  var consent = document.getElementById('proRegConsent');
  if(!consent||!consent.checked){ toast('⚠️','Debés aceptar los términos para continuar'); return; }
  _proApprovalStatus = 'pending';
  safeLS('set','velo_pro_approval','pending');
  // Show pending state card, hide form
  var form = document.getElementById('proRegForm');
  var done = document.getElementById('proRegDone');
  if(form) form.style.display = 'none';
  if(done) done.style.display = 'block';
  // Notify admin (simulated)
  _addToAdminProContactList({ from: name.value.trim(), subject: 'Nuevo registro', msg: 'Nuevo profesional pendiente de aprobación.', time: 'Ahora' });
  goTo('pro-panel');
  setTimeout(function(){ renderProPendingBanner(); }, 100);
}

function renderProPendingBanner(){
  var banner = document.getElementById('proPendingBanner');
  if(!banner) return;
  var status = safeLS('get','velo_pro_approval') || 'approved';
  banner.style.display = status === 'pending' ? 'flex' : 'none';
  // Disable "Consulta completada" button if pending
  var markBtn = document.querySelector('[onclick="openMarkSessionModal()"]');
  if(markBtn){
    markBtn.style.opacity = status==='pending'?'.35':'1';
    markBtn.style.pointerEvents = status==='pending'?'none':'auto';
  }
}

// ── PRO → ADMIN CONTACT ──────────────────────────────────────────────────────
var _proContactMessages = [];

function openProContactVelo(){
  document.getElementById('proContactVeloModal').style.display = 'flex';
}
function closeProContactVelo(){
  document.getElementById('proContactVeloModal').style.display = 'none';
}
function submitProContactVelo(){
  var subj = document.getElementById('proContactSubj');
  var msg  = document.getElementById('proContactMsg');
  if(!msg||!msg.value.trim()){ toast('⚠️','Escribí tu consulta'); return; }
  var proName = document.querySelector('#pro-panel .serif-i') ? 'Dra. Ana Martínez' : 'Profesional';
  _addToAdminProContactList({ from: proName, subject: subj?subj.value:'Consulta', msg: msg.value.trim(), time: 'Ahora' });
  closeProContactVelo();
  if(msg) msg.value = '';
  toast('✅','Consulta enviada al equipo de Velo 💌');
}

function _addToAdminProContactList(item){
  _proContactMessages.unshift(item);
  var list = document.getElementById('adminProContactList');
  if(!list) return;
  var html = '';
  _proContactMessages.slice(0,5).forEach(function(m){
    html += '<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:12px;margin-bottom:8px">'+
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">'+
      '<div style="width:32px;height:32px;border-radius:10px;background:rgba(116,198,157,.15);display:flex;align-items:center;justify-content:center;font-size:14px">💬</div>'+
      '<div><div style="font-size:12px;font-weight:700;color:rgba(255,255,255,.85)">'+m.from+'</div>'+
      '<div style="font-size:10px;color:rgba(116,198,157,.5)">'+m.subject+' · '+m.time+'</div></div></div>'+
      '<div style="font-size:11px;color:rgba(255,255,255,.6);line-height:1.5;margin-bottom:8px">"'+m.msg+'"</div>'+
      '<button onclick="toast(\'💌\',\'Respuesta enviada al profesional\')" class="a-btn-g" style="width:100%;padding:8px;justify-content:center">Responder</button>'+
    '</div>';
  });
  list.innerHTML = html || '<div style="font-size:11px;color:rgba(255,255,255,.35);text-align:center;padding:12px">No hay consultas pendientes</div>';
}

function replyProContact(proId, proName){
  toast('💌','Respuesta enviada a '+proName);
}

function approvePro(proId){
  toast('✅','Perfil aprobado. Se notifica al profesional 🌿');
  // Add buzón notification for the pro
  var msgs = JSON.parse(localStorage.getItem('velo_buzon')||'[]');
  msgs.unshift({id:Date.now(),from:'Equipo Velo',icon:'✅',title:'¡Tu perfil fue aprobado!',body:'Tu registro como profesional fue verificado. Ya podés publicarte y recibir consultas en Velo. Bienvenido/a 🌿',date:new Date().toLocaleDateString('es'),read:false,type:'sys'});
  localStorage.setItem('velo_buzon', JSON.stringify(msgs));
  if(proId==='self'){
    safeLS('set','velo_pro_approval','approved');
    renderProPendingBanner();
  }
}

function rejectPro(proId){
  toast('❌','Perfil rechazado. Se notifica al profesional con motivo.');
  var msgs = JSON.parse(localStorage.getItem('velo_buzon')||'[]');
  msgs.unshift({id:Date.now(),from:'Equipo Velo',icon:'❌',title:'Revisión de perfil',body:'Necesitamos información adicional para aprobar tu perfil. Por favor, revisá tu documentación y volvé a enviarla. Podés contactarnos por "Consultas a Velo".',date:new Date().toLocaleDateString('es'),read:false,type:'sys'});
  localStorage.setItem('velo_buzon', JSON.stringify(msgs));
}

// ── ADMIN ────────────────────────────────────────────────
var ADMIN_EMAIL = 'Diego.catalan.greco@gmail.com';
var VELO_EMAIL  = 'wearevelo.app@gmail.com';
var ADMIN_PASS  = 'Portugaloporto2026!';
// Note: Admin authentication must be validated server-side. Never store credentials in client JS.
var adminAuthed = false;
function adminLogin(){
  var em = document.getElementById('adminEmail');
  var pw = document.getElementById('adminPass');
  if(!em||!pw) return;
  if(em.value.trim()===ADMIN_EMAIL && pw.value===ADMIN_PASS){
    adminAuthed = true;
    var d = document.getElementById('adminUserDisplay');
    if(d) d.textContent = ADMIN_EMAIL;
    var r = document.getElementById('adminRoleEmail');
    if(r) r.textContent = ADMIN_EMAIL;
    goTo('admin');
    toast('👑','Bienvenido, Super Admin');
  } else {
    toast('❌','Email o contraseña incorrectos');
  }
}
function adminLogout(){
  adminAuthed = false;
  goTo('admin-login');
  toast('🌿','Sesión de administrador cerrada');
}
function adminTab(btn, tabId){
  document.querySelectorAll('.atab').forEach(function(b){ b.classList.remove('on'); });
  if(btn) btn.classList.add('on');
  var tabs=['atab-dash','atab-users','atab-pros','atab-content','atab-msg','atab-wellness','atab-support','atab-pagos','atab-solidarias','atab-config','atab-roles'];
  tabs.forEach(function(t){
    var el = document.getElementById(t);
    if(el) el.style.display = (t===tabId)?'block':'none';
  });
  if(tabId==='atab-msg') setTimeout(renderAdminContacts,50);
  if(tabId==='atab-solidarias') setTimeout(renderFreeSessions,50);
  if(tabId==='atab-wellness') setTimeout(renderBadgeCounts,50);
  if(tabId==='atab-pagos') setTimeout(renderAdminSubStats,50);
  if(tabId==='atab-users') setTimeout(renderAdminTCRecords,50);
}
function filterAdminUsers(el, filter){
  var p = el.parentElement;
  p.querySelectorAll('span').forEach(function(s){
    s.style.borderColor='rgba(255,255,255,.15)';
    s.style.background='rgba(255,255,255,.05)';
    s.style.color='rgba(255,255,255,.5)';
  });
  el.style.borderColor='var(--sage2)';
  el.style.background='var(--sage7)';
  el.style.color='var(--sage2)';
  toast('👥','Filtro: '+filter);
}
function filterSupport(el, filter){
  var p = el.parentElement;
  p.querySelectorAll('span').forEach(function(s){
    s.style.borderColor='rgba(255,255,255,.15)';
    s.style.background='rgba(255,255,255,.05)';
    s.style.color='rgba(255,255,255,.5)';
  });
  el.style.borderColor='var(--sage2)';
  el.style.background='var(--sage7)';
  el.style.color='var(--sage2)';
  toast('🎧','Soporte · '+filter);
}
function selMsgTarget(el, target){
  var p = el.parentElement;
  p.querySelectorAll('div').forEach(function(d){
    d.style.borderColor='rgba(255,255,255,.15)';
    d.style.background='rgba(255,255,255,.05)';
    d.style.color='rgba(255,255,255,.5)';
  });
  el.style.borderColor='var(--sage2)';
  el.style.background='var(--sage7)';
  el.style.color='var(--sage2)';
}
function selMsgType(el, ico){
  var p = el.parentElement;
  p.querySelectorAll('span').forEach(function(s){
    s.style.borderColor='rgba(255,255,255,.15)';
    s.style.background='rgba(255,255,255,.05)';
    s.style.color='rgba(255,255,255,.5)';
  });
  el.style.borderColor='var(--sage2)';
  el.style.background='var(--sage7)';
  el.style.color='var(--sage2)';
}
function sendAdminMsg(){
  var subj = document.getElementById('adminMsgSubject');
  var body = document.getElementById('adminMsgBody');
  if(!subj||!subj.value.trim()){ toast('⚠️','Agregá un asunto'); return; }
  if(!body||!body.value.trim()){ toast('⚠️','Escribí el mensaje'); return; }
  var selType = document.querySelector('#atab-msg span[style*="sage7"],#atab-msg span[style*="sage2"]');
  var icono = selType ? selType.textContent.trim().split(' ')[0] : '📢';
  addBuzonMsg({
    id: 'admin-'+Date.now(),
    tipo: 'sistema',
    icon: icono,
    remitente: 'Equipo Velo',
    asunto: subj.value.trim(),
    titulo: subj.value.trim(),
    cuerpo: body.value.trim(),
    extracto: body.value.trim().substring(0,80),
    leido: false,
    prioritario: true,
    fecha: new Date().toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})
  });
  subj.value=''; body.value='';
  showSuc('💌','Mensaje enviado','El mensaje llegará al buzón de los usuarios seleccionados. 💚');
}
function selInviteRole(el, role){
  var p = el.parentElement;
  p.querySelectorAll('[data-role]').forEach(function(d){
    d.classList.remove('role-sel-active');
    d.style.borderColor='rgba(255,255,255,.12)';
    d.style.background='rgba(255,255,255,.04)';
  });
  el.classList.add('role-sel-active');
  el.style.borderColor = role==='admin'?'rgba(200,146,10,.3)':'rgba(196,181,232,.3)';
  el.style.background = role==='admin'?'rgba(200,146,10,.1)':'rgba(196,181,232,.08)';
  var mod = document.getElementById('modPermsSection');
  if(mod) mod.style.display = role==='moderador'?'block':'none';
}
function saveBreathConfig(){
  var inVal = parseInt(document.getElementById('cfgBreathIn').value)||4;
  var holdVal = parseInt(document.getElementById('cfgBreathHold').value)||7;
  var outVal = parseInt(document.getElementById('cfgBreathOut').value)||8;
  safeLS('set','velo_breath_config',JSON.stringify({in:inVal,hold:holdVal,out:outVal}));
  if(window.breathSeq) breathSeq = [{p:'Inhala',d:inVal},{p:'Retén',d:holdVal},{p:'Exhala',d:outVal}];
  showSuc('🌬️','Configuración guardada','Ciclo '+inVal+'-'+holdVal+'-'+outVal+' aplicado al ejercicio de respiración. 🌿');
}
function sendInvite(){
  var em = document.getElementById('inviteEmail');
  if(!em||!em.value.trim()){ toast('⚠️','Ingresá un email'); return; }
  showSuc('📧','Invitación enviada','Se envió un email de invitación a '+em.value+' con instrucciones para acceder al panel de administración. 👑');
  em.value='';
}
function approvePro(name){
  safeLS('set','velo_pro_approved','true');
  toast('✅','Perfil aprobado. Se notifica al profesional y puede acceder a su panel.');
  deliverInboxMsg('pro-bienvenida');
}
function rejectPro(name, email){
  var msg='Hola,\n\nRevisamos tu solicitud para unirte a Velo como profesional y lamentamos informarte que en este momento no podemos aprobar tu perfil.\n\nEsto puede deberse a que la documentación presentada está incompleta, o que el perfil no cumple con los criterios actuales de la plataforma.\n\nSi creés que es un error o querés corregir tu postulación, escribinos a '+VELO_EMAIL+'. Estaremos felices de ayudarte. Gracias por tu interés en Velo.\n\nEquipo Velo';
  if(email){
    var gmailUrl='https://mail.google.com/mail/?view=cm&fs=1&to='+encodeURIComponent(email)+'&su='+encodeURIComponent('Tu solicitud en Velo — Información importante')+'&body='+encodeURIComponent(msg);
    window.open(gmailUrl,'_blank');
  }
  toast('❌','Perfil rechazado. Se notifica al profesional.');
}
function rejectVelaPorTi(username){
  var msg='Hola '+username+',\n\nLeemos tu solicitud para el programa Velo vela por ti con mucho cuidado y respeto.\n\nEn este momento, nuestros profesionales solidarios disponibles están completos y no podemos asignarte una sesión de forma inmediata. Esto no significa que tu situación sea menos importante — todo lo contrario.\n\nTe invitamos a:\n• Conectarte con nuestra comunidad de Guardianes\n• Usar el espacio de respiración y el diario personal\n• Volver a solicitar en 30 días cuando haya más disponibilidad\n\nVelo está aquí contigo. No estás sol@. 💙\n\nEquipo Velo · '+VELO_EMAIL;
  deliverInboxMsg('vela-recibida');
  showSuc('💙','Mensaje enviado a '+username,'Se le informó que está en lista de espera con un mensaje empático. 💙');
}
function assignVelaPorTi(username, proName){
  deliverInboxMsg('sesion-aprobada');
  var proEmail='profesional@ejemplo.com';
  var gmailUrl='https://mail.google.com/mail/?view=cm&fs=1&to='+encodeURIComponent(proEmail)+'&su='+encodeURIComponent('Sesión Solidaria asignada — Velo')+'&body='+encodeURIComponent('Hola '+proName+',\n\nTe asignamos una sesión solidaria para el usuario "'+username+'". Por favor coordiná el horario directamente con el equipo.\n\nGracias por tu compromiso.\nEquipo Velo · '+VELO_EMAIL);
  window.open(gmailUrl,'_blank');
  toast('🕊️','Sesión asignada. Notificando a '+proName+' y a '+username+'...');
}
function replyProContact(id, name){
  var email=name.toLowerCase().replace(/[^a-z]/g,'')+'@profesional.com';
  var gmailUrl='https://mail.google.com/mail/?view=cm&fs=1&to='+encodeURIComponent(email)+'&su='+encodeURIComponent('Respuesta de Velo — '+name)+'&body='+encodeURIComponent('Hola '+name+',\n\nGracias por tu consulta. En respuesta:\n\n[Escribí tu respuesta aquí]\n\nSaludos,\nEquipo Velo\n'+VELO_EMAIL)+'&cc='+encodeURIComponent(VELO_EMAIL);
  window.open(gmailUrl,'_blank');
}
// Velo admin stored roles
function sendInvite(){
  var em = document.getElementById('inviteEmail');
  if(!em||!em.value.trim()){ toast('⚠️','Ingresá un email'); return; }
  var selRole = document.querySelector('#atab-roles .role-sel-active');
  var role = selRole ? selRole.dataset.role : 'moderador';
  var emailVal = em.value.trim();
  var roles = JSON.parse(safeLS('get','velo_admin_roles')||'[]');
  var exists = roles.some(function(r){ return r.email===emailVal; });
  if(exists){ toast('⚠️','Este email ya tiene un rol asignado'); return; }
  var tempPass = 'Velo'+Math.random().toString(36).slice(2,8).toUpperCase()+'!';
  roles.push({ email:emailVal, role:role, fecha:new Date().toLocaleDateString('es'), pass:tempPass });
  safeLS('set','velo_admin_roles',JSON.stringify(roles));
  var gmailUrl='https://mail.google.com/mail/?view=cm&fs=1&to='+encodeURIComponent(emailVal)+'&su='+encodeURIComponent('Invitación al panel de Velo')+'&body='+encodeURIComponent('Hola,\n\nFuiste invitado/a como '+role+' en Velo.\n\nAccedé al panel en: https://diego85greco-coder.github.io/Velo/\nEmail: '+emailVal+'\nContraseña temporal: '+tempPass+'\n\nCambiá tu contraseña al ingresar por primera vez.\n\nEquipo Velo · '+VELO_EMAIL);
  window.open(gmailUrl,'_blank');
  em.value='';
  renderAdminRoles();
  showSuc('👑','Invitación enviada a '+emailVal,'El acceso fue creado internamente. Se abrió Gmail para notificar. 📧');
}
function renderAdminRoles(){
  var list = document.getElementById('adminRolesList');
  if(!list) return;
  var roles = JSON.parse(safeLS('get','velo_admin_roles')||'[]');
  if(!roles.length){ list.innerHTML='<div style="font-size:11px;color:rgba(255,255,255,.3);text-align:center;padding:12px">Sin roles adicionales creados</div>'; return; }
  list.innerHTML = roles.map(function(r){
    return '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.05)">'+
      '<div style="font-size:18px">'+(r.role==='admin'?'👑':'🛡️')+'</div>'+
      '<div style="flex:1"><div style="font-size:12px;font-weight:700;color:rgba(255,255,255,.75)">'+r.email+'</div><div style="font-size:10px;color:rgba(255,255,255,.35)">'+r.role+' · desde '+r.fecha+'</div></div>'+
      '<button class="a-btn-r" onclick="removeRole(\''+r.email+'\')">Revocar</button>'+
    '</div>';
  }).join('');
}
function removeRole(email){
  var roles = JSON.parse(safeLS('get','velo_admin_roles')||'[]');
  roles = roles.filter(function(r){ return r.email!==email; });
  safeLS('set','velo_admin_roles',JSON.stringify(roles));
  renderAdminRoles();
  toast('🗑️','Acceso revocado para '+email);
}
function renderFreeSessions(){
  var el = document.getElementById('adminFreeSessionList');
  if(!el) return;
  var pros = [
    {name:'Dra. Ana Martínez', esp:'Psicología Clínica', sesiones:2, activas:1, icono:'🧠'},
    {name:'Coach Lucas Fernández', esp:'Bienestar · Mindfulness', sesiones:1, activas:1, icono:'🧘'},
    {name:'Lic. Sofía Vargas', esp:'Psicología Infanto-Juvenil', sesiones:3, activas:0, icono:'🌱'}
  ];
  el.innerHTML = pros.map(function(p){
    return '<div style="background:rgba(168,212,232,.06);border:1px solid rgba(168,212,232,.15);border-radius:14px;padding:12px;margin-bottom:8px">'+
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">'+
        '<div style="width:36px;height:36px;border-radius:10px;background:rgba(168,212,232,.15);display:flex;align-items:center;justify-content:center;font-size:16px">'+p.icono+'</div>'+
        '<div style="flex:1"><div style="font-size:12px;font-weight:700;color:rgba(255,255,255,.85)">'+p.name+'</div>'+
        '<div style="font-size:10px;color:rgba(168,212,232,.5)">'+p.esp+'</div></div>'+
        '<div style="text-align:right"><div style="font-size:13px;font-weight:700;color:rgba(168,212,232,.9)">'+p.sesiones+'</div><div style="font-size:9px;color:rgba(168,212,232,.5)">donadas</div></div>'+
      '</div>'+
      '<div style="display:flex;gap:6px">'+
        (p.activas>0?'<span style="padding:3px 9px;background:rgba(116,198,157,.12);border:1px solid rgba(116,198,157,.25);border-radius:100px;font-size:10px;font-weight:700;color:var(--sage2)">'+p.activas+' disponible'+(p.activas>1?'s':'')+'</span>':'<span style="padding:3px 9px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:100px;font-size:10px;color:rgba(255,255,255,.35)">Sin disponibilidad</span>')+
        (p.sesiones>=3?'<span style="padding:3px 9px;background:rgba(212,168,100,.1);border:1px solid rgba(212,168,100,.2);border-radius:100px;font-size:10px;font-weight:700;color:var(--gold2)">🏅 Insignia Solidario</span>':'')+
      '</div>'+
    '</div>';
  }).join('');
}
function renderBadgeCounts(){
  var sosStat = document.getElementById('adminSosStat');
  if(sosStat) sosStat.textContent = safeLS('get','velo_sos_count')||'0';
  var el = document.getElementById('adminBadgeCounts');
  if(!el) return;
  var badges = [
    {ico:'🥉',name:'Bronce',desc:'5+ charlas',count:342},
    {ico:'🥈',name:'Plata',desc:'21+ charlas · alta valoración',count:128},
    {ico:'🥇',name:'Oro',desc:'51+ charlas',count:47},
    {ico:'💎',name:'Diamante',desc:'100+ charlas · 50+ reseñas',count:12},
    {ico:'🏅',name:'Solidario',desc:'Profesional — 3+ sesiones donadas',count:8},
    {ico:'💚',name:'Donador',desc:'Donación única',count:89},
    {ico:'💎',name:'Donador mensual',desc:'Suscripción activa',count:31}
  ];
  el.innerHTML = badges.map(function(b){
    return '<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.05)">'+
      '<div style="font-size:20px;width:28px;text-align:center">'+b.ico+'</div>'+
      '<div style="flex:1"><div style="font-size:12px;font-weight:700;color:rgba(255,255,255,.75)">'+b.name+'</div><div style="font-size:10px;color:rgba(255,255,255,.35)">'+b.desc+'</div></div>'+
      '<div style="font-size:16px;font-weight:700;color:var(--sage2)">'+b.count+'</div>'+
    '</div>';
  }).join('');
}

// ── AUTO-MENSAJES DEL SISTEMA ─────────────────────────────
var sysMessages = {
  'bienvenida-usuario': {
    ico:'🌿', title:'¡Bienvenido/a a Velo! 💚',
    body:'Nos alegra que estés acá. Velo es un espacio seguro de acompañamiento emocional, gratuito, anónimo y sin juicios. Nunca estás sol@. 💚'
  },
  'bienvenida-pro': {
    ico:'🌿', title:'¡Tu perfil fue aprobado! 🌿',
    body:'¡Bienvenido/a a la comunidad de profesionales de Velo! Tu perfil ya está activo y visible. Gracias por ser parte de este espacio. 💚'
  },
  'insignia-bronce': {
    ico:'🥉', title:'¡Ganaste la insignia Bronce! 🥉',
    body:'¡Felicitaciones! Completaste 5 charlas de apoyo. Tu compromiso con la comunidad hace la diferencia. ¡Seguí así! 💚'
  },
  'insignia-plata': {
    ico:'🥈', title:'¡Insignia de Plata desbloqueada! 🥈',
    body:'¡Increíble! Superaste las 21 charlas con una valoración excepcional. La comunidad de Velo te necesita. Gracias de corazón. ✨'
  },
  'insignia-oro': {
    ico:'🥇', title:'¡Insignia de Oro! Sos un pilar de Velo 🥇',
    body:'51 charlas completadas. Sos una de las personas que hace que Velo sea lo que es: un lugar real, humano y seguro. GRACIAS. 🌟'
  },
  'insignia-diamante': {
    ico:'💎', title:'¡Insignia Diamante! Leyenda de Velo 💎',
    body:'Más de 100 charlas. Más de 50 reseñas. Sos parte del corazón de Velo. Una leyenda real de nuestra comunidad. Gracias infinitas. 💎✨'
  },
  'donacion': {
    ico:'💚', title:'¡Gracias por tu donación! 💚',
    body:'Tu generosidad hace posible que más personas accedan a acompañamiento emocional gratuito. Cada contribución cambia vidas reales. GRACIAS desde el corazón. 💚'
  },
  'suscripcion-mensual': {
    ico:'💎', title:'¡Sos parte del círculo Velo! 💎',
    body:'Activaste tu donación mensual. Gracias por comprometerte con el bienestar emocional de toda la comunidad. Tu generosidad mes a mes es un abrazo constante. 🌿💚'
  },
  'resenas-10': {
    ico:'⭐', title:'¡10 reseñas recibidas! ⭐',
    body:'Tu impacto en la comunidad es real. 10 personas tomaron el tiempo de agradecerte. Eso no pasa por casualidad: pasa porque sos genuino/a. 🌟'
  },
  'resenas-50': {
    ico:'🌟', title:'¡50 reseñas! Comunidad te ama 🌟',
    body:'50 personas escribieron sobre el impacto que tuviste en su vida. Eso es enorme. Gracias por dar tanto de vos en Velo. 💚✨'
  },
  'resenas-100': {
    ico:'🏆', title:'¡100 reseñas! Leyenda de la comunidad 🏆',
    body:'Un hito histórico en Velo. 100 personas recordarán haberte conocido. Tu presencia en la plataforma es un regalo para todos. GRACIAS. 🏆💎'
  },
  'sesion-aprobada': {
    ico:'🕊️', title:'Tu sesión gratuita fue aprobada 🕊️',
    body:'¡Buenas noticias! Velo vela por ti aprobó tu solicitud. Te asignamos un profesional solidario. En los próximos días recibirás la confirmación del horario. 💙'
  },
  'vela-recibida': {
    ico:'🕊️', title:'Recibimos tu solicitud 💙',
    body:'Hola. Recibimos tu solicitud para el programa Velo vela por ti.\n\nQueremos que sepas que la hemos leído con el respeto y la importancia que merece. Cada solicitud es única y la analizamos con cuidado real.\n\nTe avisaremos muy pronto sobre el estado de tu caso. Mientras tanto, Velo está acá. No estás sol@. 💙'
  },
  'pro-bienvenida': {
    ico:'🌿', title:'¡Perfil profesional aprobado! 🌿',
    body:'Bienvenido/a al equipo de profesionales de Velo. Tu perfil ya está activo. La comunidad te espera con esperanza y confianza. Gracias por estar acá. 💚'
  }
};
function deliverInboxMsg(type){
  var msg = sysMessages[type];
  if(!msg) return;
  unreadCount++;
  updateInboxBadges();
  toast(msg.ico, msg.title);
}
// Triggered on user register
function finishRegister_autoMsg(){
  setTimeout(function(){ deliverInboxMsg('bienvenida-usuario'); }, 1800);
}
// Triggered on donation
function confirmDon_autoMsg(monthly){
  deliverInboxMsg(monthly ? 'suscripcion-mensual' : 'donacion');
}

// ── RESPIRA 🌬️ ──────────────────────────────────────────
var breathInterval = null;
var breathSeq = [
  {label:'Inhala lentamente...', phase:'Inhala', count:4, emoji:'🌬️', secs:4},
  {label:'Retén el aire...', phase:'Retén', count:7, emoji:'⏸️', secs:7},
  {label:'Exhala despacio...', phase:'Exhala', count:8, emoji:'💨', secs:8}
];
var breathSeqIdx = 0;
var breathSeqSecs = 0;
var breathTotal = 60;
var breathRemaining = 60;
function startBreath(secs){
  breathTotal = secs;
  breathRemaining = secs;
  breathSeqIdx = 0;
  breathSeqSecs = breathSeq[0].secs;
  var sel = document.getElementById('breathSelector');
  var ex  = document.getElementById('breathExercise');
  if(sel) sel.style.display='none';
  if(ex)  ex.style.display='flex';
  updateBreathUI();
  breathInterval = setInterval(breathTick, 1000);
}
function breathTick(){
  breathRemaining--;
  breathSeqSecs--;
  var pEl = document.getElementById('breathProgress');
  if(pEl) pEl.style.width = ((breathTotal-breathRemaining)/breathTotal*100)+'%';
  var tEl = document.getElementById('breathTimer');
  if(tEl) tEl.textContent = 'Tiempo restante: '+breathRemaining+'s';
  if(breathSeqSecs <= 0){
    breathSeqIdx = (breathSeqIdx+1) % breathSeq.length;
    breathSeqSecs = breathSeq[breathSeqIdx].secs;
    updateBreathUI();
  } else {
    var cEl = document.getElementById('breathCount');
    if(cEl) cEl.textContent = breathSeqSecs;
  }
  if(breathRemaining <= 0){
    stopBreath();
    iaTrackBreathSession();
    showSuc('🌬️','¡Ejercicio completado!','Tomaste un momento para vos. Bien hecho. 💚');
  }
}
function updateBreathUI(){
  var step = breathSeq[breathSeqIdx];
  var iEl = document.getElementById('breathInstruction');
  var pEl = document.getElementById('breathPhaseLabel');
  var eEl = document.getElementById('breathEmoji');
  var cEl = document.getElementById('breathCount');
  var cir = document.getElementById('breathCircle');
  if(iEl) iEl.textContent = step.label;
  if(pEl) pEl.textContent = step.phase;
  if(eEl) eEl.textContent = step.emoji;
  if(cEl) cEl.textContent = step.secs;
  if(cir){
    var scales = {Inhala:'scale(1.25)','Retén':'scale(1.1)',Exhala:'scale(0.85)'};
    cir.style.transform = scales[step.phase]||'scale(1)';
    cir.style.borderColor = step.phase==='Inhala'?'rgba(168,212,232,.6)':
                            step.phase==='Exhala'?'rgba(168,212,232,.2)':'rgba(168,212,232,.4)';
  }
}
function stopBreath(){
  if(breathInterval){ clearInterval(breathInterval); breathInterval=null; }
  var sel = document.getElementById('breathSelector');
  var ex  = document.getElementById('breathExercise');
  if(sel) sel.style.display='block';
  if(ex)  ex.style.display='none';
}

// ── CAMINAR LENTO 🚶 ─────────────────────────────────────
function playCaminando(el, emoji, title, sub){
  var player = document.getElementById('caminandoPlayer');
  var eEl = document.getElementById('caminandoEmoji');
  var tEl = document.getElementById('caminandoTitle');
  var sEl = document.getElementById('caminandoSub');
  if(eEl) eEl.textContent = emoji;
  if(tEl) tEl.textContent = title;
  if(sEl) sEl.textContent = sub;
  if(player) player.style.display='block';
  toast(emoji, 'Reproduciendo: '+title);
  // Scroll to player
  if(player) player.scrollIntoView({behavior:'smooth'});
}
function stopCaminando(){
  var player = document.getElementById('caminandoPlayer');
  if(player) player.style.display='none';
  toast('⏹','Audio detenido');
}

// ── INBOX — Mensajes de Velo ─────────────────────────────
var unreadCount = 3;
function openInboxMsg(msgId, detailId){
  // Mark as read
  var msg = document.getElementById(msgId);
  if(msg && msg.classList.contains('unread')){
    msg.classList.remove('unread');
    var dot = msg.querySelector('.inbox-dot');
    if(dot) dot.remove();
    unreadCount = Math.max(0, unreadCount - 1);
    updateInboxBadges();
  }
  // Show detail
  var details = document.querySelectorAll('#inbox-detail .scrl > div[id^="msg-detail"]');
  details.forEach(function(d){ d.style.display='none'; });
  var detail = document.getElementById(detailId);
  if(detail) detail.style.display='block';
  goTo('inbox-detail');
}
function markAllRead(){
  document.querySelectorAll('.inbox-msg.unread').forEach(function(msg){
    msg.classList.remove('unread');
    var dot = msg.querySelector('.inbox-dot');
    if(dot) dot.remove();
    var title = msg.querySelector('.inbox-title');
    if(title){ title.style.fontWeight='500'; title.style.color='var(--ink4)'; }
  });
  unreadCount = 0;
  updateInboxBadges();
  toast('✅','Todos los mensajes marcados como leídos');
}
function updateInboxBadges(){
  var badges = ['inboxBadge','profileInboxBadge','proInboxBadge'];
  badges.forEach(function(id){
    var b = document.getElementById(id);
    if(b){
      if(unreadCount > 0){
        b.textContent = unreadCount;
        b.style.display = 'flex';
      } else {
        b.style.display = 'none';
      }
    }
  });
  // Update profile text
  var pv = document.querySelector('#profile .pe-v');
  if(pv && pv.textContent.indexOf('sin leer') >= 0){
    pv.textContent = unreadCount > 0 ? unreadCount + ' mensajes sin leer' : 'Sin mensajes nuevos';
  }
}
// ── VELO PODCAST ─────────────────────────────────────────
function filterPodcast(el, cat){
  var parent = el.parentElement;
  parent.querySelectorAll('div').forEach(function(d){
    d.style.borderColor='rgba(255,255,255,.2)';
    d.style.background='rgba(255,255,255,.06)';
    d.style.color='rgba(255,255,255,.65)';
  });
  el.style.borderColor='var(--sage2)';
  el.style.background='var(--sage7)';
  el.style.color='var(--sage2)';
  toast('🎙️','Filtro: '+cat);
}
function playPodcast(id){
  toast('▶','Reproduciendo audio... (integración próximamente)');
}
function reactPodcast(el, emoji){
  var parts = el.textContent.split(' ');
  var count = parseInt(parts[1]||'0') + 1;
  el.textContent = emoji+' '+count;
  el.style.background='rgba(116,198,157,.15)';
  el.style.borderColor='rgba(116,198,157,.3)';
}
function selPodCat(el){
  var parent = el.parentElement;
  parent.querySelectorAll('span').forEach(function(s){
    s.style.borderColor='rgba(255,255,255,.15)';
    s.style.background='rgba(255,255,255,.05)';
    s.style.color='rgba(255,255,255,.55)';
  });
  el.style.borderColor='var(--sage2)';
  el.style.background='rgba(116,198,157,.12)';
  el.style.color='var(--sage4)';
}
function selPodMode(el, mode){
  var parent = el.parentElement;
  parent.querySelectorAll('div').forEach(function(d){
    d.style.borderColor='rgba(255,255,255,.12)';
    d.style.background='rgba(255,255,255,.05)';
  });
  if(mode==='publico'){
    el.style.borderColor='var(--sage2)';
    el.style.background='rgba(116,198,157,.12)';
  } else {
    el.style.borderColor='rgba(196,181,232,.4)';
    el.style.background='rgba(196,181,232,.1)';
  }
}
function previewAudio(inp){
  var file=inp.files[0];
  if(!file) return;
  var prev=document.getElementById('audioPreview');
  if(prev){prev.textContent='✅ '+file.name;prev.style.display='block';}
  toast('🎙️','Audio seleccionado: '+file.name);
}
function submitPodcast(){
  var title=document.getElementById('podTitle');
  if(!title||!title.value.trim()){toast('⚠️','Agregá un título a tu audio');return;}
  showSuc('🎙️','¡Audio enviado para revisión!','El equipo de Velo lo revisará en 24-48hs hábiles. Recibirás una notificación con el resultado. Gracias por compartir tu voz 💚');
  goTo('home');
}

// ── VELO VELA POR TI ─────────────────────────────────────
function selVelaProType(el, type){
  var cli=document.getElementById('velaClinico');
  var bien=document.getElementById('velaBienestar');
  var espCli=document.getElementById('velaEspecCli');
  var espBien=document.getElementById('velaEspecBien');
  if(type==='clinico'){
    if(cli){cli.style.borderColor='var(--sage2)';cli.style.background='var(--sage7)';}
    if(bien){bien.style.borderColor='rgba(168,212,232,.3)';bien.style.background='rgba(255,255,255,.7)';}
    if(espCli) espCli.style.display='block';
    if(espBien) espBien.style.display='none';
  } else {
    if(bien){bien.style.borderColor='rgba(168,212,232,.5)';bien.style.background='rgba(168,212,232,.1)';}
    if(cli){cli.style.borderColor='rgba(168,212,232,.3)';cli.style.background='rgba(255,255,255,.7)';}
    if(espCli) espCli.style.display='none';
    if(espBien) espBien.style.display='block';
  }
}
function selVelaTema(el){
  var parent=el.parentElement;
  parent.querySelectorAll('span').forEach(function(s){
    s.style.borderColor='rgba(168,212,232,.3)';
    s.style.background='rgba(255,255,255,.7)';
    s.style.color='var(--ink4)';
  });
  el.style.borderColor='var(--sage2)';
  el.style.background='var(--sage7)';
  el.style.color='var(--sage2)';
}

function submitVela(){
  showSuc('🕊️','Solicitud enviada','Velo evaluará tu caso en los próximos 7-14 días hábiles. Te notificaremos por la app sobre el estado de tu solicitud. Gracias por confiar en nosotros. 💙');
  setTimeout(function(){
    deliverInboxMsg('vela-recibida');
  }, 1800);
}
function toggleProfilePodcasts(el){
  var dot=el.querySelector('div');
  var list=document.getElementById('profilePodcastList');
  var isOn=dot.style.right==='2px';
  if(isOn){
    dot.style.right='18px';el.style.background='#CCC';
    if(list)list.style.opacity='.4';
    toast('🎙️','Podcasts ocultos en tu perfil público');
  } else {
    dot.style.right='2px';el.style.background='var(--sage2)';
    if(list)list.style.opacity='1';
    toast('🎙️','Podcasts visibles en tu perfil público');
  }
}



function confirmCancelSub(){
  showSuc('\u26a0\ufe0f','\u00bfCancelar suscripci\u00f3n?','Tu plan permanece activo hasta el fin del per\u00edodo ya pagado. Despu\u00e9s tu perfil quedar\u00e1 desactivado hasta que renueves.');
}
function goBack_contact(){
  var from=typeof contactFrom!=='undefined'?contactFrom:'home';
  goTo(from);
}



// ── POST-CHAT donation reminder (unless monthly donor) ────
function shouldShowDonReminder(){
  try{return localStorage.getItem('velo_monthly_donor')!=='true';}catch(e){return true;}
}
// After post-chat continuar, trigger mini reminder banner

// Init on load
try{loadTodayMood();}catch(e){}
try{loadProfileReviewsFromStorage();}catch(e){}
setTimeout(function(){try{applyIncognitoUI(isIncognitoActive());}catch(e){};},100);
// Extend navTo for per-screen init
function navTo(id){
  goTo(id);
}

function closeDonBanner(donate){ var b=document.getElementById('donBanner'); if(b)b.remove(); if(donate) openModal('donModal'); }

function doLoginUser(){
  var em=document.getElementById('luEmail');
  var pw=document.getElementById('luPass');
  if(em) em.classList.remove('error');
  if(pw) pw.classList.remove('error');
  var ok=true;
  if(!em||!em.value.trim()){if(em)em.classList.add('error');toast('⚠️','Ingresá tu email');ok=false;}
  else if(pw&&!pw.value.trim()){pw.classList.add('error');toast('⚠️','Ingresá tu contraseña');ok=false;}
  if(!ok)return;
  // Check stored password if one was set via reset
  var storedEmail = safeLS('get','velo_user_pass_email')||'';
  var storedPass = safeLS('get','velo_user_pass')||'';
  if(storedEmail && storedPass && em.value.trim()===storedEmail && pw.value!==storedPass){
    if(pw) pw.classList.add('error');
    toast('❌','Contraseña incorrecta');
    return;
  }
  try{localStorage.setItem('velo_session','user');localStorage.removeItem('velo_banner_shown');}catch(err){}
  goTo('home');
  setTimeout(function(){toast('🌿','Bienvenido/a de vuelta 💚');},400);
}
function doLoginPro(){
  var em=document.getElementById('lpEmail');
  var pw=document.getElementById('lpPass');
  if(em) em.classList.remove('error');
  if(pw) pw.classList.remove('error');
  var ok=true;
  if(!em||!em.value.trim()){if(em)em.classList.add('error');toast('⚠️','Ingresa tu email');ok=false;}
  else if(pw&&!pw.value.trim()){pw.classList.add('error');toast('⚠️','Ingresa tu contraseña');ok=false;}
  if(!ok)return;
  try{localStorage.setItem('velo_session','pro');localStorage.setItem('velo_pro_approved','true');}catch(err){}
  goTo('pro-panel');
  setTimeout(function(){toast('🌿','Bienvenido/a al panel');},400);
}


// ── GUARDIAN CHAT ─────────────────────────────────────────




// ── BOTTLE WRITE ──────────────────────────────────────────
var _bottleAnonActivo = true;
function togBottleAnon(){
  _bottleAnonActivo = !_bottleAnonActivo;
  var tog = document.getElementById('bottleAnonToggle');
  var knob = document.getElementById('bottleAnonKnob');
  if(tog) tog.style.background = _bottleAnonActivo ? '#3A7090' : '#ccc';
  if(knob) knob.style.left = _bottleAnonActivo ? '21px' : '3px';
}
function openBottleWrite(){
  var m = document.getElementById('bottleWriteModal');
  if(m) m.style.display = 'flex';
  var txt = document.getElementById('bottleText');
  if(txt) txt.value = '';
  _bottleAnonActivo = true;
  var tog = document.getElementById('bottleAnonToggle');
  var knob = document.getElementById('bottleAnonKnob');
  if(tog) tog.style.background = '#3A7090';
  if(knob) knob.style.left = '21px';
}
function closeBottleWrite(){
  var m = document.getElementById('bottleWriteModal');
  if(m) m.style.display = 'none';
}
function canSendBottle(){
  if(isPremiumUser()) return true;
  var today = new Date().toDateString();
  var count = parseInt(safeLS('get','velo_bottle_'+today)||'0',10);
  return count < 2;
}
function _incBottleCount(){
  var today = new Date().toDateString();
  var count = parseInt(safeLS('get','velo_bottle_'+today)||'0',10);
  safeLS('set','velo_bottle_'+today, String(count+1));
}
function sendBottle(){
  if(!canSendBottle()){
    openPlanModal('bottle');
    return;
  }
  var txt=document.getElementById('bottleText');
  if(!txt||!txt.value.trim()){toast('🍾','Escribí algo antes de lanzar la botella');return;}
  var msg=txt.value.trim();
  moderateContent(msg).then(function(ok){
    if(!ok) return;
    var isAnon=_bottleAnonActivo;
    var bottleId='b-'+Date.now();
    _loadBottleWall();
    bottleWall.unshift({
      id:bottleId,
      emoji:isAnon?'🕶️':'🍾',
      msg:msg,
      author:isAnon?'Anónimo/a':getDisplayName(),
      time:'ahora',
      answered:false
    });
    _saveBottleWall();
    _incBottleCount();
    iaTrackBottleSent();
    // Registrar como botella propia para poder eliminarla
    var myBottles = JSON.parse(safeLS('get','velo_my_bottles')||'[]');
    myBottles.push(bottleId);
    safeLS('set','velo_my_bottles', JSON.stringify(myBottles.slice(-20)));
    closeBottleWrite();
    txt.value='';
    renderBottleWall();
    updateBottleCounter();
    showSuc('🍾','Botella lanzada!',isAnon?'Lanzada en modo incognito. Nadie sabra que es tuya.':'Tu botella fue lanzada al mar de Velo.');
  });
}

function updateBottleCounter(){
  var el = document.getElementById('bottleCounter');
  if(!el) return;
  if(isPremiumUser()){
    el.style.display = 'none';
  } else {
    var today = new Date().toDateString();
    var used = parseInt(safeLS('get','velo_bottle_'+today)||'0',10);
    var remaining = Math.max(0, 2 - used);
    el.style.display = '';
    el.textContent = remaining + '/2 botellas hoy · ' + (remaining > 0 ? 'Podés lanzar más' : 'Límite alcanzado · Velo Plus es ilimitado');
    el.style.color = remaining > 0 ? '#3A7090' : '#c0392b';
  }
}

// ── URGENCY SELECTOR ──────────────────────────────────────
function selVelaUrg(el, level){
  var parent = el.parentNode;
  if(!parent) return;
  var items = parent.querySelectorAll('div');
  for(var i=0;i<items.length;i++){
    items[i].style.background = 'rgba(255,255,255,.7)';
    items[i].style.borderColor = 'rgba(168,212,232,.3)';
    var lbl = items[i].querySelector('div:last-child');
    if(lbl) lbl.style.color = 'var(--ink4)';
  }
  el.style.background = 'var(--sage7)';
  el.style.borderColor = 'var(--sage2)';
  var myLbl = el.querySelector('div:last-child');
  if(myLbl) myLbl.style.color = 'var(--sage2)';
}
function selVelaDisp(el){
  var selected = el.style.background === 'var(--sage7)';
  el.style.background = selected ? 'rgba(255,255,255,.7)' : 'var(--sage7)';
  el.style.borderColor = selected ? 'rgba(168,212,232,.3)' : 'var(--sage2)';
  el.style.color = selected ? 'var(--ink4)' : 'var(--sage2)';
}

// ── FORGOT PASSWORD ───────────────────────────────────────
function openForgotModal(){
  var inp = document.getElementById('forgotEmail');
  if(inp) inp.value = '';
  var m = document.getElementById('forgotModal');
  if(m) m.style.display = 'flex';
}
function closeForgotModal(){
  var m = document.getElementById('forgotModal');
  if(m) m.style.display = 'none';
}
function sendForgot(){
  var inp = document.getElementById('forgotEmail');
  if(!inp || !inp.value.trim()){ toast('⚠️','Ingresá tu email'); return; }
  var email = inp.value.trim();
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ toast('📧','Revisá que el email esté bien escrito'); return; }
  var stored = safeLS('get','velo_user_email')||'';
  closeForgotModal();
  // Store pending reset email and show new password modal
  safeLS('set','velo_reset_pending_email', email);
  var m = document.getElementById('resetPassModal');
  if(m){
    m.style.display='flex';
    var el = document.getElementById('resetEmailDisplay');
    if(el) el.textContent = email;
    var p1 = document.getElementById('resetPass1');
    var p2 = document.getElementById('resetPass2');
    if(p1) p1.value='';
    if(p2) p2.value='';
  } else {
    showSuc('📧','Enlace enviado','Revisá tu bandeja de '+email+'. Expira en 30 minutos.');
  }
}
function doResetPassword(){
  var p1 = document.getElementById('resetPass1');
  var p2 = document.getElementById('resetPass2');
  if(!p1||!p2||!p1.value.trim()){ toast('⚠️','Ingresá la nueva contraseña'); return; }
  if(p1.value.length < 8){ toast('⚠️','La contraseña debe tener al menos 8 caracteres'); return; }
  if(p1.value !== p2.value){ toast('⚠️','Las contraseñas no coinciden'); return; }
  var email = safeLS('get','velo_reset_pending_email')||'';
  safeLS('set','velo_user_pass', p1.value);
  safeLS('set','velo_user_pass_email', email);
  safeLS('set','velo_reset_pending_email','');
  var m = document.getElementById('resetPassModal');
  if(m) m.style.display='none';
  showSuc('🔑','Contraseña actualizada','Tu contraseña fue cambiada con éxito. Ya podés iniciar sesión con tu nueva contraseña. 💚');
}
function closeResetModal(){
  var m = document.getElementById('resetPassModal');
  if(m) m.style.display='none';
}

// ── BOTTLE REPLY ─────────────────────────────────────────





// ══ GUARDIAN CHAT — lógica inspirada en React ══
// role: 'helped' = necesita ayuda (seeker), 'helper' = quiere ayudar (guardian)

var gcRole = null; // variable global de rol

function openGuardianChat(name, av, role){
  // Contexto: guardian_directo — chat vacío, solo sistema
  gcRole = role || 'helped';
  if(gcRole === 'helped') iaTrackHelpSession();
  var gcN = document.getElementById('gcName');
  var gcA = document.getElementById('gcAv');
  var gcAm = document.getElementById('gcAvMsg');
  if(gcN)  gcN.textContent = name || 'Guardian Velo';
  if(gcA)  gcA.textContent = av   || '🌿';
  if(gcAm) gcAm.textContent = av  || '🌿';

  // Reset mensajes — SOLO mensaje de sistema, sin mensajes de muro
  var msgs = document.getElementById('gcMsgs');
  if(msgs){
    msgs.innerHTML =
      '<div style="text-align:center;padding:8px 0 16px">'
      +'<span style="font-size:11px;color:#888;background:rgba(255,255,255,.8);'
      +'padding:5px 16px;border-radius:100px;border:1px solid #e0d8d0">'
      +'Sesion iniciada. Un Guardian esta listo para escucharte.'
      +'</span></div>';
  }

  setUserStatus('ocupado');
  goTo('guardian-chat');

  // Input listo inmediatamente
  setTimeout(function(){
    var inp = document.getElementById('gcInput');
    if(inp){ inp.focus(); inp.value = ''; }
  }, 300);
}

function openHelperChat(seekerName, seekerEmoji, seekerMsg, solicitudId){
  // Contexto: ayuda_urgente — muestra msg del muro, borra solicitud
  gcRole = 'helper';
  var gcN = document.getElementById('gcName');
  var gcA = document.getElementById('gcAv');
  var gcAm = document.getElementById('gcAvMsg');
  if(gcN)  gcN.textContent = seekerName  || 'Usuario';
  if(gcA)  gcA.textContent = seekerEmoji || '🌿';
  if(gcAm) gcAm.textContent = seekerEmoji|| '🌿';

  var msgs = document.getElementById('gcMsgs');
  if(msgs){
    msgs.innerHTML =
      '<div style="text-align:center;padding:8px 0 16px">'
      +'<span style="font-size:11px;color:#888;background:rgba(255,255,255,.8);'
      +'padding:5px 16px;border-radius:100px;border:1px solid #e0d8d0">'
      +'Sesion iniciada. Conectaste con '+seekerName+'.'
      +'</span></div>';

    // Mostrar el mensaje original del muro (contexto para el helper)
    var seekDiv = document.createElement('div');
    seekDiv.style.cssText = 'display:flex;gap:8px;align-items:flex-end;margin-bottom:4px';
    seekDiv.innerHTML =
      '<div style="width:30px;height:30px;border-radius:9px;background:var(--sage7);'
      +'display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">'
      +seekerEmoji+'<\/div>'
      +'<div style="max-width:75%;padding:10px 13px;background:#fff;border-radius:18px 18px 18px 4px;'
      +'font-size:13px;color:#333;line-height:1.55;font-style:italic;box-shadow:0 1px 4px rgba(0,0,0,.08)">'
      +'"'+seekerMsg+'"<\/div>';
    msgs.appendChild(seekDiv);
  }

  // Borrar solicitud del muro inmediatamente
  if(solicitudId) aceptarSolicitud(solicitudId);

  setUserStatus('ocupado');
  goTo('guardian-chat');

  setTimeout(function(){
    var inp = document.getElementById('gcInput');
    if(inp){ inp.focus(); inp.value = ''; }
  }, 300);
}

function gcBack(){
  setUserStatus('disponible');
  var prev = typeof prevScreen !== 'undefined' ? prevScreen : 'home';
  goTo(prev || 'home');
}

function gcEnd(){
  setUserStatus('disponible');
  gcShowSurvey(gcRole);
}

// ═══════════════════════════════════════════════════════════
//  BUSINESS LOGIC — Premium, Límites, Donaciones, Video
// ═══════════════════════════════════════════════════════════

// ── ESTADO DE USUARIO ────────────────────────────────────
function isDonor(){
  return safeLS('get','velo_monthly_donor')==='true';
}
function isPremiumUser(){
  return safeLS('get','velo_premium_user')==='true';
}
function isProUser(){
  return safeLS('get','velo_pro_active')==='true';
}
function setDonor(monthly){
  if(monthly){
    safeLS('set','velo_monthly_donor','true');
    safeLS('set','velo_monthly_start',Date.now().toString());
  }
  safeLS('set','velo_last_donation',Date.now().toString());
}
function setPremiumUser(){
  safeLS('set','velo_premium_user','true');
  safeLS('set','velo_premium_start',Date.now().toString());
  updatePlanBadge();
}

// ── PAYPAL ────────────────────────────────────────────────
var PAYPAL_EMAIL = 'wearevelo.app%40gmail.com';
var PAYPAL_BASE  = 'https://www.paypal.com/donate?business='+PAYPAL_EMAIL+'&currency_code=USD&no_note=1&no_shipping=1';
var PAYPAL_SUB   = 'https://www.paypal.com/cgi-bin/webscr?cmd=_xclick-subscriptions&business='+PAYPAL_EMAIL+'&currency_code=USD&no_note=1&no_shipping=1';

function _ppReturnUrl(tag){
  return encodeURIComponent(window.location.href.split('?')[0]+'?pp='+tag);
}
function openPayPalDonate(amtUSD, monthly, itemDesc){
  var desc = encodeURIComponent(itemDesc||'Donación Velo');
  var ret  = _ppReturnUrl(monthly?'don_m':'don_o');
  if(monthly){
    var url = PAYPAL_SUB
      +'&a3='+amtUSD+'&p3=1&t3=M'
      +'&item_name='+desc
      +'&return='+ret;
    window.open(url,'_blank');
  } else {
    var url = PAYPAL_BASE
      +'&amount='+amtUSD
      +'&item_name='+desc
      +'&return='+ret;
    window.open(url,'_blank');
  }
  // Mark pending so we can confirm on return
  safeLS('set','velo_pp_pending', monthly?'donor_monthly':'donor_once');
  safeLS('set','velo_pp_amt', String(amtUSD));
}
function openPayPalPremium(){
  var desc = encodeURIComponent('Velo Premium - Muro ilimitado');
  var ret  = _ppReturnUrl('premium');
  var url  = PAYPAL_SUB
    +'&a3=2.99&p3=1&t3=M'
    +'&item_name='+desc
    +'&return='+ret;
  window.open(url,'_blank');
  safeLS('set','velo_pp_pending','premium');
}
function openPayPalPro(){
  var desc = encodeURIComponent('Velo Profesional - Plan mensual');
  var ret  = _ppReturnUrl('pro');
  var url  = PAYPAL_SUB
    +'&a3=15&p3=1&t3=M'
    +'&item_name='+desc
    +'&return='+ret;
  window.open(url,'_blank');
  safeLS('set','velo_pp_pending','pro');
  toast('💳','Completá el pago en PayPal y volvé a la app 🌿');
}
function _checkPayPalReturn(){
  try{
    var params = new URLSearchParams(window.location.search);
    var tag = params.get('pp');
    if(!tag) return;
    var pending = safeLS('get','velo_pp_pending');
    var amt     = safeLS('get','velo_pp_amt') || '0';
    if(tag==='don_m' || (tag==='don_o' && pending)){
      var monthly = tag==='don_m';
      setDonor(monthly);
      addBuzonMsg({id:'don-pp-'+Date.now(),tipo:'sistema',icon:'💚',titulo:'¡Gracias por tu donación!',cuerpo:'Recibimos tu donación de $'+amt+' USD'+(monthly?' mensual':'')+'. Tu apoyo mantiene a Velo vivo y ayuda a personas en todo el mundo. ¡Muchas gracias! 🌿',leido:false,fecha:new Date().toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})});
      toast('💚','¡Gracias! Tu donación llegó. ¡La comunidad te lo agradece! 🌿');
      updateBuzonDot(); updateInboxBadge();
    } else if(tag==='premium'){
      setPremiumUser();
      addBuzonMsg({id:'prem-pp-'+Date.now(),tipo:'sistema',icon:'💎',titulo:'¡Plan Premium activado!',cuerpo:'Ya podés publicar ilimitado en el muro y crear círculos de paz. ¡Gracias por apoyar a Velo! 💚',leido:false,fecha:new Date().toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})});
      toast('💎','¡Plan Premium activado! Gracias por tu apoyo 💚');
      updateBuzonDot(); updateInboxBadge();
      setTimeout(updatePlanBadge, 100);
    } else if(tag==='pro'){
      safeLS('set','velo_pro_paid','true');
      addBuzonMsg({id:'pro-pp-'+Date.now(),tipo:'sistema',icon:'🌿',titulo:'Pago profesional confirmado',cuerpo:'Recibimos tu pago de $15/mes. Tu solicitud está en revisión. Te avisamos en 24-48hs. ¡Bienvenido/a al equipo! 💚',leido:false,fecha:new Date().toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})});
      toast('🌿','Pago recibido. Tu solicitud está en revisión 💚');
      updateBuzonDot(); updateInboxBadge();
    }
    safeLS('set','velo_pp_pending','');
    // Clean URL without reload
    try{ history.replaceState(null,'',window.location.pathname); }catch(e){}
  }catch(e){}
}

// ── STRIPE CHECKOUT ──────────────────────────────────────
var STRIPE_PK = 'pk_live_51TXmCcV05dCjGGP2F9YnbPBIantFoxurCpISx86i0DFNFcmM2sovtp5LcV5tOVxI72V4AfgY8sK5GtJVTyYnnI1L00QwkGS6P4';
var _stripeObj = null;
function _getStripe(){ if(!_stripeObj && window.Stripe) _stripeObj=Stripe(STRIPE_PK); return _stripeObj; }

var SUPABASE_FN_URL = SUPABASE_URL + '/functions/v1/stripe-checkout';

async function openStripeCheckout(amtUSD, proName, sessionType){
  toast('💳','Preparando el pago seguro…');
  try{
    var baseUrl = window.location.href.split('?')[0];
    var resp = await fetch(SUPABASE_FN_URL, {
      method:'POST',
      headers:{'Content-Type':'application/json', 'apikey': SUPABASE_ANON, 'Authorization':'Bearer '+SUPABASE_ANON},
      body: JSON.stringify({
        amount: amtUSD,
        proName: proName || '',
        sessionType: sessionType || 'paid',
        returnUrl: baseUrl,
        cancelUrl: baseUrl
      })
    });
    var data = await resp.json();
    if(data.url){
      safeLS('set','velo_stripe_pending', JSON.stringify({amt:amtUSD, pro:proName, type:sessionType||'paid'}));
      window.location.href = data.url;
    } else {
      toast('⚠️', data.error || 'Error al conectar con Stripe');
    }
  }catch(err){
    console.error('Stripe checkout error:', err);
    toast('⚠️','Error de conexión. Intentá de nuevo.');
  }
}

function _checkStripeReturn(){
  try{
    var params = new URLSearchParams(window.location.search);
    var status = params.get('stripe');
    if(!status) return;
    var pending = JSON.parse(safeLS('get','velo_stripe_pending')||'null');
    if(status==='ok' && pending){
      var proName = pending.pro || 'el profesional';
      addBuzonMsg({id:'stripe-ok-'+Date.now(),tipo:'sistema',icon:'💳',titulo:'¡Pago confirmado!',cuerpo:'Tu pago de $'+pending.amt+' USD para la sesión con '+proName+' fue procesado exitosamente. El monto queda retenido hasta confirmar que la sesión se realizó. 🔒',leido:false,fecha:new Date().toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})});
      toast('✅','¡Pago recibido! La sesión está confirmada 💚');
      updateBuzonDot(); updateInboxBadge();
      safeLS('set','velo_stripe_pending','');
    } else if(status==='cancel'){
      toast('↩️','Pago cancelado. Tu dinero no fue cobrado.');
      safeLS('set','velo_stripe_pending','');
    }
    try{ history.replaceState(null,'',window.location.pathname); }catch(e){}
  }catch(e){}
}

// ── SESSION PAYMENT QUEUE (escrow) ────────────────────────
var _sessionPayQ = [];
function _loadSPQ(){ try{ _sessionPayQ=JSON.parse(localStorage.getItem('velo_spq')||'[]'); }catch(e){ _sessionPayQ=[]; } }
function _saveSPQ(){ try{ localStorage.setItem('velo_spq',JSON.stringify(_sessionPayQ)); }catch(e){} }

function markSessionComplete(proName, userName, amtUSD, durationMin){
  _loadSPQ();
  var entry={
    id:'sp-'+Date.now(),
    proName:proName||getDisplayName()||'Profesional',
    userName:userName||'Usuario',
    amount:parseFloat(amtUSD)||60,
    duration:durationMin||45,
    date:new Date().toLocaleDateString('es'),
    status:'pending',
    proShare:((parseFloat(amtUSD)||60)*0.8).toFixed(2),
    veloFee:((parseFloat(amtUSD)||60)*0.2).toFixed(2)
  };
  _sessionPayQ.push(entry);
  _saveSPQ();
  addBuzonMsg({id:'survey-'+Date.now(),tipo:'encuesta',icon:'⭐',titulo:'¿Cómo fue tu sesión con '+entry.proName+'?',cuerpo:'Tu opinión ayuda a mejorar la experiencia. Completá la breve encuesta 💚\n\n1. ¿El profesional fue puntual? ⏰\n2. ¿Sentiste que te escuchó? 👂\n3. ¿Recomendarías esta sesión? 💚\n\nRespondé directamente en este mensaje.',leido:false,fecha:new Date().toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})});
  updateBuzonDot(); updateInboxBadge();
  renderSessionPayQueue();
  toast('✅','Sesión marcada como completada. El usuario recibió la encuesta 📋');
}

function openMarkSessionModal(){
  var m=document.getElementById('markSessionModal');
  if(m) m.style.display='flex';
}
function closeMarkSessionModal(){
  var m=document.getElementById('markSessionModal');
  if(m) m.style.display='none';
}
function submitMarkSession(){
  var user=document.getElementById('msUserName');
  var amt=document.getElementById('msAmount');
  var dur=document.getElementById('msDuration');
  if(!user||!user.value.trim()){toast('⚠️','Ingresá el nombre del usuario');return;}
  if(!amt||!parseFloat(amt.value)){toast('⚠️','Ingresá el monto de la sesión');return;}
  closeMarkSessionModal();
  markSessionComplete(null, user.value.trim(), parseFloat(amt.value), parseInt((dur&&dur.value)||'45',10));
}

function renderSessionPayQueue(){
  _loadSPQ();
  var pending=_sessionPayQ.filter(function(s){return s.status==='pending';});
  var el=document.getElementById('adminPayQueueList');
  if(!el) return;
  if(pending.length===0){
    el.innerHTML='<div style="text-align:center;padding:14px;font-size:12px;color:rgba(116,198,157,.35)">Sin pagos pendientes ✓</div>';
  } else {
    el.innerHTML=pending.map(function(s){
      return '<div style="background:rgba(255,255,255,.04);border:1.5px solid rgba(212,168,100,.2);border-radius:14px;padding:13px;margin-bottom:9px">'+
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:9px">'+
          '<div><div style="font-size:12px;font-weight:700;color:rgba(255,255,255,.85)">'+s.proName+' → '+s.userName+'</div>'+
          '<div style="font-size:10px;color:rgba(255,255,255,.4)">'+s.date+' · '+s.duration+' min · $'+s.amount+' USD</div></div>'+
          '<div style="text-align:right"><div style="font-size:13px;font-weight:700;color:var(--sage2)">$'+s.proShare+'</div>'+
          '<div style="font-size:9px;color:rgba(255,255,255,.35)">pro · comisión $'+s.veloFee+'</div></div>'+
        '</div>'+
        '<div style="display:flex;gap:7px">'+
          '<button onclick="approveSessionPayout(\''+s.id+'\')" style="flex:1;padding:9px;background:linear-gradient(135deg,rgba(58,158,96,.25),rgba(58,158,96,.15));border:1px solid rgba(58,158,96,.3);border-radius:100px;font-size:10px;font-weight:700;color:var(--sage2);cursor:pointer;font-family:Jost,sans-serif">✓ Aprobar y pagar</button>'+
          '<button onclick="rejectSessionPayout(\''+s.id+'\')" style="padding:9px 14px;background:rgba(192,48,40,.12);border:1px solid rgba(192,48,40,.25);border-radius:100px;font-size:10px;font-weight:700;color:#F87070;cursor:pointer;font-family:Jost,sans-serif">✕ Reembolsar</button>'+
        '</div>'+
      '</div>';
    }).join('');
  }
  var badge=document.getElementById('adminPayBadge');
  if(badge){badge.style.display=pending.length>0?'flex':'none';badge.textContent=pending.length;}
}

function approveSessionPayout(id){
  _loadSPQ();
  var e=_sessionPayQ.find(function(s){return s.id===id;});
  if(!e)return;
  e.status='approved';
  _saveSPQ();
  toast('✅','Aprobado. Transferí $'+e.proShare+' a '+e.proName+' desde tu Stripe dashboard 💳');
  renderSessionPayQueue();
}
function rejectSessionPayout(id){
  _loadSPQ();
  var e=_sessionPayQ.find(function(s){return s.id===id;});
  if(!e)return;
  e.status='rejected';
  _saveSPQ();
  toast('↩️','Rechazado. Emitir reembolso al usuario desde Stripe dashboard.');
  renderSessionPayQueue();
}

// ── SESIONES SOLIDARIAS ADMIN ─────────────────────────────
var _demoProsLibres=[
  {id:'fs1',proName:'Dra. Ana Martínez',duration:45,available:true,specialty:'Psicología',emoji:'🧠'},
  {id:'fs2',proName:'Coach Lucas',duration:60,available:true,specialty:'Bienestar',emoji:'🌿'},
  {id:'fs3',proName:'Lic. Carolina',duration:45,available:false,specialty:'Terapia familiar',emoji:'👨‍👩‍👧'}
];
function renderFreeSessions(){
  var el=document.getElementById('adminFreeSessionList');
  if(!el)return;
  el.innerHTML=_demoProsLibres.map(function(s){
    return '<div style="background:rgba(168,212,232,.07);border:1px solid rgba(168,212,232,.2);border-radius:14px;padding:12px;margin-bottom:8px">'+
      '<div style="display:flex;align-items:center;gap:9px;margin-bottom:8px">'+
        '<div style="font-size:20px">'+s.emoji+'</div>'+
        '<div style="flex:1"><div style="font-size:12px;font-weight:700;color:rgba(255,255,255,.85)">'+s.proName+'</div>'+
        '<div style="font-size:10px;color:rgba(168,212,232,.6)">'+s.specialty+' · '+s.duration+' min</div></div>'+
        '<span style="padding:3px 8px;border-radius:100px;font-size:9px;font-weight:700;background:'+(s.available?'rgba(58,158,96,.15)':'rgba(192,48,40,.1)')+';color:'+(s.available?'var(--sage2)':'#F87070')+';border:1px solid '+(s.available?'rgba(58,158,96,.25)':'rgba(192,48,40,.25)')+'">'+
          (s.available?'Disponible':'Ocupado')+'</span>'+
      '</div>'+
      '<div style="display:flex;gap:6px">'+
        '<button onclick="contactProAdmin(\''+s.id+'\',\''+s.proName+'\')" style="flex:1;padding:8px;background:rgba(168,212,232,.1);border:1px solid rgba(168,212,232,.25);border-radius:100px;font-size:10px;font-weight:700;color:rgba(168,212,232,.9);cursor:pointer;font-family:Jost,sans-serif">💬 Contactar</button>'+
        '<button onclick="assignFreeSession(\''+s.id+'\',\''+s.proName+'\')" style="flex:1;padding:8px;background:rgba(58,158,96,.1);border:1px solid rgba(58,158,96,.25);border-radius:100px;font-size:10px;font-weight:700;color:var(--sage2);cursor:pointer;font-family:Jost,sans-serif">🕊️ Asignar</button>'+
      '</div>'+
    '</div>';
  }).join('');
}
function contactProAdmin(proId, proName){
  var subj=document.getElementById('adminMsgSubject');
  var body=document.getElementById('adminMsgBody');
  if(subj) subj.value='Consulta disponibilidad sesión solidaria';
  if(body) body.value='Hola '+proName+',\n\nTenemos un usuario esperando una sesión solidaria. ¿Podés confirmar disponibilidad esta semana?\n\nGracias por tu compromiso 💚\n— Equipo Velo';
  adminTab(document.getElementById('atab-btn-msg'),'atab-msg');
  toast('💌','Mensaje prellenado para '+proName+' · Revisá y enviá 📩');
}
function assignFreeSession(proId, proName){
  toast('🕊️','Sesión asignada a '+proName+'. Usuario notificado en su buzón 💙');
}

// ── MURO DE FELICIDAD ─────────────────────────────────────
var happyPosts=[];
var happyReactions={};
function _loadHappy(){
  try{ happyPosts=JSON.parse(localStorage.getItem('velo_happy')||'[]'); }catch(e){ happyPosts=[]; }
  try{ happyReactions=JSON.parse(localStorage.getItem('velo_happy_r')||'{}'); }catch(e){ happyReactions={}; }
  if(happyPosts.length===0){
    happyPosts=[
      {id:'hp1',author:'Estrella',av:'⭐',time:'hace 8 min',city:'Madrid',text:'"Mi café de la mañana con el sol entrando. Las cosas pequeñas son las más perfectas."',mType:'emoji',mData:'☕',r:{sun:12,heart:8,wow:3,hug:5,spark:2},comments:[{author:'Luna',text:'¡Eso me alegró el día! 💚',time:'hace 5 min'}],flagged:false},
      {id:'hp2',author:'Anónimo',av:'🌙',time:'hace 22 min',city:'Buenos Aires',text:'"Terminé mi primer dibujo en meses. No es perfecto pero es mío 🎨"',mType:'emoji',mData:'🎨',r:{sun:7,heart:14,wow:1,hug:9,spark:4},comments:[],flagged:false}
    ];
  }
}
function _saveHappy(){
  try{ localStorage.setItem('velo_happy',JSON.stringify(happyPosts)); }catch(e){}
  try{ localStorage.setItem('velo_happy_r',JSON.stringify(happyReactions)); }catch(e){}
}
function openHappyPost(){
  var m=document.getElementById('happyPostModal');
  if(m) m.style.display='flex';
}
function closeHappyPost(){
  var m=document.getElementById('happyPostModal');
  if(m) m.style.display='none';
  var t=document.getElementById('happyPostText'); if(t) t.value='';
  var p=document.getElementById('happyMediaPreview'); if(p){p.innerHTML='';p.style.display='none';}
  _happyMData=null; _happyMType=null;
}
var _happyMData=null, _happyMType=null;
function happyFileSelected(inp){
  var f=inp.files[0]; if(!f)return;
  if(f.size>30*1024*1024){toast('⚠️','Máximo 30MB');return;}
  _happyMType=f.type.startsWith('video')?'video':'image';
  var r=new FileReader();
  r.onload=function(e){
    _happyMData=e.target.result;
    var p=document.getElementById('happyMediaPreview');
    if(!p)return;
    p.style.display='block';
    p.innerHTML=_happyMType==='video'
      ?'<video src="'+_happyMData+'" controls style="width:100%;border-radius:14px;max-height:180px"></video>'
      :'<img src="'+_happyMData+'" style="width:100%;border-radius:14px;max-height:180px;object-fit:cover">';
  };
  r.readAsDataURL(f);
}
function submitHappyPost(){
  var tEl=document.getElementById('happyPostText');
  var text=(tEl?tEl.value.trim():'');
  if(!text&&!_happyMData){toast('📸','Agregá una foto, video o texto antes de publicar');return;}
  if(text){
    moderateContent(text).then(function(ok){if(ok) _doHappyPost(text);});
  } else { _doHappyPost(text); }
}
function _doHappyPost(text){
  _loadHappy();
  happyPosts.unshift({
    id:'hp-'+Date.now(),
    author:getDisplayName()||'Anónimo',
    av:'🌟',
    time:'ahora',
    city:'',
    text:text?'"'+text+'"':'',
    mType:_happyMData?_happyMType:null,
    mData:_happyMData||null,
    r:{sun:0,heart:0,wow:0,hug:0,spark:0},
    comments:[],
    flagged:false
  });
  _saveHappy();
  closeHappyPost();
  renderHappyWall();
  showSuc('☀️','¡Momento compartido!','Tu alegría ya está en el Muro de la Felicidad ✨');
}
function reactHappy(postId, key){
  _loadHappy();
  var p=happyPosts.find(function(x){return x.id===postId;});
  if(!p)return;
  if(!p.r) p.r={sun:0,heart:0,wow:0,hug:0,spark:0};
  var prev=happyReactions[postId];
  if(prev&&prev!==key){ p.r[prev]=Math.max(0,(p.r[prev]||1)-1); }
  if(prev===key){ p.r[key]=Math.max(0,(p.r[key]||1)-1); happyReactions[postId]=null; }
  else { p.r[key]=(p.r[key]||0)+1; happyReactions[postId]=key; }
  _saveHappy();
  renderHappyWall();
}
function addHappyComment(postId){
  var inp=document.getElementById('hc-'+postId);
  if(!inp||!inp.value.trim())return;
  _loadHappy();
  var p=happyPosts.find(function(x){return x.id===postId;});
  if(!p)return;
  if(!p.comments)p.comments=[];
  p.comments.push({author:getDisplayName()||'Anónimo',text:inp.value.trim(),time:'ahora'});
  _saveHappy();
  inp.value='';
  renderHappyWall();
}
function reportHappyPost(postId){
  _loadHappy();
  var p=happyPosts.find(function(x){return x.id===postId;});
  if(!p)return;
  p.flagged=true;
  _saveHappy();
  renderHappyWall();
  flagForAdmin('Post Muro Felicidad: '+(p.text||'[media]'),'contenido','Reportado por usuario');
  toast('🚩','Reportado. El equipo de Velo lo revisará 💙');
}
function renderHappyWall(){
  _loadHappy();
  var feed=document.getElementById('happyFeed');
  if(!feed)return;
  var visible=happyPosts.filter(function(p){return !p.flagged;});
  if(visible.length===0){
    feed.innerHTML='<div style="text-align:center;padding:28px;color:var(--earth2);font-size:13px">Sé el primero en compartir tu felicidad ☀️</div>';
    return;
  }
  var rKeys=[{k:'sun',e:'☀️'},{k:'heart',e:'💚'},{k:'wow',e:'🥰'},{k:'hug',e:'🤗'},{k:'spark',e:'✨'}];
  feed.innerHTML=visible.map(function(p){
    var my=happyReactions[p.id]||null;
    var mHtml='';
    if(p.mType==='image'&&p.mData) mHtml='<div style="border-radius:14px;overflow:hidden;margin-bottom:10px"><img src="'+p.mData+'" style="width:100%;max-height:220px;object-fit:cover;display:block"></div>';
    else if(p.mType==='video'&&p.mData) mHtml='<div style="border-radius:14px;overflow:hidden;margin-bottom:10px"><video src="'+p.mData+'" controls playsinline style="width:100%;max-height:220px;display:block"></video></div>';
    else if(p.mType==='emoji') mHtml='<div style="border-radius:14px;overflow:hidden;margin-bottom:10px;background:linear-gradient(135deg,var(--sun2),var(--peach));height:130px;display:flex;align-items:center;justify-content:center;font-size:52px">'+p.mData+'</div>';
    var cHtml='';
    if(p.comments&&p.comments.length){
      cHtml='<div style="margin-top:8px;border-top:1px solid rgba(212,168,100,.12);padding-top:8px">'+
        p.comments.slice(-3).map(function(c){
          return '<div style="display:flex;gap:7px;margin-bottom:5px;align-items:flex-start"><div style="width:20px;height:20px;border-radius:7px;background:var(--sun2);display:flex;align-items:center;justify-content:center;font-size:10px;flex-shrink:0">💬</div>'+
            '<div><span style="font-size:11px;font-weight:600;color:var(--earth2)">'+c.author+'</span><span style="font-size:11px;color:var(--ink3);margin-left:5px">'+c.text+'</span><div style="font-size:9px;color:var(--ink5)">'+c.time+'</div></div></div>';
        }).join('')+'</div>';
    }
    return '<div style="background:rgba(255,255,255,.82);border:1.5px solid rgba(255,200,100,.22);border-radius:22px;padding:15px;margin-bottom:11px;box-shadow:var(--sh);position:relative;overflow:hidden">'+
      '<div style="height:3px;background:linear-gradient(90deg,var(--warm-tan),var(--peach),transparent);position:absolute;top:0;left:0;right:0"></div>'+
      '<div style="padding-top:4px">'+
        '<div style="display:flex;align-items:center;gap:9px;margin-bottom:10px">'+
          '<div style="width:36px;height:36px;border-radius:11px;background:linear-gradient(135deg,var(--sun2),var(--peach2));border:1.5px solid rgba(255,200,80,.22);display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0">'+p.av+'</div>'+
          '<div style="flex:1"><div style="font-size:12px;font-weight:600;color:var(--ink)">'+p.author+'</div><div style="font-size:10px;color:var(--ink5)">'+p.time+(p.city?' · '+p.city:'')+'</div></div>'+
          '<button style="width:22px;height:22px;border-radius:50%;background:transparent;border:1px solid rgba(255,200,80,.22);font-size:10px;cursor:pointer" onclick="reportHappyPost(\''+p.id+'\')">🚩</button>'+
        '</div>'+
        mHtml+
        (p.text?'<div style="font-family:\'Cormorant Garamond\',serif;font-style:italic;font-size:14px;color:var(--ink2);line-height:1.6;margin-bottom:10px">'+p.text+'</div>':'')+
        '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:8px">'+
          rKeys.map(function(r){
            var cnt=p.r&&p.r[r.k]?p.r[r.k]:0;
            var active=my===r.k;
            return '<button onclick="reactHappy(\''+p.id+'\',\''+r.k+'\')" style="padding:6px 10px;border-radius:100px;background:'+(active?'rgba(255,200,80,.28)':'rgba(255,200,80,.1)')+';border:1.5px solid '+(active?'rgba(255,200,80,.55)':'rgba(255,200,80,.2)')+';cursor:pointer;font-size:12px;font-family:Jost,sans-serif;color:var(--earth)">'+
              r.e+(cnt>0?' <span style="font-size:10px;font-weight:700">'+cnt+'</span>':'')+'</button>';
          }).join('')+
        '</div>'+
        '<div style="display:flex;gap:7px;align-items:center">'+
          '<input placeholder="Comentar..." style="flex:1;border:1.5px solid rgba(255,200,80,.2);border-radius:100px;padding:7px 13px;font-size:12px;font-family:Jost,sans-serif;background:rgba(255,255,255,.7);outline:none;color:var(--ink)" id="hc-'+p.id+'" maxlength="200" onkeypress="if(event.key===\'Enter\')addHappyComment(\''+p.id+'\')">'+
          '<button onclick="addHappyComment(\''+p.id+'\')" style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--sun),var(--peach));border:none;font-size:14px;cursor:pointer;flex-shrink:0">→</button>'+
        '</div>'+
        cHtml+
      '</div>'+
    '</div>';
  }).join('');
}

// ── LÍMITE MURO DE AYUDA (2 gratis/día, ilimitado premium) ───
var FREE_HELP_LIMIT = 2;
function getHelpWallCount(){
  var today = new Date().toDateString();
  return parseInt(safeLS('get','velo_help_'+today)||'0',10);
}
function incrementHelpWallCount(){
  var today = new Date().toDateString();
  safeLS('set','velo_help_'+today, String(getHelpWallCount()+1));
}
function canPostHelpWall(){
  if(isPremiumUser()) return true;
  return getHelpWallCount() < FREE_HELP_LIMIT;
}
function showHelpLimitModal(){
  openPlanModal('help');
}
function subscribePremiumUser(){
  closeModal('planModal');
  var m = document.getElementById('helpLimitModal');
  if(m) m.style.display='none';
  openPayPalPremium();
  toast('💳','Redirigiendo a PayPal… completá el pago y volvé 🌿');
}

// ── PLAN MODAL ────────────────────────────────────────────
function openPlanModal(trigger){
  var badge = document.getElementById('planCurrentBadge');
  var cta = document.getElementById('planModalCTA');
  var isPlus = isPremiumUser();
  if(badge){
    if(isPlus){
      badge.innerHTML = '<span style="display:inline-flex;align-items:center;gap:6px;padding:6px 16px;background:linear-gradient(135deg,var(--sage),var(--sage2));border-radius:100px;color:#fff;font-size:13px;font-weight:700">💎 Velo Plus · Activo ✓</span>';
    } else {
      badge.innerHTML = '<span style="display:inline-flex;align-items:center;gap:6px;padding:6px 16px;background:rgba(0,0,0,.06);border-radius:100px;color:var(--ink3);font-size:13px;font-weight:600">Velo Free</span>';
    }
  }
  if(cta){
    if(isPlus){
      cta.innerHTML = '<div style="text-align:center;padding:10px;background:var(--sage7);border-radius:14px;font-size:12px;font-weight:700;color:var(--sage2);margin-bottom:8px">💎 Ya sos suscriptor/a de Velo Plus. ¡Gracias por apoyar la comunidad! 💚</div>'+
        '<div style="text-align:center"><button onclick="cancelPlusSubscription()" style="background:none;border:none;color:var(--ink5);font-size:11px;cursor:pointer;font-family:\'Jost\',sans-serif;text-decoration:underline">Cancelar suscripción</button></div>';
    } else {
      cta.innerHTML = '<button onclick="subscribePremiumUser()" style="width:100%;padding:15px;background:linear-gradient(135deg,var(--sage),var(--sage2));border:none;border-radius:100px;color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:\'Jost\',sans-serif;margin-bottom:8px">Suscribirme a Velo Plus — $2.99/mes 💎</button><div style="text-align:center;font-size:10px;color:var(--ink5)">Cancelás cuando quieras · Pago seguro via PayPal 🔒</div>';
    }
  }
  openModal('planModal');
}
function updatePlanBadge(){
  var btn = document.getElementById('planBtn');
  var ico = document.getElementById('planBtnIco');
  var lbl = document.getElementById('planBtnLbl');
  if(!btn) return;
  if(isPremiumUser()){
    btn.style.background = 'linear-gradient(135deg,var(--sage),var(--sage2))';
    btn.style.color = '#fff';
    btn.style.border = 'none';
    if(ico) ico.textContent = '✓';
    if(lbl) lbl.textContent = 'Plus';
  } else {
    btn.style.background = 'rgba(255,255,255,.75)';
    btn.style.color = 'var(--sage2)';
    btn.style.border = '1.5px solid rgba(116,198,157,.2)';
    if(ico) ico.textContent = '💎';
    if(lbl) lbl.textContent = 'Plus';
  }
}

// ── TÉRMINOS Y CONDICIONES ────────────────────────────────
var TC_VERSION = 'v1.0_2026-05-17';
var TC_DATE    = '17 de mayo de 2026';

function getTCContent(){
  return '<div style="font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--sage3);margin-bottom:4px">Versión '+TC_VERSION+' · '+TC_DATE+'</div>'+
  '<p style="font-size:11px;color:var(--ink4);font-style:italic;margin-bottom:14px">Este documento constituye un contrato legalmente vinculante conforme al Derecho de la Unión Europea, el Reglamento General de Protección de Datos (RGPD — UE 2016/679) y la legislación portuguesa aplicable. Al pulsar "Aceptar", usted reconoce haberlo leído y comprende que queda vinculado por él.</p>'+

  _tcSec('1','PARTES DEL CONTRATO Y OPERADOR',
    '<p>La Plataforma <b>Velo</b> (en adelante, "la Plataforma" o "Velo") es operada por <b>Diego Catalan Greco</b>, persona física, en calidad de propietario individual de la marca Velo, domiciliado en Portugal y sujeto a la legislación de la Unión Europea.</p>'+
    '<p>Al registrarse, el "Usuario" o "Profesional" (en adelante, "el Usuario") celebra este contrato con el operador mencionado. Si en el futuro Velo fuese operada por una persona jurídica constituida formalmente, este contrato continuará vigente y será novado automáticamente en favor de dicha entidad, sin que sea necesario el re-consentimiento del Usuario.</p>'+
    '<p><b>Contacto del responsable del tratamiento:</b> wearevelo.app@gmail.com</p>'),

  _tcSec('2','CAPACIDAD LEGAL Y EDAD MÍNIMA',
    '<p>El uso de Velo está <b>estrictamente reservado a personas mayores de 18 años</b> con plena capacidad jurídica para contratar según la ley de su país de residencia. Al aceptar estos T&C, el Usuario declara bajo su exclusiva responsabilidad que cumple este requisito. Velo podrá requerir documentación acreditativa en cualquier momento. En caso de falsedad, la cuenta será eliminada y se reserva el derecho a emprender acciones legales.</p>'),

  _tcSec('3','NATURALEZA DEL SERVICIO Y EXENCIÓN DE RESPONSABILIDAD MÉDICA',
    '<p>Velo es exclusivamente un proveedor de <b>infraestructura tecnológica</b> que actúa como intermediario para conectar a Usuarios con otros Usuarios (Guardianes) y con Profesionales de la salud mental, y que proporciona herramientas digitales de gestión y comunicación.</p>'+
    '<p>⚠️ <b>EXENCIÓN ABSOLUTA — SALUD:</b> Velo <u>no</u> es un centro médico, no presta servicios de salud, no emite diagnósticos, no receta ni valida tratamientos. La relación profesional-paciente se da de forma directa y exclusiva entre el Usuario y el Profesional. Velo queda completamente exenta de cualquier responsabilidad civil, penal o administrativa derivada de diagnósticos erróneos, negligencias médicas, daños físicos o psicológicos, empeoramiento de patologías o fallecimiento resultantes de las interacciones dentro de la Plataforma.</p>'+
    '<p>El módulo de Diario Personal es de uso <b>estrictamente privado</b>. Ningún algoritmo ni persona de Velo accede, lee ni analiza su contenido. La información del Diario nunca será usada para detección de crisis ni para ningún otro fin.</p>'),

  _tcSec('4','EXPEDIENTE CLÍNICO PRIVADO DEL PROFESIONAL',
    '<p>Velo provee a los Profesionales un espacio privado para notas de seguimiento ("Expediente"). El Profesional es el único propietario y custodio legal de dichos expedientes conforme a la legislación de salud aplicable en su jurisdicción. Velo actúa como mero encargado del tratamiento automatizado (almacenamiento cifrado) y no accede, edita ni audita el contenido.</p>'+
    '<p>El Profesional se obliga a (a) no compartir sus credenciales; (b) respetar el secreto profesional; (c) asumir responsabilidad exclusiva ante cualquier filtración provocada por descuido, hackeo local de su dispositivo o mal uso del Expediente.</p>'),

  _tcSec('5','SUSCRIPCIONES, DONACIONES Y PASARELAS DE PAGO (PayPal · Stripe)',
    '<p><b>Suscripciones:</b> El acceso a determinadas funciones de Velo (plan "Velo Plus") requiere el pago de una suscripción periódica de USD 2,99/mes gestionada a través de PayPal. El Usuario autoriza los cobros automáticos.</p>'+
    '<p><b>Donaciones:</b> Los Usuarios pueden realizar aportaciones voluntarias a Profesionales gestionadas mediante Stripe. Velo actúa como agente de dispersión y retiene el 20% como comisión de plataforma.</p>'+
    '<p><b>Datos de pago:</b> Velo <u>no</u> almacena datos de tarjetas de crédito ni credenciales bancarias. Las transacciones son procesadas de forma segura por PayPal Inc. y Stripe Inc. bajo sus propias políticas de seguridad y certificación PCI-DSS.</p>'+
    '<p><b>Exención financiera:</b> Velo no se responsabiliza por retenciones de fondos, fallos en transacciones, contracargos ni comisiones aplicadas por las pasarelas de pago.</p>'+
    '<p><b>Política de reembolsos:</b> Las suscripciones y donaciones voluntarias no son reembolsables, salvo error técnico directamente imputable al código de Velo, en cuyo caso el Usuario deberá notificarlo a wearevelo.app@gmail.com en un plazo máximo de 14 días desde la transacción.</p>'),

  _tcSec('6','OBLIGACIONES Y RESPONSABILIDAD DEL PROFESIONAL',
    '<p>Al registrarse como Profesional, el Usuario garantiza que sus títulos, licencias y certificaciones son <b>100% auténticos y vigentes</b>. La presentación de documentos falsos o la suplantación de identidad profesional constituye un ilícito penal. Velo denunciará activamente ante las autoridades competentes cualquier sospecha de fraude.</p>'+
    '<p><b>Cláusula de indemnidad:</b> Si Velo fuere demandada, sancionada o incurriere en gastos de defensa jurídica como consecuencia directa de una acción, omisión, fraude o mala praxis de un Profesional, este último se obliga a indemnizar a Velo por la totalidad de dichos costes, incluyendo honorarios de abogados, tasas judiciales y el importe de cualquier multa o condena.</p>'),

  _tcSec('7','PROTECCIÓN DE DATOS PERSONALES — RGPD (UE 2016/679)',
    '<p><b>Responsable del tratamiento:</b> Diego Catalan Greco · wearevelo.app@gmail.com</p>'+
    '<p><b>Datos recogidos:</b> nombre de usuario, dirección de correo electrónico, contraseña (cifrada), dirección IP en el momento del registro, avatar (opcional), y metadatos de uso de la Plataforma (fechas de acceso, preferencias de privacidad). No se recogen datos biométricos ni de categoría especial salvo los introducidos voluntariamente por el propio Usuario en el Diario o en el chat.</p>'+
    '<p><b>Finalidades y base jurídica:</b></p>'+
    '<ul style="padding-left:16px;margin:6px 0">'+
    '<li>Ejecución del contrato (Art. 6.1.b RGPD): gestión de cuentas, suscripciones y comunicaciones dentro de la Plataforma.</li>'+
    '<li>Cumplimiento de obligación legal (Art. 6.1.c RGPD): conservación de registros de aceptación de T&C durante el plazo legalmente exigible.</li>'+
    '<li>Interés legítimo (Art. 6.1.f RGPD): seguridad de la Plataforma, prevención de fraude y moderación de contenido.</li>'+
    '</ul>'+
    '<p><b>Plazo de conservación:</b> Los datos de cuenta activa se conservan mientras la cuenta esté activa. Tras la baja, se eliminan los datos operativos en un plazo de 30 días. Los datos mínimos de reserva legal (email, nombre de usuario, IP de registro, timestamp y versión de T&C aceptada) se conservan de forma bloqueada durante <b>6 años</b> conforme al Art. 149.º del Código Civil Português (prescripción general) y para la defensa jurídica de Velo ante posibles reclamaciones.</p>'+
    '<p><b>Derechos del interesado:</b> Conforme al RGPD, el Usuario tiene derecho a <b>acceder, rectificar, suprimir, portar, limitar y oponerse</b> al tratamiento de sus datos, así como a no ser objeto de decisiones automatizadas con efectos significativos. Para ejercer estos derechos, escriba a wearevelo.app@gmail.com. Tiene también derecho a presentar reclamación ante la <b>CNPD</b> (Comissão Nacional de Proteção de Dados, Portugal) — www.cnpd.pt.</p>'+
    '<p><b>Transferencias internacionales:</b> Los datos pueden ser procesados por proveedores (Stripe, PayPal, Firebase) ubicados fuera de la UE. En todos los casos se utilizan mecanismos de transferencia adecuados conforme al Capítulo V del RGPD (Cláusulas Contractuales Tipo o decisiones de adecuación).</p>'),

  _tcSec('8','MODERACIÓN DE CONTENIDO Y EXPULSIÓN',
    '<p>Queda estrictamente prohibido el uso de chats, comentarios o mensajes para: insultos, acoso, amenazas, pornografía, venta de sustancias ilegales, spam o cualquier contenido que infrinja la legislación portuguesa o de la UE.</p>'+
    '<p>Velo se reserva el derecho de cancelar, suspender o banear permanentemente cualquier cuenta sin previo aviso ni derecho a devolución si detecta incumplimientos de estos T&C o si recibe denuncias fundadas de la comunidad.</p>'),

  _tcSec('9','DERECHO DE DESISTIMIENTO Y BAJA',
    '<p>Conforme a la Directiva UE 2011/83 sobre derechos de los consumidores, los Usuarios residentes en la Unión Europea tienen <b>14 días naturales de derecho de desistimiento</b> desde la primera suscripción de pago, salvo que hayan solicitado expresamente comenzar el servicio antes del vencimiento de dicho plazo (acceso inmediato tras el pago), en cuyo caso el derecho de desistimiento se extingue.</p>'+
    '<p>Para solicitar la baja de la cuenta y la supresión de datos operativos, el Usuario puede hacerlo desde la configuración de la app o escribiendo a wearevelo.app@gmail.com.</p>'),

  _tcSec('10','PROPIEDAD INTELECTUAL',
    '<p>El nombre "Velo", el logotipo, el diseño de la interfaz, los textos, imágenes y el código de la Plataforma son propiedad exclusiva de Diego Catalan Greco. Queda prohibida su reproducción, distribución o uso comercial sin autorización expresa y por escrito.</p>'+
    '<p>El contenido generado por los Usuarios (publicaciones, mensajes) permanece en propiedad del Usuario, quien concede a Velo una licencia no exclusiva, gratuita y global para mostrarlo dentro de la Plataforma.</p>'),

  _tcSec('11','LEY APLICABLE Y JURISDICCIÓN',
    '<p>Este contrato se rige por el Derecho de la <b>República Portuguesa</b> y, en lo que le sea de aplicación, por el Derecho de la <b>Unión Europea</b>. Para cualquier controversia, las partes se someten a la jurisdicción de los <b>Tribunales de la cidade de Lisboa, Portugal</b>, renunciando a cualquier otro fuero que pudiera corresponderles.</p>'+
    '<p>Nada de lo dispuesto en estos T&C limita los derechos que la legislación imperativa de protección al consumidor de la UE otorga a los consumidores que residan en Estados Miembros de la UE.</p>'),

  _tcSec('12','MODIFICACIONES DE LOS TÉRMINOS',
    '<p>Velo podrá modificar estos T&C en cualquier momento. Los cambios serán notificados con al menos <b>15 días de antelación</b> mediante aviso dentro de la Plataforma. El uso continuado de la Plataforma tras dicha notificación implica la aceptación de los nuevos términos. Si el Usuario no los acepta, deberá cesar el uso de la Plataforma y solicitar la baja.</p>'+
    '<p>La versión vigente siempre estará disponible dentro de la app, en la sección de Configuración > Términos y Condiciones.</p>');
}

function _tcSec(num, title, body){
  return '<div style="margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid rgba(0,0,0,.06)">'+
    '<div style="font-size:12px;font-weight:800;color:var(--ink);margin-bottom:6px">'+num+'. '+title+'</div>'+
    '<div style="font-size:11.5px;color:var(--ink3);line-height:1.75">'+body+'</div>'+
  '</div>';
}

function openTCModal(){
  var el = document.getElementById('tcDocContent');
  if(el) el.innerHTML = getTCContent();
  var vl = document.getElementById('tcVersionLabel');
  if(vl) vl.textContent = TC_VERSION+' · Conforme al RGPD (UE 2016/679) y Derecho Portugués';
  openModal('tcFullModal');
}

function _fetchUserIP(cb){
  try{
    fetch('https://api.ipify.org?format=json').then(function(r){return r.json();}).then(function(d){ cb(d.ip||'N/D'); }).catch(function(){ cb('N/D'); });
  } catch(e){ cb('N/D'); }
}

function recordTCAcceptance(name, email){
  var records = JSON.parse(safeLS('get','velo_tc_records')||'[]');
  var existing = records.findIndex(function(r){ return r.email && r.email===email; });
  var ts = new Date().toISOString();
  var record = { name: name||'N/D', email: email||'N/D', timestamp: ts, ip: 'obteniendo…', tcVersion: TC_VERSION, status: 'ACCEPTED' };
  if(existing>=0) records[existing] = record; else records.push(record);
  safeLS('set','velo_tc_records', JSON.stringify(records));
  _fetchUserIP(function(ip){
    var recs = JSON.parse(safeLS('get','velo_tc_records')||'[]');
    var idx = recs.findIndex(function(r){ return r.email===email && r.timestamp===ts; });
    if(idx>=0){ recs[idx].ip = ip; safeLS('set','velo_tc_records', JSON.stringify(recs)); }
  });
}

function renderAdminTCRecords(){
  var el = document.getElementById('adminTCRecords');
  if(!el) return;
  var records = JSON.parse(safeLS('get','velo_tc_records')||'[]');
  if(!records.length){
    el.innerHTML = '<div style="text-align:center;padding:14px;font-size:11px;color:rgba(255,255,255,.3)">Sin registros de aceptación aún.</div>';
    return;
  }
  el.innerHTML = records.slice().reverse().map(function(r){
    var d = new Date(r.timestamp);
    var dateStr = d.toLocaleDateString('es',{day:'2-digit',month:'short',year:'numeric'});
    var timeStr = d.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    return '<div style="background:rgba(116,198,157,.05);border:1px solid rgba(116,198,157,.15);border-radius:12px;padding:10px 12px;margin-bottom:7px">'+
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:5px">'+
        '<div>'+
          '<div style="font-size:11px;font-weight:700;color:rgba(255,255,255,.8)">'+r.name+'</div>'+
          '<div style="font-size:10px;color:rgba(116,198,157,.7)">'+r.email+'</div>'+
        '</div>'+
        '<span style="padding:2px 8px;background:rgba(116,198,157,.12);border:1px solid rgba(116,198,157,.25);border-radius:100px;font-size:9px;font-weight:700;color:rgba(116,198,157,.9);white-space:nowrap">✓ ACEPTADO</span>'+
      '</div>'+
      '<div style="display:flex;flex-wrap:wrap;gap:6px">'+
        '<span style="font-size:9px;color:rgba(255,255,255,.4);background:rgba(255,255,255,.05);padding:2px 7px;border-radius:6px">📅 '+dateStr+' · '+timeStr+' UTC</span>'+
        '<span style="font-size:9px;color:rgba(255,255,255,.4);background:rgba(255,255,255,.05);padding:2px 7px;border-radius:6px">🌐 IP: '+r.ip+'</span>'+
        '<span style="font-size:9px;color:rgba(116,198,157,.6);background:rgba(116,198,157,.08);padding:2px 7px;border-radius:6px">📄 '+r.tcVersion+'</span>'+
      '</div>'+
    '</div>';
  }).join('');
}

function exportTCRecords(){
  var records = JSON.parse(safeLS('get','velo_tc_records')||'[]');
  if(!records.length){ toast('📄','Sin registros que exportar'); return; }
  var csv = 'Nombre,Email,Timestamp (UTC),IP,Version TC,Estado\n';
  csv += records.map(function(r){
    return ['"'+r.name+'"','"'+r.email+'"','"'+r.timestamp+'"','"'+r.ip+'"','"'+r.tcVersion+'"','"'+r.status+'"'].join(',');
  }).join('\n');
  var blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = 'velo_tc_records_'+new Date().toISOString().slice(0,10)+'.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('✅','CSV exportado con '+records.length+' registros');
}

// ── SOS COUNTRY DETECTION ─────────────────────────────────
var _SOS_COUNTRIES = {
  AR:{flag:'🇦🇷',name:'Argentina',numbers:[
    {icon:'🚨',num:'911',label:'Emergencias 911',sub:'Policía · Bomberos · SAME'},
    {icon:'🚑',num:'107',label:'SAME 107',sub:'Ambulancias · Capital Federal'},
    {icon:'🧠',num:'135',label:'Crisis 135',sub:'Salud mental · gratuito · 24hs'},
    {icon:'👩',num:'144',label:'Violencia 144',sub:'Mujer en situación de riesgo'}
  ]},
  ES:{flag:'🇪🇸',name:'España',numbers:[
    {icon:'🚨',num:'112',label:'Emergencias 112',sub:'Policía · Bomberos · Médico'},
    {icon:'🧠',num:'024',label:'Crisis 024',sub:'Salud mental · gratuito · 24hs'},
    {icon:'👩',num:'016',label:'Violencia 016',sub:'Violencia de género · 24hs'},
    {icon:'🚑',num:'061',label:'Médico 061',sub:'Urgencias médicas'}
  ]},
  CL:{flag:'🇨🇱',name:'Chile',numbers:[
    {icon:'🚨',num:'149',label:'Carabineros 149',sub:'Policía · emergencias'},
    {icon:'🚑',num:'131',label:'SAMU 131',sub:'Ambulancia · urgencias'},
    {icon:'🧠',num:'800200818',label:'Crisis 800 200 818',sub:'Salud mental · gratuito'},
    {icon:'👩',num:'1455',label:'Mujer 1455',sub:'Violencia contra la mujer'}
  ]},
  MX:{flag:'🇲🇽',name:'México',numbers:[
    {icon:'🚨',num:'911',label:'Emergencias 911',sub:'Policía · Bomberos · Médico'},
    {icon:'🧠',num:'8002900024',label:'SAPTEL 800 290 0024',sub:'Crisis · salud mental · 24hs'},
    {icon:'👩',num:'8004547839',label:'INMUJERES 800 454 TEVE',sub:'Violencia contra la mujer'}
  ]},
  UY:{flag:'🇺🇾',name:'Uruguay',numbers:[
    {icon:'🚨',num:'911',label:'Emergencias 911',sub:'Policía · Bomberos · SIATE'},
    {icon:'🧠',num:'08005050',label:'Salud Mental 0800 5050',sub:'Crisis · gratuito · 24hs'},
    {icon:'👩',num:'08004141',label:'Mujer 0800 4141',sub:'Violencia de género · gratuito'}
  ]},
  CO:{flag:'🇨🇴',name:'Colombia',numbers:[
    {icon:'🚨',num:'123',label:'Emergencias 123',sub:'Policía · Bomberos · CRUE'},
    {icon:'🧠',num:'106',label:'Línea 106',sub:'Salud mental · crisis · 24hs'},
    {icon:'👩',num:'155',label:'Mujer 155',sub:'Violencia de género · gratuito'}
  ]},
  PT:{flag:'🇵🇹',name:'Portugal',numbers:[
    {icon:'🚨',num:'112',label:'Emergências 112',sub:'Polícia · Bombeiros · INEM'},
    {icon:'🚑',num:'112',label:'INEM 112',sub:'Ambulância · urgências médicas'},
    {icon:'🧠',num:'21354545',label:'SOS Voz Amiga 213 544 545',sub:'Crise · saúde mental · gratuito'},
    {icon:'👩',num:'116006',label:'Apoio à Vítima 116 006',sub:'Violência doméstica · gratuito'}
  ]},
  BR:{flag:'🇧🇷',name:'Brasil',numbers:[
    {icon:'🚨',num:'190',label:'Polícia 190',sub:'Emergências policiais'},
    {icon:'🚑',num:'192',label:'SAMU 192',sub:'Urgências médicas · ambulância'},
    {icon:'🧠',num:'18800006263',label:'CVV 188',sub:'Crise emocional · gratuito · 24hs'},
    {icon:'👩',num:'180',label:'Ligue 180',sub:'Violência contra a mulher'}
  ]}
};
var _langToCountry = {
  'es-AR':'AR','es-419':'AR','ar':'AR',
  'es-ES':'ES','es':'ES','ca':'ES','gl':'ES','eu':'ES',
  'es-CL':'CL',
  'es-MX':'MX',
  'es-UY':'UY',
  'es-CO':'CO',
  'pt-PT':'PT','pt':'PT',
  'pt-BR':'BR'
};
function _detectCountryCode(){
  var langs = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language||'es'];
  for(var i=0;i<langs.length;i++){
    var l = langs[i];
    if(_langToCountry[l]) return _langToCountry[l];
    var short = l.split('-')[0]+'-'+l.split('-')[1];
    if(_langToCountry[short]) return _langToCountry[short];
    var prefix = l.split('-')[0];
    if(_langToCountry[prefix]) return _langToCountry[prefix];
  }
  return 'AR'; // default
}
function _buildSOSSection(code, data, isDetected){
  var link = function(n){ return 'tel:'+n.num; };
  var cards = data.numbers.map(function(n){
    return '<a href="'+link(n)+'" style="display:flex;align-items:center;gap:7px;padding:9px 10px;background:rgba(192,48,40,.05);border:1.5px solid rgba(192,48,40,.14);border-radius:13px;text-decoration:none">'+
      '<span style="font-size:16px">'+n.icon+'</span>'+
      '<div><div style="font-size:11px;font-weight:700;color:var(--sos)">'+n.label+'</div>'+
      '<div style="font-size:9px;color:var(--ink5)">'+n.sub+'</div></div></a>';
  }).join('');
  var header = isDetected
    ? '<div style="font-size:9px;font-weight:700;letter-spacing:1.5px;color:var(--sos);margin-bottom:6px;display:flex;align-items:center;gap:6px">'+data.flag+' '+data.name.toUpperCase()+' <span style="font-size:8px;font-weight:600;padding:2px 7px;background:rgba(192,48,40,.08);border-radius:100px;color:var(--sos)">Detectado</span><span style="flex:1;height:1px;background:rgba(192,48,40,.12);display:block"></span></div>'
    : '<div style="font-size:9px;font-weight:700;letter-spacing:1.5px;color:var(--ink4);margin-bottom:6px;display:flex;align-items:center;gap:6px">'+data.flag+' '+data.name.toUpperCase()+' <span style="flex:1;height:1px;background:rgba(192,48,40,.12);display:block"></span></div>';
  return header+'<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px">'+cards+'</div>';
}
function renderSOSCountry(){
  var el = document.getElementById('sosCountryContent');
  if(!el) return;
  var detected = _detectCountryCode();
  var html = '';
  // Detected country first
  if(_SOS_COUNTRIES[detected]){
    html += _buildSOSSection(detected, _SOS_COUNTRIES[detected], true);
  }
  // Divider for other countries
  var othersHtml = '';
  Object.keys(_SOS_COUNTRIES).forEach(function(code){
    if(code !== detected) othersHtml += _buildSOSSection(code, _SOS_COUNTRIES[code], false);
  });
  if(othersHtml){
    html += '<details style="margin-bottom:10px"><summary style="font-size:9px;font-weight:700;letter-spacing:1.5px;color:var(--ink4);cursor:pointer;margin-bottom:6px;list-style:none;display:flex;align-items:center;gap:6px">🌎 OTROS PAÍSES <span style="flex:1;height:1px;background:rgba(192,48,40,.12);display:block"></span> <span style="font-size:10px">›</span></summary>'+othersHtml+'</details>';
  }
  el.innerHTML = html;
}

// ── CANCEL SUBSCRIPTION ───────────────────────────────────
function cancelPlusSubscription(){
  if(!confirm('¿Seguro que querés cancelar Velo Plus?\n\nTu suscripción pasará a Velo Free y perderás el acceso ilimitado. Las personas que ayudás con tu $2.99/mes dependen de vos. 💙')) return;
  safeLS('set','velo_premium_user','false');
  var cancelled = JSON.parse(safeLS('get','velo_cancelled_subs')||'[]');
  cancelled.push({date: new Date().toISOString(), plan:'plus'});
  safeLS('set','velo_cancelled_subs', JSON.stringify(cancelled));
  closeModal('planModal');
  updatePlanBadge();
  var chip = document.getElementById('profilePlanChip');
  var planBtnEl = document.getElementById('profilePlanBtn');
  var cancelBtnEl = document.getElementById('profileCancelBtn');
  if(chip) chip.innerHTML = '<span style="font-size:12px;font-weight:600;color:var(--ink4)">Velo Free</span>';
  if(planBtnEl){ planBtnEl.style.display = ''; planBtnEl.textContent = 'Ver Velo Plus →'; }
  if(cancelBtnEl) cancelBtnEl.style.display = 'none';
  showSuc('🙏','Suscripción cancelada','Volviste al plan Velo Free. Gracias por haber formado parte de la comunidad Plus. Tu apoyo ayudó a muchas personas. Si algún día querés volver, aquí estaremos. 💙');
}

// ── ADMIN: SUBSCRIPTION STATS ─────────────────────────────
function renderAdminSubStats(){
  var statsEl = document.getElementById('adminSubStats');
  var cancelledEl = document.getElementById('adminSubCancelled');
  if(!statsEl) return;
  var isPlus = isPremiumUser();
  var freeCount = isPlus ? 0 : 1;
  var plusCount = isPlus ? 1 : 0;
  var cancelled = JSON.parse(safeLS('get','velo_cancelled_subs')||'[]');
  var cancelledCount = cancelled.length;
  statsEl.innerHTML =
    '<div style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:12px 8px;text-align:center">'+
      '<div style="font-size:22px;font-weight:800;color:rgba(255,255,255,.8)">'+freeCount+'</div>'+
      '<div style="font-size:9px;font-weight:700;color:rgba(255,255,255,.4);margin-top:3px">Velo Free</div>'+
    '</div>'+
    '<div style="background:linear-gradient(135deg,rgba(116,198,157,.15),rgba(116,198,157,.08));border:1px solid rgba(116,198,157,.3);border-radius:14px;padding:12px 8px;text-align:center">'+
      '<div style="font-size:22px;font-weight:800;color:var(--sage2)">'+plusCount+'</div>'+
      '<div style="font-size:9px;font-weight:700;color:rgba(116,198,157,.6);margin-top:3px">💎 Velo Plus</div>'+
    '</div>'+
    '<div style="background:rgba(200,80,80,.07);border:1px solid rgba(200,80,80,.2);border-radius:14px;padding:12px 8px;text-align:center">'+
      '<div style="font-size:22px;font-weight:800;color:rgba(220,100,100,.7)">'+cancelledCount+'</div>'+
      '<div style="font-size:9px;font-weight:700;color:rgba(200,80,80,.5);margin-top:3px">Cancelaron</div>'+
    '</div>';
  if(cancelledCount > 0 && cancelledEl){
    var rows = cancelled.slice(-3).reverse().map(function(c){
      var d = new Date(c.date);
      var label = d.toLocaleDateString('es',{day:'2-digit',month:'short',year:'numeric'});
      return '<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.04)">'+
        '<span style="font-size:10px;color:rgba(255,255,255,.4)">Cancelación</span>'+
        '<span style="font-size:10px;color:rgba(200,100,100,.6)">'+label+'</span>'+
      '</div>';
    }).join('');
    cancelledEl.innerHTML = '<div style="font-size:8px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(200,80,80,.5);margin-bottom:6px">Últimas cancelaciones</div>'+
      '<div style="background:rgba(255,255,255,.04);border:1px solid rgba(200,80,80,.15);border-radius:12px;padding:8px 12px">'+rows+'</div>';
  } else if(cancelledEl){
    cancelledEl.innerHTML = '';
  }
}

// ── DONACIÓN DESPUÉS DE RESEÑA ────────────────────────────
function showPostReviewDonation(){
  // No mostrar si ya es donor o premium
  if(isDonor() || isPremiumUser()) return;
  setTimeout(function(){
    var m = document.createElement('div');
    m.id='postReviewDonModal';
    m.style.cssText='position:fixed;inset:0;z-index:9750;background:rgba(10,20,10,.55);backdrop-filter:blur(10px);display:flex;align-items:flex-end;justify-content:center';
    m.innerHTML='<div style="width:100%;max-width:420px;background:#fff;border-radius:28px 28px 0 0;padding:24px 22px 40px">'+
      '<div style="width:36px;height:4px;background:var(--sage5);border-radius:2px;margin:0 auto 18px"></div>'+
      '<div style="text-align:center;margin-bottom:14px"><div style="font-size:32px;margin-bottom:6px">💚</div>'+
        '<div style="font-size:18px;font-weight:800;color:var(--ink);margin-bottom:4px">¿Querés apoyar a Velo?</div>'+
        '<div style="font-size:12px;color:var(--ink4);line-height:1.6">Ayudás a que la comunidad siga existiendo y a que más personas reciban apoyo gratuito.</div></div>'+
      '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px">'+
        '<div onclick="selectPostDon(this,5)" style="padding:10px 6px;border:1.5px solid var(--border);border-radius:12px;text-align:center;cursor:pointer;background:rgba(255,255,255,.9)"><div style="font-size:14px;font-weight:800;color:var(--sage)">$5</div></div>'+
        '<div onclick="selectPostDon(this,10)" style="padding:10px 6px;border:1.5px solid var(--sage2);border-radius:12px;text-align:center;cursor:pointer;background:var(--sage7)"><div style="font-size:14px;font-weight:800;color:var(--sage)">$10</div></div>'+
        '<div onclick="selectPostDon(this,15)" style="padding:10px 6px;border:1.5px solid var(--border);border-radius:12px;text-align:center;cursor:pointer;background:rgba(255,255,255,.9)"><div style="font-size:14px;font-weight:800;color:var(--sage)">$15</div></div>'+
        '<div onclick="selectPostDon(this,0)" style="padding:10px 6px;border:1.5px solid var(--border);border-radius:12px;text-align:center;cursor:pointer;background:rgba(255,255,255,.9)"><div style="font-size:12px;font-weight:700;color:var(--ink4)">Otro</div></div>'+
      '</div>'+
      '<div id="postDonCustomWrap" style="display:none;margin-bottom:12px"><input id="postDonCustom" type="number" min="5" placeholder="Mínimo $5 USD" class="inp" style="font-size:15px"></div>'+
      '<label style="display:flex;align-items:center;gap:8px;margin-bottom:14px;cursor:pointer;padding:8px 0">'+
        '<input type="checkbox" id="postDonMonthly" style="width:18px;height:18px;accent-color:var(--sage)">'+
        '<span style="font-size:12px;color:var(--ink4)">Hacer esta donación mensual (podés cancelar cuando quieras)</span>'+
      '</label>'+
      '<button onclick="confirmPostDon()" style="width:100%;padding:15px;background:linear-gradient(135deg,var(--sage),var(--sage2));border:none;border-radius:100px;color:#fff;font-size:15px;font-weight:700;cursor:pointer;font-family:Jost,sans-serif;margin-bottom:10px">Donar ahora 💚</button>'+
      '<button onclick="document.getElementById(\'postReviewDonModal\').remove()" style="width:100%;padding:10px;background:none;border:none;color:var(--ink5);font-size:13px;cursor:pointer;font-family:Jost,sans-serif">No por ahora</button>'+
    '</div>';
    var phone = document.querySelector('.phone');
    if(phone) phone.appendChild(m);
  }, 1800);
}
var _postDonAmt=10;
function selectPostDon(el,amt){
  document.querySelectorAll('#postReviewDonModal [onclick^="selectPostDon"]').forEach(function(d){
    d.style.borderColor='var(--border)'; d.style.background='rgba(255,255,255,.9)';
    var n=d.querySelector('div'); if(n){n.style.color='var(--ink4)';n.style.fontWeight='700';}
  });
  el.style.borderColor='var(--sage2)'; el.style.background='var(--sage7)';
  var n=el.querySelector('div'); if(n){n.style.color='var(--sage)';n.style.fontWeight='800';}
  _postDonAmt=amt;
  var wrap=document.getElementById('postDonCustomWrap');
  if(wrap) wrap.style.display=(amt===0)?'block':'none';
}
function confirmPostDon(){
  var custom=document.getElementById('postDonCustom');
  var amt=_postDonAmt;
  if(amt===0 && custom){ amt=parseFloat(custom.value); if(!amt||amt<5){toast('⚠️','Mínimo $5 USD');return;} }
  var monthly=document.getElementById('postDonMonthly');
  var isMonthly=monthly&&monthly.checked;
  var m=document.getElementById('postReviewDonModal'); if(m)m.remove();
  var desc = isMonthly ? 'Donación mensual Velo' : 'Donación Velo';
  openPayPalDonate(amt, isMonthly, desc);
  toast('💳','Redirigiendo a PayPal… completá el pago y volvé 🌿');
}

// ── VIDEOLLAMADA (Jitsi Meet — funciona en Safari/Chrome) ─
function startVideoCall(roomId, displayName){
  if(!roomId) roomId = 'velo-session-'+Date.now();
  if(!displayName) displayName = getDisplayName() || 'Usuario Velo';
  var phone = document.querySelector('.phone');
  var existing = document.getElementById('jitsiModal');
  if(existing) existing.remove();
  var m = document.createElement('div');
  m.id='jitsiModal';
  m.style.cssText='position:absolute;inset:0;z-index:9600;background:#0a1a0a;display:flex;flex-direction:column';
  var safeUrl='https://meet.jit.si/'+encodeURIComponent(roomId)+'#userInfo.displayName="'+encodeURIComponent(displayName)+'"&config.startWithVideoMuted=false&config.startWithAudioMuted=false&config.prejoinPageEnabled=false&config.toolbarButtons=["microphone","camera","hangup"]&interfaceConfig.SHOW_BRAND_WATERMARK=false';
  m.innerHTML='<div style="display:flex;align-items:center;justify-content:space-between;padding:max(env(safe-area-inset-top,16px),16px) 16px 12px;background:#0a1a0a;flex-shrink:0">'+
    '<div style="font-size:14px;font-weight:700;color:rgba(116,198,157,.9)">📹 Videollamada Velo</div>'+
    '<button onclick="endVideoCall()" style="padding:7px 14px;background:rgba(192,48,40,.8);border:none;border-radius:100px;color:#fff;font-size:12px;font-weight:700;cursor:pointer;font-family:Jost,sans-serif">Finalizar ✕</button>'+
  '</div>'+
  '<iframe src="'+safeUrl+'" allow="camera;microphone;display-capture;fullscreen;speaker" style="flex:1;border:none;width:100%;background:#000" allowfullscreen></iframe>';
  if(phone) phone.appendChild(m);
}
function endVideoCall(){
  var m=document.getElementById('jitsiModal'); if(m)m.remove();
  toast('✅','Videollamada finalizada');
}

// ── COMISIÓN PROFESIONAL (20% Velo / 80% profesional) ─────
function calcProCommission(tarifaTotal){
  var velo = parseFloat((tarifaTotal * 0.20).toFixed(2));
  var pro  = parseFloat((tarifaTotal * 0.80).toFixed(2));
  return {velo:velo, pro:pro, total:tarifaTotal};
}
function showProCommissionInfo(tarifaEl){
  var tarifa = parseFloat((tarifaEl?tarifaEl.value:0)||50);
  if(!tarifa||tarifa<1) return;
  var c = calcProCommission(tarifa);
  toast('💰','Recibirás $'+c.pro+' por sesión (Velo retiene $'+c.velo+' - 20%)');
}

// ═══════════════════════════════════════════════════════════
//  FIN BUSINESS LOGIC
// ═══════════════════════════════════════════════════════════
function dejarResena(stars, tags, comment){
  if(!stars) stars = 5;
  if(!tags) tags = [];
  if(!comment) comment = '';
  addProfileReview(stars, tags, comment);
  checkAndAwardBadge(totalCharlas + 1);
  totalCharlas = totalCharlas + 1;
  toast('⭐','¡Gracias por tu reseña! Ayuda a la comunidad 💚');
  showPostReviewDonation();
}

function gcShowSurvey(role){
  var ayudado  = document.getElementById('survey-ayudado');
  var guardian = document.getElementById('survey-guardian');
  if(!ayudado || !guardian){ goTo('home'); return; }
  if(role === 'helper'){
    ayudado.style.display  = 'none';
    guardian.style.display = 'block';
  } else {
    ayudado.style.display  = 'block';
    guardian.style.display = 'none';
  }
  goTo('post-chat');
}

function gcSend(){
  var inp = document.getElementById('gcInput');
  if(!inp || !inp.value.trim()) return;
  var text = inp.value.trim();
  inp.value = '';
  inp.style.height = '44px';

  var msgs = document.getElementById('gcMsgs');
  if(!msgs) return;

  // Mensaje del usuario (derecha)
  var userDiv = document.createElement('div');
  userDiv.style.cssText = 'display:flex;justify-content:flex-end';
  var bubble = document.createElement('div');
  bubble.style.cssText = 'max-width:75%;padding:10px 13px;background:linear-gradient(135deg,var(--sage7),rgba(82,183,136,.15));border-radius:18px 18px 4px 18px;font-size:13px;color:#222;line-height:1.55;box-shadow:0 1px 4px rgba(0,0,0,.08)';
  bubble.textContent = text;
  userDiv.appendChild(bubble);
  msgs.appendChild(userDiv);
  msgs.scrollTop = msgs.scrollHeight;

  // Respuesta automatica del guardian
  setTimeout(function(){
    var replyDiv = document.createElement('div');
    replyDiv.style.cssText = 'display:flex;gap:8px;align-items:flex-end';
    var avEl = document.getElementById('gcAvMsg');
    var avTxt = avEl ? avEl.textContent : '🌿';
    var replies = [
      'Gracias por compartir eso. Te escucho. 🌿',
      'Entiendo como te sientes. Estoy aqui contigo.',
      'Eso que describes suena difícil. Contame mas si queres.',
      'No estas solo/a en esto. Seguimos juntos. 💚'
    ];
    var reply = replies[Math.floor(Math.random()*replies.length)];
    replyDiv.innerHTML = '<div style="width:30px;height:30px;border-radius:9px;background:var(--sage7);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">'+avTxt+'<\/div><div style="max-width:75%;padding:10px 13px;background:#fff;border-radius:18px 18px 18px 4px;font-size:13px;color:#333;line-height:1.55;box-shadow:0 1px 4px rgba(0,0,0,.08)">'+reply+'<\/div>';
    msgs.appendChild(replyDiv);
    msgs.scrollTop = msgs.scrollHeight;
  }, 900);
}

function setStar(n){
  var stars = document.querySelectorAll('#starRating span');
  for(var i=0;i<stars.length;i++){
    stars[i].style.color = i < n ? '#f4b942' : '#e0e0e0';
  }
}
function toggleTag(btn){
  var active = btn.style.borderColor === 'rgb(61, 109, 90)';
  btn.style.borderColor = active ? '#e0e0e0' : '#3d6d5a';
  btn.style.color       = active ? '#555'     : '#3d6d5a';
  btn.style.background  = active ? '#fff'     : 'rgba(61,109,90,.07)';
}
function selGuardianFeel(btn){
  var btns = document.querySelectorAll('#guardianFeelings button');
  for(var i=0;i<btns.length;i++){
    btns[i].style.borderColor = '#e0e0e0';
    btns[i].style.background  = '#fff';
    btns[i].style.color       = '#444';
  }
  btn.style.borderColor = '#3d6d5a';
  btn.style.background  = 'rgba(61,109,90,.07)';
  btn.style.color       = '#3d6d5a';
}
function submitSurvey(){
  var stars=document.querySelectorAll('#starRating span');
  var count=0;
  for(var si=0;si<stars.length;si++){if(stars[si].style.color==='rgb(244, 185, 66)')count++;}
  var tags=[];
  var tagBtns=document.querySelectorAll('#survey-ayudado button');
  for(var ti=0;ti<tagBtns.length;ti++){if(tagBtns[ti].style.borderColor==='rgb(61, 109, 90)')tags.push(tagBtns[ti].textContent.trim());}
  var comment='';var cmt=document.getElementById('surveyComment');if(cmt)comment=cmt.value.trim();
  dejarResena(count||5, tags, comment);
  toast('⭐','Reseña guardada. Gracias! 💚');
  // Suggest donation after session
  goTo('donation-exit');
}
function submitGuardianSurvey(){
  var feelings=[];
  var feelBtns=document.querySelectorAll('#guardianFeelings button');
  for(var fi=0;fi<feelBtns.length;fi++){if(feelBtns[fi].style.borderColor==='rgb(61, 109, 90)')feelings.push(feelBtns[fi].textContent.trim());}
  dejarResena(5,feelings,'Sesión como guardián completada');
  goTo('home');
  setTimeout(function(){ toast('🌿','Registrado. Gracias por acompañar! 💚'); }, 300);
}

var helpAnon = true;


function selTopic(btn){
  var btns = document.querySelectorAll('#helpTopics button');
  for(var i=0;i<btns.length;i++){
    btns[i].style.borderColor = '#ddd';
    btns[i].style.background  = '#fff';
    btns[i].style.color       = '#555';
  }
  btn.style.borderColor = '#3d6d5a';
  btn.style.background  = 'rgba(61,109,90,.08)';
  btn.style.color       = '#3d6d5a';
}

function toggleAnon(el){
  helpAnon = !helpAnon;
  var dot = document.getElementById('anonDot');
  el.style.background = helpAnon ? '#3d6d5a' : '#ddd';
  if(dot) dot.style.left = helpAnon ? '21px' : '3px';
}

function submitHelpForm(){
  var msgEl = document.getElementById('helpMsg');
  var text = msgEl ? msgEl.value.trim() : '';
  // IA: detectar crisis en solicitud de ayuda
  if(text && _veloIA.crisis.some(function(k){ return text.toLowerCase().indexOf(k)>=0; })){
    openModal('sosModal');
    addBuzonMsg({id:'ia-help-crisis-'+Date.now(),tipo:'sistema',icon:'🆘',remitente:'Velo IA',titulo:'Pedido de ayuda urgente detectado',cuerpo:'Detectamos palabras de crisis en tu mensaje de la Sala de Ayuda.\n\nEstamos conectándote con un Guardián ahora mismo. Mientras tanto:\n\n📞 Centro de Asistencia al Suicida: 135 (24hs, gratis)\n📞 SAME: 107\n\nNo estás solo/a. 💚',leido:false,fecha:new Date().toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})});
    updateBuzonDot(); updateInboxBadge();
  }
  openGuardianChat('Guardian Velo', '🌿', 'helped');
}

// ── BOTELLAS EN EL MURO ──────────────────────────────────
// Las botellas quedan visibles hasta que alguien las responda

var _bottleDefaults = [
  {id:1, emoji:'😔', msg:'Hoy me siento invisible. Trabajo tanto pero nadie parece verme realmente.', author:'Anónima', time:'hace 2h', answered:false},
  {id:2, emoji:'😶', msg:'Tengo una decisión importante y no sé a quién pedirle consejo.', author:'Marcos', time:'hace 11 min', answered:false},
  {id:3, emoji:'🌧️', msg:'Extraño a alguien que ya no está. No sé cómo seguir sin esa presencia.', author:'Anónimo', time:'hace 45 min', answered:false}
];
function _loadBottleWall(){
  try{
    var stored = JSON.parse(localStorage.getItem('velo_bottles')||'null');
    bottleWall = stored && stored.length ? stored : _bottleDefaults.slice();
  }catch(e){ bottleWall = _bottleDefaults.slice(); }
}
function _saveBottleWall(){
  try{ localStorage.setItem('velo_bottles', JSON.stringify(bottleWall)); }catch(e){}
}
var bottleWall = _bottleDefaults.slice();

function renderBottleWall(){
  _loadBottleWall();
  var container = document.getElementById('bottleWallList');
  if(!container) return;
  container.innerHTML = '<div class="shimmer-card"><div class="shimmer-line"></div><div class="shimmer-line w80"></div><div class="shimmer-line w40"></div></div>';
  setTimeout(function(){
    container.innerHTML = '';
    var pending = bottleWall.filter(function(b){ return !b.answered; });
    if(pending.length === 0){
      container.innerHTML = '<div style="text-align:center;padding:30px;font-size:13px;color:rgba(255,255,255,.4);font-style:italic">No hay botellas flotando ahora. Sé el primero en lanzar una. 🍾</div>';
      return;
    }
    var myBottles = JSON.parse(safeLS('get','velo_my_bottles')||'[]');
    pending.forEach(function(bottle, idx){
      var isMine = myBottles.indexOf(bottle.id) >= 0;
      var div = document.createElement('div');
      var colors = [
        {bg:'#fff',border:'rgba(58,112,144,.25)',accent:'#3A7090',text:'#1A3A5A',sub:'#5A8FA8'},
        {bg:'#fff',border:'rgba(107,85,168,.2)',accent:'#6855A8',text:'#2A1A50',sub:'#7B65B8'},
        {bg:'#fff',border:'rgba(45,106,79,.2)',accent:'#2D6A4F',text:'#1A3A28',sub:'#4A9070'}
      ];
      var c = colors[idx % colors.length];
      div.style.cssText = 'background:'+c.bg+';border:1.5px solid '+c.border+';border-left:4px solid '+c.accent+';border-radius:18px;padding:14px 16px;margin:0 17px 10px;box-shadow:0 2px 12px rgba(0,0,0,.06);animation:waveIn .35s ease both';
      var actionBtn = isMine
        ? '<button onclick="deleteMyBottle(\''+bottle.id+'\')" style="padding:9px 16px;background:#FFF0EE;border:1.5px solid rgba(192,48,40,.25);border-radius:100px;color:#C03028;font-size:11px;font-weight:700;cursor:pointer;font-family:\'Jost\',sans-serif">Retirar 🗑️</button>'
        : '<button onclick="respondBottle(\''+bottle.id+'\')" style="padding:9px 18px;background:linear-gradient(135deg,'+c.accent+','+c.sub+');border:none;border-radius:100px;color:#fff;font-size:12px;font-weight:700;cursor:pointer;font-family:\'Jost\',sans-serif;box-shadow:0 3px 10px rgba(0,0,0,.15)">🍾 Abrir botella</button>';
      div.innerHTML = '<div style="font-size:22px;margin-bottom:7px">'+bottle.emoji+'</div>'
        +'<div style="font-family:\'Cormorant Garamond\',serif;font-style:italic;font-size:15px;color:'+c.text+';line-height:1.6;margin-bottom:12px">"'+bottle.msg+'"</div>'
        +'<div style="display:flex;align-items:center;justify-content:space-between">'
        +'<div style="font-size:11px;color:'+c.sub+'">'+bottle.author+' · '+bottle.time+(isMine?' · <b>Tu botella</b>':'')+'</div>'
        +actionBtn
        +'</div>';
      container.appendChild(div);
    });
  }, 200);
}

function respondBottle(id){
  var bottle = null;
  for(var i=0;i<bottleWall.length;i++){
    if(bottleWall[i].id===id){ bottle=bottleWall[i]; break; }
  }
  if(!bottle) return;
  openBottleReply(bottle.msg, id);
}
function deleteMyBottle(id){
  bottleWall = bottleWall.filter(function(b){ return b.id !== id; });
  _saveBottleWall();
  var myBottles = JSON.parse(safeLS('get','velo_my_bottles')||'[]');
  safeLS('set','velo_my_bottles', JSON.stringify(myBottles.filter(function(x){ return x!==id; })));
  renderBottleWall();
  toast('🍾','Tu botella fue retirada del mar.');
}

function openBottleDetail(card){
  var msgs = [
    'Hoy me siento invisible. Trabajo tanto pero nadie parece verme realmente.',
    'Extraño a alguien que ya no esta. No se como seguir sin esa presencia.',
    'Tengo miedo de que las cosas nunca mejoren. Alguien mas siente esto?'
  ];
  var cards = document.querySelectorAll('#bottle .scrl > div[onclick]');
  var idx = 0;
  for(var i=0;i<cards.length;i++){ if(cards[i]===card){idx=i;break;} }
  openBottleReply(msgs[idx] || msgs[0], null);
}

var currentBottleId = null;
function openBottleReply(msg, bottleId){
  currentBottleId = bottleId || null;
  var txt = document.getElementById('bottleReplyText');
  var inp = document.getElementById('bottleReplyInput');
  var m   = document.getElementById('bottleReplyModal');
  var cnt = document.getElementById('bottleCharCount');
  var btn = document.getElementById('bottleReplySendBtn');
  if(txt) txt.textContent = msg || '';
  if(inp) inp.value = '';
  if(cnt) cnt.textContent = '0/100 mín.';
  if(btn){ btn.disabled=true; btn.style.background='rgba(58,112,144,.3)'; btn.style.color='rgba(255,255,255,.5)'; btn.style.cursor='not-allowed'; }
  if(m)   m.style.display = 'flex';
}
function onBottleReplyInput(el){
  var len = el.value.length;
  var cnt = document.getElementById('bottleCharCount');
  var btn = document.getElementById('bottleReplySendBtn');
  if(cnt){
    if(len < 100){
      cnt.textContent = len+'/100 mín.';
      cnt.style.color = len > 60 ? '#e08a00' : '#aaa';
    } else {
      cnt.textContent = len+' ✓';
      cnt.style.color = '#2D6A4F';
    }
  }
  if(btn){
    var ready = len >= 100;
    btn.disabled = !ready;
    btn.style.background = ready ? 'linear-gradient(135deg,#3A7090,#2D6A8A)' : 'rgba(58,112,144,.3)';
    btn.style.color = ready ? '#fff' : 'rgba(255,255,255,.5)';
    btn.style.cursor = ready ? 'pointer' : 'not-allowed';
  }
}
function closeBottleReply(){
  var m = document.getElementById('bottleReplyModal');
  if(m) m.style.display = 'none';
}
function sendBottleReply(){
  var inp = document.getElementById('bottleReplyInput');
  if(!inp||!inp.value.trim()){ toast('🌊','Escribí algo antes de responder'); return; }
  if(inp.value.trim().length < 100){ toast('💙','Tu respuesta debe tener al menos 100 caracteres. Tomate el tiempo de acompañar de verdad.'); return; }
  var replyText = inp.value.trim();
  var answeredBottle = null;
  if(currentBottleId !== null){
    for(var i=0;i<bottleWall.length;i++){
      if(bottleWall[i].id===currentBottleId){
        bottleWall[i].answered=true;
        answeredBottle = bottleWall[i];
        break;
      }
    }
    _saveBottleWall();
    renderBottleWall();
  }
  // Notify the sender in their buzón
  if(answeredBottle){
    addBuzonMsg({
      id:'bottle-r-'+Date.now(),
      tipo:'botella',
      icon:'🍾',
      titulo:'¡Tu botella fue respondida!',
      cuerpo:'Alguien encontró tu mensaje en el mar y quiso responderte:\n\n"'+replyText+'"',
      leido:false,
      fecha:new Date().toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})
    });
    updateBuzonDot(); updateInboxBadge();
  }
  closeBottleReply();
  showSuc('🌊','Botella recogida','Tu respuesta fue enviada. El remitente la verá en su buzón de Velo 🍾');
}

// ── ESTADO DE USUARIO ─────────────────────────────────────
// Cuando está en chat activo → ocupado, al salir → disponible
var userStatus = 'disponible'; // 'disponible' | 'ocupado'

function setUserStatus(status){
  userStatus = status;
  // Update all status indicators in guardian cards
  var indicators = document.querySelectorAll('.status-dot');
  for(var i=0;i<indicators.length;i++){
    if(status === 'ocupado'){
      indicators[i].style.background = '#e74c3c';
      indicators[i].title = 'Ocupado';
    } else {
      indicators[i].style.background = '#2ecc71';
      indicators[i].title = 'Disponible';
    }
  }
  // Update profile badge if exists
  var badge = document.getElementById('userStatusBadge');
  if(badge){
    badge.textContent = status === 'ocupado' ? '🔴 Ocupado' : '🟢 Disponible';
    badge.style.color = status === 'ocupado' ? '#e74c3c' : '#27ae60';
  }
}

// ══════════════════════════════════════════════════════════
// BUZÓN VELO — Sistema de mensajes internos
// Tipos: 'botella' | 'resena' | 'profesional' | 'sistema'
// ══════════════════════════════════════════════════════════

var buzonMensajes = [
  {
    id: 'sys-bienvenida',
    tipo: 'sistema',
    icon: '🌿',
    remitente: 'Velo Oficial',
    asunto: 'Bienvenido/a a la comunidad',
    titulo: 'Bienvenido/a a la comunidad',
    extracto: 'Estamos aquí para acompañarte. Explorá, conectá y cuídate.',
    cuerpo: 'Bienvenido/a a Velo, tu espacio seguro de acompañamiento emocional.\n\nAquí podés:\n• 🤝 Buscar acompañamiento en la Sala de Ayuda\n• 🛡️ Conectarte con Guardianes disponibles\n• 📓 Llevar tu diario íntimo\n• 🌬️ Practicar ejercicios de respiración\n• 🍾 Dejar mensajes en botella\n• 💬 Unirte a Círculos de Paz\n\nVelo siempre será gratuito. Gracias por confiar en nosotros. 💚',
    fecha: 'Hoy',
    leido: false,
    prioritario: true
  },
  {
    id: 'sys-ia-mes1',
    tipo: 'sistema',
    icon: '🤖',
    remitente: 'Velo IA',
    asunto: 'Tu resumen de bienestar del primer mes',
    titulo: 'Tu resumen de bienestar del primer mes',
    extracto: 'Llevas un mes con nosotros. Aquí tu resumen personalizado.',
    cuerpo: 'Han pasado 30 días desde que te uniste a Velo. 🌿\n\nEste es tu resumen de bienestar:\n\n📊 Actividad del mes\n• Sesiones de respiración: 4\n• Entradas en tu diario: 7\n• Conexiones en la comunidad: 3\n\n💡 Lo que notamos\nTu mayor actividad fue entre las 20hs y 22hs. Muchos usuarios encuentran que ese momento es ideal para el autocuidado.\n\n🌟 Recomendación IA\nIntentá mantener al menos 5 min de respiración guiada por semana. Tiene un impacto real en la regulación emocional.\n\nSeguís haciendo un gran trabajo. Velo está aquí. 💚',
    fecha: 'Hace 1 día',
    leido: false,
    prioritario: false
  }
];

function _syncNotifStorage(){
  try{safeLS('set','velo_notificaciones',JSON.stringify(buzonMensajes.slice(0,50)));}catch(e){}
}
function _loadNotifStorage(){
  try{var s=safeLS('get','velo_notificaciones');if(s){var arr=JSON.parse(s);if(arr.length>buzonMensajes.length)buzonMensajes=arr;}}catch(e){}
}

function addBuzonMsg(msg){
  buzonMensajes.unshift(msg);
  _syncNotifStorage();
  updateBuzonDot();
  updateInboxBadge();
  if(document.getElementById('buzonList')) renderBuzon();
}

function updateBuzonDot(){
  var dot = document.getElementById('buzonDot');
  var unread = buzonMensajes.filter(function(m){ return !m.leido; });
  if(dot) dot.style.display = unread.length > 0 ? 'block' : 'none';
}

function updateInboxBadge(){
  var unread = buzonMensajes.filter(function(m){ return !m.leido; });
  var n = unread.length;
  var badge = document.getElementById('inboxBadge');
  if(badge){badge.textContent = n > 9 ? '9+' : n; badge.style.display = n > 0 ? 'flex' : 'none';}
  var pbadge = document.getElementById('profileInboxBadge');
  if(pbadge){pbadge.textContent = n > 9 ? '9+' : n; pbadge.style.display = n > 0 ? 'flex' : 'none';}
}

function renderBuzon(){
  var list = document.getElementById('buzonList');
  var empty = document.getElementById('buzonEmpty');
  if(!list) return;

  if(buzonMensajes.length === 0){
    list.innerHTML = '';
    if(empty) empty.style.display = 'block';
    return;
  }
  if(empty) empty.style.display = 'none';

  list.innerHTML = '';
  buzonMensajes.forEach(function(msg){
    var card = document.createElement('div');
    var bg = msg.prioritario ? 'rgba(196,181,232,.08)' : 'rgba(255,255,255,.92)';
    var border = msg.prioritario ? '1.5px solid rgba(196,181,232,.3)' : '1px solid rgba(45,106,79,.08)';
    var ring = !msg.leido ? ';box-shadow:0 2px 14px rgba(45,106,79,.1)' : '';
    card.style.cssText = 'background:'+bg+';border:'+border+';border-radius:20px;padding:16px;margin-bottom:10px;cursor:pointer;position:relative'+ring;
    card.onclick = function(){ openBuzonDetail(msg.id); };

    // Support both field naming conventions
    var titulo = msg.asunto || msg.titulo || 'Mensaje de Velo';
    var preview = msg.extracto || (msg.cuerpo ? msg.cuerpo.substring(0,90)+'…' : '');
    var remitente = msg.remitente || 'Velo';
    var icono = msg.icon || {botella:'🍾',resena:'⭐',profesional:'🩺',sistema:'🛡️',soporte:'💌',encuesta:'📋',donacion:'💚'}[msg.tipo] || '📬';
    var dotHtml = !msg.leido ? '<div style="position:absolute;top:14px;right:14px;width:9px;height:9px;background:var(--sage3);border-radius:50%;border:2px solid #fff"></div>' : '';

    var botellaExtra = '';
    if(msg.tipo === 'botella'){
      var resp = msg.cuerpo || msg.extracto || '';
      botellaExtra = '<div style="margin-top:10px;padding:10px;background:rgba(168,212,232,.12);border-radius:12px;border:1px solid rgba(168,212,232,.25)">'
        +'<div style="font-size:10px;font-weight:700;color:#3b82f6;margin-bottom:4px">RESPUESTA RECIBIDA<\/div>'
        +'<div style="font-size:12px;color:var(--ink3);line-height:1.5">"'+resp.substring(0,120)+'"<\/div>'
        +'<\/div>';
    }

    card.innerHTML = dotHtml
      +'<div style="display:flex;gap:12px;align-items:flex-start">'
      +'<div style="width:44px;height:44px;border-radius:14px;background:var(--sage7);border:1px solid rgba(116,198,157,.2);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">'+icono+'<\/div>'
      +'<div style="flex:1;min-width:0">'
      +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">'
      +'<span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:'+(msg.prioritario?'#7c3aed':'var(--ink4)')+'">'+remitente+'<\/span>'
      +'<span style="font-size:10px;color:var(--ink5)">'+msg.fecha+'<\/span>'
      +'<\/div>'
      +'<div style="font-size:13px;font-weight:'+(msg.leido?'500':'700')+';color:'+(msg.leido?'var(--ink4)':'var(--ink)')+';margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+titulo+'<\/div>'
      +'<div style="font-size:12px;color:var(--ink4);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.4">'+preview+'<\/div>'
      +botellaExtra
      +'<\/div><\/div>';

    list.appendChild(card);
  });
}

function openBuzonMsg(id){
  for(var i=0;i<buzonMensajes.length;i++){
    if(buzonMensajes[i].id===id){
      buzonMensajes[i].leido = true;
      break;
    }
  }
  _syncNotifStorage();
  updateBuzonDot();
  updateInboxBadge();
  renderBuzon();
}
function openBuzonDetail(id){
  var msg = null;
  for(var i=0;i<buzonMensajes.length;i++){
    if(buzonMensajes[i].id===id){ msg=buzonMensajes[i]; msg.leido=true; break; }
  }
  if(!msg) return;
  _syncNotifStorage(); updateBuzonDot(); updateInboxBadge();
  var titulo = msg.asunto || msg.titulo || 'Mensaje';
  var cuerpo = msg.cuerpo || msg.extracto || '';
  var icono = msg.icon || '📬';
  var remitente = msg.remitente || 'Velo';
  var det = document.getElementById('buzonDetailContent');
  if(det) det.innerHTML = '<div style="font-size:36px;margin-bottom:12px">'+icono+'<\/div>'
    +'<div style="font-size:10px;font-weight:700;color:var(--ink4);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">'+remitente+' · '+msg.fecha+'<\/div>'
    +'<div style="font-size:20px;font-weight:700;color:var(--ink);margin-bottom:16px;line-height:1.3">'+titulo+'<\/div>'
    +'<div style="font-size:14px;color:var(--ink2);line-height:1.75;white-space:pre-wrap">'+cuerpo+'<\/div>';
  goTo('buzon-detail');
  renderBuzon();
}

function buzonTab(tab){
  var panelVelo=document.getElementById('buzonPanelVelo');
  var panelPro=document.getElementById('buzonPanelPro');
  var tabVelo=document.getElementById('buzonTabVelo');
  var tabPro=document.getElementById('buzonTabPro');
  if(!panelVelo||!panelPro||!tabVelo||!tabPro)return;
  if(tab==='velo'){
    panelVelo.style.display='';panelPro.style.display='none';
    tabVelo.style.background='var(--sage2)';tabVelo.style.color='#fff';tabVelo.style.border='none';
    tabPro.style.background='#fff';tabPro.style.color='var(--ink4)';tabPro.style.border='1.5px solid var(--border)';
  }else{
    panelVelo.style.display='none';panelPro.style.display='';
    tabPro.style.background='var(--sage2)';tabPro.style.color='#fff';tabPro.style.border='none';
    tabVelo.style.background='#fff';tabVelo.style.color='var(--ink4)';tabVelo.style.border='1.5px solid var(--border)';
  }
}

// ── BOTELLAS: cuando se responde, va al buzón del autor ──
function responderBotella_buzon(botellaId, textoRespuesta){
  var botella = null;
  for(var i=0;i<bottleWall.length;i++){
    if(bottleWall[i].id===botellaId){ botella=bottleWall[i]; break; }
  }
  if(!botella) return;
  botella.answered = true;
  _saveBottleWall();
  renderBottleWall();
  addBuzonMsg({
    id:'bottle-r-'+Date.now(),
    tipo:'botella',
    icon:'🍾',
    titulo:'¡Tu botella fue respondida!',
    cuerpo:'Alguien encontró tu mensaje en el mar y quiso responderte:\n\n"'+textoRespuesta+'"',
    leido:false,
    fecha:new Date().toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'})
  });
  updateBuzonDot(); updateInboxBadge();
  closeBottleReply();
  showSuc('🌊','Botella recogida','Tu respuesta fue enviada. El remitente la verá en su buzón de Velo 🍾');
}





// ══ SALA DE AYUDA — Solicitudes Activas ══════════════════
var solicitudesActivas = [
  {id:'s1', emoji:'😔', nombre:'Anonima', msg:'No se por que pero hoy me desperte con una tristeza enorme. Alguien puede escucharme?', anonimo:true, tiempo:'hace 3 min'},
  {id:'s2', emoji:'😶', nombre:'Marcos',  msg:'Tengo una decision importante y no se a quien pedirle consejo.', anonimo:false, tiempo:'hace 11 min'}
];


function aceptarSolicitud(id){
  solicitudesActivas = solicitudesActivas.filter(function(s){ return s.id !== id; });
  renderSolicitudes();
}

function renderSolicitudes(){
  var container = document.getElementById('solicitudesList');
  if(!container) return;
  container.innerHTML = '<div class="shimmer-card"><div class="shimmer-line"></div><div class="shimmer-line w60"></div></div>';
  setTimeout(function(){
    container.innerHTML = '';
    if(solicitudesActivas.length === 0){
      container.innerHTML = '<div style="text-align:center;padding:30px;font-size:13px;color:#aaa;font-style:italic">No hay solicitudes activas ahora. 🌿<\/div>';
      return;
    }
    solicitudesActivas.forEach(function(sol){
      var card = document.createElement('div');
      card.className='dark-seeker';
      card.style.cssText = 'background:#fff;border:1.5px solid rgba(116,198,157,.2);border-left:4px solid var(--sage2);border-radius:18px;padding:16px;margin-bottom:10px;box-shadow:0 2px 12px rgba(45,106,79,.06);animation:waveIn .35s ease both';
      card.innerHTML =
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">'
        +'<span style="font-size:22px">'+sol.emoji+'<\/span>'
        +'<div style="flex:1">'
        +'<div style="font-size:12px;font-weight:700;color:var(--sage)">'+sol.nombre+'<\/div>'
        +'<div style="font-size:10px;color:#aaa">'+sol.tiempo+' · '+(sol.anonimo?'Anónimo/a':'Público')+'<\/div>'
        +'<\/div>'
        +'<\/div>'
        +'<div style="font-style:italic;font-size:13px;color:var(--ink2);line-height:1.6;margin-bottom:14px">"'+sol.msg+'"<\/div>'
        +'<div style="display:flex;gap:8px">'
        +'<button onclick="aceptarAyuda(\''+sol.id+'\')" style="width:100%;padding:10px;background:var(--sage2);border:none;border-radius:100px;color:#fff;font-size:12px;font-weight:700;cursor:pointer;font-family:\'Jost\',sans-serif">Acompañar 💚<\/button>'
        +'<\/div>';
      container.appendChild(card);
    });
  }, 200);
}

// ── FIXES SOBRE v98 ──────────────────────────────────────────
function closeWelcomeBack(d){var w=document.getElementById('welcomeBack');if(w)w.style.display='none';goTo('home');}
function closeDonThanks(){var d2=document.getElementById('donThanks');if(d2)d2.style.display='none';}
function togMonthly(){var d3=document.getElementById('monthlyDetail');if(!d3)return;d3.style.display=d3.style.display==='block'?'none':'block';}

// ── SALA DE AYUDA ─────────────────────────────────────────────
var _helpAnonActivo = false;
var _helpTopicSel = '';
function openHelpSheet(){
  var sheet=document.getElementById('helpFormSheet');
  if(!sheet)return;
  var msg=document.getElementById('helpMsg');
  if(msg){
    msg.value='';
    msg.oninput=function(){
      var c=document.getElementById('helpMsgCount');
      if(c)c.textContent=msg.value.length;
    };
  }
  var cnt=document.getElementById('helpMsgCount');if(cnt)cnt.textContent='0';
  _helpAnonActivo=false;_helpTopicSel='';
  var tog=document.getElementById('helpAnonToggle');if(tog)tog.style.background='#ccc';
  var knob=document.getElementById('helpAnonKnob');if(knob)knob.style.left='3px';
  var btns=document.querySelectorAll('#helpTopics button');
  for(var bi=0;bi<btns.length;bi++){btns[bi].style.borderColor='#cde0d5';btns[bi].style.background='#fff';btns[bi].style.color='#555';}
  sheet.style.display='flex';
  setTimeout(function(){var m=document.getElementById('helpMsg');if(m)m.focus();},300);
}
function closeHelpSheet(){var sh=document.getElementById('helpFormSheet');if(sh)sh.style.display='none';}
function openHelpForm(){openHelpSheet();}
function togHelpAnon(){
  _helpAnonActivo=!_helpAnonActivo;
  var tog=document.getElementById('helpAnonToggle');if(tog)tog.style.background=_helpAnonActivo?'#52b788':'#ccc';
  var knob=document.getElementById('helpAnonKnob');if(knob)knob.style.left=_helpAnonActivo?'21px':'3px';
}
function publicarSolicitud(){
  if(!canPostHelpWall()){showHelpLimitModal();return;}
  var msgEl=document.getElementById('helpMsg');
  var msg=msgEl?msgEl.value.trim():'';
  if(!msg){toast('✍️','Escribí un mensaje');return;}
  moderateContent(msg).then(function(ok){
    if(!ok) return;
    var isAnon=isIncognitoActive()||_helpAnonActivo;
    solicitudesActivas.unshift({
      id:'sol-'+Date.now(),
      emoji:isAnon?'🕶️':'😔',
      nombre:isAnon?'Anonima':getDisplayName(),
      anonimo:isAnon,
      tema:_helpTopicSel||'General',
      msg:msg,
      tiempo:'ahora'
    });
    incrementHelpWallCount();
    closeHelpSheet();
    renderSolicitudes();
    var remaining=canPostHelpWall()?FREE_HELP_LIMIT-getHelpWallCount():0;
    var suffix=!isPremiumUser()&&remaining>=0?' ('+remaining+' publicación'+(remaining!==1?'es':'')+' gratuita'+(remaining!==1?'s':'')+' restante'+(remaining!==1?'s':'')+')':'';
    toast(isAnon?'🕶️':'✅',isAnon?'Publicado en modo incógnito':'Tu solicitud está en el muro'+suffix);
  });
}
function aceptarAyuda(solId){
  var sol=null;
  for(var ai=0;ai<solicitudesActivas.length;ai++){if(solicitudesActivas[ai].id===solId){sol=solicitudesActivas[ai];break;}}
  if(!sol)return;
  solicitudesActivas=solicitudesActivas.filter(function(sx){return sx.id!==solId;});
  renderSolicitudes();
  var hc=document.getElementById('helpCount');if(hc)hc.textContent=solicitudesActivas.length+' ahora';
  closeHelpSheet();
  setTimeout(function(){ openHelperChat(sol.anonimo?'Anónimo/a':sol.nombre,sol.emoji,sol.msg,null); },100);
}

// ── EDICION DE CAMPOS CALM ────────────────────────────────────
var _editTarget='';
var _editSync='';
function openEditModal(campo,titulo,targetId){
  var syncMap={cancion:'recCancion',pelicula:'recPelicula',libro:'recLibro'};
  _editTarget=targetId||'';
  _editSync=syncMap[campo]||'';
  var modal=document.getElementById('editCalmModal');
  var inp=document.getElementById('editCalmInput');
  var ttl=document.getElementById('editCalmTitle');
  if(!modal||!inp)return;
  var el=document.getElementById(targetId||'');
  var cur=el?el.textContent:'';
  if(cur.length>0&&cur.charAt(0)==='"')cur=cur.slice(1);
  if(cur.length>0&&cur.charAt(cur.length-1)==='"')cur=cur.slice(0,-1);
  if(ttl)ttl.textContent=titulo||'Editar';
  inp.value=cur;
  modal.style.display='flex';
  setTimeout(function(){inp.focus();},250);
}
function closeEditModal(){var modal=document.getElementById('editCalmModal');if(modal)modal.style.display='none';_editTarget='';_editSync='';}
function saveEditModal(){
  var inp=document.getElementById('editCalmInput');if(!inp)return;
  var val=inp.value.trim();if(!val){toast('Escribi algo');return;}
  if(_editTarget){var el=document.getElementById(_editTarget);if(el)el.textContent=val;safeLS('set','velo_calm_'+_editTarget,val);}
  if(_editSync){var rec=document.getElementById(_editSync);if(rec)rec.textContent=val;safeLS('set','velo_calm_'+_editSync,val);}
  closeEditModal();toast('Guardado');
}
function loadCalmData(){
  var fields=['calmMensaje','calmAliento','calmCancion','calmPelicula','calmLibro'];
  var syncs={calmCancion:'recCancion',calmPelicula:'recPelicula',calmLibro:'recLibro'};
  for(var fi=0;fi<fields.length;fi++){
    var fid=fields[fi];var saved=safeLS('get','velo_calm_'+fid);
    if(saved){var el=document.getElementById(fid);if(el)el.textContent=saved;if(syncs[fid]){var rec=document.getElementById(syncs[fid]);if(rec)rec.textContent=saved;}}
  }
}

// ── PERFIL: INSIGNIAS + RESENAS ──────────────────────────────
var profileReviews = [];
var _profileReviewsDefaults = [
  {stars:5,tags:['Sabe escuchar','Sin juzgarme'],comment:'Fue exactamente lo que necesitaba. Gracias.',date:'15 de mayo de 2026'},
  {stars:5,tags:['Palabras de aliento'],comment:'Me ayudo a ver las cosas diferente.',date:'14 de mayo de 2026'},
  {stars:4,tags:['Buen consejo'],comment:'Muy paciente y comprensivo.',date:'12 de mayo de 2026'},
  {stars:5,tags:['Sabe escuchar'],comment:'Gracias por tu tiempo.',date:'4 de mayo de 2026'},
  {stars:5,tags:['Sin juzgarme'],comment:'',date:'2 de mayo de 2026'}
];
var totalCharlas = 47;
function loadProfileData(){
  // Load saved name
  var savedName = safeLS('get','velo_user_name');
  if(savedName){
    var nameEl = document.getElementById('profileNameDisplay');
    if(nameEl) nameEl.textContent = savedName;
  }
  // Load saved avatar
  var savedAv = safeLS('get','velo_user_avatar');
  if(savedAv){
    var avEl = document.getElementById('profileAvDisplay');
    if(avEl){ var dot = document.getElementById('profileDot'); avEl.textContent = savedAv; if(dot) avEl.appendChild(dot); }
  }
  // Load calm data
  var map={calmMensaje:'profMensaje',calmAliento:'profAliento',calmCancion:'profCancion',calmPelicula:'profPelicula',calmLibro:'profLibro'};
  var keys=['calmMensaje','calmAliento','calmCancion','calmPelicula','calmLibro'];
  for(var ki=0;ki<keys.length;ki++){var k=keys[ki];var saved=safeLS('get','velo_calm_'+k);if(saved){var el=document.getElementById(map[k]);if(el)el.textContent=saved;}}
  // Sync today's mood to profile
  var moodKey='velo_mood_'+new Date().toISOString().slice(0,10);
  var moodSaved=safeLS('get',moodKey);
  if(moodSaved){try{var m=JSON.parse(moodSaved);var moodDisp=document.getElementById('profMoodToday');if(moodDisp)moodDisp.textContent=m.emoji+' '+m.label;}catch(e){}}
  _loadNotifStorage();
  updateInboxBadge();
  renderProfileBadges();
  renderProfileReviews();
  applyIncognitoUI(isIncognitoActive());
  // Update plan section
  var chip = document.getElementById('profilePlanChip');
  var planBtnEl = document.getElementById('profilePlanBtn');
  var cancelBtnEl = document.getElementById('profileCancelBtn');
  if(isPremiumUser()){
    if(chip) chip.innerHTML = '<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;background:linear-gradient(135deg,var(--sage),var(--sage2));border-radius:100px;color:#fff;font-size:11px;font-weight:700">💎 Velo Plus · Activo</span>';
    if(planBtnEl) planBtnEl.style.display = 'none';
    if(cancelBtnEl) cancelBtnEl.style.display = '';
  } else {
    if(chip) chip.innerHTML = '<span style="font-size:12px;font-weight:600;color:var(--ink4)">Velo Free</span>';
    if(planBtnEl){ planBtnEl.style.display = ''; planBtnEl.textContent = 'Ver Velo Plus →'; }
    if(cancelBtnEl) cancelBtnEl.style.display = 'none';
  }
}
function renderProfileBadges(){
  var charlas=totalCharlas;
  var badges=['bronce','plata','oro','diamante'];
  var thresholds=[5,20,40,100];
  var badgeLabels={bronce:'Bronce',plata:'Plata',oro:'Oro',diamante:'Diamante'};
  var badgeEmojis={bronce:'🥉',plata:'🥈',oro:'🥇',diamante:'💎'};
  var highestBadge=null;

  for(var bi=0;bi<badges.length;bi++){
    var name=badges[bi];
    var threshold=thresholds[bi];
    var unlocked=charlas>=threshold;
    var card=document.getElementById('badge-'+name);
    var st=document.getElementById('badge-'+name+'-st');
    if(card) card.style.opacity=unlocked?'1':'0.45';
    if(st) st.textContent=unlocked?'Obtenida':'Faltan '+(threshold-charlas)+' charlas';
    if(unlocked) highestBadge=name;
  }

  // Actualizar statCharlas
  var sc=document.getElementById('statCharlas');
  if(sc) sc.textContent=charlas;

  // Actualizar hero badge en el perfil
  var heroTag=document.getElementById('profileBadgeTag');
  if(heroTag&&highestBadge){
    var colors={
      bronce:'rgba(180,120,60,.14),rgba(180,120,60,.06)',
      plata:'rgba(150,150,160,.14),rgba(150,150,160,.06)',
      oro:'rgba(200,146,10,.14),rgba(200,146,10,.06)',
      diamante:'rgba(80,160,230,.12),rgba(100,80,200,.08)'
    };
    var textColors={bronce:'#8B5E3C',plata:'#6B7280',oro:'var(--gold)',diamante:'#5A9DC0'};
    heroTag.textContent=badgeEmojis[highestBadge]+' Guardiana '+badgeLabels[highestBadge];
    heroTag.style.background='linear-gradient(135deg,'+colors[highestBadge]+')';
    heroTag.style.color=textColors[highestBadge];
  }

  // Conectar hasGoldBadge globalmente (para tryCreateCircle)
  hasGoldBadge=(charlas>=thresholds[2]);
  safeLS('set','velo_can_create_group',hasGoldBadge?'1':'0');

  // Proxima insignia
  var next=document.getElementById('nextBadgeInfo');
  if(next){
    var nextBadge=null;
    for(var ni=0;ni<thresholds.length;ni++){
      if(charlas<thresholds[ni]){
        nextBadge={name:badges[ni],need:thresholds[ni]-charlas,emoji:badgeEmojis[badges[ni]]};
        break;
      }
    }
    if(nextBadge){
      next.innerHTML=nextBadge.emoji+' Proxima: <b>'+badgeLabels[nextBadge.name]+'</b> · faltan <b>'+nextBadge.need+' charlas</b>';
    } else {
      next.innerHTML='<b>🏆 Sos referente de Velo. Todas las insignias obtenidas.</b>';
    }
  }

  var sr=document.getElementById('statResenas');
  if(sr)sr.textContent=profileReviews.length||0;

  var sr=document.getElementById('statResenas');
  if(sr)sr.textContent=profileReviews?profileReviews.length:0;
}
function renderProfileReviews(){
  var c=document.getElementById('profileReviews');
  if(!c)return;
  if(!profileReviews||!profileReviews.length){
    c.innerHTML='<div style="padding:20px 16px;text-align:center;font-size:12px;color:var(--ink4);font-style:italic">Aun no tenes resenas. Segui acompanando!</div>';
    return;
  }
  var preview=profileReviews.slice(0,5);
  var total=profileReviews.length;
  var h='';
  for(var ri=0;ri<preview.length;ri++){
    var rev=preview[ri];
    var stars='';
    for(var si=0;si<5;si++)stars+=si<(rev.stars||5)?'&#9733;':'&#9734;';
    var tagsHtml='';
    if(rev.tags&&rev.tags.length){
      tagsHtml='<div style="display:flex;flex-wrap:wrap;gap:4px;margin:5px 0">';
      for(var ti=0;ti<rev.tags.length;ti++){
        tagsHtml+='<span style="font-size:10px;padding:2px 8px;border-radius:100px;background:var(--sage7);color:var(--sage2)">'+rev.tags[ti]+'</span>';
      }
      tagsHtml+='</div>';
    }
    var row='<div style="padding:13px 16px;border-bottom:1px solid var(--border)">';
    row+='<div style="display:flex;justify-content:space-between;align-items:center">';
    row+='<div style="font-size:15px;color:#f4b942">'+stars+'</div>';
    row+=(rev.date?'<div style="font-size:10px;color:var(--ink5)">'+rev.date+'</div>':'');
    row+='</div>';
    row+=tagsHtml;
    row+=(rev.comment?'<div style="font-size:13px;color:var(--ink3);margin-top:5px;font-style:italic">"'+rev.comment+'"</div>':'');
    row+='</div>';
    h+=row;
  }
  if(total>5){
    h+='<div onclick="openAllReviews()" style="padding:14px 16px;text-align:center;cursor:pointer;color:var(--sage2);font-size:13px;font-weight:700">Ver todas las resenas ('+(total-5)+' mas) →</div>';
  }
  c.innerHTML=h;
}
function addProfileReview(stars,tags,comment){
  var now=new Date();
  var dateStr=now.toLocaleDateString('es-AR',{day:'numeric',month:'long',year:'numeric'});
  var name=isIncognitoActive()?'Anonima':getDisplayName();
  profileReviews.unshift({
    stars:stars||5,
    tags:tags||[],
    comment:comment||'',
    date:dateStr,
    author:name
  });
  safeLS('set','velo_reviews',JSON.stringify(profileReviews.slice(0,100)));
  totalCharlas++;
  safeLS('set','velo_charlas',String(totalCharlas));
  checkAndAwardBadge(totalCharlas);
}
function checkAndAwardBadge(n){
  var thresholds={bronce:5,plata:20,oro:40,diamante:100};
  var names={bronce:'Bronce',plata:'Plata',oro:'Oro',diamante:'Diamante'};
  var order=['bronce','plata','oro','diamante'];
  for(var oi=0;oi<order.length;oi++){
    var key=order[oi];
    if(n>=thresholds[key]){
      var prev=parseInt(safeLS('get','velo_badge_'+key)||'0',10);
      if(prev<thresholds[key]){
        safeLS('set','velo_badge_'+key,String(thresholds[key]));
        addBuzonMsg({id:'badge-'+key+Date.now(),tipo:'sistema',remitente:'Velo Comunidad',asunto:'Insignia '+names[key]+' desbloqueada',extracto:'Felicitaciones por tu aporte a la comunidad.',fecha:'Hoy',leido:false});
        if(key==='oro'){setTimeout(function(){addBuzonMsg({id:'perm'+Date.now(),tipo:'sistema',remitente:'Velo Comunidad',asunto:'Podes crear grupos en Circulos de Paz',extracto:'Con tu insignia Oro tenes este acceso.',fecha:'Hoy',leido:false});},1500);}
      }
    }
  }
}
function loadProfileReviewsFromStorage(){
  var saved=safeLS('get','velo_reviews');
  if(saved){
    try{profileReviews=JSON.parse(saved);}catch(ex){profileReviews=_profileReviewsDefaults.slice();}
  } else {
    profileReviews=_profileReviewsDefaults.slice();
  }
  var ch=safeLS('get','velo_charlas');
  if(ch) totalCharlas=parseInt(ch,10)||47;
  var saved2=safeLS('get','velo_circles');
  if(saved2){try{userCircles=JSON.parse(saved2);}catch(ex){userCircles=[];}}
  hasGoldBadge=(totalCharlas>=40);
  safeLS('set','velo_can_create_group',hasGoldBadge?'1':'0');
}

// ── ENCUESTA MEJORADA ─────────────────────────────────────────
function saveMoodHistory(emoji,label){
  var key='velo_mood_'+new Date().toISOString().slice(0,10);
  safeLS('set',key,JSON.stringify({emoji:emoji,label:label,date:new Date().toISOString().slice(0,10)}));
}

function openAllReviews(){
  if(!profileReviews||!profileReviews.length){
    toast('Aun no tenes resenas. Segui acompanando!');
    return;
  }
  var cnt=document.getElementById('allReviewsCount');
  var avgDiv=document.getElementById('allReviewsStars');
  var total=profileReviews.length;
  if(cnt)cnt.textContent=total+(total===1?' resena en total':' resenas en total');
  if(avgDiv&&total){
    var avg=0;
    for(var ai=0;ai<total;ai++)avg+=profileReviews[ai].stars||5;
    avg=Math.round(avg/total*10)/10;
    avgDiv.textContent=avg+' ★ promedio';
  }
  var list=document.getElementById('allReviewsList');
  if(!list){goTo('all-reviews');return;}
  var h='';
  for(var ri=0;ri<total;ri++){
    var rev=profileReviews[ri];
    var stars='';
    for(var si=0;si<5;si++)stars+=si<(rev.stars||5)?'&#9733;':'&#9734;';
    var tagsHtml='';
    if(rev.tags&&rev.tags.length){
      tagsHtml='<div style="display:flex;flex-wrap:wrap;gap:4px;margin:6px 0">';
      for(var ti=0;ti<rev.tags.length;ti++){
        tagsHtml+='<span style="font-size:10px;padding:2px 8px;border-radius:100px;background:var(--sage7);color:var(--sage2);border:1px solid rgba(116,198,157,.2)">'+rev.tags[ti]+'</span>';
      }
      tagsHtml+='</div>';
    }
    var row='<div style="padding:15px 18px;border-bottom:1px solid var(--border);background:'+(ri%2===0?'#fff':'rgba(248,252,249,.6)')+'">';
    row+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">';
    row+='<div style="font-size:17px;color:#f4b942;letter-spacing:2px">'+stars+'</div>';
    row+=(rev.date?'<div style="font-size:10px;color:var(--ink5)">'+rev.date+'</div>':'');
    row+='</div>';
    row+=tagsHtml;
    row+=(rev.comment?'<div style="font-size:13px;color:var(--ink2);line-height:1.6;font-style:italic;margin-top:4px">"'+rev.comment+'"</div>':'');
    row+='</div>';
    h+=row;
  }
  list.innerHTML=h;
  goTo('all-reviews');
}

// ══ SISTEMA DE CIRCULOS DE PAZ ═══════════════════════════════

var userCircles=[];

















// goTo feed hook renderiza myCircles via setTimeout

// ══ SISTEMA CÍRCULOS DE PAZ — COMPLETO ═══════════════════════

var MAX_CIRCLE_MEMBERS = 15;
var selectedCircleIcon = '🌿';
var currentCircleId = null;
var currentCircleIsOwner = false;

// Cargar círculos de comunidad desde localStorage
var userCircles = [];

// Persistir
function saveCircles(){
  safeLS('set','velo_circles',JSON.stringify(userCircles));
}

// ── ICON PICKER ───────────────────────────────────────────────
function selCircleIcon(el){
  var all=document.querySelectorAll('#circleIconPicker span');
  for(var i=0;i<all.length;i++){
    all[i].style.background='rgba(255,255,255,.7)';
    all[i].style.borderColor='var(--border)';
  }
  el.style.background='var(--sage7)';
  el.style.borderColor='var(--sage2)';
  selectedCircleIcon=el.textContent.trim();
}

// ── CREAR CÍRCULO ─────────────────────────────────────────────
function confirmCreateCircle(){
  var nameEl=document.getElementById('newCircleName');
  var descEl=document.getElementById('newCircleDesc');
  if(!nameEl||!nameEl.value.trim()){toast('Pone un nombre al circulo');return;}
  var circle={
    id:'uc-'+Date.now(),
    name:nameEl.value.trim(),
    desc:descEl?descEl.value.trim():'',
    icon:selectedCircleIcon||'🌿',
    createdBy:'yo',
    createdAt:new Date().toLocaleDateString('es-AR',{day:'numeric',month:'long',year:'numeric'}),
    members:1,
    maxMembers:MAX_CIRCLE_MEMBERS,
    full:false
  };
  userCircles.unshift(circle);
  saveCircles();
  document.getElementById('createCircleModal').style.display='none';
  if(nameEl)nameEl.value='';
  if(descEl)descEl.value='';
  selectedCircleIcon='🌿';
  renderCommunityCircles();
  showSuc('✨','Circulo creado!','Tu circulo es visible para toda la comunidad. Hasta '+MAX_CIRCLE_MEMBERS+' personas pueden unirse.');
  setTimeout(function(){
    enterCircle(circle.id);
  },1800);
}

// ── ENTRAR AL CÍRCULO ─────────────────────────────────────────
function enterCircle(circleId){
  // Buscar en userCircles primero, sino es círculo oficial
  var circle=null;
  for(var i=0;i<userCircles.length;i++){
    if(userCircles[i].id===circleId){circle=userCircles[i];break;}
  }

  if(circle){
    // Círculo de usuario — verificar capacidad
    if(circle.full && circle.createdBy!=='yo'){
      showSuc('🚫','Sala completa','Este circulo ya tiene '+MAX_CIRCLE_MEMBERS+' personas. Intenta mas tarde cuando alguien salga.');
      return;
    }
    // Sumar miembro si no es el creador
    if(circle.createdBy!=='yo'){
      circle.members=Math.min((circle.members||1)+1, MAX_CIRCLE_MEMBERS);
      circle.full=(circle.members>=MAX_CIRCLE_MEMBERS);
      saveCircles();
      renderCommunityCircles();
    }
    currentCircleId=circleId;
    currentCircleIsOwner=(circle.createdBy==='yo');
    openCircleChat(circle.name,circle.icon,'var(--gold)',circle.members,circle.maxMembers,true);
  } else {
    // Círculo oficial — siempre accesible, no hay límite real en prototipo
    currentCircleId=circleId;
    currentCircleIsOwner=false;
    // Extraer datos del nombre pasado (compatibilidad con onclick legacy)
    openCircleChat(circleId,'🌿','var(--sage2)',1,null,false);
  }
}

// Compatibilidad con los onclick de círculos oficiales (pasan name directamente)
function enterCircleLegacy(name,icon,dotColor,count){
  currentCircleId=null;
  currentCircleIsOwner=false;
  openCircleChat(name,icon,dotColor,parseInt(count)||1,null,false);
}

function openCircleChat(name,icon,dotColor,members,maxMembers,isUserCircle){
  var nameEl=document.getElementById('circleName');
  var avEl=document.getElementById('circleAv');
  var cntEl=document.getElementById('circleCount');
  var dotEl=document.getElementById('circleDot');
  var banner=document.getElementById('circleRulesBanner');
  var ownerBtn=document.getElementById('circleCreatorBtn');
  var capacityBar=document.getElementById('circleCapacityBar');

  if(nameEl)nameEl.textContent=name;
  if(avEl)avEl.textContent=icon;
  if(dotEl)dotEl.style.background=dotColor||'var(--sage2)';
  if(banner)banner.style.display='flex';
  if(ownerBtn)ownerBtn.style.display=currentCircleIsOwner?'block':'none';

  // Barra de capacidad
  if(capacityBar&&isUserCircle&&maxMembers){
    var pct=Math.round((members/maxMembers)*100);
    capacityBar.style.display='block';
    capacityBar.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">'
      +'<span style="font-size:10px;color:var(--ink4)">Capacidad</span>'
      +'<span style="font-size:10px;font-weight:700;color:'+(members>=maxMembers?'#c0392b':'var(--sage2)')+'">'+members+'/'+maxMembers+'</span>'
      +'</div>'
      +'<div style="height:4px;background:rgba(0,0,0,.08);border-radius:100px">'
      +'<div style="height:100%;border-radius:100px;background:'+(members>=maxMembers?'#e74c3c':'var(--sage2)')+';width:'+pct+'%;transition:width .3s"></div>'
      +'</div>';
    if(cntEl)cntEl.textContent=members+' de '+maxMembers+' personas';
  } else {
    if(capacityBar)capacityBar.style.display='none';
    if(cntEl)cntEl.textContent=(members||'—')+' personas activas';
  }

  // Limpiar mensajes y poner bienvenida
  var msgs=document.getElementById('circleMsgs');
  if(msgs){
    msgs.innerHTML='<div style="text-align:center;padding:8px 0">'
      +'<span style="font-size:11px;color:var(--ink4);background:rgba(255,255,255,.7);padding:4px 13px;border-radius:100px;border:1px solid var(--border)">💚 Bienvenido/a a '+name+'</span>'
      +'</div>';
  }
  goTo('circles');
}

// ── SALIR DEL CÍRCULO ─────────────────────────────────────────
function leaveCircle(){
  if(currentCircleId){
    // Restar miembro si no es el creador
    for(var i=0;i<userCircles.length;i++){
      if(userCircles[i].id===currentCircleId){
        if(userCircles[i].createdBy!=='yo'){
          userCircles[i].members=Math.max(1,(userCircles[i].members||1)-1);
          userCircles[i].full=(userCircles[i].members>=MAX_CIRCLE_MEMBERS);
        }
        break;
      }
    }
    saveCircles();
  }
  currentCircleId=null;
  currentCircleIsOwner=false;
  goTo('feed');
  setTimeout(function(){renderCommunityCircles();},100);
}

// ── ELIMINAR CÍRCULO (solo creador) ──────────────────────────
function deleteMyCircle(){
  if(!currentCircleId){leaveCircle();return;}
  userCircles=userCircles.filter(function(c){return c.id!==currentCircleId;});
  saveCircles();
  currentCircleId=null;
  currentCircleIsOwner=false;
  goTo('feed');
  setTimeout(function(){renderCommunityCircles();toast('🌿','Círculo eliminado');},200);
}

// ── RENDERIZAR CÍRCULOS DE COMUNIDAD EN EL FEED ──────────────
function renderMyCircles(){renderCommunityCircles();}
function renderCommunityCircles(){
  var grid=document.getElementById('circlesCommunityGrid');
  if(!grid)return;

  // Mantener los círculos fijos del HTML (los que tienen class="circle-card" y NO tienen data-user)
  // y agregar los de usuario dinámicamente al inicio
  var existingFixed=grid.querySelectorAll('.circle-card[data-fixed="true"]');
  // Eliminar solo los dinámicos (data-user)
  var existingDynamic=grid.querySelectorAll('.circle-card[data-user="true"]');
  for(var di=0;di<existingDynamic.length;di++){
    existingDynamic[di].parentNode.removeChild(existingDynamic[di]);
  }

  // Insertar círculos de usuario al principio del grid
  var firstFixed=grid.querySelector('.circle-card[data-fixed="true"]');

  for(var ci=userCircles.length-1;ci>=0;ci--){
    var circle=userCircles[ci];
    var card=createCommunityCircleCard(circle);
    if(firstFixed){
      grid.insertBefore(card,firstFixed);
    } else {
      grid.appendChild(card);
    }
  }

  // Actualizar sección "Mis Círculos" en sidebar
  renderMyCirclesSidebar();
}

function createCommunityCircleCard(circle){
  var card=document.createElement('div');
  card.className='circle-card';
  card.setAttribute('data-name',circle.name);
  card.setAttribute('data-user','true');

  var isFull=circle.full||(circle.members>=MAX_CIRCLE_MEMBERS);
  var pct=Math.min(100,Math.round(((circle.members||1)/MAX_CIRCLE_MEMBERS)*100));

  card.style.cssText='background:linear-gradient(135deg,rgba(255,255,255,.9),rgba(234,247,238,.7));'
    +'border:1.5px solid '+(isFull?'rgba(192,48,40,.25)':'rgba(116,198,157,.25)')+';'
    +'border-left:4px solid '+(isFull?'#e74c3c':'var(--gold)')+';'
    +'border-radius:22px;padding:14px;cursor:pointer;position:relative;box-shadow:var(--sh)';

  var inner='<div style="font-size:28px;margin-bottom:6px">'+circle.icon+'</div>'
    +'<div style="font-size:12px;font-weight:700;color:var(--ink);margin-bottom:2px;line-height:1.3">'+circle.name+'</div>'
    +(circle.desc?'<div style="font-size:10px;color:var(--ink4);margin-bottom:6px;line-height:1.4">'+circle.desc+'</div>':'')
    +'<div style="font-size:9px;font-weight:700;color:var(--gold);margin-bottom:4px">🥇 Creado por Guardian</div>'
    +'<div style="font-size:10px;color:'+(isFull?'#c0392b':'var(--ink4)')+';margin-bottom:6px">'
    +circle.members+'/'+MAX_CIRCLE_MEMBERS+' personas'+(isFull?' · <b>LLENO</b>':'')
    +'</div>'
    +'<div style="height:3px;background:rgba(0,0,0,.07);border-radius:100px;margin-bottom:8px">'
    +'<div style="height:100%;border-radius:100px;background:'+(isFull?'#e74c3c':'var(--sage2)')+';width:'+pct+'%"></div>'
    +'</div>';

  if(circle.createdBy==='yo'){
    inner+='<div style="display:flex;gap:6px">'
      +'<div style="flex:1;padding:6px;background:var(--sage7);border-radius:100px;text-align:center;font-size:10px;font-weight:700;color:var(--sage2)">Entrar</div>'
      +'<div onclick="event.stopPropagation();confirmDeleteCircle(\''+circle.id+'\')" style="padding:6px 10px;background:rgba(192,48,40,.08);border:1px solid rgba(192,48,40,.2);border-radius:100px;font-size:10px;font-weight:700;color:#c0392b">Eliminar</div>'
      +'</div>';
  } else if(isFull){
    inner+='<div style="padding:6px;background:rgba(192,48,40,.08);border-radius:100px;text-align:center;font-size:10px;font-weight:700;color:#c0392b">Sala completa</div>';
  } else {
    inner+='<div style="padding:6px;background:var(--sage7);border-radius:100px;text-align:center;font-size:10px;font-weight:700;color:var(--sage2)">Unirme</div>';
  }

  card.innerHTML=inner;
  (function(cid,full,owner){
    card.onclick=function(){
      if(full&&!owner){
        showSuc('🚫','Sala completa','Este circulo ya tiene '+MAX_CIRCLE_MEMBERS+' personas. Espera a que alguien salga.');
        return;
      }
      enterCircle(cid);
    };
  })(circle.id,isFull,circle.createdBy==='yo');

  return card;
}

function confirmDeleteCircle(circleId){
  userCircles=userCircles.filter(function(c){return c.id!==circleId;});
  saveCircles();
  renderCommunityCircles();
  toast('🌿','Círculo eliminado');
}

// ── MIS CÍRCULOS — sidebar pequeño ───────────────────────────
function renderMyCirclesSidebar(){
  var section=document.getElementById('myCirclesSection');
  var list=document.getElementById('myCirclesList');
  if(!section||!list)return;
  var mine=userCircles.filter(function(c){return c.createdBy==='yo';});
  section.style.display=mine.length?'block':'none';
  if(!mine.length)return;
  list.innerHTML='';
  mine.forEach(function(circle){
    var row=document.createElement('div');
    row.style.cssText='display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(255,255,255,.8);border:1.5px solid rgba(116,198,157,.2);border-radius:14px;margin-bottom:6px;cursor:pointer';
    var inner='<div style="font-size:20px">'+circle.icon+'</div>';
    inner+='<div style="flex:1"><div style="font-size:12px;font-weight:700;color:var(--ink)">'+circle.name+'</div>';
    inner+='<div style="font-size:10px;color:var(--sage2)">'+circle.members+'/'+MAX_CIRCLE_MEMBERS+' · Tuyo</div></div>';
    inner+='<div style="font-size:16px;color:var(--ink5)">&#8250;</div>';
    row.innerHTML=inner;
    (function(cid){row.onclick=function(){enterCircle(cid);};})(circle.id);
    list.appendChild(row);
  });
}

function loadGuardianDetailReviews(){
  var list=document.getElementById('gdReviewsList');
  if(!list)return;
  var reviews=profileReviews.slice(0,5);
  if(!reviews.length){
    list.innerHTML='<div style="padding:16px;text-align:center;font-size:12px;color:var(--ink4);font-style:italic">Aun no tiene resenas.</div>';
    return;
  }
  var h='';
  for(var ri=0;ri<reviews.length;ri++){
    var rev=reviews[ri];
    var stars='';
    for(var si=0;si<5;si++)stars+=si<(rev.stars||5)?'&#9733;':'&#9734;';
    var row='<div style="padding:12px 14px;border-bottom:1px solid var(--border)">';
    row+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">';
    row+='<div style="font-size:14px;color:#f4b942">'+stars+'</div>';
    row+=(rev.date?'<div style="font-size:9px;color:var(--ink5)">'+rev.date+'</div>':'');
    row+='</div>';
    if(rev.tags&&rev.tags.length){
      row+='<div style="display:flex;flex-wrap:wrap;gap:3px;margin:4px 0">';
      for(var ti=0;ti<rev.tags.length;ti++){
        row+='<span style="font-size:9px;padding:2px 7px;border-radius:100px;background:var(--sage7);color:var(--sage2)">'+rev.tags[ti]+'</span>';
      }
      row+='</div>';
    }
    row+=(rev.comment?'<div style="font-size:12px;color:var(--ink3);font-style:italic;line-height:1.5">"'+rev.comment+'"</div>':'');
    row+='</div>';
    h+=row;
  }
  if(profileReviews.length>5){
    h+='<div style="padding:12px 14px;text-align:center;font-size:11px;color:var(--ink4)">... y '+(profileReviews.length-5)+' resenas mas</div>';
  }
  list.innerHTML=h;
}
