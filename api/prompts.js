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

  const sys = `You write highly detailed, specific image generation prompts for Nano Banana Pro (Google Gemini 3 Pro Image). This model renders text accurately and follows precise layout instructions. Your prompts must be detailed enough that a designer could reproduce the result exactly.

Write exactly 3 prompts. Be specific about: lighting, materials, textures, spatial relationships, font weights, element sizes relative to each other, background treatments, and atmosphere. Never be vague or generic.

NEVER include hex codes, RGB values, or any numeric color codes. Describe every color by name (e.g. "crimson red", "charcoal slate", "warm ivory").

---

PROMPT 1 — LOGO:
A clean, professional brand logo on a pure white background. Describe:
- A specific, meaningful icon or symbol that relates directly to the brand's niche — not generic
- The brand name rendered as a clean wordmark beside or beneath the icon
- Exact color names for every element
- Style: flat vector, no drop shadows, no gradients on background, no decorative borders
- Precise spatial layout of icon vs wordmark
- Any specific design details that make it distinctive

---

PROMPT 2 — FACEBOOK COVER (16:9):
A wide social media banner. The reference logo image will be provided. Describe in detail:

LAYOUT (single horizontal strip — all elements must sit on one horizontal band so it reads at any crop):
- FAR LEFT: The provided logo reference image placed cleanly — specify exact size relative to banner height (e.g. "logo occupies 60% of the banner height")
- DIRECTLY BESIDE THE LOGO (still left side): The tagline in a specific font weight and size, in a specific color, on a specific number of lines
- FAR RIGHT: ONE call to action only — write the exact CTA text, describe whether it appears as a pill button, badge, underlined text, or outlined box, and what color it is
- CENTRE AREA: purely background — no text, no elements

DO NOT include the brand name as text — the logo already contains it.
DO NOT put anything else on the right side except the single CTA.

BACKGROUND: Describe a specific, creative background treatment using brand colors — gradients, geometric shapes, subtle patterns, light flares, textures. Not a plain solid color. Be specific.

ATMOSPHERE: Describe the overall mood and feeling.

---

PROMPT 3 — LINKEDIN COVER (wider/more panoramic):
Same strict single-strip layout as Facebook but more minimal, corporate, and premium. Different background concept from the Facebook cover. The reference logo image will be provided.

LAYOUT:
- FAR LEFT: Provided logo reference, slightly smaller than Facebook version (e.g. "50% of banner height")
- DIRECTLY BESIDE LOGO: Tagline only, smaller text, muted color
- FAR RIGHT: One professional CTA — write the exact text and describe its treatment
- NO brand name as text anywhere
- NO stacking of elements — everything on one horizontal line

BACKGROUND: A different, more restrained background to the Facebook cover. More corporate. Describe specifically.

ATMOSPHERE: Fortune 500 energy. Confident, minimal, premium.

---

Return ONLY raw JSON with no extra text: { "logo": "...", "fb": "...", "li": "..." }`;

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
        max_tokens: 2500,
        system: sys,
        messages: [{ role: 'user', content:
`Brand name: ${brand.brandName}
Tagline: ${brand.tagline || 'None'}
Niche: ${brand.niche}
Description: ${brand.description}
Personality: ${brand.personality}
Primary color: ${brand.c1} — describe as a color name in prompts, never use this hex code
Secondary color: ${brand.c2} — describe as a color name in prompts, never use this hex code
Logo icon concept: ${brand.iconConcept || 'choose something specific and meaningful for this niche'}
Hard rules: ${brand.rules || 'None'}

Write all 3 prompts now. Be highly specific and detailed. No hex codes anywhere.`
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
