// Vercel serverless function — sends thank-you emails via Resend, keeping the key server-side
const { Resend } = require('resend');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) return res.status(500).json({ error: 'RESEND_API_KEY not configured' });

  const { email, name, type, amount } = req.body || {};
  if (!email || !type) return res.status(400).json({ error: 'Missing email or type' });

  const resend = new Resend(RESEND_KEY);
  const displayName = name || 'amigo/a';

  let subject, html;

  if (type === 'plus') {
    subject = '⭐ ¡Bienvenido/a a Velo Plus!';
    html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f1eb;font-family:'Georgia',serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1eb;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#fffef9;border-radius:18px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#C8A560,#A07840);padding:32px 28px;text-align:center">
          <div style="font-size:36px;margin-bottom:8px">⭐</div>
          <div style="font-family:'Georgia',serif;font-size:26px;color:#fffef9;font-weight:700;letter-spacing:-.5px">Velo Plus</div>
          <div style="font-size:13px;color:rgba(255,254,249,.8);margin-top:4px">Tu membresía está activa</div>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:28px 28px 20px">
          <p style="font-size:17px;color:#1a2e1a;margin:0 0 16px;line-height:1.5">Hola, <strong>${displayName}</strong> 🌿</p>
          <p style="font-size:14px;color:#3d5a3e;line-height:1.7;margin:0 0 20px">Tu suscripción a <strong>Velo Plus</strong> está activa. Gracias por apoyar la comunidad y por confiar en Velo para acompañar tu bienestar emocional.</p>
          <!-- Feature list -->
          <div style="background:#f9f6ef;border-radius:12px;padding:18px 20px;margin-bottom:20px;border:1px solid #e8e2d6">
            <div style="font-size:12px;font-weight:700;color:#8a6a30;letter-spacing:.5px;margin-bottom:12px">LO QUE DESBLOQUEASTE</div>
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr><td style="padding:5px 0;font-size:13px;color:#3d5a3e">✅ &nbsp;Mensajes al Mar ilimitados</td></tr>
              <tr><td style="padding:5px 0;font-size:13px;color:#3d5a3e">✅ &nbsp;Crear Círculos de Paz</td></tr>
              <tr><td style="padding:5px 0;font-size:13px;color:#C8A560">✅ &nbsp;Insignia dorada ✨</td></tr>
              <tr><td style="padding:5px 0;font-size:13px;color:#3d5a3e">✅ &nbsp;Prioridad en lista de guardianes</td></tr>
              <tr><td style="padding:5px 0;font-size:13px;color:#3d5a3e">✅ &nbsp;Sesiones de guardián ilimitadas</td></tr>
              <tr><td style="padding:5px 0;font-size:13px;color:#3d5a3e">💚 &nbsp;Tu suscripción subsidia sesiones para quienes más lo necesitan</td></tr>
            </table>
          </div>
          <p style="font-size:13px;color:#6b7c6b;line-height:1.6;margin:0 0 24px">Gracias por ser parte de quienes hacen que Velo crezca. Tu apoyo importa más de lo que imaginás.</p>
          <!-- CTA -->
          <table cellpadding="0" cellspacing="0" width="100%"><tr><td align="center">
            <a href="https://velo-ashen-mu.vercel.app" style="display:inline-block;background:linear-gradient(135deg,#C8A560,#A07840);color:#fffef9;text-decoration:none;padding:13px 28px;border-radius:100px;font-size:14px;font-weight:700;letter-spacing:.3px">Ir a Velo Plus →</a>
          </td></tr></table>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:20px 28px 28px;border-top:1px solid #e8e2d6;text-align:center">
          <p style="font-size:11px;color:#a09880;margin:0;line-height:1.7">Con gratitud 🌿<br><strong style="color:#3d5a3e">El equipo Velo</strong><br><a href="https://velo-ashen-mu.vercel.app" style="color:#7a9a7a;text-decoration:none">velo-ashen-mu.vercel.app</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  } else {
    // donation
    const amtText = amount ? `$${amount} USD` : 'tu donación';
    subject = `💚 Gracias por apoyar Velo, ${displayName}`;
    html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f1eb;font-family:'Georgia',serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1eb;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#fffef9;border-radius:18px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#2e5e35,#4a8a52);padding:32px 28px;text-align:center">
          <div style="font-size:36px;margin-bottom:8px">💚</div>
          <div style="font-family:'Georgia',serif;font-size:26px;color:#fffef9;font-weight:700;letter-spacing:-.5px">Velo</div>
          <div style="font-size:13px;color:rgba(255,254,249,.8);margin-top:4px">Recibimos tu donación · ${amtText}</div>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:28px 28px 20px">
          <p style="font-size:17px;color:#1a2e1a;margin:0 0 16px;line-height:1.5">Hola, <strong>${displayName}</strong> 🌿</p>
          <p style="font-size:14px;color:#3d5a3e;line-height:1.7;margin:0 0 20px">Recibimos tu aporte de <strong>${amtText}</strong>. Gracias de corazón — cada contribución ayuda a mantener Velo completamente gratuito y a subsidiar sesiones para personas que más lo necesitan.</p>
          <!-- Impact -->
          <div style="background:#f0f7f1;border-radius:12px;padding:18px 20px;margin-bottom:20px;border:1px solid #c8e0c8">
            <div style="font-size:12px;font-weight:700;color:#2e5e35;letter-spacing:.5px;margin-bottom:12px">EL IMPACTO DE TU APORTE</div>
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr><td style="padding:5px 0;font-size:13px;color:#3d5a3e">🌱 &nbsp;Mantiene la app gratuita para todos</td></tr>
              <tr><td style="padding:5px 0;font-size:13px;color:#3d5a3e">🤝 &nbsp;Subsidia sesiones solidarias</td></tr>
              <tr><td style="padding:5px 0;font-size:13px;color:#3d5a3e">💬 &nbsp;Financia el desarrollo de nuevas herramientas</td></tr>
              <tr><td style="padding:5px 0;font-size:13px;color:#3d5a3e">🌍 &nbsp;Amplía el acceso al bienestar emocional</td></tr>
            </table>
          </div>
          <p style="font-size:13px;color:#6b7c6b;line-height:1.6;margin:0 0 24px">Con cada aporte, más personas pueden acceder a acompañamiento emocional sin costo. Lo que hiciste hoy importa.</p>
          <!-- CTA -->
          <table cellpadding="0" cellspacing="0" width="100%"><tr><td align="center">
            <a href="https://velo-ashen-mu.vercel.app" style="display:inline-block;background:linear-gradient(135deg,#2e5e35,#4a8a52);color:#fffef9;text-decoration:none;padding:13px 28px;border-radius:100px;font-size:14px;font-weight:700;letter-spacing:.3px">Volver a Velo →</a>
          </td></tr></table>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:20px 28px 28px;border-top:1px solid #e8e2d6;text-align:center">
          <p style="font-size:11px;color:#a09880;margin:0;line-height:1.7">Con gratitud 🌿<br><strong style="color:#3d5a3e">El equipo Velo</strong><br><a href="https://velo-ashen-mu.vercel.app" style="color:#7a9a7a;text-decoration:none">velo-ashen-mu.vercel.app</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }

  try {
    await resend.emails.send({
      from: 'Velo <onboarding@resend.dev>',
      to: email,
      subject,
      html,
    });
    return res.json({ ok: true });
  } catch (e) {
    console.error('send-email error:', e);
    return res.status(500).json({ error: e.message });
  }
};
