// Vercel serverless — proxies Groq API, keeping the key server-side
// Compatible with the same request/response shape as api/gemini.js
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const GROQ_KEY = process.env.GROQ_API_KEY || process.env.GROQ_KEY;
  if (!GROQ_KEY) return res.status(500).json({ error: 'GROQ_API_KEY not configured' });

  const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
  const MODELS   = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];

  const { type, prompt, systemPrompt, msgs, cfg } = req.body || {};

  // Convert Groq OpenAI response → Gemini-compatible shape
  function wrap(text) {
    return { candidates: [{ content: { parts: [{ text }] } }] };
  }

  async function callGroq(messages, cfgOverride) {
    const config = Object.assign({ temperature: 0.7, maxOutputTokens: 300 }, cfg || {}, cfgOverride || {});
    for (const model of MODELS) {
      try {
        const r = await fetch(GROQ_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_KEY },
          body: JSON.stringify({
            model,
            messages,
            temperature: config.temperature,
            max_tokens: config.maxOutputTokens || config.max_tokens || 300
          })
        });
        const json = await r.json();
        if (json.choices && json.choices[0] && json.choices[0].message) {
          return json.choices[0].message.content;
        }
      } catch (e) { continue; }
    }
    return null;
  }

  // ── Grounded (news) — Groq has no web search; generate without URLs ─
  if (type === 'grounded') {
    try {
      const text = await callGroq(
        [{ role: 'user', content: prompt || '' }],
        { temperature: 0.5, maxOutputTokens: 1500 }
      );
      if (text) return res.json(wrap(text));
      return res.status(500).json({ error: 'Groq returned no content' });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── Multi-turn chat ──────────────────────────────────────────────────
  if (type === 'chat') {
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    (msgs || []).forEach(m => messages.push({ role: m.user ? 'user' : 'assistant', content: m.text || '' }));
    if (!messages.some(m => m.role === 'user')) {
      return res.json({ error: 'No user messages' });
    }
    const text = await callGroq(messages, { temperature: 0.88, maxOutputTokens: 200 });
    if (text) return res.json(wrap(text));
    return res.status(500).json({ error: 'All models failed' });
  }

  // ── Single-turn generate (default) ──────────────────────────────────
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: prompt || '' });
  const text = await callGroq(messages);
  if (text) return res.json(wrap(text));
  return res.status(500).json({ error: 'All models failed' });
};
