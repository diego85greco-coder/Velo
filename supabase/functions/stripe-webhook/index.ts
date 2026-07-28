// Edge Function: stripe-webhook
// Recibe los eventos de Stripe de la suscripción a Velo Plus, VERIFICA la firma
// (para que nadie falsee un evento) y actualiza el perfil del usuario:
//   • checkout.session.completed (mode=subscription) → role='plus', +33 días
//   • invoice.paid / invoice.payment_succeeded       → role='plus', +33 días
//     (cada renovación mensual EXTIENDE el vencimiento)
//   • customer.subscription.deleted                  → role='user' (fin del período)
//
// El cliente (premium.js) baja a gratis solo cuando plus_expires_at ya venció,
// así que acá solo tocamos la fila del perfil.
//
// Mapeo evento → usuario de Velo: por el `veloUserId` que guardamos en la
// metadata de la suscripción al crear el checkout (y como respaldo, el email).
//
// Deploy (SIN verificación de JWT — Stripe llama directo, sin auth de Supabase):
//   supabase functions deploy stripe-webhook --no-verify-jwt
// Secrets necesarios: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
//                     SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import Stripe from 'https://esm.sh/stripe@14?target=deno'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
})
const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? ''
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const PLUS_DAYS = 33 // un mes + margen para que la renovación llegue a tiempo

async function setPlan(veloUserId: string, email: string, plan: 'plus' | 'user') {
  let filter = ''
  if (veloUserId && /^[0-9a-fA-F-]{20,}$/.test(veloUserId)) {
    filter = `id=eq.${encodeURIComponent(veloUserId)}`
  } else if (email) {
    // SEGURIDAD: usar `eq`, no `ilike`. El email viene de la metadata del checkout,
    // que a su vez sale del body sin verificar; en `ilike` los caracteres `%` y `_`
    // son comodines (y `_` es válido en un email), así que un `____@gmail.com`
    // hacía coincidir MUCHOS perfiles y un solo evento de cancelación bajaba a
    // `user` a todos ellos (o les regalaba Plus en la dirección contraria).
    const _mail = email.trim().toLowerCase()
    // Sanidad mínima: un email real, sin comodines ni comas (PostgREST separa por comas).
    if (!/^[^\s,%*()]+@[^\s,%*()]+\.[^\s,%*()]+$/.test(_mail)) {
      console.warn('[stripe-webhook] email con formato inesperado — ignorado')
      return
    }
    filter = `email=eq.${encodeURIComponent(_mail)}`
  }
  if (!filter) { console.warn('[stripe-webhook] sin clave para mapear — ignorado'); return }

  const now = Date.now()
  const update = plan === 'plus'
    ? { role: 'plus', plus_expires_at: new Date(now + PLUS_DAYS * 864e5).toISOString() }
    : { role: 'user', plus_expires_at: new Date(now - 1000).toISOString() }

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?${filter}`, {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(update),
    })
    const rows = await res.json().catch(() => [])
    const n = Array.isArray(rows) ? rows.length : 0
    console.log(`[stripe-webhook] ${plan} → ${filter} (perfiles: ${n})`)
    if (!n) console.warn('[stripe-webhook] ⚠️ ningún perfil coincidió')
  } catch (e) {
    console.error('[stripe-webhook] error actualizando perfil:', (e as Error).message)
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok', { status: 200 })

  const sig = req.headers.get('stripe-signature') ?? ''
  const raw = await req.text()

  let event: Stripe.Event
  try {
    // constructEventAsync: obligatorio en Deno (la verificación de firma es async).
    event = await stripe.webhooks.constructEventAsync(raw, sig, WEBHOOK_SECRET)
  } catch (e) {
    console.error('[stripe-webhook] firma inválida:', (e as Error).message)
    return new Response('bad signature', { status: 400 })
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const s = event.data.object as Stripe.Checkout.Session
      if (s.mode === 'subscription') {
        const m = (s.metadata || {}) as Record<string, string>
        await setPlan(m.veloUserId || s.client_reference_id || '', m.veloEmail || s.customer_email || '', 'plus')
      }
    } else if (event.type === 'invoice.paid' || event.type === 'invoice.payment_succeeded') {
      const inv = event.data.object as Stripe.Invoice
      const subId = typeof inv.subscription === 'string' ? inv.subscription : inv.subscription?.id
      let m: Record<string, string> = {}
      if (subId) {
        const sub = await stripe.subscriptions.retrieve(subId)
        m = (sub.metadata || {}) as Record<string, string>
      }
      await setPlan(m.veloUserId || '', m.veloEmail || inv.customer_email || '', 'plus')
    } else if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object as Stripe.Subscription
      const m = (sub.metadata || {}) as Record<string, string>
      await setPlan(m.veloUserId || '', m.veloEmail || '', 'user')
    } else {
      console.log(`[stripe-webhook] evento sin acción: ${event.type}`)
    }
  } catch (e) {
    console.error('[stripe-webhook] error procesando:', (e as Error).message)
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
