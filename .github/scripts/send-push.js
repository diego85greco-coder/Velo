const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT     = process.env.VAPID_SUBJECT || 'mailto:diego85greco@gmail.com';
const SUPABASE_URL      = process.env.SUPABASE_URL;
const SUPABASE_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing required environment variables');
  process.exit(1);
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  const { data: users, error } = await supabase
    .from('profiles')
    .select('id, push_subscription')
    .not('push_subscription', 'is', null);

  if (error) { console.error('Supabase error:', error); process.exit(1); }

  console.log(`Found ${(users || []).length} subscriptions`);
  let sent = 0, failed = 0;

  await Promise.allSettled((users || []).map(async (user) => {
    try {
      const sub = JSON.parse(user.push_subscription);
      await webpush.sendNotification(sub, JSON.stringify({
        title: '💚 Velo',
        body: '¿Cómo te sentís hoy?',
        icon: '/assets/icon-192.png',
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
