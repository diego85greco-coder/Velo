// Vercel serverless function — proxies Gemini API calls, keeping the key server-side
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const GEMINI_KEY = process.env.GEMINI_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_KEY;
  if (!GEMINI_KEY) return res.status(500).json({ error: 'GEMINI_KEY not configured' });

  const MODELS = [
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=',
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=',
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key='
  ];

  const { type, prompt, systemPrompt, msgs, cfg } = req.body || {};

  // ── Grounded search ──────────────────────────────────────────
  if (type === 'grounded') {
    try {
      const r = await fetch(MODELS[0] + GEMINI_KEY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: Object.assign({ temperature: 0.5, maxOutputTokens: 1500 }, cfg || {})
        })
      });
      return res.json(await r.json());
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── Multi-turn chat ──────────────────────────────────────────
  if (type === 'chat') {
    let contents = (msgs || []).map(m => ({ role: m.user ? 'user' : 'model', parts: [{ text: m.text }] }));
    while (contents.length && contents[0].role !== 'user') contents.shift();
    if (!contents.length) return res.json({ error: 'No user messages' });
    const body = {
      system_instruction: { parts: [{ text: systemPrompt || '' }] },
      contents,
      generationConfig: Object.assign({ temperature: 0.88, maxOutputTokens: 200 }, cfg || {})
    };
    for (const url of MODELS) {
      try {
        const r = await fetch(url + GEMINI_KEY, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
        const json = await r.json();
        if (json.candidates) return res.json(json);
      } catch (e) { continue; }
    }
    return res.status(500).json({ error: 'All models failed' });
  }

  // ── Single-turn generate (default) ──────────────────────────
  const body = {
    contents: [{ parts: [{ text: prompt || '' }] }],
    generationConfig: Object.assign({ temperature: 0.7, maxOutputTokens: 300 }, cfg || {})
  };
  for (const url of MODELS) {
    try {
      const r = await fetch(url + GEMINI_KEY, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      const json = await r.json();
      if (json.candidates) return res.json(json);
    } catch (e) { continue; }
  }
  return res.status(500).json({ error: 'All models failed' });
};
