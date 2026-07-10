const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');
const crypto = require('crypto');

// Pub key hardcoded — la vive en el cliente igual (viaja en applicationServerKey).
// Hardcodearla acá elimina el modo de falla en que el env var quedaba desactualizado
// respecto a la del cliente y todos los pushes devolvían 403 BadJwtToken.
// El único secret real es la private key: esa sigue viniendo por env var.
const VAPID_PUBLIC_KEY  = 'BDArqGzq2k2topSo3dg0XJC0-vsUrn466S0RRvwbHc2BYV61mSGfk9E5CenvUJKrXbsJGVqgC8Nvxq6nn20-0u0';
const VAPID_PRIVATE_KEY = (process.env.VAPID_PRIVATE_KEY || '').trim();
const SUPABASE_URL      = (process.env.SUPABASE_URL      || '').trim();
const SUPABASE_KEY      = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const GEMINI_KEY        = (process.env.GEMINI_API_KEY    || '').trim();

// VAPID_SUBJECT hardcoded — Apple rechaza cualquier variación con BadJwtToken.
// El env var quedaba con formato incorrecto (espacios, comillas, encoding raro)
// y no había forma de diagnosticarlo por el masking de secrets en logs.
// Hardcodear el subject elimina esa clase de bug entera.
const VAPID_SUBJECT = 'mailto:diego85greco@gmail.com';

if (!VAPID_PRIVATE_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing required environment variables');
  process.exit(1);
}

// Fingerprint de la private key (sin exponer la key). Comparar con:
//   priv esperada = RYeGjvTCv_ozjj54pSlTS_Qra_oD9363jIChSR-rZWg
//   Prefix: RYeGjvTC, Tail: rZWg, Len: 43, SHA256 prefix: 9b488d2f053ab8d1
const _privPrefix = VAPID_PRIVATE_KEY.slice(0, 8);
const _privTail   = VAPID_PRIVATE_KEY.slice(-4);
const _privHash   = crypto.createHash('sha256').update(VAPID_PRIVATE_KEY).digest('hex').slice(0, 16);
console.log(`[vapid] subject="${VAPID_SUBJECT}" public_key_prefix="${VAPID_PUBLIC_KEY.slice(0, 12)}..." private_key_len=${VAPID_PRIVATE_KEY.length} priv_prefix="${_privPrefix}" priv_tail="${_privTail}" priv_hash=${_privHash}`);
if (_privHash !== '9b488d2f053ab8d1') {
  console.warn(`[vapid] ⚠️ PRIVATE KEY MISMATCH — el secret VAPID_PRIVATE_KEY NO es RYeGjvT...rZWg`);
}
webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Decodificar y loguear un JWT de prueba para verificar aud/exp/sub
try {
  const _testHdrs = webpush.getVapidHeaders('https://web.push.apple.com', VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, 'aes128gcm', 3600);
  const _m = _testHdrs.Authorization.match(/t=([^,]+),\s*k=(.+)/);
  if (_m) {
    const [_h, _p] = _m[1].split('.');
    const _hdr = JSON.parse(Buffer.from(_h, 'base64').toString());
    const _pl  = JSON.parse(Buffer.from(_p, 'base64').toString());
    console.log(`[jwt-test] header=${JSON.stringify(_hdr)} payload=${JSON.stringify(_pl)} k_matches_pub=${_m[2] === VAPID_PUBLIC_KEY}`);
  }
} catch (e) { console.warn('[jwt-test] err:', e.message); }

// Returns the local hour (0-23) for a given IANA timezone at the current moment
function localHour(tz) {
  try {
    return parseInt(new Intl.DateTimeFormat('es', { hour: 'numeric', hour12: false, timeZone: tz }).format(new Date()), 10);
  } catch { return -1; }
}

const FORCE_SEND = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch';

// Slot elegido por HORA LOCAL del usuario (no UTC).
// Así los usuarios en Portugal / Europa reciben su push en su horario local,
// no al mediodía o a las 3 AM. Dedup por slot+día evita duplicados si dos cron
// hits caen dentro de la misma ventana local del usuario.
//   morning   → local 6-11
//   afternoon → local 13-19
//   night     → local 20-23 o 0-3
function getSlot(tz) {
  const h = localHour(tz);
  if (h < 0) return null; // tz inválida
  if (h >= 6  && h < 12) return 'morning';
  if (h >= 13 && h < 20) return 'afternoon';
  if (h >= 20 || h <= 3) return 'night';
  return null; // hora "muerta" (mediodía 12 o 4-5 AM) — no molestar
}

// Static fallbacks — español neutro (universal), sin voseo ni "acá/che".
// Mañana: invitar a registrar el ánimo + saludo cálido
// Tarde: validar el día tal como está + sugerencia de la app
// Noche: mensaje de ánimo + cierre íntimo
const FALLBACK = {
  morning: [
    { title: '🌅 ¡Buenos días!', body: 'Empieza el día registrando cómo te sientes 💚 Es el primer gesto de cuidarte hoy.' },
    { title: '☀️ Hola, buen día', body: 'Tu ánimo importa 🌿 Toca aquí y anota cómo estás llegando hoy.' },
    { title: '🌱 Buenos días', body: 'Cada mañana es una hoja en blanco 💛 ¿Cómo te sientes hoy? Regístralo en un toque.' },
    { title: '🌤️ ¡A comenzar!', body: 'Registra tu ánimo antes de comenzar el día 💚 Aunque sea de paso.' },
    { title: '🌸 Buen día para ti', body: '¿Cómo llegas hoy? 🌿 Un registro de 5 segundos hace toda la diferencia.' },
  ],
  afternoon: [
    { title: '🌤️ ¿Cómo va tu día?', body: 'Si viene bien, celébralo. Si viene difícil, no estás solo/a 💚 Escribe algo en Bitácora.' },
    { title: '💛 Pausa para ti', body: 'La Sala de Ayuda tiene gente esperando escucharte. No hace falta que aguantes solo/a 🌿' },
    { title: '🌊 ¿Necesitas soltar algo?', body: 'Lánzalo Al Mar. Alguien lo va a encontrar y te dejará amor 💙' },
    { title: '☮️ Círculos de Paz', body: 'Hoy hay conversación en Círculos — sobre ansiedad, duelo, soledad. Únete si necesitas 🌿' },
    { title: '🤝 ¿Mal momento?', body: 'Está bien no estar bien 💚 Cuenta con Bitácora o Sala de Ayuda cuando lo necesites.' },
    { title: '✨ Te recordamos', body: '¿Cómo va la tarde? Si hay algo pesándote, lánzalo Al Mar 🌊 o escríbelo en Bitácora 📖' },
    { title: '💙 Un poco de aire', body: 'Respira. Si necesitas hablar, hay guardianes disponibles en Sala de Ayuda. No estás solo/a 🌿' },
  ],
  night: [
    { title: '🌙 Buenas noches', body: 'Llegaste hasta aquí. Eso solo ya es mucho 💪 Descansa bien. Nos vemos mañana.' },
    { title: '🌙 Cierra el día', body: 'Sea como sea que estuvo, hoy diste lo que pudiste 💚 Descansa. Eres más fuerte de lo que crees.' },
    { title: '💪 Buenas noches', body: 'Los días difíciles también cuentan. Mañana es otra oportunidad 🌿 Nos vemos.' },
    { title: '🌙 Ya está', body: 'Suelta el día. Lo que quedó pendiente, mañana. Descansa tranquilo/a 💚' },
    { title: '💙 Cierre suave', body: 'Sea como sea que hoy te sentiste, es válido. Descansa 💪 Mañana te esperamos.' },
    { title: '🌙 Descanso', body: 'Gracias por seguir apareciendo en Velo. Eso ya dice mucho de ti 💚 Buenas noches.' },
  ],
};

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-1.5-flash'];

