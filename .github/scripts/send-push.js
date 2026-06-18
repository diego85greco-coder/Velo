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
  { title: '🌅 ¡Buenos días!', body: '¿Cómo amaneciste hoy? Tomate un segundo para registrar cómo te sentís 🌿' },
  { title: '🌤️ Empezá bien el día', body: 'Abrí tu diario y anotá cómo llegás a este nuevo día 📔' },
  { title: '☀️ Un momento para vos', body: '¿Hay un guardián disponible hoy? Conectate con alguien que te escuche 🛡️' },
  { title: '🌱 Hoy es un nuevo comienzo', body: 'Los Círculos de Paz están activos. ¿Te sumás a la conversación? ☮️' },
];
const AFTERNOON_MSGS = [
  { title: '🌤️ ¿Cómo va la tarde?', body: 'Un momento para vos en medio del día. ¿Cómo está tu energía? 💛' },
  { title: '💛 Pausa de tarde', body: 'Publicá en Al Mar algo que necesitás soltar hoy 🌊' },
  { title: '🤝 ¿Alguien necesita apoyo?', body: 'Entrá a la Sala de Ayuda — quizás hoy sos vos quien acompaña 💚' },
  { title: '🌈 Momentos que hacen bien', body: 'Mirá el Muro Feliz y compartí algo que te alegró hoy ✨' },
];
const NIGHT_MSGS = [
  { title: '🌙 Antes de cerrar el día…', body: '¿Cómo estuvo? Es el mejor momento para guardar cómo te sentiste hoy ✨' },
  { title: '🕯️ ¿Cómo terminó tu día?', body: 'Anotá en tu diario antes de dormir. Solo vos lo podés leer 📔' },
  { title: '💤 Unos minutos para vos', body: 'Probá un ejercicio de respiración antes de dormir 🌬️' },
  { title: '🌙 ¿Sentiste algo hoy?', body: 'Registrá tu estado de ánimo y Velo armará tu resumen del mes 😊' },
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
