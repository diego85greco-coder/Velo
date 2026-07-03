// Edge Function: send-dm-push
// Se dispara con un DB webhook / trigger cuando entra un row nuevo a
// direct_messages. Lee la push_subscription del destinatario y le manda
// una Web Push. Skippea sentinels internos (__velo_*).
//
// Deploy:
//   1. supabase secrets set VAPID_PUBLIC_KEY=<...> VAPID_PRIVATE_KEY=<...>
//      VAPID_SUBJECT=mailto:hey@heyvelo.app
//   2. supabase functions deploy send-dm-push --no-verify-jwt
//   3. Configurar el trigger en SQL (ver README).
//
// Requiere que el schema `net` esté habilitado en Postgres si preferís
// el trigger PL/pgSQL en vez del Database Webhook de la UI.

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
// @ts-ignore npm: import
import webPush from "npm:web-push@3.6.7";

const VAPID_PUBLIC   = Deno.env.get("VAPID_PUBLIC_KEY")   || "";
const VAPID_PRIVATE  = Deno.env.get("VAPID_PRIVATE_KEY")  || "";
const VAPID_SUBJECT  = Deno.env.get("VAPID_SUBJECT")      || "mailto:hey@heyvelo.app";
const SUPABASE_URL   = Deno.env.get("SUPABASE_URL")       || "";
const SERVICE_ROLE   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
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
    return new Response("no target", { status: 200 });
  }

  const txt = String(rec.text || "");

  // Skippear sentinels internos (chat req/acc/rej/busy/bye, guardian, help)
  if (txt.startsWith("__velo_") &&
      !txt.startsWith("__velo_dm_audio__") &&
      !txt.startsWith("__velo_dm_image__")) {
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
    return new Response("no sub", { status: 200 });
  }

  let sub: any = row.push_subscription;
  if (typeof sub === "string") {
    try { sub = JSON.parse(sub); } catch (_) { return new Response("bad sub", { status: 200 }); }
  }

  // Cuerpo preview
  let body = txt;
  if (txt.startsWith("__velo_dm_audio__")) body = "🎙️ Te envió una nota de voz";
  else if (txt.startsWith("__velo_dm_image__")) body = "📷 Te envió una foto";
  else if (txt.length > 100) body = txt.slice(0, 100) + "…";

  const notifPayload = JSON.stringify({
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
    await webPush.sendNotification(sub, notifPayload, { TTL: 60 * 60 * 24 });
    return new Response("sent", { status: 200 });
  } catch (e: any) {
    console.error("[send-dm-push]", e?.statusCode, e?.body || e?.message);
    // 410 / 404 = subscription expiró — devolver 200 igual (no queremos reintentos)
    return new Response(`push err: ${e?.statusCode || "??"}`, { status: 200 });
  }
});
