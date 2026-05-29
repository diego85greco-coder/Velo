// Vercel serverless function — Gemini via direct REST API (no SDK dependency)
// Tries models in order: 2.5-flash → 2.5-flash-preview → 1.5-flash
// Accepts GEMINI_API_KEY or GEMINI_KEY env var name

const MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-preview-05-20',
  'gemini-1.5-flash',
  'gemini-1.5-flash-latest'
];
const BASE_URL = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}`;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const KEY = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY;
  if (!KEY) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

  const { type, prompt, systemPrompt, msgs, cfg } = req.body || {};

  // Try each model until one succeeds
  async function callGemini(body) {
    for (const model of MODELS) {
      try {
        const r = await fetch(`${BASE_URL(model)}:generateContent?key=${KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const json = await r.json();
        if (!r.ok) {
          console.log(`[Velo] ${model} HTTP ${r.status} — trying next`);
          continue;
        }
        // Validate candidates exist and have text
        const cand = json.candidates && json.candidates[0];
        const parts = cand && cand.content && cand.content.parts;
        if (!parts || !parts.length) {
          console.log(`[Velo] ${model} returned no parts — trying next`);
          continue;
        }
        return { json, model };
      } catch (e) {
        console.log(`[Velo] ${model} exception: ${e.message}`);
        continue;
      }
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

      const body = {
        contents,
        generationConfig: Object.assign({ temperature: 0.88, maxOutputTokens: 200 }, cfg || {})
      };
      if (systemPrompt) body.system_instruction = { parts: [{ text: systemPrompt }] };

      const result = await callGemini(body);
      if (!result) return res.status(500).json({ error: 'All Gemini models failed' });
      return res.json(result.json);
    } catch (e) {
      console.error('[Velo] Gemini chat error:', e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  // ── Grounded search ──────────────────────────────────────────
  if (type === 'grounded') {
    try {
      const body = {
        contents: [{ role: 'user', parts: [{ text: prompt || '' }] }],
        tools: [{ google_search: {} }],
        generationConfig: Object.assign({ temperature: 0.5, maxOutputTokens: 1500 }, cfg || {})
      };

      const result = await callGemini(body);
      if (!result) return res.status(500).json({ error: 'All Gemini models failed' });
      return res.json(result.json);
    } catch (e) {
      console.error('[Velo] Gemini grounded error:', e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  // ── Single-turn generate (default) ──────────────────────────
  try {
    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt || '' }] }],
      generationConfig: Object.assign({ temperature: 0.7, maxOutputTokens: 300 }, cfg || {})
    };

    const result = await callGemini(body);
    if (!result) return res.status(500).json({ error: 'All Gemini models failed' });
    return res.json(result.json);
  } catch (e) {
    console.error('[Velo] Gemini generate error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
