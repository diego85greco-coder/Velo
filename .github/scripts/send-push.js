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

// Pick message based on current UTC hour
// 12 UTC = 09:00 AR (mañana)
// 17 UTC = 14:00 AR (tarde)
//  0 UTC = 21:00 AR (noche)
function getNotification() {
  const hour = new Date().getUTCHours();
  if (hour >= 11 && hour < 15) {
    return {
      title: '🌅 ¡Buenos días!',
      body: '¿Cómo amaneciste hoy? Tomate un segundo para registrar cómo te sentís 🌿',
      tag: 'velo-morning'
    };
  }
  if (hour >= 15 && hour < 20) {
    return {
      title: '🌤️ ¿Cómo va la tarde?',
      body: 'Un momento para vos en medio del día. ¿Cómo está tu energía? 💛',
      tag: 'velo-afternoon'
    };
  }
  // night (0–4 UTC = 21–01 AR)
  return {
    title: '🌙 Antes de cerrar el día…',
    body: '¿Cómo estuvo? Es el mejor momento para guardar cómo te sentiste hoy ✨',
    tag: 'velo-night'
  };
}

async function main() {
  const { data: users, error } = await supabase
    .from('profiles')
    .select('id, push_subscription')
    .not('push_subscription', 'is', null);

  if (error) { console.error('Supabase error:', error); process.exit(1); }

  const notif = getNotification();
  console.log(`Sending "${notif.title}" to ${(users || []).length} subscribers`);

  let sent = 0, failed = 0;

  await Promise.allSettled((users || []).map(async (user) => {
    try {
      const sub = JSON.parse(user.push_subscription);
      await webpush.sendNotification(sub, JSON.stringify({
        title: notif.title,
        body: notif.body,
        icon: '/assets/icon-192.png',
        badge: '/assets/icon-72.png',
        tag: notif.tag,
        url: '/'
      }));
      sent++;
    } catch (err) {
      // Subscription expired or invalid — clean up
      if (err.statusCode === 410 || err.statusCode === 404) {
        await supabase.from('profiles').update({ push_subscription: null }).eq('id', user.id);
        console.log(`Removed expired subscription for user ${user.id}`);
      }
      failed++;
    }
  }));

  console.log(`Done — sent: ${sent}, failed: ${failed}`);
}

main();
