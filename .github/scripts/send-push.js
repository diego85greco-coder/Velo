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

function getSlot(tz) {
  const utcH = new Date().getUTCHours();
  // Wide windows handle GitHub cron drift + transition between old/new schedule:
  //   morning   → UTC 5-13  (old cron was 6, new is 12)
  //   afternoon → UTC 14-19 (old cron was 14, new is 17)
  //   night     → UTC 1-3 or 19-22 (old cron was 19, new is 2)
  if (utcH >= 5  && utcH <= 13) return 'morning';
  if (utcH >= 14 && utcH <= 18) return 'afternoon';
  if ((utcH >= 19 && utcH <= 22) || (utcH >= 1 && utcH <= 3)) return 'night';
  // Manual dispatch always sends, using user's local time for label
  if (FORCE_SEND) {
    const h = localHour(tz);
    if (h >= 6  && h < 13) return 'morning';
    if (h >= 13 && h < 20) return 'afternoon';
    return 'night';
  }
  return null;
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

async function main() {
  const { data: users, error } = await supabase
    .from('profiles')
    .select('id, push_subscription')
    .not('push_subscription', 'is', null);

  if (error) { console.error('Supabase error:', error); process.exit(1); }

  console.log(`Found ${users?.length || 0} users with push_subscription in DB`);

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
        await webpush.sendNotification(sub, JSON.stringify({
          title: notif.title, body: notif.body,
          icon: '/assets/icon-192.png', badge: '/assets/icon-72.png',
          tag: notif.tag, url: '/'
        }));
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
