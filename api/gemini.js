// Vercel serverless function — Gemini 2.0 Flash via @google/generative-ai SDK
const { GoogleGenerativeAI } = require('@google/generative-ai');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

  const { type, prompt, systemPrompt, msgs, cfg } = req.body || {};
  const genCfg = Object.assign({ temperature: 0.7, maxOutputTokens: 300 }, cfg || {});

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

  // ── Multi-turn chat ──────────────────────────────────────────
  if (type === 'chat') {
    try {
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        systemInstruction: systemPrompt || '',
        generationConfig: Object.assign({ temperature: 0.88, maxOutputTokens: 200 }, cfg || {})
      });

      // Build history (all turns except the last user message)
      let allMsgs = (msgs || []).filter(m => m.text && m.text.trim());
      // First message must be from user
      while (allMsgs.length && allMsgs[0].user === false) allMsgs.shift();
      if (!allMsgs.length) return res.status(400).json({ error: 'No user messages' });

      const lastMsg = allMsgs[allMsgs.length - 1];
      const history = allMsgs.slice(0, -1).map(m => ({
        role: m.user ? 'user' : 'model',
        parts: [{ text: m.text }]
      }));

      const chat = model.startChat({ history });
      const result = await chat.sendMessage(lastMsg.text);
      const text = result.response.text();

      // Return in Gemini REST shape so existing client code (_gText) works unchanged
      return res.json({
        candidates: [{ content: { parts: [{ text }] } }]
      });
    } catch (e) {
      console.error('[Velo] Gemini chat error:', e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  // ── Grounded search ──────────────────────────────────────────
  if (type === 'grounded') {
    try {
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        tools: [{ googleSearch: {} }],
        generationConfig: Object.assign({ temperature: 0.5, maxOutputTokens: 1500 }, cfg || {})
      });
      const result = await model.generateContent(prompt || '');
      const text = result.response.text();
      // Pass through groundingMetadata so the client can extract real article URLs
      const candidate = (result.response.candidates || [])[0] || {};
      const groundingChunks = (candidate.groundingMetadata && candidate.groundingMetadata.groundingChunks) || [];
      return res.json({
        candidates: [{
          content: { parts: [{ text }] },
          groundingMetadata: { groundingChunks }
        }]
      });
    } catch (e) {
      console.error('[Velo] Gemini grounded error:', e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  // ── Single-turn generate (default) ──────────────────────────
  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      generationConfig: genCfg
    });
    const result = await model.generateContent(prompt || '');
    const text = result.response.text();
    return res.json({
      candidates: [{ content: { parts: [{ text }] } }]
    });
  } catch (e) {
    console.error('[Velo] Gemini generate error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
