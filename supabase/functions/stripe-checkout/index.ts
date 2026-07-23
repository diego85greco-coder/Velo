import Stripe from 'https://esm.sh/stripe@14?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?target=deno'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
})

// Resuelve el email VERIFICADO del que llama a partir del JWT de Supabase Auth
// del header Authorization. Devuelve null si no hay sesión válida (p.ej. si sólo
// vino la anon key). Se usa para que cancel_plus opere SOLO sobre la propia cuenta.
async function _verifiedEmail(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization') || ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!jwt) return null
  try {
    const supa = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } },
    )
    const { data, error } = await supa.auth.getUser()
    if (error || !data || !data.user || !data.user.email) return null
    return String(data.user.email).trim().toLowerCase()
  } catch (_) {
    return null
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { amount, proName, sessionType, returnUrl, cancelUrl, veloUserId, veloEmail } = body

    // ── Cancelar la suscripción a Velo Plus ──────────────────────────
    // Marca cancel_at_period_end=true: la persona conserva Plus hasta el final
    // del período que ya pagó, y no se le cobra de nuevo. El webhook baja el
    // perfil a gratis cuando llega el fin del período (customer.subscription.deleted).
    if (sessionType === 'cancel_plus') {
      // v1588 (SEGURIDAD): el email a cancelar se toma del JWT VERIFICADO del que
      // llama, NO del body. Antes cualquiera podía cancelar el Plus de otra persona
      // POSTeando { sessionType:'cancel_plus', veloEmail:'victima@…' }.
      const email = await _verifiedEmail(req)
      if (!email) return json({ error: 'No autenticado' }, 401)
      const customers = await stripe.customers.list({ email, limit: 10 })
      let cancelled = 0
      for (const c of customers.data) {
        const subs = await stripe.subscriptions.list({ customer: c.id, status: 'active', limit: 10 })
        for (const s of subs.data) {
          await stripe.subscriptions.update(s.id, { cancel_at_period_end: true })
          cancelled++
        }
      }
      return json({ ok: cancelled > 0, cancelled })
    }

    // ── Suscripción mensual a Velo Plus ($2.99/mes) ──────────────────
    // El precio/nombre/ciclo se definen inline (price_data): no hace falta crear
    // ningún producto ni "Price" en el panel de Stripe. Se renueva solo cada mes.
    if (sessionType === 'plus_subscription') {
      const meta = {
        veloUserId: String(veloUserId || ''),
        veloEmail:  String(veloEmail  || ''),
        platform:   'velo',
        kind:       'plus',
      }
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Velo Plus ⭐',
              description: 'Suscripción mensual · acceso ilimitado y beneficios extra. Cancelás cuando quieras.',
            },
            unit_amount: 299,
            recurring: { interval: 'month' },
          },
          quantity: 1,
        }],
        client_reference_id: veloUserId || undefined,
        customer_email: veloEmail || undefined,
        metadata: meta,
        subscription_data: { metadata: meta },
        allow_promotion_codes: true,
        success_url: (returnUrl || 'https://heyvelo.app') + '?stripe=ok&session_id={CHECKOUT_SESSION_ID}',
        cancel_url:  (cancelUrl  || 'https://heyvelo.app') + '?stripe=cancel',
      })
      return json({ url: session.url, id: session.id })
    }

    // ── Pago único: donación ("Apoyá a Velo") o sesión con profesional ──
    if (!amount || amount < 1) {
      return json({ error: 'Monto inválido' }, 400)
    }

    const isDonation = sessionType === 'donation'
    const label = isDonation
      ? 'Apoyo a Velo 💚'
      : sessionType === 'solidaria'
        ? 'Sesión solidaria · Velo'
        : `Sesión con ${proName || 'profesional'} · Velo`
    const desc = isDonation
      ? 'Aporte voluntario para mantener Velo gratuito y accesible para todos.'
      : 'El pago queda retenido hasta confirmar la sesión. Velo retiene 20% de comisión.'

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: label, description: desc },
          unit_amount: Math.round(parseFloat(amount) * 100),
        },
        quantity: 1,
      }],
      mode: 'payment',
      submit_type: isDonation ? 'donate' : 'pay',
      success_url: (returnUrl || 'https://heyvelo.app') + '?stripe=ok&session_id={CHECKOUT_SESSION_ID}',
      cancel_url:  (cancelUrl  || 'https://heyvelo.app') + '?stripe=cancel',
      metadata: {
        proName:     proName     || '',
        sessionType: sessionType || 'paid',
        platform:    'velo',
        commission:  isDonation ? '0' : '20',
      },
    })

    return json({ url: session.url, id: session.id })

  } catch (err) {
    console.error('Stripe error:', err)
    return json({ error: (err as Error).message }, 500)
  }
})
