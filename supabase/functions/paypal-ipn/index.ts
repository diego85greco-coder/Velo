// Edge Function: paypal-ipn
// Recibe las notificaciones IPN de PayPal para la suscripción a Velo Plus,
// las VERIFICA con PayPal (para que nadie falsee un pago) y actualiza el perfil
// del usuario en Supabase:
//   • subscr_signup / subscr_payment  → role='plus', plus_expires_at = +33 días
//     (cada pago/renovación EXTIENDE el vencimiento; si dejan de pagar, vence solo)
//   • subscr_eot                       → role='user' (fin del período)
//   • subscr_cancel / subscr_failed    → se ignoran: el usuario conserva Plus
//     hasta que venza el mes ya pagado (lo maneja plus_expires_at + el cliente).
//
// El cliente (premium.js ~línea 879) ya baja a gratis cuando plus_expires_at
// quedó en el pasado, así que acá solo tocamos la fila del perfil.
//
// Mapeo IPN → usuario de Velo: primero por `custom` (el email de Velo que la app
// manda en el botón), y si no viene, por `payer_email` (el email de PayPal del
// que paga). Funciona mejor cuando la persona usa el mismo email en Velo y PayPal.
//
// Deploy:
//   supabase functions deploy paypal-ipn --no-verify-jwt
// Config en PayPal: pasar notify_url al botón (ya lo hace la app) y/o activar
// IPN en la cuenta apuntando a la URL de esta función.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
// Endpoint de verificación de IPN de PayPal (producción).
const PAYPAL_IPN_VERIFY = "https://ipnpb.paypal.com/cgi-bin/webscr";
const PLUS_DAYS = 33; // un mes + margen para que la renovación llegue a tiempo

serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return new Response("ok", { status: 200 });

  // Cuerpo crudo (x-www-form-urlencoded) — hay que reenviarlo TAL CUAL a PayPal.
  const rawBody = await req.text();

  // 1) Verificar con PayPal que el IPN es auténtico.
  try {
    const verifyRes = await fetch(PAYPAL_IPN_VERIFY, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "cmd=_notify-validate&" + rawBody,
    });
    const verifyTxt = (await verifyRes.text()).trim();
    if (verifyTxt !== "VERIFIED") {
      console.warn("[paypal-ipn] NO verificado por PayPal:", verifyTxt.slice(0, 40));
      return new Response("not verified", { status: 200 });
    }
  } catch (e) {
    console.error("[paypal-ipn] error verificando:", (e as Error).message);
    return new Response("verify error", { status: 200 });
  }

  // 2) Parsear campos del IPN.
  const p = new URLSearchParams(rawBody);
  const txnType    = (p.get("txn_type") || "").trim();
  // `custom` = "veloUserId|veloEmail" (lo manda la app). Es la forma EXACTA de
  // mapear, aunque paguen con tarjeta o con otro PayPal. payer_email es respaldo.
  const customRaw  = (p.get("custom") || "").trim();
  const parts      = customRaw.split("|");
  const veloId     = (parts[0] || "").trim();
  const veloEmail  = (parts[1] || "").trim().toLowerCase();
  const payerEmail = (p.get("payer_email") || "").trim().toLowerCase();

  console.log(`[paypal-ipn] txn_type=${txnType} veloId=${veloId||"-"} veloEmail=${veloEmail||"-"} payer=${payerEmail||"-"}`);

  // Filtro de mapeo: por ID de Velo si vino; si no, por email de Velo; si no, por
  // el email de PayPal del que pagó (menos confiable).
  let matchFilter = "";
  if (veloId && /^[0-9a-fA-F-]{20,}$/.test(veloId)) matchFilter = `id=eq.${encodeURIComponent(veloId)}`;
  else if (veloEmail) matchFilter = `email=ilike.${encodeURIComponent(veloEmail)}`;
  else if (payerEmail) matchFilter = `email=ilike.${encodeURIComponent(payerEmail)}`;
  if (!matchFilter) {
    console.log("[paypal-ipn] sin dato para mapear — ignorado");
    return new Response("no match key", { status: 200 });
  }

  // 3) Decidir la actualización según el tipo de evento.
  const now = Date.now();
  let update: Record<string, unknown> | null = null;
  if (txnType === "subscr_signup" || txnType === "subscr_payment") {
    update = { role: "plus", plus_expires_at: new Date(now + PLUS_DAYS * 864e5).toISOString() };
  } else if (txnType === "subscr_eot") {
    // Fin de la suscripción → baja a gratis.
    update = { role: "user", plus_expires_at: new Date(now - 1000).toISOString() };
  } else {
    // subscr_cancel, subscr_failed, etc.: no cortamos ya — conserva Plus hasta
    // que venza el mes pagado (plus_expires_at del último pago).
    console.log(`[paypal-ipn] evento sin acción inmediata (${txnType})`);
    return new Response("ignored", { status: 200 });
  }

  // 4) Actualizar el perfil (match por ID o email).
  try {
    const url = `${SUPABASE_URL}/rest/v1/profiles?${matchFilter}`;
    const res = await fetch(url, {
      method: "PATCH",
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(update),
    });
    const rows = await res.json().catch(() => []);
    const n = Array.isArray(rows) ? rows.length : 0;
    console.log(`[paypal-ipn] ${txnType} → ${matchFilter} → ${JSON.stringify(update)} (perfiles actualizados: ${n})`);
    if (!n) console.warn("[paypal-ipn] ⚠️ ningún perfil coincidió — no se actualizó nada");
  } catch (e) {
    console.error("[paypal-ipn] error actualizando perfil:", (e as Error).message);
  }

  return new Response("ok", { status: 200 });
});
