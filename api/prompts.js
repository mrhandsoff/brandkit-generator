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

  const sys = `You write image generation prompts for Nano Banana Pro (Google Gemini 3 Pro). It renders text accurately and follows layout instructions precisely.

Write exactly 3 prompts:

LOGO:
Clean brand logo on a pure white background. Include a distinct icon/symbol AND the brand name as a clearly legible wordmark. Flat vector illustration style. Describe the colors using color names or descriptors only — never include hex codes or RGB values in the prompt. No shadows, no gradients on the background.

FACEBOOK COVER:
A 16:9 wide social media banner for Facebook. The composition should feel like a professional marketing asset — premium, designed, intentional. Include the following text elements rendered clearly in the image: the brand name, the tagline, and a short punchy CTA relevant to the brand (e.g. "Book a Free Call", "Get Started Today", "Claim Your Spot"). The brand logo reference image will be provided — instruct the model to place it cleanly on the LEFT SIDE. The right side should contain the text hierarchy: brand name large, tagline below, CTA as a styled button or badge. Background should use brand colors creatively — not plain solid color. No hex codes in the prompt, describe colors by name.

LINKEDIN COVER:
A wide professional LinkedIn company banner. More minimal and corporate than the Facebook cover. Different background concept. Include the brand name and tagline as text. Include a professional CTA (e.g. "Connect With Us", "View Our Work", "Let's Talk"). The brand logo will be provided — instruct the model to place it on the left side. Right side has brand name, tagline, CTA in a clean hierarchy. Must feel like something a Fortune 500 company would use. No hex codes in the prompt, describe colors by name.

IMPORTANT: Never include hex codes, RGB values, or any color codes anywhere in any prompt. Describe colors by name only (e.g. "deep red", "charcoal gray", "navy blue").

Return ONLY raw JSON: { "logo": "...", "fb": "...", "li": "..." }`;

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
        max_tokens: 1800,
        system: sys,
        messages: [{ role: 'user', content:
          `Brand name: ${brand.brandName}
Tagline: ${brand.tagline || 'None'}
Niche: ${brand.niche}
Description: ${brand.description}
Personality: ${brand.personality}
Primary color: ${brand.c1} (describe as color name, never use the hex code in prompts)
Secondary color: ${brand.c2} (describe as color name, never use the hex code in prompts)
Icon concept: ${brand.iconConcept || 'AI decides based on brand'}
Rules: ${brand.rules || 'None'}

Write the 3 prompts now. Remember: no hex codes anywhere.`
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
