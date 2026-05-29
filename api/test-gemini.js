// Diagnostic endpoint — GET /api/test-gemini to verify key and connectivity
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const KEY = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || process.env.GOOGLE_AI_KEY;
  if (!KEY) {
    return res.json({ ok: false, step: 'env', error: 'No API key found. Set GEMINI_API_KEY in Vercel env vars.' });
  }

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
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 200,
            // Disable thinking for 2.5-flash — saves tokens and latency
            thinkingConfig: { thinkingBudget: 0 }
          }
        })
      });

      const json = await r.json();

      if (!r.ok) {
        console.log(`[test-gemini] ${model} HTTP ${r.status}`);
        continue;
      }

      const cand = json.candidates && json.candidates[0];
      const parts = cand && cand.content && cand.content.parts;
      // Skip thought-only parts (thinking models)
      const textPart = parts && parts.find(p => !p.thought && p.text);
      const text = textPart ? textPart.text : null;

      if (text) {
        return res.json({ ok: true, model, response: text.trim() });
      }

      // No text yet — log and try next model
      console.log(`[test-gemini] ${model} no text parts. finishReason=${cand && cand.finishReason}`);
      continue;

    } catch (e) {
      console.log(`[test-gemini] ${model} exception: ${e.message}`);
      continue;
    }
  }

  return res.json({ ok: false, step: 'all_models_failed', tried: MODELS });
};
