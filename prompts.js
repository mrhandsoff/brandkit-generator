const fetch = require('node-fetch');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { brand } = req.body;
  if (!brand) return res.status(400).json({ error: 'Missing brand data' });

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const sys = `You write image generation prompts for Nano Banana Pro (Google Gemini 3 Pro image model). It excels at text rendering and reference image composition.

Write exactly 2 prompts:

LOGO: Clean brand logo on pure white background. Include a specific icon/symbol AND the brand name as legible wordmark text. Flat vector illustration style. Specify exact hex colors. White background only.

COVER: Creative, unique social media cover banner for this brand's specific industry — no generic descriptions. Describe a compelling visual concept with the brand name and tagline as text. End with exactly this sentence: "The provided reference image is the brand logo — place it prominently and cleanly on the left side of the banner."

Return ONLY raw JSON: { "logo": "...", "cover": "..." }`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1200,
        system: sys,
        messages: [{ role: 'user', content:
          `Brand: ${brand.brandName}\nTagline: ${brand.tagline||'None'}\nNiche: ${brand.niche}\nDescription: ${brand.description}\nPersonality: ${brand.personality}\nPrimary: ${brand.c1}\nSecondary: ${brand.c2}\nIcon: ${brand.iconConcept||'AI decides'}\nRules: ${brand.rules||'None'}`
        }]
      })
    });

    if (!r.ok) {
      const e = await r.json();
      return res.status(500).json({ error: e.error?.message || 'Claude error' });
    }

    const data = await r.json();
    const text = (data.content?.[0]?.text || '').replace(/```json|```/g, '').trim();
    const prompts = JSON.parse(text);
    return res.status(200).json({ prompts });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