async function geminiGenerate(prompt) {
  if (!GEMINI_KEY) return null;
  for (const model of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.95, maxOutputTokens: 120, thinkingConfig: { thinkingBudget: 0 } }
        })
      });
      const data = await res.json();
      const parts = data.candidates?.[0]?.content?.parts;
      const text = parts?.find(p => !p.thought && p.text)?.text?.trim();
      if (text) return text;
    } catch (e) {
      console.warn(`[gemini] ${model} failed:`, e.message);
    }
  }
  return null;
}

async function generateNotification(slot) {
  // Features SIN muro feliz (fue removido de la app)
  const afternoonFeatures = [
    'Bitácora (escribir tu historia — anónimo o público)',
    'Sala de Ayuda (pedir acompañamiento en tiempo real de alguien de la comunidad)',
    'Círculos de Paz (grupos temáticos: ansiedad, duelo, relaciones, soledad)',
    'Al Mar (lanzar anónimamente algo que necesitás soltar; alguien lo va a encontrar)',
    'Guardianes (personas reales que eligieron estar disponibles para escuchar)',
    'tu Diario íntimo (privado, solo vos lo ves)',
  ];

  let prompt = '';
  if (slot === 'morning') {
    prompt = `Eres el asistente empático de Velo, una app de apoyo emocional en español neutro/universal (tú, no vos — evitar argentinismos como "acá", "che", "pinta", "sos", "podés").
Generá una notificación push de BUENOS DÍAS. Objetivos, en orden:
1. Saludo cálido de mañana, corto, humano, NO corporativo
2. INVITAR EXPLÍCITAMENTE a registrar cómo se siente hoy en la app (es el ritual matutino más importante)
3. El registro de ánimo toma 5 segundos y le ayuda a conocerse mejor

Reglas de estilo:
- Título máx 42 caracteres, empezá con 1 emoji cálido (🌅 ☀️ 🌱 🌤️ 🌸)
- Cuerpo máx 100 caracteres, tono íntimo, como amigo cercano
- Mencioná el registro de ánimo de forma sutil pero clara ('registra cómo estás', 'anota tu ánimo', '¿cómo te sientes hoy?')
- Puedes usar 1-2 emojis totales, no más
- NO uses 'salud mental', NO uses hashtags, NO uses listas
- Respondé SOLO JSON: {"title":"...","body":"..."}`;
  } else if (slot === 'afternoon') {
    const feature = pick(afternoonFeatures);
    // Alternar entre modo empático (validar mal momento) y modo activo (invitar a hacer)
    const useEmpathic = Math.random() < 0.65;
    if (useEmpathic) {
      prompt = `Eres el asistente empático de Velo, una app de apoyo emocional en español neutro/universal (tú, no vos — evitar argentinismos como "acá", "che", "pinta", "sos", "podés").
Generá una notificación push de la TARDE. La persona puede estar pasando un momento difícil O uno bueno — validá AMBOS posibles.
Objetivos:
1. Reconocer que la tarde puede venir bien o difícil ('si viene bien, celébralo', 'si viene difícil, no estás solo/a')
2. Recordar sutilmente que la app está ahí para acompañar el mal momento — mencioná específicamente: ${feature}
3. Tono empático, NO forzado positivo, honesto

Reglas de estilo:
- Título máx 42 caracteres, empezá con 1 emoji suave (💛 🌿 💙 🤝 ✨ 🌤️)
- Cuerpo máx 110 caracteres, tono cálido, como un amigo que sabe validar
- Frases que sirven: 'está bien no estar bien', 'no estás solo/a', 'si necesitas soltar algo'
- Máx 2 emojis totales
- NO uses 'salud mental', NO uses hashtags
- Respondé SOLO JSON: {"title":"...","body":"..."}`;
    } else {
      prompt = `Eres el asistente de Velo, una app de apoyo emocional en español neutro/universal (tú, no vos — evitar argentinismos como "acá", "che", "pinta", "sos", "podés").
Generá una notificación push de la TARDE con una INVITACIÓN CONCRETA a usar la app.
Objetivo: invitar sutilmente a usar ${feature}. La invitación debe sentirse útil, no promocional.

Reglas de estilo:
- Título máx 42 caracteres, 1 emoji al inicio (🌤️ 💛 🌿 ☮️ 🌊 📖)
- Cuerpo máx 110 caracteres, tono cercano
- Explicá EN 1 FRASE por qué ese feature puede servir hoy
- NO seas cursi, NO uses 'salud mental', sin hashtags
- Respondé SOLO JSON: {"title":"...","body":"..."}`;
    }
  } else {
    // Noche — mensaje de ánimo fuerte, cierre íntimo, validar el día tal como fue
    prompt = `Eres el asistente empático de Velo, una app de apoyo emocional en español neutro/universal (tú, no vos — evitar argentinismos como "acá", "che", "pinta", "sos", "podés").
Generá una notificación push de BUENAS NOCHES con MENSAJE DE ÁNIMO FUERTE.
Objetivos, en orden:
1. Validar que el día pudo ser difícil O bueno, sin asumir
2. Dar un mensaje de fortaleza REAL, no cursi ('llegaste hasta aquí y eso ya es mucho', 'eres más fuerte de lo que crees', 'los días difíciles también cuentan')
3. Cierre íntimo con buenas noches
4. NO recomendar features de la app — es momento de bajar la actividad

Reglas de estilo:
- Título máx 42 caracteres, empezá con 🌙 o 💪 o 💙
- Cuerpo máx 110 caracteres, tono íntimo, como abrazo verbal
- Frases fuertes ok: 'eres más fuerte de lo que crees', 'llegaste hasta aquí', 'diste lo que pudiste'
- Máx 2 emojis totales
- NO uses 'salud mental', NO cursilería, honesto y cálido
- Respondé SOLO JSON: {"title":"...","body":"..."}`;
  }

  const raw = await geminiGenerate(prompt);
  if (!raw) return null;

  try {
    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : raw);
    if (parsed.title && parsed.body) return { ...parsed, tag: `velo-${slot}` };
  } catch { }
  return null;
}

