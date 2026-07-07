const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

const VAPID_PUBLIC_KEY  = (process.env.VAPID_PUBLIC_KEY  || '').trim();
const VAPID_PRIVATE_KEY = (process.env.VAPID_PRIVATE_KEY || '').trim();
const VAPID_SUBJECT     = (process.env.VAPID_SUBJECT     || 'mailto:diego85greco@gmail.com').trim();
const SUPABASE_URL      = (process.env.SUPABASE_URL      || '').trim();
const SUPABASE_KEY      = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const GEMINI_KEY        = (process.env.GEMINI_API_KEY    || '').trim();

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing required environment variables');
  process.exit(1);
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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

// Static fallbacks — used if Gemini is unavailable
// Mañana: siempre invitar a registrar el ánimo + saludo cálido
// Tarde: validar el día tal como está (bueno o difícil) + sugerencia específica de la app
// Noche: mensaje de ánimo fuerte 💪 + cierre íntimo
const FALLBACK = {
  morning: [
    { title: '🌅 ¡Buenos días!', body: 'Empezá el día registrando cómo te sentís 💚 Es el primer gesto de cuidarte hoy.' },
    { title: '☀️ ¡Hola! Buen día', body: 'Tu ánimo importa 🌿 Tocá acá y anotá cómo estás llegando hoy.' },
    { title: '🌱 Buenos días', body: 'Cada mañana es una hoja en blanco 💛 ¿Cómo te sentís hoy? Registralo en un toque.' },
    { title: '🌤️ ¡Arrancamos!', body: 'Registrá tu ánimo antes de arrancar el día 💚 Aunque sea de paso.' },
    { title: '🌸 Buen día para vos', body: 'Che, ¿cómo llegás hoy? 🌿 Un registro de 5 segundos hace toda la diferencia.' },
  ],
  afternoon: [
    { title: '🌤️ ¿Cómo va tu día?', body: 'Si viene lindo, celebralo. Si viene difícil, no estás solo/a 💚 Escribí algo en Bitácora.' },
    { title: '💛 Pausa para vos', body: 'La Sala de Ayuda tiene gente esperando escucharte. No hace falta que aguantes solo/a 🌿' },
    { title: '🌊 ¿Necesitás soltar algo?', body: 'Lanzalo Al Mar. Alguien lo va a encontrar y te dejará amor 💙' },
    { title: '☮️ Círculos de Paz', body: 'Hoy hay conversación en Círculos — sobre ansiedad, duelo, soledad. Sumate si necesitás 🌿' },
    { title: '🤝 ¿Mal momento?', body: 'Está bien no estar bien 💚 Contá con Bitácora o Sala de Ayuda cuando lo necesités.' },
    { title: '✨ Te acordamos', body: '¿Cómo va la tarde? Si hay algo pesándote, lanzalo Al Mar 🌊 o escribilo en Bitácora 📖' },
    { title: '💙 Un poco de aire', body: 'Respirá. Si necesitás hablar, hay guardianes disponibles en Sala de Ayuda. No estás solo/a 🌿' },
  ],
  night: [
    { title: '🌙 Buenas noches', body: 'Llegaste hasta acá. Eso solo ya es mucho 💪 Descansá bien. Nos vemos mañana.' },
    { title: '🌙 Cerrá el día', body: 'Sea como sea que estuvo, hoy diste lo que pudiste 💚 Descansá. Sos más fuerte de lo que creés.' },
    { title: '💪 Buenas noches', body: 'Los días difíciles también cuentan. Mañana es otra oportunidad 🌿 Nos vemos.' },
    { title: '🌙 Ya está', body: 'Soltá el día. Lo que quedó pendiente, mañana. Descansá tranquilo/a 💚' },
    { title: '💙 Cierre suave', body: 'Sea como sea que hoy te sentiste, es válido. Descansá 💪 Mañana te esperamos.' },
    { title: '🌙 Descanso', body: 'Gracias por seguir apareciendo en Velo. Eso ya dice mucho de vos 💚 Buenas noches.' },
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
    prompt = `Sos el asistente empático de Velo, una app de apoyo emocional en español rioplatense (vos, no tú).
Generá una notificación push de BUENOS DÍAS. Objetivos, en orden:
1. Saludo cálido de mañana, corto, humano, NO corporativo
2. INVITAR EXPLÍCITAMENTE a registrar cómo se siente hoy en la app (es el ritual matutino más importante)
3. El registro de ánimo toma 5 segundos y le ayuda a conocerse mejor

Reglas de estilo:
- Título máx 42 caracteres, empezá con 1 emoji cálido (🌅 ☀️ 🌱 🌤️ 🌸)
- Cuerpo máx 100 caracteres, tono íntimo, como amigo cercano
- Mencioná el registro de ánimo de forma sutil pero clara ('registrá cómo estás', 'anotá tu ánimo', '¿cómo te sentís hoy?')
- Podés usar 1-2 emojis totales, no más
- NO uses 'salud mental', NO uses hashtags, NO uses listas
- Respondé SOLO JSON: {"title":"...","body":"..."}`;
  } else if (slot === 'afternoon') {
    const feature = pick(afternoonFeatures);
    // Alternar entre modo empático (validar mal momento) y modo activo (invitar a hacer)
    const useEmpathic = Math.random() < 0.65;
    if (useEmpathic) {
      prompt = `Sos el asistente empático de Velo, una app de apoyo emocional en español rioplatense (vos, no tú).
Generá una notificación push de la TARDE. La persona puede estar pasando un momento difícil O uno bueno — validá AMBOS posibles.
Objetivos:
1. Reconocer que la tarde puede venir bien o difícil ('si viene bien, celebralo', 'si viene difícil, no estás solo/a')
2. Recordar sutilmente que la app está ahí para acompañar el mal momento — mencioná específicamente: ${feature}
3. Tono empático, NO forzado positivo, honesto

Reglas de estilo:
- Título máx 42 caracteres, empezá con 1 emoji suave (💛 🌿 💙 🤝 ✨ 🌤️)
- Cuerpo máx 110 caracteres, tono cálido, como un amigo que sabe validar
- Frases que sirven: 'está bien no estar bien', 'no estás solo/a', 'si necesitás soltar algo'
- Máx 2 emojis totales
- NO uses 'salud mental', NO uses hashtags
- Respondé SOLO JSON: {"title":"...","body":"..."}`;
    } else {
      prompt = `Sos el asistente de Velo, una app de apoyo emocional en español rioplatense (vos, no tú).
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
    prompt = `Sos el asistente empático de Velo, una app de apoyo emocional en español rioplatense (vos, no tú).
Generá una notificación push de BUENAS NOCHES con MENSAJE DE ÁNIMO FUERTE.
Objetivos, en orden:
1. Validar que el día pudo ser difícil O bueno, sin asumir
2. Dar un mensaje de fortaleza REAL, no cursi ('llegaste hasta acá y eso ya es mucho', 'sos más fuerte de lo que creés', 'los días difíciles también cuentan')
3. Cierre íntimo con buenas noches
4. NO recomendar features de la app — es momento de bajar la actividad

Reglas de estilo:
- Título máx 42 caracteres, empezá con 🌙 o 💪 o 💙
- Cuerpo máx 110 caracteres, tono íntimo, como abrazo verbal
- Frases fuertes ok: 'sos más fuerte de lo que creés', 'llegaste hasta acá', 'diste lo que pudiste'
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
      if (err.statusCode === 410 || err.statusCode === 404) {
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
  const body = `Un resumen de cómo estuviste esta semana emocionalmente. Tocá para verlo ✨`;

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
      if (err.statusCode === 410 || err.statusCode === 404) {
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
      if (err.statusCode === 410 || err.statusCode === 404) {
        await supabase.from('profiles').update({ push_subscription: null }).eq('id', uid);
      }
      failed++;
    }
  }));
  console.log(`[wrapped] broadcasts=${brRows.length}, push_sent=${sent}, push_failed=${failed}`);
  return { sent };
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
        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabase.from('profiles').update({ push_subscription: null }).eq('id', p.buddy_id);
        }
      }
    } catch (e) { console.warn('[buddy-alert] pair err:', e.message); }
  }
  console.log(`[buddy-alert] checked=${checked}, alerts_sent=${sent}`);
  return { sent };
}

async function main() {
  const { data: users, error } = await supabase
    .from('profiles')
    .select('id, push_subscription')
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
    console.log(`  user ${user.id}: tz=${tz} h=${localHour(tz)} slot=${slot||'none'}`);
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
        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabase.from('profiles').update({ push_subscription: null }).eq('id', id);
          console.log(`Removed expired sub for user ${id}`);
        }
        failed++;
      }
    }));
  }

  console.log(`Done — total_users=${users?.length||0}, sent=${sent}, skipped_no_window=${skipped}, failed=${failed}`);
}

main();
