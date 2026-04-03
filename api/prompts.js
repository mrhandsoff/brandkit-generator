const fetch = require('node-fetch');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { brand } = req.body;
  if (!brand || !brand.brandName || !brand.niche)
    return res.status(400).json({ error: 'Brand name and niche are required' });

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const sys = `You are an elite brand identity designer who writes image generation prompts. You think like Paula Scher, Aaron Draplin, and Michael Bierut. You write prompts for multiple AI image models.

You will write exactly 3 prompts. Each must be extremely detailed and specific.

ABSOLUTE RULES:
1. NEVER include hex codes, RGB values, or numeric color codes. Describe every color by name (e.g. "electric blue", "charcoal", "warm ivory").
2. Every element needs exact position, relative size, named color, and style.

---

## PROMPT 1 — LOGO (1:1 square)

Design an iconic brand logo. Think Pentagram, Wolff Olins, Collins.

THE ICON must be an ABSTRACT GEOMETRIC MARK:
- A bold shape, lettermark, or monogram — NOT a literal picture of what the brand does
- Good examples: "Bold uppercase B from two perfect circles with a diagonal negative space cut" / "Abstract angular arrow from three overlapping parallelograms" / "Geometric shield with a clean cutout forming a hidden letter"
- If the user's concept is literal (e.g. "a book"), abstract it into geometry: "angular shape suggesting pages, formed from two converging trapezoids"
- ONE brand color for the icon. Wordmark in contrasting neutral.
- Must work at 16px (favicon) and 1000px (billboard)

THE WORDMARK:
- Brand name in clean modern sans-serif (specify weight: bold, semibold, medium)
- Position relative to icon (beside or below)
- Subtle letter-spacing

STYLE: Flat solid vector. No gradients. No shadows. No outlines. No decorative borders. Pure geometry.
BACKGROUND: Solid near-black (#0a0a0a equivalent described as "near-black" or "deep charcoal"). This makes the colored icon pop.

---

## PROMPT 2 — FACEBOOK BACKGROUND (16:9 wide)

CRITICAL: This is BACKGROUND ART ONLY. No text. No words. No letters. No logo. No tagline. No CTA. PURE ABSTRACT VISUAL ART.

Create a stunning, premium abstract background using the brand's color palette. This will be used as a social media cover — text and logo will be overlaid separately.

Requirements:
- Wide 16:9 composition
- Use the brand's primary and secondary colors creatively
- The LEFT 30% should be slightly darker or more subdued (the logo will sit here)
- The RIGHT 70% should be the hero visual — bold, beautiful, eye-catching

STYLE DIRECTION — choose ONE and execute it with extreme specificity:
- Gradient mesh: describe exact color transitions, direction (e.g. "sweeping from deep navy at bottom-left to electric blue at top-right with a warm accent bloom at centre"), and light behavior
- Abstract geometry: large-scale overlapping shapes at varying opacities creating depth and dimension
- Flowing organic forms: smooth curves like liquid glass or draped silk, with subtle light caustics
- Architectural perspective: clean converging lines creating dramatic depth, with color wash
- Atmospheric: soft bokeh-like light orbs, subtle grain texture, depth-of-field blur effect

Be EXTREMELY specific about colors, angles, opacity, scale, and positioning. The more specific, the better the output.

NO TEXT. NO WORDS. NO LETTERS. PURE VISUAL ART.

---

## PROMPT 3 — LINKEDIN BACKGROUND (21:9 ultra-wide)

Same rules as Prompt 2: BACKGROUND ART ONLY. No text. No words. No letters. No logo. PURE ABSTRACT VISUAL ART.

A different creative direction from the Facebook background. More restrained, more corporate, but equally beautiful.

Requirements:
- Ultra-wide 21:9 panoramic composition
- Same brand color palette but different treatment
- LEFT 25% slightly subdued for logo placement
- More horizontal flow to match the panoramic format
- Think: Fortune 500 annual report header, Bloomberg terminal aesthetic, architectural photography

Be extremely specific. Different concept from Prompt 2.

NO TEXT. NO WORDS. NO LETTERS. PURE VISUAL ART.

---

## FONT PAIRING

Based on the brand's personality and niche, suggest a Google Fonts pairing:
- "heading": A distinctive display/heading font from Google Fonts (e.g. "Space Grotesk", "Outfit", "Syne", "Cabinet Grotesk", "Plus Jakarta Sans", "Clash Display", "Satoshi"). Pick something that matches the brand personality — bold brands get geometric sans, elegant brands get refined serifs, tech brands get monospace-influenced faces.
- "body": A clean readable body font from Google Fonts (e.g. "Inter", "DM Sans", "General Sans", "Manrope", "Nunito Sans", "Source Sans 3"). Should complement the heading font.

Do NOT always pick the same fonts. Match the brand's personality.

---

Return ONLY raw JSON, no markdown fences:
{ "logo": "...", "fb": "...", "li": "...", "fonts": { "heading": "...", "body": "..." } }`;

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
        max_tokens: 3000,
        system: sys,
        messages: [{
          role: 'user',
          content: `Brand name: ${brand.brandName}
Tagline: ${brand.tagline || 'None provided'}
Niche: ${brand.niche}
Description: ${brand.description || 'Not provided'}
Personality: ${brand.personality || 'Professional, modern, trustworthy'}
Primary color: ${brand.c1} — describe as a named color, NEVER use this hex
Secondary color: ${brand.c2} — describe as a named color, NEVER use this hex
Logo icon concept: ${brand.iconConcept || 'Create a bold abstract geometric mark — a lettermark, monogram, or abstract shape. NOT a literal illustration.'}
Hard rules: ${brand.rules || 'None'}

CRITICAL:
1. Logo icon = ABSTRACT GEOMETRIC SHAPE. If the concept above is too literal, abstract it into pure geometry.
2. Cover prompts = BACKGROUND ART ONLY. Zero text. Zero words. Zero letters. The text gets added separately.
3. FB and LI backgrounds must be DIFFERENT creative concepts from each other.

Write all 3 prompts. Return raw JSON only.`
        }]
      })
    });

    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      return res.status(500).json({ error: e.error?.message || `Claude API ${r.status}` });
    }

    const data = await r.json();
    let text = (data.content?.[0]?.text || '').trim();
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    let prompts;
    try {
      prompts = JSON.parse(text);
    } catch (_) {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) prompts = JSON.parse(match[0]);
      else throw new Error('Claude returned invalid JSON');
    }

    if (!prompts.logo || !prompts.fb || !prompts.li)
      throw new Error('Missing prompts in response');

    // Ensure fonts exist with fallback
    if (!prompts.fonts) prompts.fonts = { heading: 'Space Grotesk', body: 'DM Sans' };

    return res.status(200).json({ prompts });

  } catch (e) {
    console.error('Prompts error:', e);
    return res.status(500).json({ error: e.message });
  }
};
