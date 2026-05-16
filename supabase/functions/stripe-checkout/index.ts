import Stripe from 'https://esm.sh/stripe@14?target=deno'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { amount, proName, sessionType, returnUrl, cancelUrl } = await req.json()

    if (!amount || amount < 1) {
      return new Response(JSON.stringify({ error: 'Monto inválido' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const label = sessionType === 'solidaria'
      ? 'Sesión solidaria · Velo'
      : `Sesión con ${proName || 'profesional'} · Velo`

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: label,
            description: 'El pago queda retenido hasta confirmar la sesión. Velo retiene 20% de comisión.',
          },
          unit_amount: Math.round(parseFloat(amount) * 100),
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: (returnUrl || 'https://velo.app') + '?stripe=ok&session_id={CHECKOUT_SESSION_ID}',
      cancel_url:  (cancelUrl  || 'https://velo.app') + '?stripe=cancel',
      metadata: {
        proName:     proName     || '',
        sessionType: sessionType || 'paid',
        platform:    'velo',
        commission:  '20',
      },
    })

    return new Response(JSON.stringify({ url: session.url, id: session.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('Stripe error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
