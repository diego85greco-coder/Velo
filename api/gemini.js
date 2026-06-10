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

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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