// ── WRAPPED ANUAL — se dispara el 20 de diciembre ────────────────────
// Manda broadcast al buzón de cada usuario que tuvo actividad en el año
async function sendAnnualWrapped(users) {
  const now = new Date();
  if (now.getUTCMonth() !== 11 || now.getUTCDate() !== 20) return { sent: 0 };
  const utcH = now.getUTCHours();
  // Solo en las 2 ventanas de mañana (7 UTC EU / 12 UTC LATAM)
  if (utcH !== 7 && utcH !== 12) return { sent: 0 };

  const year = now.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1)).toISOString();
  const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59)).toISOString();

  console.log(`[wrapped-annual] 20 dic — buscando actividad de ${year}`);

  // Usuarios con al menos 1 mood en el año
  const { data: moods, error: moodErr } = await supabase
    .from('mood_entries')
    .select('user_id')
    .like('date_key', `${year}-%`);
  if (moodErr) { console.error('[wrapped-annual] mood_entries error:', moodErr); return { sent: 0 }; }

  const activeIds = [...new Set((moods || []).map(m => m.user_id))];
  console.log(`[wrapped-annual] ${activeIds.length} usuarios activos en ${year}`);
  if (!activeIds.length) return { sent: 0 };

  const title = `🎊 Tu Wrapped anual ${year} está listo`;
  const body = `Un resumen completo del año — evolución mes a mes, tu día favorito, tu personalidad emocional analizada por IA. Deslizá para verlo ✨`;

  const brRows = activeIds.map(uid => ({
    target: `user:${uid}`,
    subject: title,
    body: `${body}\n\nAbrí Velo y andá al menú → "Mi Wrapped anual" 🌿`,
    icon: '🎊',
    sender: 'Velo — Wrapped anual',
  }));
  try {
    for (let i = 0; i < brRows.length; i += 100) {
      const chunk = brRows.slice(i, i + 100);
      const { error: brErr } = await supabase.from('broadcasts').insert(chunk);
      if (brErr) console.warn('[wrapped-annual] broadcast batch err:', brErr);
    }
  } catch (e) { console.warn('[wrapped-annual] broadcast err:', e.message); }

  // Push notif con dedup por año
  let sent = 0, failed = 0;
  const usersById = {};
  (users || []).forEach(u => { usersById[u.id] = u; });

  await Promise.allSettled(activeIds.map(async (uid) => {
    const u = usersById[uid];
    if (!u || !u.push_subscription) return;
    let parsedFull, rawSub, tz;
    try {
      parsedFull = JSON.parse(u.push_subscription);
      rawSub = parsedFull.sub && parsedFull.sub.endpoint ? parsedFull.sub : parsedFull;
      if (!parsedFull.sub) parsedFull = { sub: rawSub };
      tz = parsedFull.tz || 'America/Argentina/Buenos_Aires';
    } catch { return; }
    const h = localHour(tz);
    if (h < 6 || h >= 12) return;
    if (parsedFull.lastAnnualWrapped === String(year)) return;
    try {
      await webpush.sendNotification(rawSub, JSON.stringify({
        title, body,
        icon: '/assets/icon-192.png', badge: '/assets/icon-72.png',
        tag: `velo-wrapped-annual-${year}`, url: '/?open=wrapped-annual',
        actions: [
          { action: 'open-wrapped', title: '🎊 Ver mi año', url: '/?open=wrapped-annual' },
          { action: 'later', title: 'Después' }
        ],
      }));
      sent++;
      const updated = { ...parsedFull, lastAnnualWrapped: String(year) };
      await supabase.from('profiles').update({ push_subscription: JSON.stringify(updated) }).eq('id', uid);
    } catch (err) {
      const body = (err.body || err.message || '').toString();
      const isExpired = err.statusCode === 410 || err.statusCode === 404;
      const isVapidMismatch = err.statusCode === 403 && /BadJwtToken|Unauthorized|VapidPk/i.test(body);
      if (isExpired || isVapidMismatch) {
        await supabase.from('profiles').update({ push_subscription: null }).eq('id', uid);
      }
      failed++;
    }
  }));
  console.log(`[wrapped-annual] broadcasts=${brRows.length}, push_sent=${sent}, push_failed=${failed}`);
  return { sent };
}

