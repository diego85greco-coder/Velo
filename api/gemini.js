// Vercel serverless function — Gemini 2.0 Flash via direct REST API (no SDK dependency)
// Accepts GEMINI_API_KEY or GEMINI_KEY env var name

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const KEY = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY;
  if (!KEY) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

  const { type, prompt, systemPrompt, msgs, cfg } = req.body || {};

  // ── Multi-turn chat ──────────────────────────────────────────
  if (type === 'chat') {
    try {
      let allMsgs = (msgs || []).filter(m => m.text && m.text.trim());
      // First turn must be from user
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

      const r = await fetch(`${BASE}:generateContent?key=${KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const json = await r.json();
      if (!r.ok) {
        console.error('[Velo] Gemini chat HTTP', r.status, JSON.stringify(json).slice(0, 200));
        return res.status(r.status).json({ error: (json.error && json.error.message) || 'Gemini error' });
      }
      return res.json(json);
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

      const r = await fetch(`${BASE}:generateContent?key=${KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const json = await r.json();
      if (!r.ok) {
        console.error('[Velo] Gemini grounded HTTP', r.status, JSON.stringify(json).slice(0, 200));
        return res.status(r.status).json({ error: (json.error && json.error.message) || 'Gemini error' });
      }
      // Pass through full response — client extracts groundingMetadata.groundingChunks
      return res.json(json);
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

    const r = await fetch(`${BASE}:generateContent?key=${KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const json = await r.json();
    if (!r.ok) {
      console.error('[Velo] Gemini generate HTTP', r.status, JSON.stringify(json).slice(0, 200));
      return res.status(r.status).json({ error: (json.error && json.error.message) || 'Gemini error' });
    }
    return res.json(json);
  } catch (e) {
    console.error('[Velo] Gemini generate error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
