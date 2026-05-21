// Diagnostic endpoint — GET /api/test-groq to verify key and connectivity
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const GROQ_KEY = process.env.GROQ_API_KEY || process.env.GROQ_KEY;
  if (!GROQ_KEY) {
    return res.json({ ok: false, step: 'env', error: 'GROQ_API_KEY not found in Vercel env vars' });
  }

  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + GROQ_KEY
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: 'Respondé solo: OK' }],
        temperature: 0,
        max_tokens: 5
      })
    });
    const json = await r.json();
    if (json.choices && json.choices[0]) {
      return res.json({ ok: true, model: 'llama-3.3-70b-versatile', response: json.choices[0].message.content });
    }
    return res.json({ ok: false, step: 'api', httpStatus: r.status, error: json.error || json });
  } catch (e) {
    return res.json({ ok: false, step: 'fetch', error: e.message });
  }
};
