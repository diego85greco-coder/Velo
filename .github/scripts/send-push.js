const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

const VAPID_PUBLIC_KEY  = (process.env.VAPID_PUBLIC_KEY  || '').trim();
const VAPID_PRIVATE_KEY = (process.env.VAPID_PRIVATE_KEY || '').trim();
const VAPID_SUBJECT     = (process.env.VAPID_SUBJECT     || 'mailto:diego85greco@gmail.com').trim();
const SUPABASE_URL      = (process.env.SUPABASE_URL      || '').trim();
const SUPABASE_KEY      = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

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

// Timezone groups — any tz whose offset matches gets treated as that group
const AR_TZS = ['America/Argentina/Buenos_Aires','America/Argentina/Cordoba','America/Argentina/Mendoza','America/Sao_Paulo','America/Montevideo'];
const PT_TZS = ['Europe/Lisbon','Atlantic/Azores','Europe/Madrid','Europe/London','Africa/Casablanca'];

function getSlot(tz) {
  const h = localHour(tz);
  if (h >= 8 && h < 11)  return 'morning';
  if (h >= 13 && h < 16) return 'afternoon';
  if (h >= 20 && h < 23) return 'night';
  return null; // not a notification window
}

const MORNING_MSGS = [
  { title: '🌅 ¡Buenos días!', body: 'Hoy tiene todo para ser un buen día 💚 ¿Anotás cómo llegás en tu diario?' },
  { title: '☀️ ¡Hola! Buenos días', body: 'Qué lindo tenerte acá 🌿 Hay guardianes disponibles si querés charlar con alguien hoy.' },
  { title: '🌱 ¡Buenos días!', body: 'Cada día es una oportunidad nueva 💛 Unite a los Círculos de Paz y empezá bien.' },
  { title: '🌤️ ¡Buenos días!', body: 'Arrancás con todo 💪 Si tenés algo que soltar, Al Mar te espera con brazos abiertos 🌊' },
];
const AFTERNOON_MSGS = [
  { title: '💛 ¡Buenas tardes!', body: '¡Hola! Esperamos que tu día esté yendo bien 🌤️ ¿Compartís algo en el Muro Feliz?' },
  { title: '🌿 ¡Buenas tardes!', body: 'Una pausa para vos 💚 Si necesitás apoyo, hay guardianes en la Sala de Ayuda listos para escucharte.' },
  { title: '🌈 ¡Buenas tardes!', body: '¡Qué bueno verte! 😊 Los Círculos de Paz están activos — ¿te sumás a la charla?' },
  { title: '🤝 ¡Buenas tardes!', body: 'El acompañamiento hace la diferencia 💙 ¿Publicás en Al Mar algo que necesitás soltar hoy?' },
];
const NIGHT_MSGS = [
  { title: '🌙 Buenas noches', body: 'Que descanses bien. Hoy hiciste lo que pudiste y eso es suficiente 💚 Nos vemos mañana.' },
  { title: '🌙 Buenas noches', body: 'Cerrá los ojos con calma. Mañana es un nuevo comienzo 🌿 Nos vemos mañana.' },
  { title: '🌙 Buenas noches', body: 'Que la noche te traiga descanso y paz ✨ Nos vemos mañana.' },
  { title: '🌙 Buenas noches', body: 'Gracias por estar en Velo hoy 💙 Que descanses. Nos vemos mañana.' },
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function getNotification(slot) {
  if (slot === 'morning')   return { ...pick(MORNING_MSGS),   tag: 'velo-morning' };
  if (slot === 'afternoon') return { ...pick(AFTERNOON_MSGS), tag: 'velo-afternoon' };
  return                           { ...pick(NIGHT_MSGS),     tag: 'velo-night' };
}

async function main() {
  const { data: users, error } = await supabase
    .from('profiles')
    .select('id, push_subscription')
    .not('push_subscription', 'is', null);

  if (error) { console.error('Supabase error:', error); process.exit(1); }

  let sent = 0, failed = 0, skipped = 0;

  await Promise.allSettled((users || []).map(async (user) => {
    let rawSub, tz;
    try {
      const parsed = JSON.parse(user.push_subscription);
      // New format: { sub: {...}, tz: 'America/...' }
      // Old format: direct subscription object (backwards compatible)
      if (parsed.sub && parsed.sub.endpoint) {
        rawSub = parsed.sub;
        tz = parsed.tz || 'America/Argentina/Buenos_Aires';
      } else {
        rawSub = parsed;
        tz = 'America/Argentina/Buenos_Aires'; // default for old subscribers
      }
    } catch { skipped++; return; }

    const slot = getSlot(tz);
    if (!slot) { skipped++; return; } // not a notification window for this user's timezone

    const notif = getNotification(slot);
    console.log(`[${tz}] slot=${slot} → "${notif.title}"`);

    try {
      await webpush.sendNotification(rawSub, JSON.stringify({
        title: notif.title,
        body:  notif.body,
        icon:  '/assets/icon-192.png',
        badge: '/assets/icon-72.png',
        tag:   notif.tag,
        url:   '/'
      }));
      sent++;
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        await supabase.from('profiles').update({ push_subscription: null }).eq('id', user.id);
        console.log(`Removed expired subscription for user ${user.id}`);
      }
      failed++;
    }
  }));

  console.log(`Done — sent: ${sent}, skipped (wrong window): ${skipped}, failed: ${failed}`);
}

main();