// ── WRAPPED MENSUAL — se dispara el día 1 de cada mes ─────────────────
// Manda broadcast al inbox + push notif a todos los usuarios que tuvieron
// actividad de mood en el mes anterior. Dedup por mes en push_subscription.
// ── Resumen semanal (domingos, ventana de mañana local) ────────────
// Corre solo los domingos en las ventanas cron 7 UTC y 12 UTC. Filtra por
// hora local del usuario (6-11) + dedup por semana con lastWeekly. Manda
// push que al tocarla abre la app — el client-side _checkWeeklySummary
// arma el overlay real con las moods de los últimos 7 días.
async function sendWeeklySummary(users) {
  const now = new Date();
  if (now.getUTCDay() !== 0) return { sent: 0 }; // 0 = Domingo UTC
  const utcH = now.getUTCHours();
  if (utcH !== 7 && utcH !== 12) return { sent: 0 };

  // Clave de la semana = fecha del domingo (YYYY-MM-DD UTC)
  const weekKey = now.toISOString().slice(0, 10);
  console.log(`[weekly] Domingo ${weekKey} — enviando resumen semanal`);

  // Insert automático del broadcast al buzón — solo una vez por domingo (por eso
  // solo lo hacemos en el slot de las 7 UTC, no en el de las 12).
  // El cliente detecta el body "__WEEKLY_REPORT__YYYY-MM-DD" y arma el resumen
  // personalizado desde los datos locales del user. Con la dedup por body, si
  // el workflow se re-ejecuta el mismo domingo, no se duplica.
  if (utcH === 7) {
    try {
      const bcast = {
        target: 'users',
        subject: '📊 Tu resumen semanal — ' + weekKey,
        body: '__WEEKLY_REPORT__' + weekKey,
        icon: '📊',
        sender: 'Velo — Resumen Semanal',
        sent_at: new Date().toISOString(),
      };
      const { error: bcErr } = await supabase.from('broadcasts').insert(bcast);
      if (bcErr) console.warn('[weekly-broadcast]', bcErr.message);
      else console.log('[weekly-broadcast] resumen semanal insertado en broadcasts para', weekKey);
    } catch (e) { console.warn('[weekly-broadcast]', e && e.message); }
  }

  // Users con al menos 1 mood en los últimos 7 días (evitamos molestar a inactivos)
  const weekAgo = new Date(now); weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);
  const weekAgoKey = weekAgo.toISOString().slice(0, 10);
  const { data: moods, error: moodErr } = await supabase
    .from('mood_entries')
    .select('user_id')
    .gte('date_key', weekAgoKey);
  if (moodErr) { console.error('[weekly] mood_entries error:', moodErr); return { sent: 0 }; }

  const activeIds = [...new Set((moods || []).map(m => m.user_id))];
  console.log(`[weekly] ${activeIds.length} usuarios con moods en la semana`);
  if (!activeIds.length) return { sent: 0 };

  const title = `🌸 Tu semana en Velo`;
  const body = `Un resumen de cómo estuviste esta semana emocionalmente. Toca para verlo ✨`;

  let sent = 0, failed = 0;
  const usersById = {};
  (users || []).forEach(u => { usersById[u.id] = u; });

  await Promise.allSettled(activeIds.map(async (uid) => {
    const u = usersById[uid];
    if (!u || !u.push_subscription) return;
    let parsedFull, rawSub, tz;
    try {
      parsedFull = JSON.parse(u.push_subscription);
      rawSub = parsedFull.sub && parsedFull.sub.endpoint ? parsedFull.sub : parsedFull;
      if (!parsedFull.sub) parsedFull = { sub: rawSub };
      tz = parsedFull.tz || 'America/Argentina/Buenos_Aires';
    } catch { return; }
    // Solo mandamos si es mañana local del usuario (6-11)
    const h = localHour(tz);
    if (h < 6 || h >= 12) return;
    // Dedup por semana
    if (parsedFull.lastWeekly === weekKey) return;
    try {
      await webpush.sendNotification(rawSub, JSON.stringify({
        title, body,
        icon: '/assets/icon-192.png', badge: '/assets/icon-72.png',
        tag: `velo-weekly-${weekKey}`, url: '/?open=weekly-summary',
        actions: [
          { action: 'open-weekly-summary', title: '🌸 Ver mi semana', url: '/?open=weekly-summary' },
          { action: 'later', title: 'Después' }
        ],
      }));
      sent++;
      const updated = { ...parsedFull, lastWeekly: weekKey };
      await supabase.from('profiles').update({ push_subscription: JSON.stringify(updated) }).eq('id', uid);
    } catch (err) {
      const body = (err.body || err.message || '').toString();
      const isExpired = err.statusCode === 410 || err.statusCode === 404;
      const isVapidMismatch = err.statusCode === 403 && /BadJwtToken|Unauthorized|VapidPk/i.test(body);
      if (isExpired || isVapidMismatch) {
        await supabase.from('profiles').update({ push_subscription: null }).eq('id', uid);
      }
      failed++;
    }
  }));

  console.log(`[weekly] sent=${sent}, failed=${failed}`);
  return { sent, failed };
}

