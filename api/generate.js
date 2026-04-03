const fetch = require('node-fetch');

const FAL_KEY = () => process.env.FAL_API_KEY;

// ── Retry wrapper ────────────────────────────────────────────────────────
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

// ── fal.ai queue-based generation ────────────────────────────────────────
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

  // Poll for completion — 6 min max
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
    if (sd.status === 'FAILED') {
      const reason = sd.error || sd.detail || 'Unknown';
      throw new Error(`fal generation failed: ${reason}`);
    }
  }
  throw new Error('fal timed out after 6 minutes');
}

// ── Upload an image URL to fal storage (needed for image references) ─────
async function uploadToFal(imageUrl) {
  const imgResp = await fetch(imageUrl);
  if (!imgResp.ok) throw new Error(`Failed to fetch image for upload: ${imgResp.status}`);
  const blob = await imgResp.buffer();

  const init = await fetch('https://rest.fal.run/storage/upload/initiate', {
    method: 'POST',
    headers: { 'Authorization': `Key ${FAL_KEY()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content_type: 'image/png', file_name: 'asset.png' })
  });
  if (!init.ok) throw new Error(`Upload initiate failed: ${init.status}`);
  const { upload_url, file_url } = await init.json();

  const putResp = await fetch(upload_url, {
    method: 'PUT',
    body: blob,
    headers: { 'Content-Type': 'image/png' }
  });
  if (!putResp.ok) throw new Error(`Upload PUT failed: ${putResp.status}`);

  return file_url;
}

// ── Main handler ─────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!FAL_KEY()) return res.status(500).json({ error: 'FAL_API_KEY not configured' });

  const { type, prompt, logoFalUrl } = req.body;

  if (!type || !prompt) return res.status(400).json({ error: 'type and prompt are required' });

  try {

    // ── LOGO — 1:1, 2K, standalone generation ────────────────────────────
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

      // Upload to fal storage so it can be used as a reference in cover generation
      let falUrl = url;
      try {
        falUrl = await uploadToFal(url);
      } catch (e) {
        console.warn('Logo upload to fal storage failed, using direct URL:', e.message);
      }

      return res.status(200).json({ url, falUrl });
    }

    // ── FACEBOOK COVER — 16:9, edit endpoint with logo as reference ──────
    if (type === 'cover-fb') {
      if (!logoFalUrl) return res.status(400).json({ error: 'logoFalUrl required for FB cover' });

      const url = await withRetry(() => falQueue('fal-ai/nano-banana-pro/edit', {
        prompt,
        image_urls: [logoFalUrl],
        num_images: 1,
        aspect_ratio: '16:9',
        output_format: 'png',
        safety_tolerance: '4',
        resolution: '2K',
        limit_generations: true
      }), 2, 'cover-fb');

      return res.status(200).json({ url });
    }

    // ── LINKEDIN COVER — 21:9, FRESH generation with logo reference ──────
    // FIX: Previously tried to outpaint the FB cover, which caused the model
    // to regenerate the logo incorrectly. Now we generate a fresh LinkedIn
    // cover using the same logo reference but a separate prompt optimized
    // for ultra-wide format. This is far more reliable.
    if (type === 'cover-li') {
      if (!logoFalUrl) return res.status(400).json({ error: 'logoFalUrl required for LinkedIn cover' });

      const url = await withRetry(() => falQueue('fal-ai/nano-banana-pro/edit', {
        prompt,
        image_urls: [logoFalUrl],
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
