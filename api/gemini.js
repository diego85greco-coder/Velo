// Vercel serverless function — Gemini via direct REST API (no SDK dependency)
// Tries models: 2.5-flash → 2.5-flash-preview → 1.5-flash → 1.5-flash-latest
// Disables Gemini 2.5 thinking to save tokens/latency for app use cases

const MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-preview-05-20',
  'gemini-1.5-flash',
  'gemini-1.5-flash-latest'
];
const BASE_URL = (m) => `https://generativelanguage.googleapis.com/v1beta/models/${m}`;

// Merge in thinkingConfig: disable thinking (only accepted by 2.5 models, ignored by 1.5)
function buildGenCfg(overrides) {
  return Object.assign(
    { temperature: 0.7, maxOutputTokens: 400, thinkingConfig: { thinkingBudget: 0 } },
    overrides || {}
  );
}

// Extract the first non-thought text part from candidates
function extractText(json) {
  const cand = json.candidates && json.candidates[0];
  const parts = cand && cand.content && cand.content.parts;
  if (!parts || !parts.length) return null;
  const tp = parts.find(p => !p.thought && p.text);
  return tp ? tp.text : null;
}

// v1594 (SEGURIDAD): exigir un JWT de Supabase válido antes de gastar la API key.
// Antes el endpoint era abierto (CORS *, sin auth) → cualquiera podía pegarle y
// quemar la key + saltear el límite de IA / el gate de Plus. Se valida el token
// contra /auth/v1/user. URL y anon key son públicas (no secretas).
const _SUPA_URL  = process.env.SUPABASE_URL || 'https://yuravtnjvvztsxdtggod.supabase.co';
const _SUPA_ANON = process.env.SUPABASE_ANON_KEY || 'sb_publishable_mBoqW2t3QoJvp5jFecEGgQ_1wrPiT9C';
async function _veloAuthed(req) {
  try {
    const auth = req.headers.authorization || req.headers.Authorization || '';
    const jwt = String(auth).replace(/^Bearer\s+/i, '').trim();
    if (!jwt || jwt === _SUPA_ANON) return null; // exigir token de usuario real, no la anon key
    const r = await fetch(`${_SUPA_URL}/auth/v1/user`, { headers: { apikey: _SUPA_ANON, Authorization: `Bearer ${jwt}` } });
    if (!r.ok) return null;
    const u = await r.json().catch(() => null);
    return (u && u.id) ? jwt : null;
  } catch (_) { return null; }
}

