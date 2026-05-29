// Diagnostic endpoint — GET /api/test-gemini to verify key and connectivity
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const GEMINI_KEY = process.env.GEMINI_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_KEY;
  if (!GEMINI_KEY) {
    return res.json({ ok: false, step: 'env', error: 'GEMINI_KEY env var not found in Vercel' });
  }

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + GEMINI_KEY;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Respondé solo: OK' }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 10 }
      })
    });
    const json = await r.json();
    if (json.candidates) {
      return res.json({ ok: true, model: 'gemini-2.0-flash', response: json.candidates[0].content.parts[0].text });
    }
    return res.json({ ok: false, step: 'api', httpStatus: r.status, error: json.error || json });
  } catch (e) {
    return res.json({ ok: false, step: 'fetch', error: e.message });
  }
};
