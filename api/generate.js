const fetch = require('node-fetch');

const FAL_KEY = () => process.env.FAL_API_KEY;

// ── 3 best models for logo generation ────────────────────────────────
const LOGO_MODELS = [
  {
    id: 'gemini',
    name: 'Gemini Pro',
    endpoint: 'fal-ai/nano-banana-pro',
    body: (prompt) => ({
      prompt,
      num_images: 1,
      aspect_ratio: '1:1',
      output_format: 'png',
      safety_tolerance: '4',
      resolution: '2K'
    })
  },
  {
    id: 'flux',
    name: 'Flux Pro',
    endpoint: 'fal-ai/flux-pro/v1.1',
    body: (prompt) => ({
      prompt,
      num_images: 1,
      image_size: { width: 1024, height: 1024 },
      output_format: 'png',
      safety_tolerance: '4'
    })
  },
  {
    id: 'ideogram',
    name: 'Ideogram v3',
    endpoint: 'fal-ai/ideogram/v3',
    body: (prompt) => ({
      prompt,
      aspect_ratio: '1:1',
      style_type: 'DESIGN'
    })
  }
];

// ── fal.ai queue-based generation ────────────────────────────────────
async function falQueue(endpoint, body) {
  const r = await fetch(`https://queue.fal.run/${endpoint}`, {
    method: 'POST',
    headers: { 'Authorization': `Key ${FAL_KEY()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`fal (${r.status}): ${t.slice(0, 200)}`);
  }
  const job = await r.json();
  if (!job.status_url || !job.response_url) throw new Error('No polling URLs');

  for (let i = 0; i < 120; i++) {
    await new Promise(res => setTimeout(res, 3000));
    let sd;
    try {
      const sr = await fetch(job.status_url, { headers: { 'Authorization': `Key ${FAL_KEY()}` } });
      sd = await sr.json();
    } catch (_) { continue; }

    if (sd.status === 'COMPLETED') {
      const rr = await fetch(job.response_url, { headers: { 'Authorization': `Key ${FAL_KEY()}` } });
      const result = await rr.json();
      // Different models return images in different fields
      const url = result.images?.[0]?.url || result.image?.url || null;
      if (!url) throw new Error('No image URL in result');
      return url;
    }
    if (sd.status === 'FAILED') throw new Error(`Generation failed: ${sd.error || 'Unknown'}`);
  }
  throw new Error('Timed out after 6 minutes');
}

// ── Retry wrapper ────────────────────────────────────────────────────
async function withRetry(fn, retries = 1, label = '') {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try { return await fn(); } catch (e) {
      lastErr = e;
      if (i < retries) {
        console.warn(`[${label}] Attempt ${i + 1} failed: ${e.message}`);
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }
  throw lastErr;
}

// ── Main handler ─────────────────────────────────────────────────────
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!FAL_KEY()) return res.status(500).json({ error: 'FAL_API_KEY not configured' });

  const { type, prompt } = req.body;
  if (!type || !prompt) return res.status(400).json({ error: 'type and prompt required' });

  try {

    // ── LOGOS — 3 models in parallel ─────────────────────────────────
    if (type === 'logos') {
      const results = await Promise.allSettled(
        LOGO_MODELS.map(model =>
          withRetry(
            () => falQueue(model.endpoint, model.body(prompt)),
            1,
            model.id
          )
        )
      );

      const logos = LOGO_MODELS.map((model, i) => ({
        id: model.id,
        name: model.name,
        url: results[i].status === 'fulfilled' ? results[i].value : null,
        error: results[i].status === 'rejected' ? results[i].reason.message : null
      }));

      // At least one must succeed
      if (!logos.some(l => l.url)) {
        throw new Error('All 3 models failed: ' + logos.map(l => l.error).join('; '));
      }

      return res.status(200).json({ logos });
    }

    // ── FB BACKGROUND — 16:9, no text, art only ─────────────────────
    if (type === 'cover-fb') {
      const url = await withRetry(() => falQueue('fal-ai/nano-banana-pro', {
        prompt,
        num_images: 1,
        aspect_ratio: '16:9',
        output_format: 'png',
        safety_tolerance: '4',
        resolution: '2K'
      }), 2, 'cover-fb');
      return res.status(200).json({ url });
    }

    // ── LI BACKGROUND — 21:9, no text, art only ─────────────────────
    if (type === 'cover-li') {
      const url = await withRetry(() => falQueue('fal-ai/nano-banana-pro', {
        prompt,
        num_images: 1,
        aspect_ratio: '21:9',
        output_format: 'png',
        safety_tolerance: '4',
        resolution: '2K'
      }), 2, 'cover-li');
      return res.status(200).json({ url });
    }

    return res.status(400).json({ error: `Invalid type: ${type}` });

  } catch (e) {
    console.error(`[generate] ${type}:`, e.message);
    return res.status(500).json({ error: e.message });
  }
};
