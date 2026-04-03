const fetch = require('node-fetch');

const FAL_KEY = () => process.env.FAL_API_KEY;

// ── Retry wrapper ────────────────────────────────────────────────────
async function withRetry(fn, retries = 2, label = '') {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < retries) {
        console.warn(`[${label}] Attempt ${i + 1} failed: ${e.message} — retrying...`);
        await new Promise(r => setTimeout(r, 2000 * (i + 1)));
      }
    }
  }
  throw lastErr;
}

// ── fal.ai queue-based generation ────────────────────────────────────
async function falQueue(endpoint, body) {
  const r = await fetch(`https://queue.fal.run/${endpoint}`, {
    method: 'POST',
    headers: { 'Authorization': `Key ${FAL_KEY()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`fal submit (${r.status}): ${t.slice(0, 300)}`);
  }
  const job = await r.json();
  if (!job.status_url || !job.response_url) throw new Error('No polling URLs from fal');

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
      const url = result.images?.[0]?.url;
      if (!url) throw new Error('No image URL in fal result');
      return url;
    }
    if (sd.status === 'FAILED') throw new Error(`fal generation failed: ${sd.error || 'Unknown'}`);
  }
  throw new Error('fal timed out after 6 minutes');
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
  if (!type || !prompt) return res.status(400).json({ error: 'type and prompt are required' });

  try {

    // ── LOGO — 1:1, 2K ─────────────────────────────────────────────
    if (type === 'logo') {
      const url = await withRetry(() => falQueue('fal-ai/nano-banana-pro', {
        prompt,
        num_images: 1,
        aspect_ratio: '1:1',
        output_format: 'png',
        safety_tolerance: '4',
        resolution: '2K',
        limit_generations: true
      }), 2, 'logo');

      return res.status(200).json({ url });
    }

    // ── FACEBOOK COVER — 16:9, standalone (no logo ref) ─────────────
    if (type === 'cover-fb') {
      const url = await withRetry(() => falQueue('fal-ai/nano-banana-pro', {
        prompt,
        num_images: 1,
        aspect_ratio: '16:9',
        output_format: 'png',
        safety_tolerance: '4',
        resolution: '2K',
        limit_generations: true
      }), 2, 'cover-fb');

      return res.status(200).json({ url });
    }

    // ── LINKEDIN COVER — 21:9, standalone (no logo ref) ─────────────
    if (type === 'cover-li') {
      const url = await withRetry(() => falQueue('fal-ai/nano-banana-pro', {
        prompt,
        num_images: 1,
        aspect_ratio: '21:9',
        output_format: 'png',
        safety_tolerance: '4',
        resolution: '2K',
        limit_generations: true
      }), 2, 'cover-li');

      return res.status(200).json({ url });
    }

    return res.status(400).json({ error: `Invalid type: ${type}` });

  } catch (e) {
    console.error(`[generate] ${type} error:`, e.message);
    return res.status(500).json({ error: e.message });
  }
};