// v1621 (ABUSO): consumir cupo ANTES de gastar la clave de Gemini.
// El tope de 25/24h lo llevaba el cliente insertando en `ia_usage`, así que
// llamar a este endpoint directamente con el token del navegador lo salteaba por
// completo y se podía quemar la cuota en un bucle. Ahora lo cuenta el servidor
// mediante el RPC velo_consume_quota, que cuenta y registra en el mismo paso.
// Si el RPC no responde se DEJA PASAR: preferimos que la app siga funcionando
// ante un fallo de la base antes que cortarle la IA a todo el mundo.
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

  const _jwt = await _veloAuthed(req);
  if (!_jwt) return res.status(401).json({ error: 'No autenticado' });

  // v1625: dos cupos distintos. `ia` es la conversación con el acompañante
  // (25/día, ilimitado con Plus); `ia_sys` son las llamadas que hace la app
  // sola —moderación de cada publicación, detector de crisis, resúmenes,
  // frase del día— con un techo mucho más alto (200/día).
  //
  // En v1621 todo caía en el mismo cupo: alguien que publicaba 25 veces se
  // quedaba sin poder hablar con el acompañante, y el clasificador de crisis
  // dejaba de ejecutarse. El cliente ahora manda `kind`; si no lo manda (una
  // versión vieja en caché) se aplica el cupo estricto, que es el
  // comportamiento de hoy.
  const _kind = (req.body && req.body.kind === 'ia_sys') ? 'ia_sys' : 'ia';
  const _q = await _veloQuota(_jwt, _kind);
  if (!_q.ok) {
    return res.status(429).json({
      error: _kind === 'ia_sys'
        ? 'Límite diario de operaciones automáticas alcanzado'
        : 'Llegaste al límite diario de Velo IA',
      limit: _q.limit, used: _q.used, reason: _q.reason, kind: _kind
    });
  }

  const KEY = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY;
  if (!KEY) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

  const { type, prompt, systemPrompt, msgs, cfg } = req.body || {};

  // Call each model in order until one succeeds with actual text
  async function callGemini(body) {
    for (const model of MODELS) {
      try {
        const r = await fetch(`${BASE_URL(model)}:generateContent?key=${KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const json = await r.json();
        if (!r.ok) { console.log(`[Velo] ${model} HTTP ${r.status} — next`); continue; }
        if (extractText(json)) return json;
        console.log(`[Velo] ${model} no text (finishReason=${(json.candidates||[{}])[0].finishReason}) — next`);
      } catch (e) { console.log(`[Velo] ${model} err: ${e.message}`); }
    }
    return null;
  }

  // ── Multi-turn chat ──────────────────────────────────────────
  if (type === 'chat') {
    try {
      let allMsgs = (msgs || []).filter(m => m.text && m.text.trim());
      while (allMsgs.length && allMsgs[0].user === false) allMsgs.shift();
      if (!allMsgs.length) return res.status(400).json({ error: 'No user messages' });

      const contents = allMsgs.map(m => ({
        role: m.user ? 'user' : 'model',
        parts: [{ text: m.text }]
      }));
      const body = { contents, generationConfig: buildGenCfg(Object.assign({ maxOutputTokens: 250 }, cfg || {})) };
      if (systemPrompt) body.system_instruction = { parts: [{ text: systemPrompt }] };

      const json = await callGemini(body);
      if (!json) return res.status(500).json({ error: 'All Gemini models failed' });
      return res.json(json);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── Grounded search ──────────────────────────────────────────
  if (type === 'grounded') {
    try {
      const body = {
        contents: [{ role: 'user', parts: [{ text: prompt || '' }] }],
        tools: [{ google_search: {} }],
        generationConfig: buildGenCfg(Object.assign({ temperature: 0.5, maxOutputTokens: 1800 }, cfg || {}))
      };
      const json = await callGemini(body);
      if (!json) return res.status(500).json({ error: 'All Gemini models failed' });
      return res.json(json);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── Vision / image moderation ────────────────────────────────
  if (type === 'vision') {
    try {
      const { image, mimeType } = req.body || {};
      if (!image) return res.status(400).json({ error: 'No image data' });
      const body = {
        contents: [{ role: 'user', parts: [
          { inlineData: { mimeType: mimeType || 'image/jpeg', data: image } },
          { text: prompt || '¿Esta imagen contiene desnudez, contenido sexual explícito, pornografía u otro contenido inapropiado? Respondé SOLO con una línea: "safe" o "unsafe: <motivo breve en español>".' }
        ]}],
        generationConfig: buildGenCfg({ temperature: 0, maxOutputTokens: 80 })
      };
      const json = await callGemini(body);
      if (!json) return res.status(500).json({ error: 'All Gemini models failed' });
      return res.json(json);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── Image generation ─────────────────────────────────────────
  if (type === 'image-gen') {
    try {
      const imgModel = 'gemini-2.0-flash-preview-image-generation';
      const body = {
        contents: [{ role: 'user', parts: [{ text: prompt || '' }] }],
        generationConfig: { responseModalities: ['IMAGE', 'TEXT'] }
      };
      const r = await fetch(`${BASE_URL(imgModel)}:generateContent?key=${KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const json = await r.json();
      if (!r.ok) return res.status(r.status).json({ error: (json.error && json.error.message) || 'Image generation failed' });
      return res.json(json);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── Single-turn generate (default) ──────────────────────────
  try {
    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt || '' }] }],
      generationConfig: buildGenCfg(cfg || {})
    };
    const json = await callGemini(body);
    if (!json) return res.status(500).json({ error: 'All Gemini models failed' });
    return res.json(json);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