async function sendMonthlyWrapped(users) {
  const now = new Date();
  if (now.getUTCDate() !== 1) return { sent: 0 };
  // Corremos en las 2 ventanas de "mañana" globales (7 UTC = EU mañana, 12 UTC = LATAM mañana).
  // El filtro por hora local del usuario + dedup por mes garantiza que cada persona reciba
  // la notif en su mañana local, una sola vez.
  const utcH = now.getUTCHours();
  if (utcH !== 7 && utcH !== 12) return { sent: 0 };

  // Mes anterior
  const prev = new Date(now); prev.setUTCMonth(prev.getUTCMonth() - 1);
  const yr = prev.getUTCFullYear();
  const mo = prev.getUTCMonth() + 1;
  const monthKey = `${yr}-${String(mo).padStart(2, '0')}`;
  const mNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const monthLabel = mNames[mo - 1];

  console.log(`[wrapped] Día 1 del mes — buscando actividad de ${monthLabel} ${yr}`);

  // Usuarios con al menos 1 mood en el mes anterior
  const { data: moods, error: moodErr } = await supabase
    .from('mood_entries')
    .select('user_id')
    .like('date_key', `${monthKey}-%`);
  if (moodErr) { console.error('[wrapped] mood_entries error:', moodErr); return { sent: 0 }; }

  const activeIds = [...new Set((moods || []).map(m => m.user_id))];
  console.log(`[wrapped] ${activeIds.length} usuarios con actividad en ${monthLabel}`);
  if (!activeIds.length) return { sent: 0 };

  const title = `🌸 Tu Wrapped de ${monthLabel} está listo`;
  const body = `Descubrí cómo fue tu mes emocional. Deslizá para ver tu resumen ✨`;

  // 1) Broadcast al inbox (uno por usuario para que quede en la campana)
  const brRows = activeIds.map(uid => ({
    target: `user:${uid}`,
    subject: title,
    body: `${body}\n\nAbrí Velo y andá al menú → "Mi Wrapped mensual" 🌿`,
    icon: '🌸',
    sender: 'Velo — Wrapped mensual',
  }));
  try {
    // insert en batches de 100 para no romper el payload
    for (let i = 0; i < brRows.length; i += 100) {
      const chunk = brRows.slice(i, i + 100);
      const { error: brErr } = await supabase.from('broadcasts').insert(chunk);
      if (brErr) console.warn('[wrapped] broadcast batch err:', brErr);
    }
  } catch (e) { console.warn('[wrapped] broadcast err:', e.message); }

  // 2) Push notif — solo a los que tienen push_subscription y no recibieron este mes
  let sent = 0, failed = 0;
  const usersById = {};
  (users || []).forEach(u => { usersById[u.id] = u; });

  await Promise.allSettled(activeIds.map(async (uid) => {
    const u = usersById[uid];
    if (!u || !u.push_subscription) return;
    let parsedFull, rawSub, tz;
    try {
      parsedFull = JSON.parse(u.push_subscription);
      rawSub = parsedFull.sub && parsedFull.sub.endpoint ? parsedFull.sub : parsedFull;
      if (!parsedFull.sub) parsedFull = { sub: rawSub };
      tz = parsedFull.tz || 'America/Argentina/Buenos_Aires';
    } catch { return; }
    // Solo mandamos si es mañana local del usuario (6-11)
    const h = localHour(tz);
    if (h < 6 || h >= 12) return;
    // Dedup por mes
    if (parsedFull.lastWrapped === monthKey) return;
    try {
      await webpush.sendNotification(rawSub, JSON.stringify({
        title, body,
        icon: '/assets/icon-192.png', badge: '/assets/icon-72.png',
        tag: `velo-wrapped-${monthKey}`, url: '/?open=wrapped',
        actions: [
          { action: 'open-wrapped', title: '🌸 Ver Wrapped', url: '/?open=wrapped' },
          { action: 'later', title: 'Después' }
        ],
      }));
      sent++;
      const updated = { ...parsedFull, lastWrapped: monthKey };
      await supabase.from('profiles').update({ push_subscription: JSON.stringify(updated) }).eq('id', uid);
    } catch (err) {
      const body = (err.body || err.message || '').toString();
      const isExpired = err.statusCode === 410 || err.statusCode === 404;
      const isVapidMismatch = err.statusCode === 403 && /BadJwtToken|Unauthorized|VapidPk/i.test(body);
      if (isExpired || isVapidMismatch) {
        await supabase.from('profiles').update({ push_subscription: null }).eq('id', uid);
      }
      failed++;
    }
  }));
  console.log(`[wrapped] broadcasts=${brRows.length}, push_sent=${sent}, push_failed=${failed}`);

  // ── Cohorte "no completaron el mes" ────────────────────────────────
  // Usuarios con push que NO registraron ningún ánimo el mes pasado. En vez de
  // dejarlos sin nada, los invitamos a empezar ESTE mes para tener su Wrapped
  // el 1° del próximo. Excluimos cuentas creadas este mes (no vivieron el mes
  // anterior, no tiene sentido decirles que "no lo completaron").
  const activeSet = new Set(activeIds);
  const curMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).getTime();
  const curMonthLabel = mNames[now.getUTCMonth()];
  const nextMonthLabel = mNames[(now.getUTCMonth() + 1) % 12];
  const inviteUsers = (users || []).filter(u => {
    if (!u || activeSet.has(u.id) || !u.push_subscription) return false;
    const created = u.created_at ? new Date(u.created_at).getTime() : 0;
    if (created && created >= curMonthStart) return false; // cuenta nueva de este mes
    return true;
  });
  console.log(`[wrapped-invite] ${inviteUsers.length} usuarios sin actividad en ${monthLabel} para invitar`);

  const invTitle = `🌱 Tu Wrapped te espera`;
  const invBody = `No llegaste a registrar ${monthLabel}, ¡pero este mes es una nueva oportunidad! Registrá cómo te sentís en ${curMonthLabel} y el 1° de ${nextMonthLabel} vas a tener tu Wrapped completo ✨`;

  // 1) Broadcast al inbox
  try {
    const invRows = inviteUsers.map(u => ({
      target: `user:${u.id}`,
      subject: invTitle,
      body: invBody,
      icon: '🌱',
      sender: 'Velo — Tu mes emocional',
    }));
    for (let i = 0; i < invRows.length; i += 100) {
      const chunk = invRows.slice(i, i + 100);
      if (!chunk.length) break;
      const { error: brErr } = await supabase.from('broadcasts').insert(chunk);
      if (brErr) console.warn('[wrapped-invite] broadcast batch err:', brErr);
    }
  } catch (e) { console.warn('[wrapped-invite] broadcast err:', e.message); }

  // 2) Push (mañana local + dedup por mes con clave propia)
  let invSent = 0, invFailed = 0;
  await Promise.allSettled(inviteUsers.map(async (u) => {
    let parsedFull, rawSub, tz;
    try {
      parsedFull = JSON.parse(u.push_subscription);
      rawSub = parsedFull.sub && parsedFull.sub.endpoint ? parsedFull.sub : parsedFull;
      if (!parsedFull.sub) parsedFull = { sub: rawSub };
      tz = parsedFull.tz || 'America/Argentina/Buenos_Aires';
    } catch { return; }
    const h = localHour(tz);
    if (h < 6 || h >= 12) return;
    if (parsedFull.lastWrappedInvite === monthKey) return; // dedup
    try {
      await webpush.sendNotification(rawSub, JSON.stringify({
        title: invTitle, body: invBody,
        icon: '/assets/icon-192.png', badge: '/assets/icon-72.png',
        tag: `velo-wrapped-invite-${monthKey}`, url: '/?open=mood',
        actions: [
          { action: 'open-mood', title: '🌿 Registrar hoy', url: '/?open=mood' },
          { action: 'later', title: 'Después' }
        ],
      }));
      invSent++;
      const updated = { ...parsedFull, lastWrappedInvite: monthKey };
      await supabase.from('profiles').update({ push_subscription: JSON.stringify(updated) }).eq('id', u.id);
    } catch (err) {
      const eb = (err.body || err.message || '').toString();
      const isExpired = err.statusCode === 410 || err.statusCode === 404;
      const isVapidMismatch = err.statusCode === 403 && /BadJwtToken|Unauthorized|VapidPk/i.test(eb);
      if (isExpired || isVapidMismatch) {
        await supabase.from('profiles').update({ push_subscription: null }).eq('id', u.id);
      }
      invFailed++;
    }
  }));
  console.log(`[wrapped-invite] push_sent=${invSent}, push_failed=${invFailed}`);
  return { sent: sent + invSent };
}

