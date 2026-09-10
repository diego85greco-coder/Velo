import { createClient } from 'jsr:@supabase/supabase-js@2'

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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!jwt) return json({ error: 'No autenticado' }, 401)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  )

  const { data: userData, error: userError } = await supabase.auth.getUser(jwt)
  if (userError || !userData.user) return json({ error: 'No autenticado' }, 403)

  let reason: string | null = null
  try {
    const body = await req.json()
    reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 1000) || null : null
  } catch (_) {
    // El motivo es opcional.
  }

  // La RPC de producción es la ruta autoritativa: elimina los datos de la
  // aplicación y auth.users en una única operación server-side.
  // No borramos auth.users primero porque varias tablas no dependen de él
  // mediante FK y podrían quedar datos personales huérfanos.
  const { error: rpcError } = await supabase.rpc('delete_my_account', {
    p_reason: reason,
  })

  if (rpcError) {
    console.error('[delete-account] delete_my_account failed:', rpcError)
    return json({
      error: 'No se pudo completar el borrado de la cuenta',
      code: rpcError.code || 'DELETE_FAILED',
    }, 500)
  }

  return json({ ok: true })
})
