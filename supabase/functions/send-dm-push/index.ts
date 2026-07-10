// Edge Function: send-dm-push
// Se dispara con un DB webhook / trigger cuando entra un row nuevo a
// direct_messages. Lee la push_subscription del destinatario y le manda
// una Web Push. Skippea sentinels internos (__velo_*).
//
// Deploy:
//   1. supabase secrets set VAPID_PRIVATE_KEY=<...> VAPID_SUBJECT=mailto:hey@heyvelo.app
//      (VAPID_PUBLIC_KEY ya no hace falta — está hardcodeada, ver abajo)
//   2. supabase functions deploy send-dm-push --no-verify-jwt
//   3. Configurar el trigger en SQL (ver README).
//
// Requiere que el schema `net` esté habilitado en Postgres si preferís
// el trigger PL/pgSQL en vez del Database Webhook de la UI.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
// @ts-ignore npm: import
import webPush from "npm:web-push@3.6.7";

// Pub key hardcodeada — igual patrón que .github/scripts/send-push.js.
// La pub key viaja al cliente igual (applicationServerKey), no es secreta.
// Hardcodearla elimina el modo de falla en que el secret de Supabase quedaba
// desalineado con la key real del cliente y todos los push devolvían 403
// BadJwtToken en silencio (fire-and-forget, sin feedback al usuario).
const VAPID_PUBLIC   = "BDArqGzq2k2topSo3dg0XJC0-vsUrn466S0RRvwbHc2BYV61mSGfk9E5CenvUJKrXbsJGVqgC8Nvxq6nn20-0u0";
const VAPID_PRIVATE  = (Deno.env.get("VAPID_PRIVATE_KEY")  || "").trim();
const VAPID_SUBJECT  = "mailto:diego85greco@gmail.com"; // hardcoded — mismo criterio que send-push.js
const SUPABASE_URL   = Deno.env.get("SUPABASE_URL")       || "";
const SERVICE_ROLE   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// Fingerprint de la private key (sin exponerla) via Web Crypto — no depende
// de node:crypto compat. Comparar con logs de `supabase functions logs
// send-dm-push`. Esperado (par vigente desde v1320): hash=9b488d2f053ab8d1
async function _sha256Hex16(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}
if (VAPID_PRIVATE) {
  const _hash = await _sha256Hex16(VAPID_PRIVATE);
  console.log(`[vapid] pub_prefix=${VAPID_PUBLIC.slice(0,12)}... priv_len=${VAPID_PRIVATE.length} priv_prefix=${VAPID_PRIVATE.slice(0,8)} priv_tail=${VAPID_PRIVATE.slice(-4)} priv_hash=${_hash}`);
  if (_hash !== "9b488d2f053ab8d1") {
    console.warn("[vapid] ⚠️ PRIVATE KEY MISMATCH — el secret VAPID_PRIVATE_KEY de este Edge Function NO es RYeGjvT...rZWg. Correr: supabase secrets set VAPID_PRIVATE_KEY=RYeGjvTCv_ozjj54pSlTS_Qra_oD9363jIChSR-rZWg");
  }
  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
} else {
  console.error("[vapid] VAPID_PRIVATE_KEY no está seteada como secret de este Edge Function");
}

serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return new Response("ok", { status: 200 });
  let payload: any = {};
  try { payload = await req.json(); } catch (_) { return new Response("bad json", { status: 400 }); }

  // Soporta 2 formatos:
  //   Database Webhook Supabase: { type:"INSERT", record:{...}, old_record:null, ... }
  //   Trigger PL/pgSQL custom:   { record:{...} }
  const rec = payload.record || payload;
  if (!rec || !rec.to_id || !rec.from_id) {
    console.log("[send-dm-push] no target (payload sin to_id/from_id)");
    return new Response("no target", { status: 200 });
  }

  console.log(`[send-dm-push] invocación: from=${rec.from_id} to=${rec.to_id}`);

  if (!VAPID_PRIVATE) {
    console.error("[send-dm-push] vapid not configured");
    return new Response("vapid not configured", { status: 200 });
  }

  const txt = String(rec.text || "");

  // v1400: los pedidos de chat SÍ generan push (guardián con la app cerrada
  // se entera de que alguien necesita acompañamiento; lo mismo un pedido de
  // chat directo). El resto de los sentinels internos se sigue salteando.
  let sentinelPush: { title: string; body: string; tag: string } | null = null;
  if (txt.startsWith("__velo_guardian_req__")) {
    sentinelPush = {
      title: "🛡️ Alguien necesita acompañamiento",
      body: `${rec.from_name || "Alguien"} te pide un chat de apoyo. Entrá a Velo para aceptar — si no podés ahora, se le avisa que no estás disponible.`,
      tag: "velo-guardian-req",
    };
  } else if (txt === "__velo_chat_req__") {
    sentinelPush = {
      title: `${rec.from_name || "Alguien"} quiere chatear 💬`,
      body: "Te llegó una solicitud de chat. Entrá a Velo para aceptarla o rechazarla.",
      tag: `velo-dm-${rec.from_id}`,
    };
  } else if (txt === "__velo_accompany_req__") {
    sentinelPush = {
      title: "💚 Alguien quiere acompañarte",
      body: "Un guardián vio tu mensaje en la Sala de Ayuda y quiere acompañarte. Entrá a Velo para responder.",
      tag: "velo-accompany-req",
    };
  } else if (txt.startsWith("__velo_") &&
      !txt.startsWith("__velo_dm_audio__") &&
      !txt.startsWith("__velo_dm_image__")) {
    console.log(`[send-dm-push] sentinel skip (${txt.slice(0, 24)})`);
    return new Response("sentinel skip", { status: 200 });
  }

  // Sacar la push_subscription del destinatario
  const url = `${SUPABASE_URL}/rest/v1/profiles?id=eq.${rec.to_id}&select=push_subscription,nombre`;
  const profRes = await fetch(url, {
    headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` }
  });
  const rows = await profRes.json().catch(() => []);
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row || !row.push_subscription) {
    console.log(`[send-dm-push] NO SUB — el destinatario ${rec.to_id} no tiene push_subscription guardada (no instaló la PWA / no dio permiso de notificaciones)`);
    return new Response("no sub", { status: 200 });
  }

  let sub: any = row.push_subscription;
  if (typeof sub === "string") {
    try { sub = JSON.parse(sub); } catch (_) { console.error("[send-dm-push] bad sub JSON"); return new Response("bad sub", { status: 200 }); }
  }
  // El cliente guarda { sub: {...}, tz, clientPubKey, buildV } desde v1325 —
  // desenvolver si viene en ese formato envuelto.
  const rawSub = sub && sub.sub && sub.sub.endpoint ? sub.sub : sub;

  // Cuerpo preview
  let body = txt;
  if (txt.startsWith("__velo_dm_audio__")) body = "🎙️ Te envió una nota de voz";
  else if (txt.startsWith("__velo_dm_image__")) body = "📷 Te envió una foto";
  else if (txt.length > 100) body = txt.slice(0, 100) + "…";

  const notifPayload = JSON.stringify(sentinelPush ? {
    title: sentinelPush.title,
    body: sentinelPush.body,
    icon: "/assets/icon-192.png",
    badge: "/assets/icon-72.png",
    tag: sentinelPush.tag,
    url: "/",
    requireInteraction: true,
    actions: [
      { action: "open", title: "💬 Abrir Velo", url: "/" },
      { action: "later", title: "Ahora no" }
    ]
  } : {
    title: `${rec.from_name || "Alguien"} 💬`,
    body,
    icon: "/assets/icon-192.png",
    badge: "/assets/icon-72.png",
    tag: `velo-dm-${rec.from_id}`,
    url: `/?open=dm&peer=${encodeURIComponent(rec.from_id || "")}`,
    // Custom actions para deep-link — el service worker las procesa
    actions: [
      { action: "open-dm", title: "💬 Ver mensaje", url: `/?open=dm&peer=${encodeURIComponent(rec.from_id || "")}` },
      { action: "later", title: "Después" }
    ]
  });

  try {
    await webPush.sendNotification(rawSub, notifPayload, { TTL: 60 * 60 * 24 });
    console.log(`[send-dm-push] ✅ SENT — push entregado al servicio para ${rec.to_id}`);
    return new Response("sent", { status: 200 });
  } catch (e: any) {
    const errBody = String(e?.body || e?.message || "");
    console.error("[send-dm-push]", e?.statusCode, errBody);
    // 410/404 = subscription expiró; 403 BadJwtToken = mismatch de VAPID key.
    // En ambos casos limpiamos la sub para que el cliente la regenere sola
    // la próxima vez que abra la app (mismo criterio que send-push.js).
    const isExpired = e?.statusCode === 410 || e?.statusCode === 404;
    const isVapidMismatch = e?.statusCode === 403 && /BadJwtToken|Unauthorized|VapidPk/i.test(errBody);
    if (isExpired || isVapidMismatch) {
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${rec.to_id}`, {
          method: "PATCH",
          headers: {
            apikey: SERVICE_ROLE,
            Authorization: `Bearer ${SERVICE_ROLE}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal"
          },
          body: JSON.stringify({ push_subscription: null })
        });
        console.log(`[send-dm-push] cleared stale sub for ${rec.to_id} (${isExpired ? "expired" : "vapid-mismatch"})`);
      } catch (_) {}
    }
    // devolver 200 igual (no queremos reintentos)
    return new Response(`push err: ${e?.statusCode || "??"}`, { status: 200 });
  }
});
