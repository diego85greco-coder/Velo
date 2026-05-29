// Diagnostic endpoint — GET /api/test-gemini to verify key and connectivity
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const KEY = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || process.env.GOOGLE_AI_KEY;
  if (!KEY) {
    return res.json({ ok: false, step: 'env', error: 'No API key found. Set GEMINI_API_KEY in Vercel env vars.' });
  }

  // Try models in order — first that works wins
  const MODELS = [
    'gemini-2.5-flash',
    'gemini-2.5-flash-preview-05-20',
    'gemini-1.5-flash',
    'gemini-1.5-flash-latest'
  ];

  const BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';

  for (const model of MODELS) {
    try {
      const r = await fetch(`${BASE}${model}:generateContent?key=${KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Reply with just the word OK' }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 10 }
        })
      });

      const json = await r.json();

      if (!r.ok) {
        // Model not found or key error — try next model
        console.log(`[test-gemini] ${model} HTTP ${r.status}: ${JSON.stringify(json).slice(0,120)}`);
        continue;
      }

      // Extract text safely — handle thinking models (parts may have thought:true entries)
      const cand = json.candidates && json.candidates[0];
      const parts = cand && cand.content && cand.content.parts;
      const textPart = parts && parts.find(p => !p.thought && p.text);
      const text = textPart ? textPart.text : (parts && parts[0] && parts[0].text) || null;

      if (text) {
        return res.json({ ok: true, model, response: text.trim() });
      }

      // Candidates present but no text — return raw for debugging
      return res.json({ ok: false, step: 'parse', model, raw: JSON.stringify(json).slice(0, 400) });

    } catch (e) {
      console.log(`[test-gemini] ${model} exception: ${e.message}`);
      continue;
    }
  }

  return res.json({ ok: false, step: 'all_models_failed', tried: MODELS });
};
