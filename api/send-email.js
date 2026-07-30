// Vercel serverless function — sends emails via Resend HTTP API (no npm package needed)
// v1597 (SEGURIDAD): antes era un endpoint ABIERTO (CORS *, sin auth) → cualquiera
// podía hacer que Velo enviara emails desde noreply@heyvelo.app a cualquier
// dirección con contenido arbitrario (phishing/suplantación + quema de la cuota de
// Resend). Ahora exige un JWT de Supabase válido; y 'admin-reply' exige ser admin.
const _SUPA_URL   = process.env.SUPABASE_URL || 'https://yuravtnjvvztsxdtggod.supabase.co';
const _SUPA_ANON  = process.env.SUPABASE_ANON_KEY || 'sb_publishable_mBoqW2t3QoJvp5jFecEGgQ_1wrPiT9C';
const _ADMIN_MAILS = ['consultas@heyvelo.app', 'wearevelo.app@gmail.com'];
async function _veloUser(req) {
  try {
    const auth = req.headers.authorization || req.headers.Authorization || '';
    const jwt = String(auth).replace(/^Bearer\s+/i, '').trim();
    if (!jwt || jwt === _SUPA_ANON) return null;
    const r = await fetch(`${_SUPA_URL}/auth/v1/user`, { headers: { apikey: _SUPA_ANON, Authorization: `Bearer ${jwt}` } });
    if (!r.ok) return null;
    const u = await r.json().catch(() => null);
    if (!u || !u.id) return null;
    u._jwt = jwt;
    return u;
  } catch (_) { return null; }
}