// ── BUDDY LOW MOOD ALERT ─────────────────────────────────────────────
// Si un usuario con compañero/a registró ánimo bajo 2 días seguidos,
// avisa suave al buddy. Solo dispara al START de la racha (no todos los días).
// Corre en la ventana morning (12 UTC) para no acumular con las otras notifs.
async function sendBuddyLowMoodAlerts(users) {
  const utcH = new Date().getUTCHours();
  if (utcH !== 12) return { sent: 0 };

  // Emojis considerados "bajo" (score <= 2.5)
  const LOW = new Set(['🥺', '😞', '😔', '😰', '😤', '😢']);

  // Buscar todas las parejas activas (buddy_id set + buddy_started_at set)
  const { data: pairs, error: pairErr } = await supabase
    .from('profiles')
    .select('id, buddy_id, buddy_name, buddy_started_at')
    .not('buddy_id', 'is', null);

  if (pairErr) { console.warn('[buddy-alert] err:', pairErr.message); return { sent: 0 }; }
  if (!pairs || !pairs.length) return { sent: 0 };

  const usersById = {};
  (users || []).forEach(u => { usersById[u.id] = u; });

  let sent = 0, checked = 0;

  // Nombres para el broadcast (opcional — el buddy_name ya lo tenemos guardado)
  const nameMap = {};
  try {
    const { data: nd } = await supabase.from('profiles').select('id,nombre,username').in('id', pairs.map(p => p.id));
    (nd || []).forEach(p => { nameMap[p.id] = p.nombre || (p.username ? '@' + p.username : 'Tu compañero/a'); });
  } catch (e) {}

  for (const p of pairs) {
    checked++;
    try {
      // Últimos 3 date_keys del user con ánimo registrado
      const { data: moods } = await supabase
        .from('mood_entries')
        .select('date_key,emoji')
        .eq('user_id', p.id)
        .order('date_key', { ascending: false })
        .limit(3);
      if (!moods || moods.length < 2) continue;

      // Los 2 más recientes deben ser fechas consecutivas y ambos bajos
      const d0 = moods[0].date_key, d1 = moods[1].date_key;
      const dt0 = new Date(d0 + 'T00:00:00Z').getTime();
      const dt1 = new Date(d1 + 'T00:00:00Z').getTime();
      const daysBetween = Math.round((dt0 - dt1) / 86400000);
      if (daysBetween !== 1) continue; // no son consecutivos
      if (!LOW.has(moods[0].emoji) || !LOW.has(moods[1].emoji)) continue;

      // Solo alertar si el streak recién empezó → el 3º (si existe) NO es bajo
      if (moods.length >= 3 && LOW.has(moods[2].emoji)) {
        // Racha larga en curso — ya se alertó al start, no volver a spammear
        continue;
      }

      // Insertar broadcast al buddy (siempre — para que quede en la campana)
      const alertKey = `${p.id}:${d0}`;
      const buddyName = nameMap[p.id] || 'Tu compañero/a';
      await supabase.from('broadcasts').insert({
        target: `user:${p.buddy_id}`,
        subject: '🕊️ Un mensaje puede ayudar',
        body: `${buddyName} viene con días difíciles. Nada urgente — solo por si querés escribirle algo cálido 💚`,
        icon: '🕊️',
        sender: 'Velo — Compañeros de bienestar',
      });

      // Push notification al buddy si tiene sub — respeta hora local del buddy (morning only)
      const buddyU = usersById[p.buddy_id];
      if (!buddyU || !buddyU.push_subscription) { sent++; continue; }
      let parsedFull, rawSub, tz;
      try {
        parsedFull = JSON.parse(buddyU.push_subscription);
        rawSub = parsedFull.sub && parsedFull.sub.endpoint ? parsedFull.sub : parsedFull;
        if (!parsedFull.sub) parsedFull = { sub: rawSub };
        tz = parsedFull.tz || 'America/Argentina/Buenos_Aires';
      } catch { continue; }
      const h = localHour(tz);
      if (h < 6 || h >= 12) { sent++; continue; } // no es su mañana local — broadcast alcanza
      if (parsedFull.lastBuddyAlert === alertKey) { sent++; continue; } // dedup por streak

      try {
        await webpush.sendNotification(rawSub, JSON.stringify({
          title: '🕊️ Un mensaje puede ayudar',
          body: `${buddyName} viene con días difíciles. Escribirle algo cálido puede sumar 💚`,
          icon: '/assets/icon-192.png', badge: '/assets/icon-72.png',
          tag: 'velo-buddy-alert', url: '/?open=buddy',
          actions: [
            { action: 'open-buddy', title: '💬 Ir al buddy', url: '/?open=buddy' },
            { action: 'later', title: 'Después' }
          ],
        }));
        const updated = { ...parsedFull, lastBuddyAlert: alertKey };
        await supabase.from('profiles').update({ push_subscription: JSON.stringify(updated) }).eq('id', p.buddy_id);
        sent++;
      } catch (err) {
        const body = (err.body || err.message || '').toString();
        const isExpired = err.statusCode === 410 || err.statusCode === 404;
        const isVapidMismatch = err.statusCode === 403 && /BadJwtToken|Unauthorized|VapidPk/i.test(body);
        if (isExpired || isVapidMismatch) {
          await supabase.from('profiles').update({ push_subscription: null }).eq('id', p.buddy_id);
        }
      }
    } catch (e) { console.warn('[buddy-alert] pair err:', e.message); }
  }
  console.log(`[buddy-alert] checked=${checked}, alerts_sent=${sent}`);
  return { sent };
}

// ── CHECK-IN SEMANAL de compañeros de bienestar ───────────────────────
// Durante el ciclo de 30 días, una vez por semana (día 7, 14, 21, 28) si la
// pareja NO se escribió en los últimos 7 días, se les manda un empujoncito
// suave para que se pregunten cómo están. Se procesa una fila por usuario
// (profiles tiene A→B y B→A), así que ambos lados reciben su propio aviso.
async function sendBuddyWeeklyCheckin(users) {
  const utcH = new Date().getUTCHours();
  if (utcH !== 12) return { sent: 0 }; // ventana mañana LATAM, 1 vez al día

  const { data: pairs, error } = await supabase
    .from('profiles')
    .select('id, buddy_id, buddy_name, buddy_started_at')
    .not('buddy_id', 'is', null);
  if (error || !pairs || !pairs.length) return { sent: 0 };

  const usersById = {};
  (users || []).forEach(u => { usersById[u.id] = u; });

  const now = Date.now();
  let sent = 0, checked = 0;

  for (const p of pairs) {
    checked++;
    try {
      if (!p.buddy_started_at) continue;
      const startTs = new Date(p.buddy_started_at).getTime();
      const daysSince = Math.floor((now - startTs) / 86400000);
      // Solo dentro del ciclo, en los hitos semanales (7/14/21/28)
      if (daysSince < 7 || daysSince >= 30) continue;
      if (daysSince % 7 !== 0) continue;
      const weekNum = Math.floor(daysSince / 7);

      // ¿Hablaron en los últimos 7 días? Si sí, no molestar.
      const sinceIso = new Date(now - 7 * 86400000).toISOString();
      const { data: msgs } = await supabase
        .from('direct_messages')
        .select('id')
        .or(`and(from_id.eq.${p.id},to_id.eq.${p.buddy_id}),and(from_id.eq.${p.buddy_id},to_id.eq.${p.id})`)
        .gte('created_at', sinceIso)
        .limit(1);
      if (msgs && msgs.length) continue;

      const buddyName = p.buddy_name || 'tu compañero/a';
      const checkinKey = `${p.id}:w${weekNum}`;

      // Broadcast al Buzón (siempre queda en la campana)
      await supabase.from('broadcasts').insert({
        target: `user:${p.id}`,
        subject: '🌱 ¿Cómo van con tu compañero/a?',
        body: `Hace unos días que no se escriben con ${buddyName}. ¿Cómo están? Un "hola, ¿cómo andás?" puede alegrarle el día 💚`,
        icon: '🌱',
        sender: 'Velo — Compañeros de bienestar',
      });

      // Push si tiene sub y es su mañana local
      const u = usersById[p.id];
      if (!u || !u.push_subscription) { sent++; continue; }
      let parsedFull, rawSub, tz;
      try {
        parsedFull = JSON.parse(u.push_subscription);
        rawSub = parsedFull.sub && parsedFull.sub.endpoint ? parsedFull.sub : parsedFull;
        if (!parsedFull.sub) parsedFull = { sub: rawSub };
        tz = parsedFull.tz || 'America/Argentina/Buenos_Aires';
      } catch { continue; }
      const h = localHour(tz);
      if (h < 6 || h >= 12) { sent++; continue; } // no es su mañana — broadcast alcanza
      if (parsedFull.lastBuddyCheckin === checkinKey) { sent++; continue; } // dedup por semana

      try {
        await webpush.sendNotification(rawSub, JSON.stringify({
          title: '🌱 ¿Cómo van con tu compañero/a?',
          body: `Hace unos días que no se escriben con ${buddyName}. Un mensajito puede sumar 💚`,
          icon: '/assets/icon-192.png', badge: '/assets/icon-72.png',
          tag: 'velo-buddy-checkin', url: '/?open=buddy',
          actions: [
            { action: 'open-buddy', title: '💬 Escribirle', url: '/?open=buddy' },
            { action: 'later', title: 'Después' }
          ],
        }));
        await supabase.from('profiles').update({
          push_subscription: JSON.stringify({ ...parsedFull, lastBuddyCheckin: checkinKey })
        }).eq('id', p.id);
        sent++;
      } catch (err) {
        const body = (err.body || err.message || '').toString();
        const isExpired = err.statusCode === 410 || err.statusCode === 404;
        const isVapidMismatch = err.statusCode === 403 && /BadJwtToken|Unauthorized|VapidPk/i.test(body);
        if (isExpired || isVapidMismatch) {
          await supabase.from('profiles').update({ push_subscription: null }).eq('id', p.id);
        }
      }
    } catch (e) { console.warn('[buddy-checkin] pair err:', e.message); }
  }
  console.log(`[buddy-checkin] checked=${checked}, sent=${sent}`);
  return { sent };
}

