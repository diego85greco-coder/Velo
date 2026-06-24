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
const FALLBACK = {
  morning: [
    { title: '🌅 ¡Buenos días!', body: 'Hoy tiene todo para ser un buen día 💚 ¿Anotás cómo llegás en tu diario?' },
    { title: '☀️ ¡Hola! Buenos días', body: 'Qué lindo tenerte acá 🌿 Hay guardianes disponibles si querés charlar con alguien hoy.' },
    { title: '🌱 ¡Buenos días!', body: 'Cada día es una oportunidad nueva 💛 Unite a los Círculos de Paz y empezá bien.' },
    { title: '🌤️ ¡Buenos días!', body: 'Arrancás con todo 💪 Si tenés algo que soltar, Al Mar te espera 🌊' },
  ],
  afternoon: [
    { title: '💛 ¡Buenas tardes!', body: '¡Hola! Esperamos que tu día esté yendo bien 🌤️ ¿Compartís algo en el Muro Feliz?' },
    { title: '🌿 ¡Buenas tardes!', body: 'Una pausa para vos 💚 Hay guardianes en la Sala de Ayuda listos para escucharte.' },
    { title: '🌈 ¡Buenas tardes!', body: '¡Qué bueno verte! 😊 Los Círculos de Paz están activos — ¿te sumás a la charla?' },
    { title: '🤝 ¡Buenas tardes!', body: 'El acompañamiento hace la diferencia 💙 ¿Publicás en Al Mar algo que necesitás soltar?' },
  ],
  night: [
    { title: '🌙 Buenas noches', body: 'Que descanses bien. Hoy hiciste lo que pudiste y eso es suficiente 💚 Nos vemos mañana.' },
    { title: '🌙 Buenas noches', body: 'Cerrá los ojos con calma. Mañana es un nuevo comienzo 🌿 Nos vemos mañana.' },
    { title: '🌙 Buenas noches', body: 'Que la noche te traiga descanso y paz ✨ Nos vemos mañana.' },
    { title: '🌙 Buenas noches', body: 'Gracias por estar en Velo hoy 💙 Que descanses. Nos vemos mañana.' },
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
  const features = {
    morning:   ['tu Diario personal', 'los Guardianes disponibles', 'los Círculos de Paz', 'Al Mar (publicar algo que necesitás soltar)'],
    afternoon: ['el Muro Feliz', 'la Sala de Ayuda', 'los Círculos de Paz', 'Al Mar (publicar algo que necesitás soltar)'],
  };

  let prompt = '';
  if (slot === 'morning') {
    const feature = pick(features.morning);
    prompt = `Sos el asistente de Velo, una app de apoyo emocional en español latinoamericano.
Generá una notificación push de buenos días para los usuarios. Debe:
- Saludar con calidez y decir algo lindo y alentador
- Invitar sutilmente a usar: ${feature}
- Ser breve: título máx 40 caracteres, cuerpo máx 90 caracteres
- Usar 1-2 emojis naturales, tono cálido y cercano, no corporativo
- Responder SOLO en formato JSON: {"title":"...","body":"..."}`;
  } else if (slot === 'afternoon') {
    const feature = pick(features.afternoon);
    prompt = `Sos el asistente de Velo, una app de apoyo emocional en español latinoamericano.
Generá una notificación push de buenas tardes para los usuarios. Debe:
- Saludar con calidez y decir algo lindo sobre la tarde
- Invitar sutilmente a usar: ${feature}
- Ser breve: título máx 40 caracteres, cuerpo máx 90 caracteres
- Usar 1-2 emojis naturales, tono cálido y cercano, no corporativo
- Responder SOLO en formato JSON: {"title":"...","body":"..."}`;
  } else {
    prompt = `Sos el asistente de Velo, una app de apoyo emocional en español latinoamericano.
Generá una notificación push de buenas noches para los usuarios. Debe:
- Dar un mensaje de ánimo sincero y cálido sobre el día que pasó
- Desear buenas noches y terminar con "Nos vemos mañana."
- NO recomendar ninguna función de la app
- Ser breve: título máx 40 caracteres, cuerpo máx 90 caracteres
- Usar 1 emoji, tono íntimo y reconfortante
- Responder SOLO en formato JSON: {"title":"...","body":"..."}`;
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
