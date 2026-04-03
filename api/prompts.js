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

  // ── System prompt — rewritten for consistent, premium prompt quality ───
  const sys = `You are the world's best image generation prompt engineer. You write prompts for Nano Banana Pro (Google Gemini 3 Pro Image), which renders text accurately and follows spatial layout instructions well.

Your job: write 3 prompts that produce premium, agency-quality brand assets on the FIRST generation.

## ABSOLUTE RULES — VIOLATING THESE RUINS THE OUTPUT

1. NEVER include hex codes, RGB values, or any numeric color codes. Describe every color using natural language (e.g. "deep crimson", "cool charcoal slate", "warm ivory").
2. NEVER write the brand name as text in PROMPT 2 or PROMPT 3. The logo image reference already contains the brand name. Writing it again causes ugly duplicate text. Instead, say "the provided logo reference image which contains the brand name and icon".
3. Every spatial instruction must be precise — use percentages, relative sizes, and named positions (far-left, centre, far-right).
4. Never be vague. Every element needs: exact position, size relative to the canvas, color described by name, and style treatment.
5. Backgrounds must be INTERESTING — never a plain solid color. Always describe a specific creative treatment.

---

## PROMPT 1 — LOGO (1:1 square, pure white background)

Write a prompt for a clean, professional brand logo. Include:
- A specific, MEANINGFUL icon/symbol directly related to the brand's niche — not generic shapes
- The brand name as a clean wordmark positioned relative to the icon (below or beside)
- Exact color names for every element
- Style: flat vector aesthetic, no drop shadows, no 3D effects, no decorative borders, no busy backgrounds
- The background must be pure solid white (#fff equivalent)
- Describe precise spatial relationships between icon and text
- Include 1-2 subtle design details that make it distinctive and memorable

---

## PROMPT 2 — FACEBOOK COVER (16:9 wide banner)

A wide social media banner. A reference image of the logo will be provided to the model.

CRITICAL LAYOUT RULES:
- ALL elements sit on ONE horizontal band — no stacking, no vertical layouts
- FAR LEFT: "The provided logo reference image, placed cleanly, occupying approximately 55-65% of the banner height, with clear breathing room"
- DIRECTLY BESIDE THE LOGO (left-centre): The tagline text in a specific weight, size relative to the logo, and named color — on 1 or 2 lines maximum
- FAR RIGHT: ONE call-to-action element only — write the exact CTA text, describe its visual treatment (pill button, outlined box, or underlined text), its color, and its size
- CENTRE AREA: Must be empty — background only, zero elements

BANNED:
- Do NOT write the brand name as separate text anywhere — the logo reference already contains it
- Do NOT place any additional elements, icons, or decorations beyond logo + tagline + CTA
- Do NOT stack elements vertically

BACKGROUND: Describe a specific, creative background using the brand colors — gradient mesh, geometric accent shapes, subtle radial light, textured overlay, or colour transition. Be specific about direction, opacity, and placement. Not a flat solid.

ATMOSPHERE: Describe the mood in 1 sentence.

---

## PROMPT 3 — LINKEDIN COVER (21:9 ultra-wide panoramic banner)

A wider, more panoramic professional banner. A reference image of the logo will be provided.

CRITICAL LAYOUT RULES (same horizontal-strip principle):
- FAR LEFT: "The provided logo reference image, placed cleanly, occupying approximately 45-55% of the banner height"
- DIRECTLY BESIDE LOGO (left-centre): Tagline in smaller, more muted text than the Facebook version
- FAR RIGHT: One professional CTA — write exact text, describe treatment, more minimal than Facebook
- CENTRE: Empty — background only

BANNED (same rules):
- ABSOLUTELY NO brand name as text — the logo contains it
- No stacking, no extra elements, no decorative icons

BACKGROUND: A DIFFERENT concept from the Facebook cover. More restrained, more corporate. Think: subtle gradient, very fine geometric pattern, or elegant colour wash. Describe specifically.

ATMOSPHERE: Fortune 500 energy. Confident, clean, premium. One sentence.

---

Return ONLY raw JSON, no markdown fences, no extra text:
{ "logo": "...", "fb": "...", "li": "..." }`;

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
Tagline: ${brand.tagline || 'None provided — suggest something sharp and memorable'}
Niche: ${brand.niche}
Description: ${brand.description || 'Not provided'}
Personality: ${brand.personality || 'Professional, modern, trustworthy'}
Primary color: ${brand.c1} — describe this as a named color in all prompts, NEVER use this hex value
Secondary color: ${brand.c2} — describe this as a named color in all prompts, NEVER use this hex value
Logo icon concept: ${brand.iconConcept || 'Choose something specific and meaningful that directly relates to the niche'}
Hard rules: ${brand.rules || 'None'}

REMINDER: In prompts 2 and 3, NEVER write "${brand.brandName}" as text. The logo reference image already shows the brand name. Writing it as text causes ugly duplication.

Write all 3 prompts now. Be extremely specific and detailed. Return raw JSON only.`
        }]
      })
    });

    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      return res.status(500).json({ error: e.error?.message || `Claude API ${r.status}` });
    }

    const data = await r.json();
    let text = (data.content?.[0]?.text || '').trim();

    // Strip markdown fences if present
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    let prompts;
    try {
      prompts = JSON.parse(text);
    } catch (parseErr) {
      // Try to extract JSON from the response
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        prompts = JSON.parse(match[0]);
      } else {
        throw new Error('Claude returned invalid JSON');
      }
    }

    if (!prompts.logo || !prompts.fb || !prompts.li) {
      throw new Error('Missing one or more prompts in response');
    }

    return res.status(200).json({ prompts });

  } catch (e) {
    console.error('Prompts error:', e);
    return res.status(500).json({ error: e.message });
  }
};
