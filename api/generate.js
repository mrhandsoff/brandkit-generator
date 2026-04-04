const fetch = require('node-fetch');

const OR_KEY = () => process.env.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;

// ── 2 best logo models on OpenRouter ─────────────────────────────────
const LOGO_MODELS = [
  { id: 'nanobana', name: 'Nano Banana 2', model: 'google/nano-banana-2' },
  { id: 'riverflow', name: 'Riverflow V2 Pro', model: 'sourceful/riverflow-v2-pro' }
];

const COVER_MODEL = 'google/nano-banana-2';

// ── OpenRouter image generation ──────────────────────────────────────
async function generateImage(model, prompt) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OR_KEY()}`
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!r.ok) {
    const err = await r.text().catch(() => '');
    throw new Error(`OpenRouter (${r.status}): ${err.slice(0, 200)}`);
  }

  const data = await r.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('No content in response');

  if (typeof content === 'string') {
    if (content.startsWith('http')) return content;
    if (content.startsWith('data:image')) return content;
    const urlMatch = content.match(/https?:\/\/[^\s\)]+\.(png|jpg|jpeg|webp)/i);
    if (urlMatch) return urlMatch[0];
  }

  if (Array.isArray(content)) {
    for (const block of content) {
      if (block.type === 'image_url' && block.image_url?.url) return block.image_url.url;
      if (block.type === 'image' && block.url) return block.url;
      if (block.type === 'image' && block.source?.url) return block.source.url;
      if (block.type === 'image' && block.source?.data) return `data:image/png;base64,${block.source.data}`;
      if (block.type === 'text' && block.text) {
        const u = block.text.match(/https?:\/\/[^\s\)]+\.(png|jpg|jpeg|webp)/i);
        if (u) return u[0];
      }
    }
  }

  throw new Error('Could not extract image from response');
}

async function withRetry(fn, retries = 1) {
  for (let i = 0; i <= retries; i++) {
    try { return await fn(); } catch (e) {
      if (i === retries) throw e;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

// ── Main handler ─────────────────────────────────────────────────────
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!OR_KEY()) return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });

  const { type, prompt, modelId } = req.body;

  try {
    if (type === 'logos') {
      if (!prompt) return res.status(400).json({ error: 'prompt required' });
      const results = await Promise.allSettled(
        LOGO_MODELS.map(m => withRetry(() => generateImage(m.model, prompt)))
      );
      const logos = LOGO_MODELS.map((m, i) => ({
        id: m.id, name: m.name,
        url: results[i].status === 'fulfilled' ? results[i].value : null,
        error: results[i].status === 'rejected' ? results[i].reason.message : null
      }));
      if (!logos.some(l => l.url)) throw new Error('All models failed: ' + logos.map(l => l.error).join('; '));
      return res.status(200).json({ logos });
    }

    if (type === 'logo-single') {
      if (!prompt || !modelId) return res.status(400).json({ error: 'prompt and modelId required' });
      const model = LOGO_MODELS.find(m => m.id === modelId);
      if (!model) return res.status(400).json({ error: 'Invalid modelId' });
      const url = await withRetry(() => generateImage(model.model, prompt));
      return res.status(200).json({ url });
    }

    if (type === 'cover-fb' || type === 'cover-li') {
      if (!prompt) return res.status(400).json({ error: 'prompt required' });
      const url = await withRetry(() => generateImage(COVER_MODEL, prompt), 2);
      return res.status(200).json({ url });
    }

    return res.status(400).json({ error: `Invalid type: ${type}` });
  } catch (e) {
    console.error(`[generate] ${type}:`, e.message);
    return res.status(500).json({ error: e.message });
  }
};