// ── CICLO DE 30 DÍAS de compañeros: recordatorio día 28 + expiración día 30 ──
// "2 días antes de cumplir los 30 debe decidir si renueva; si no renueva,
// al día 30 se anula solo." Renovar resetea buddy_started_at (pRenewBuddy),
// así que las parejas renovadas nunca llegan a 30.
async function buddyCycleMaintenance() {
  const utcH = new Date().getUTCHours();
  if (utcH !== 12) return { expired: 0, reminded: 0 };
  const { data: pairs, error } = await supabase
    .from('profiles')
    .select('id, buddy_id, buddy_name, buddy_started_at')
    .not('buddy_id', 'is', null)
    .not('buddy_started_at', 'is', null);
  if (error || !pairs || !pairs.length) return { expired: 0, reminded: 0 };

  const now = Date.now();
  const cleared = new Set();
  let expired = 0, reminded = 0;

  for (const p of pairs) {
    try {
      const days = Math.floor((now - new Date(p.buddy_started_at).getTime()) / 86400000);
      if (days >= 30) {
        if (cleared.has(p.id)) continue;
        cleared.add(p.id); if (p.buddy_id) cleared.add(p.buddy_id);
        await supabase.from('profiles').update({ buddy_id: null, buddy_name: null, buddy_started_at: null }).eq('id', p.id);
        if (p.buddy_id) await supabase.from('profiles').update({ buddy_id: null, buddy_name: null, buddy_started_at: null }).eq('id', p.buddy_id);
        for (const uid of [p.id, p.buddy_id].filter(Boolean)) {
          await supabase.from('broadcasts').insert({
            target: `user:${uid}`,
            subject: '🌿 El ciclo de 30 días llegó a su fin',
            body: 'Su acompañamiento cumplió los 30 días y se cerró. Gracias por acompañarse 💚 Pueden anotarse de nuevo cuando quieran.',
            icon: '🌿', sender: 'Velo — Compañeros de bienestar',
          });
        }
        expired++;
      } else if (days === 28) {
        // Cada fila cubre a su propio dueño (hay una fila por lado de la pareja)
        await supabase.from('broadcasts').insert({
          target: `user:${p.id}`,
          subject: '⏰ Tu ciclo de compañeros termina en 2 días',
          body: `El acompañamiento con ${p.buddy_name || 'tu compañero/a'} cumple 30 días en 2 días. Si quieren seguir, entrá a Compañer@ y tocá "Renovar 30 días más" — si no, se cierra solo al día 30.`,
          icon: '⏰', sender: 'Velo — Compañeros de bienestar',
        });
        reminded++;
      }
    } catch (e) { console.warn('[buddy-cycle] pair err:', e.message); }
  }
  console.log(`[buddy-cycle] expired=${expired}, reminded=${reminded}`);
  return { expired, reminded };
}

// ── LIMPIEZA de media caducada del bucket 'vibes' ─────────────────────
// Los vibes expiran a las 24h (el cron SQL borra las filas), pero los
// archivos (fotos y desde v1383 VIDEOS de hasta 35MB) quedaban en Storage
// para siempre. Corre una vez al día (3 UTC): borra archivos con más de
// 48h de antigüedad — todo vibe expira a las 24h, así que >48h es basura
// segura (los vibes "archivados" guardan la media aparte via archived=true
// en la fila; si la fila con esa URL sigue viva, la salteamos).
async function cleanupVibesStorage() {
  const utcH = new Date().getUTCHours();
  if (utcH !== 3) return { deleted: 0 };
  const cutoff = Date.now() - 48 * 3600 * 1000;
  let deleted = 0;
  try {
    // URLs todavía referenciadas por filas vivas (archivados o no expirados)
    const { data: liveRows } = await supabase.from('vibes').select('media_url').limit(2000);
    const liveUrls = new Set((liveRows || []).map(r => r.media_url).filter(Boolean));
    const { data: folders, error: fErr } = await supabase.storage.from('vibes').list('', { limit: 500 });
    if (fErr) { console.warn('[vibes-cleanup] list root:', fErr.message); return { deleted }; }
    for (const folder of (folders || [])) {
      if (!folder.name || folder.id) continue; // solo carpetas (id null en folders)
      const { data: files, error: lErr } = await supabase.storage.from('vibes').list(folder.name, { limit: 1000 });
      if (lErr || !files) continue;
      const toDelete = [];
      for (const f of files) {
        const ts = f.created_at ? new Date(f.created_at).getTime() : 0;
        if (!ts || ts > cutoff) continue;
        const path = folder.name + '/' + f.name;
        // ¿Alguna fila viva referencia este archivo? (URL pública termina en el path)
        let referenced = false;
        for (const u of liveUrls) { if (u && u.endsWith('/' + path)) { referenced = true; break; } }
        if (!referenced) toDelete.push(path);
      }
      if (toDelete.length) {
        const { error: dErr } = await supabase.storage.from('vibes').remove(toDelete);
        if (dErr) console.warn('[vibes-cleanup] remove err:', dErr.message);
        else deleted += toDelete.length;
      }
    }
  } catch (e) { console.warn('[vibes-cleanup]', e.message); }
  console.log(`[vibes-cleanup] deleted=${deleted}`);
  return { deleted };
}

