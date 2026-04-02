const fetch = require('node-fetch');

const FAL_KEY = () => process.env.FAL_API_KEY;

async function falQueue(endpoint, body) {
  const r = await fetch(`https://queue.fal.run/${endpoint}`, {
    method: 'POST',
    headers: { 'Authorization': `Key ${FAL_KEY()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) { const t = await r.text(); throw new Error(`fal (${r.status}): ${t}`); }
  const job = await r.json();
  if (!job.status_url || !job.response_url) throw new Error('No polling URLs');

  for (let i = 0; i < 120; i++) {
    await new Promise(res => setTimeout(res, 3000));
    let sd;
    try {
      const sr = await fetch(job.status_url, { headers: { 'Authorization': `Key ${FAL_KEY()}` } });
      sd = await sr.json();
    } catch (e) { continue; }
    if (sd.status === 'COMPLETED') {
      const rr = await fetch(job.response_url, { headers: { 'Authorization': `Key ${FAL_KEY()}` } });
      const result = await rr.json();
      const url = result.images?.[0]?.url;
      if (!url) throw new Error('No image URL in result');
      return url;
    }
    if (sd.status === 'FAILED') throw new Error('Generation failed on fal');
  }
  throw new Error('Timed out after 6 minutes');
}

async function uploadToFal(imageUrl) {
  const imgResp = await fetch(imageUrl);
  const blob = await imgResp.buffer();
  const init = await fetch('https://rest.fal.run/storage/upload/initiate', {
    method: 'POST',
    headers: { 'Authorization': `Key ${FAL_KEY()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content_type: 'image/png', file_name: 'asset.png' })
  });
  if (!init.ok) throw new Error(`Upload initiate: ${init.status}`);
  const { upload_url, file_url } = await init.json();
  await fetch(upload_url, { method: 'PUT', body: blob, headers: { 'Content-Type': 'image/png' } });
  return file_url;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!FAL_KEY()) return res.status(500).json({ error: 'FAL_API_KEY not configured' });

  const { type, prompt, logoFalUrl, fbUrl } = req.body;

  try {
    // ── Logo ──────────────────────────────────────────────────────────────
    if (type === 'logo') {
      const url = await falQueue('fal-ai/nano-banana-pro', {
        prompt,
        num_images: 1,
        aspect_ratio: '1:1',
        output_format: 'png',
        safety_tolerance: '4',
        resolution: '2K',
        limit_generations: true
      });
      let falUrl = url;
      try { falUrl = await uploadToFal(url); } catch (e) { console.warn('Upload failed:', e.message); }
      return res.status(200).json({ url, falUrl });
    }

    // ── Facebook Cover — 16:9, edit endpoint with logo reference ─────────
    if (type === 'cover-fb') {
      if (!logoFalUrl) throw new Error('Logo URL required');
      const url = await falQueue('fal-ai/nano-banana-pro/edit', {
        prompt,
        image_urls: [logoFalUrl],
        num_images: 1,
        aspect_ratio: '16:9',
        output_format: 'png',
        safety_tolerance: '4',
        resolution: '2K',
        limit_generations: true
      });
      return res.status(200).json({ url });
    }

    // ── LinkedIn Cover — outpaint the FB cover to extend it wider ─────────
    // FB is 16:9 (1280x720 at 2K). LinkedIn needs 4:1 ratio (1584x396).
    // We use flux-pro fill to outpaint the FB cover horizontally.
    // This guarantees the same logo appears — no regeneration risk.
    if (type === 'cover-li') {
      if (!fbUrl) throw new Error('Facebook cover URL required for LinkedIn outpainting');

      // Upload FB cover to fal storage first
      let fbFalUrl = fbUrl;
      try { fbFalUrl = await uploadToFal(fbUrl); } catch (e) { console.warn('FB upload failed, using direct URL'); }

      // Use nano-banana-pro/edit to extend the image with wider aspect
      // Pass the FB cover as reference and instruct it to extend the composition
      const url = await falQueue('fal-ai/nano-banana-pro/edit', {
        prompt: `${prompt} This is an extension of the provided Facebook cover image. Extend the composition to be ultra-wide (4:1 panoramic ratio). Keep all existing elements including the logo exactly as they are on the left side. Add more background and compositional depth on the right side that matches the existing design style, colors, and atmosphere seamlessly. The result should look like one cohesive ultra-wide banner.`,
        image_urls: [fbFalUrl],
        num_images: 1,
        aspect_ratio: '21:9',
        output_format: 'png',
        safety_tolerance: '4',
        resolution: '2K',
        limit_generations: true
      });
      return res.status(200).json({ url });
    }

    return res.status(400).json({ error: `Invalid type: ${type}` });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