// v1621 (ABUSO): tope de correos por persona y día, contado en el servidor.
// Exigir sesión (v1597) evitó que cualquiera de afuera mandara correos como
// Velo, pero una cuenta cualquiera todavía podía llamar en bucle y quemar la
// cuota de Resend —o usar el remitente noreply@heyvelo.app para spam—. El RPC
// velo_consume_quota cuenta y registra en el mismo paso.
// Ante un fallo de la base se deja pasar: no vale la pena cortar los correos
// transaccionales por un problema de conexión.
async function _veloQuota(jwt, kind) {
  try {
    const r = await fetch(`${_SUPA_URL}/rest/v1/rpc/velo_consume_quota`, {
      method: 'POST',
      headers: { apikey: _SUPA_ANON, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_kind: kind })
    });
    if (!r.ok) return { ok: true, degraded: true };
    const j = await r.json().catch(() => null);
    if (!j || typeof j.ok === 'undefined') return { ok: true, degraded: true };
    return j;
  } catch (_) { return { ok: true, degraded: true }; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) return res.status(500).json({ error: 'RESEND_API_KEY not configured' });

  const { email, name, type, amount, topic, reply, allowReply, message } = req.body || {};
  if (!email || !type) return res.status(400).json({ error: 'Missing email or type' });

  // Auth: exigir usuario autenticado. 'admin-reply' (asunto+cuerpo arbitrarios
  // enviados como Velo) exige además ser admin.
  const _u = await _veloUser(req);
  if (!_u) return res.status(401).json({ error: 'No autenticado' });
  const _isAdmin = _ADMIN_MAILS.indexOf(String(_u.email || '').trim().toLowerCase()) >= 0;
  if (type === 'admin-reply' && !_isAdmin) {
    return res.status(403).json({ error: 'Solo admin' });
  }
  // El tope no aplica a moderación: responder consultas es su trabajo.
  if (!_isAdmin) {
    const _q = await _veloQuota(_u._jwt, 'email');
    if (!_q.ok) return res.status(429).json({ error: 'Llegaste al límite diario de correos', limit: _q.limit, used: _q.used });
  }

  const displayName = name || 'amigo/a';
  const APP_URL = 'https://heyvelo.app';
  let subject, html, replyTo;

  if (type === 'admin-reply') {
    const safeReply = (reply || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
    const safeTopic = (topic || 'Consulta').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    subject = `Re: ${topic || 'Consulta'} — Velo`;
    if (allowReply) replyTo = 'consultas@heyvelo.app';
    html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f1eb;font-family:'Georgia',serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1eb;padding:32px 16px"><tr><td align="center">
<table width="100%" style="max-width:520px;background:#fffef9;border-radius:18px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
<tr><td style="background:linear-gradient(135deg,#2e5e35,#4a8a52);padding:24px 28px;text-align:center">
<div style="font-size:30px;margin-bottom:6px">&#128140;</div>
<div style="font-size:22px;color:#fffef9;font-weight:700">Respuesta de Velo</div>
<div style="font-size:12px;color:rgba(255,254,249,.75);margin-top:4px">Re: ${safeTopic}</div>
</td></tr>
<tr><td style="padding:28px 28px 20px">
<p style="font-size:17px;color:#1a2e1a;margin:0 0 14px;line-height:1.5">Hola, <strong>${displayName}</strong></p>
<div style="background:#f0f7f1;border-radius:12px;padding:18px 20px;margin-bottom:20px;border:1px solid #c8e0c8;font-size:14px;color:#2a4a2e;line-height:1.7">${safeReply}</div>
${allowReply ? '<p style="font-size:13px;color:#3d5a3e;line-height:1.6;margin:0 0 20px">Podés responder directamente a este correo si tenés alguna duda adicional.</p>' : '<p style="font-size:13px;color:#3d5a3e;line-height:1.6;margin:0 0 20px">Si tenés consultas adicionales, podés escribirnos desde la sección Contacto en Velo.</p>'}
<table cellpadding="0" cellspacing="0" width="100%"><tr><td align="center">
<a href="${APP_URL}" style="display:inline-block;background:linear-gradient(135deg,#2e5e35,#4a8a52);color:#fffef9;text-decoration:none;padding:13px 28px;border-radius:100px;font-size:14px;font-weight:700">Ir a Velo &rarr;</a>
</td></tr></table>
</td></tr>
<tr><td style="padding:20px 28px 28px;border-top:1px solid #e8e2d6;text-align:center">
<p style="font-size:11px;color:#a09880;margin:0;line-height:1.7">Con gratitud<br><strong style="color:#3d5a3e">El equipo Velo</strong><br><a href="${APP_URL}" style="color:#7a9a7a;text-decoration:none">heyvelo.app</a></p>
</td></tr>
</table></td></tr></table></body></html>`;
  } else if (type === 'new-contact') {
    // Notificación interna al admin cuando llega un formulario de contacto
    const safeName    = (name    || 'Sin nombre').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const safeTopic   = (topic   || 'General').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const safeMessage = (message || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
    const safeEmail   = (email   || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    subject = `📬 Nueva consulta: ${topic || 'General'} — Velo`;
    html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f1eb;font-family:'Georgia',serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1eb;padding:32px 16px"><tr><td align="center">
<table width="100%" style="max-width:520px;background:#fffef9;border-radius:18px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
<tr><td style="background:linear-gradient(135deg,#2e5e35,#4a8a52);padding:24px 28px;text-align:center">
<div style="font-size:30px;margin-bottom:6px">📬</div>
<div style="font-size:22px;color:#fffef9;font-weight:700">Nueva consulta</div>
<div style="font-size:12px;color:rgba(255,254,249,.75);margin-top:4px">Asunto: ${safeTopic}</div>
</td></tr>
<tr><td style="padding:28px 28px 20px">
<table style="width:100%;border-collapse:collapse;margin-bottom:16px">
<tr><td style="font-size:12px;color:#8a9a8a;padding:6px 0;font-weight:700;width:100px">DE:</td><td style="font-size:14px;color:#1a2e1a;padding:6px 0">${safeName}</td></tr>
<tr><td style="font-size:12px;color:#8a9a8a;padding:6px 0;font-weight:700">CORREO:</td><td style="font-size:14px;color:#1a2e1a;padding:6px 0"><a href="mailto:${safeEmail}" style="color:#2e5e35">${safeEmail}</a></td></tr>
<tr><td style="font-size:12px;color:#8a9a8a;padding:6px 0;font-weight:700">ASUNTO:</td><td style="font-size:14px;color:#1a2e1a;padding:6px 0">${safeTopic}</td></tr>
</table>
<div style="background:#f0f7f1;border-radius:12px;padding:18px 20px;margin-bottom:20px;border:1px solid #c8e0c8;font-size:14px;color:#2a4a2e;line-height:1.7">${safeMessage}</div>
<table cellpadding="0" cellspacing="0" width="100%"><tr><td align="center">
<a href="${APP_URL}" style="display:inline-block;background:linear-gradient(135deg,#2e5e35,#4a8a52);color:#fffef9;text-decoration:none;padding:13px 28px;border-radius:100px;font-size:14px;font-weight:700">Responder desde Velo &rarr;</a>
</td></tr></table>
</td></tr>
<tr><td style="padding:20px 28px 28px;border-top:1px solid #e8e2d6;text-align:center">
<p style="font-size:11px;color:#a09880;margin:0;line-height:1.7">Notificación automática de <strong style="color:#3d5a3e">Velo</strong><br><a href="${APP_URL}" style="color:#7a9a7a;text-decoration:none">heyvelo.app</a></p>
</td></tr>
</table></td></tr></table></body></html>`;
  } else if (type === 'plus') {
    subject = '⭐ ¡Bienvenido/a a Velo Plus!';
    html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f1eb;font-family:'Georgia',serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1eb;padding:32px 16px"><tr><td align="center">
<table width="100%" style="max-width:520px;background:#fffef9;border-radius:18px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
<tr><td style="background:linear-gradient(135deg,#C8A560,#A07840);padding:32px 28px;text-align:center">
<div style="font-size:36px;margin-bottom:8px">&#11088;</div>
<div style="font-size:26px;color:#fffef9;font-weight:700">Velo Plus</div>
<div style="font-size:13px;color:rgba(255,254,249,.8);margin-top:4px">Tu membresía está activa</div>
</td></tr>
<tr><td style="padding:28px 28px 20px">
<p style="font-size:17px;color:#1a2e1a;margin:0 0 16px;line-height:1.5">Hola, <strong>${displayName}</strong></p>
<p style="font-size:14px;color:#3d5a3e;line-height:1.7;margin:0 0 20px">Tu suscripción a <strong>Velo Plus</strong> está activa. Gracias por apoyar la comunidad.</p>
<div style="background:#f9f6ef;border-radius:12px;padding:18px 20px;margin-bottom:20px;border:1px solid #e8e2d6">
<div style="font-size:12px;font-weight:700;color:#8a6a30;margin-bottom:12px">LO QUE DESBLOQUEASTE</div>
<p style="font-size:13px;color:#3d5a3e;margin:4px 0">&#9989; Mensajes al Mar ilimitados</p>
<p style="font-size:13px;color:#3d5a3e;margin:4px 0">&#9989; Crear Círculos de Paz</p>
<p style="font-size:13px;color:#C8A560;margin:4px 0">&#9989; Insignia dorada</p>
<p style="font-size:13px;color:#3d5a3e;margin:4px 0">&#9989; Sesiones de guardián ilimitadas</p>
<p style="font-size:13px;color:#3d5a3e;margin:4px 0">&#128154; Tu suscripción subsidia sesiones para quienes más lo necesitan</p>
</div>
<table cellpadding="0" cellspacing="0" width="100%"><tr><td align="center">
<a href="${APP_URL}" style="display:inline-block;background:linear-gradient(135deg,#C8A560,#A07840);color:#fffef9;text-decoration:none;padding:13px 28px;border-radius:100px;font-size:14px;font-weight:700">Ir a Velo Plus &rarr;</a>
</td></tr></table>
</td></tr>
<tr><td style="padding:20px 28px 28px;border-top:1px solid #e8e2d6;text-align:center">
<p style="font-size:11px;color:#a09880;margin:0;line-height:1.7">Con gratitud<br><strong style="color:#3d5a3e">El equipo Velo</strong><br><a href="${APP_URL}" style="color:#7a9a7a;text-decoration:none">heyvelo.app</a></p>
</td></tr>
</table></td></tr></table></body></html>`;
  } else {
    const amtText = amount ? `$${amount} USD` : 'tu donación';
    subject = `Gracias por apoyar Velo, ${displayName}`;
    html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f1eb;font-family:'Georgia',serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1eb;padding:32px 16px"><tr><td align="center">
<table width="100%" style="max-width:520px;background:#fffef9;border-radius:18px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
<tr><td style="background:linear-gradient(135deg,#2e5e35,#4a8a52);padding:32px 28px;text-align:center">
<div style="font-size:36px;margin-bottom:8px">&#128154;</div>
<div style="font-size:26px;color:#fffef9;font-weight:700">Velo</div>
<div style="font-size:13px;color:rgba(255,254,249,.8);margin-top:4px">Recibimos tu donación &middot; ${amtText}</div>
</td></tr>
<tr><td style="padding:28px 28px 20px">
<p style="font-size:17px;color:#1a2e1a;margin:0 0 16px;line-height:1.5">Hola, <strong>${displayName}</strong></p>
<p style="font-size:14px;color:#3d5a3e;line-height:1.7;margin:0 0 20px">Recibimos tu aporte de <strong>${amtText}</strong>. Gracias de corazón. Cada contribución ayuda a mantener Velo gratuito.</p>
<div style="background:#f0f7f1;border-radius:12px;padding:18px 20px;margin-bottom:20px;border:1px solid #c8e0c8">
<div style="font-size:12px;font-weight:700;color:#2e5e35;margin-bottom:12px">EL IMPACTO DE TU APORTE</div>
<p style="font-size:13px;color:#3d5a3e;margin:4px 0">&#127807; Mantiene la app gratuita para todos</p>
<p style="font-size:13px;color:#3d5a3e;margin:4px 0">&#129309; Subsidia sesiones solidarias</p>
<p style="font-size:13px;color:#3d5a3e;margin:4px 0">&#127757; Amplía el acceso al bienestar emocional</p>
</div>
<table cellpadding="0" cellspacing="0" width="100%"><tr><td align="center">
<a href="${APP_URL}" style="display:inline-block;background:linear-gradient(135deg,#2e5e35,#4a8a52);color:#fffef9;text-decoration:none;padding:13px 28px;border-radius:100px;font-size:14px;font-weight:700">Volver a Velo &rarr;</a>
</td></tr></table>
</td></tr>
<tr><td style="padding:20px 28px 28px;border-top:1px solid #e8e2d6;text-align:center">
<p style="font-size:11px;color:#a09880;margin:0;line-height:1.7">Con gratitud<br><strong style="color:#3d5a3e">El equipo Velo</strong><br><a href="${APP_URL}" style="color:#7a9a7a;text-decoration:none">heyvelo.app</a></p>
</td></tr>
</table></td></tr></table></body></html>`;
  }

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Velo <noreply@heyvelo.app>', to: email, subject, html, ...(replyTo ? { reply_to: replyTo } : {}) })
    });
    const json = await r.json();
    if (!r.ok) return res.status(500).json({ error: json.message || 'Resend error' });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