async function main() {
  const { data: users, error } = await supabase
    .from('profiles')
    .select('id, push_subscription, created_at')
    .not('push_subscription', 'is', null);

  if (error) { console.error('Supabase error:', error); process.exit(1); }

  console.log(`Found ${users?.length || 0} users with push_subscription in DB`);

  // Wrapped mensual (día 1 en ventana morning UTC)
  try { await sendMonthlyWrapped(users); } catch (e) { console.warn('[wrapped] failed:', e.message); }

  // Wrapped anual (20 de diciembre en ventana morning UTC)
  try { await sendAnnualWrapped(users); } catch (e) { console.warn('[wrapped-annual] failed:', e.message); }

  // Resumen semanal (domingos en ventana morning UTC)
  try { await sendWeeklySummary(users); } catch (e) { console.warn('[weekly] failed:', e.message); }

  // Aviso a buddies con racha baja de 2 días
  try { await sendBuddyLowMoodAlerts(users); } catch (e) { console.warn('[buddy-alert] failed:', e.message); }

  // Check-in semanal de compañeros que no se escriben (día 7/14/21/28 del ciclo)
  try { await sendBuddyWeeklyCheckin(users); } catch (e) { console.warn('[buddy-checkin] failed:', e.message); }

  // Ciclo 30 días: recordatorio de renovación (día 28) + expiración automática (día 30)
  try { await buddyCycleMaintenance(); } catch (e) { console.warn('[buddy-cycle] failed:', e.message); }

  // Limpieza diaria de fotos/videos caducados del bucket 'vibes' (3 UTC)
  try { await cleanupVibesStorage(); } catch (e) { console.warn('[vibes-cleanup] failed:', e.message); }

  // Group users by slot so we call Gemini once per slot, not once per user
  const slotUsers = { morning: [], afternoon: [], night: [] };
  let skipped = 0;

  const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

  for (const user of (users || [])) {
    let rawSub, tz, parsedFull;
    try {
      parsedFull = JSON.parse(user.push_subscription);
      if (parsedFull.sub && parsedFull.sub.endpoint) { rawSub = parsedFull.sub; tz = parsedFull.tz || 'America/Argentina/Buenos_Aires'; }
      else { rawSub = parsedFull; parsedFull = { sub: rawSub }; tz = 'America/Argentina/Buenos_Aires'; }
    } catch { skipped++; continue; }
    const slot = getSlot(tz);
    const clientPub = (parsedFull.clientPubKey || '').slice(0, 12);
    const buildV = parsedFull.buildV || '?';
    const pubMatch = parsedFull.clientPubKey === VAPID_PUBLIC_KEY;
    console.log(`  user ${user.id}: tz=${tz} h=${localHour(tz)} slot=${slot||'none'} buildV=${buildV} clientPub=${clientPub}... match=${pubMatch}`);
    if (!slot) { skipped++; continue; }
    // Dedup: skip if this slot was already sent today
    if (parsedFull.lastSent && parsedFull.lastSent[slot] === today) {
      console.log(`  user ${user.id}: already sent ${slot} today — skipping`);
      skipped++;
      continue;
    }
    slotUsers[slot].push({ id: user.id, sub: rawSub, tz, parsedFull });
  }

  // Generate one AI message per active slot
  const notifs = {};
  for (const slot of ['morning', 'afternoon', 'night']) {
    if (!slotUsers[slot].length) continue;
    const ai = await generateNotification(slot);
    if (ai) {
      console.log(`[AI ${slot}] "${ai.title}" — "${ai.body}"`);
      notifs[slot] = ai;
    } else {
      notifs[slot] = { ...pick(FALLBACK[slot]), tag: `velo-${slot}` };
      console.log(`[fallback ${slot}] "${notifs[slot].title}"`);
    }
  }

  let sent = 0, failed = 0;

  for (const slot of ['morning', 'afternoon', 'night']) {
    const notif = notifs[slot];
    if (!notif) continue;
    await Promise.allSettled(slotUsers[slot].map(async ({ id, sub, tz, parsedFull }) => {
      try {
        // Sumar action inteligente según el slot
        let payload = {
          title: notif.title, body: notif.body,
          icon: '/assets/icon-192.png', badge: '/assets/icon-72.png',
          tag: notif.tag, url: '/'
        };
        if (slot === 'morning') {
          payload.url = '/?open=mood';
          payload.actions = [
            { action: 'open-mood', title: '🌿 Registrar ánimo', url: '/?open=mood' },
            { action: 'later', title: 'Después' }
          ];
        }
        await webpush.sendNotification(sub, JSON.stringify(payload));
        sent++;
        // Record that this slot was sent today to prevent duplicate sends
        const updatedSub = { ...parsedFull, lastSent: { ...(parsedFull.lastSent || {}), [slot]: today } };
        await supabase.from('profiles').update({ push_subscription: JSON.stringify(updatedSub) }).eq('id', id);
      } catch (err) {
        const body = (err.body || err.message || '').toString();
        const epUrl = sub && sub.endpoint || '';
        const epHost = epUrl ? (new URL(epUrl)).host : '(none)';
        const epTail = epUrl.slice(-30);
        console.warn(`[push-err] user=${id} slot=${slot} status=${err.statusCode||'??'} endpoint_host=${epHost} endpoint_tail=...${epTail} body=${body.slice(0, 300)}`);
        // Limpiar sub si expiró (410/404) o si hay VAPID mismatch (403 BadJwtToken)
        const isExpired = err.statusCode === 410 || err.statusCode === 404;
        const isVapidMismatch = err.statusCode === 403 && /BadJwtToken|Unauthorized|VapidPk/i.test(body);
        if (isExpired || isVapidMismatch) {
          await supabase.from('profiles').update({ push_subscription: null }).eq('id', id);
          console.log(`Removed stale sub for user ${id} (${isExpired ? 'expired' : 'vapid-mismatch'})`);
        }
        failed++;
      }
    }));
  }

  console.log(`Done — total_users=${users?.length||0}, sent=${sent}, skipped_no_window=${skipped}, failed=${failed}`);
}

main();
