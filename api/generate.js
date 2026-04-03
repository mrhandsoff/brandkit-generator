const fetch = require('node-fetch');
const FAL_KEY = () => process.env.FAL_API_KEY;

const LOGO_MODELS = [
  {
    id: 'gemini', name: 'Gemini Pro',
    endpoint: 'fal-ai/nano-banana-pro',
    body: (prompt) => ({ prompt, num_images: 1, aspect_ratio: '1:1', output_format: 'png', safety_tolerance: '4', resolution: '2K' })
  },
  {
    id: 'ideogram', name: 'Ideogram v3',
    endpoint: 'fal-ai/ideogram/v3',
    body: (prompt) => ({ prompt, aspect_ratio: '1:1', style_type: 'DESIGN' })
  }
];

async function falQueue(endpoint, body) {
  const r = await fetch(`https://queue.fal.run/${endpoint}`, {
    method: 'POST',
    headers: { 'Authorization': `Key ${FAL_KEY()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`fal (${r.status}): ${(await r.text()).slice(0, 200)}`);
  const job = await r.json();
  if (!job.status_url || !job.response_url) throw new Error('No polling URLs');

  for (let i = 0; i < 120; i++) {
    await new Promise(res => setTimeout(res, 3000));
    try {
      const sr = await fetch(job.status_url, { headers: { 'Authorization': `Key ${FAL_KEY()}` } });
      const sd = await sr.json();
      if (sd.status === 'COMPLETED') {
        const rr = await fetch(job.response_url, { headers: { 'Authorization': `Key ${FAL_KEY()}` } });
        const result = await rr.json();
        return result.images?.[0]?.url || result.image?.url || null;
      }
      if (sd.status === 'FAILED') throw new Error(`Failed: ${sd.error || 'Unknown'}`);
    } catch (e) { if (e.message.startsWith('Failed')) throw e; }
  }
  throw new Error('Timed out');
}

async function withRetry(fn, retries = 1) {
  for (let i = 0; i <= retries; i++) {
    try { return await fn(); } catch (e) { if (i === retries) throw e; await new Promise(r => setTimeout(r, 2000)); }
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!FAL_KEY()) return res.status(500).json({ error: 'FAL_API_KEY not configured' });

  const { type, prompt, imageUrl, modelId } = req.body;

  try {
    // ── ALL LOGOS — 2 models in parallel ────────────────────────────
    if (type === 'logos') {
      if (!prompt) return res.status(400).json({ error: 'prompt required' });
      const results = await Promise.allSettled(
        LOGO_MODELS.map(m => withRetry(() => falQueue(m.endpoint, m.body(prompt))))
      );
      const logos = LOGO_MODELS.map((m, i) => ({
        id: m.id, name: m.name,
        url: results[i].status === 'fulfilled' ? results[i].value : null,
        error: results[i].status === 'rejected' ? results[i].reason.message : null
      }));
      if (!logos.some(l => l.url)) throw new Error('All models failed');
      return res.status(200).json({ logos });
    }

    // ── SINGLE LOGO — regen from specific model ─────────────────────
    if (type === 'logo-single') {
      if (!prompt || !modelId) return res.status(400).json({ error: 'prompt and modelId required' });
      const model = LOGO_MODELS.find(m => m.id === modelId);
      if (!model) return res.status(400).json({ error: 'Invalid modelId' });
      const url = await withRetry(() => falQueue(model.endpoint, model.body(prompt)));
      return res.status(200).json({ url });
    }

    // ── REMOVE BACKGROUND — bria ────────────────────────────────────
    if (type === 'remove-bg') {
      if (!imageUrl) return res.status(400).json({ error: 'imageUrl required' });
      const url = await falQueue('fal-ai/bria/background/remove', { image_url: imageUrl });
      return res.status(200).json({ url });
    }

    // ── COVER BACKGROUNDS — no text, art only ───────────────────────
    if (type === 'cover-fb' || type === 'cover-li') {
      if (!prompt) return res.status(400).json({ error: 'prompt required' });
      const ratio = type === 'cover-fb' ? '16:9' : '21:9';
      const url = await withRetry(() => falQueue('fal-ai/nano-banana-pro', {
        prompt, num_images: 1, aspect_ratio: ratio, output_format: 'png', safety_tolerance: '4', resolution: '2K'
      }), 2);
      return res.status(200).json({ url });
    }

    return res.status(400).json({ error: `Invalid type: ${type}` });
  } catch (e) {
    console.error(`[generate] ${type}:`, e.message);
    return res.status(500).json({ error: e.message });
  }
};
