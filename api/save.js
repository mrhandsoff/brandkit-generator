const { put } = require('@vercel/blob');
const fetch = require('node-fetch');

module.exports.config = {
  maxDuration: 60,
  api: { bodyParser: { sizeLimit: '20mb' } }
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { brand, logoUrl, logoCleanUrl, fbUrl, liUrl, fonts } = req.body;
  if (!brand || !brand.brandName) return res.status(400).json({ error: 'Missing brand data' });
  if (!logoUrl) return res.status(400).json({ error: 'Logo URL is required' });

  try {
    const slug = brand.brandName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40)
      + '-' + Date.now().toString(36);

    // ── Upload helper — handles both base64 data URLs and remote URLs ────
    async function uploadAsset(source, filename) {
      if (!source) return null;
      try {
        let buffer, contentType;

        if (source.startsWith('data:')) {
          // Base64 data URL
          contentType = source.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png';
          buffer = Buffer.from(source.split(',')[1], 'base64');
        } else {
          // Remote URL — fetch the image
          const r = await fetch(source, { timeout: 30000 });
          if (!r.ok) throw new Error(`Fetch ${r.status}`);
          buffer = await r.buffer();
          const ct = r.headers.get('content-type') || '';
          contentType = ct.includes('jpeg') || ct.includes('jpg') ? 'image/jpeg' : 'image/png';
        }

        const blob = await put(`kits/${slug}/${filename}`, buffer, {
          access: 'public',
          contentType
        });
        return blob.url;
      } catch (e) {
        console.error(`Upload ${filename} failed:`, e.message);
        return null;
      }
    }

    // Upload all assets in parallel
    const [storedLogo, storedLogoClean, storedFb, storedLi] = await Promise.all([
      uploadAsset(logoUrl, 'logo.png'),
      uploadAsset(logoCleanUrl, 'logo-transparent.png'),
      uploadAsset(fbUrl, 'facebook-cover.jpg'),
      uploadAsset(liUrl, 'linkedin-cover.jpg')
    ]);

    // Build kit data
    const kitData = {
      slug,
      brand,
      fonts: fonts || null,
      logoUrl: storedLogo || logoUrl,
      logoCleanUrl: storedLogoClean || logoCleanUrl || null,
      fbUrl: storedFb || fbUrl || null,
      liUrl: storedLi || liUrl || null,
      createdAt: new Date().toISOString()
    };

    // Store kit JSON in Blob
    const jsonBlob = await put(
      `kits/${slug}/kit.json`,
      JSON.stringify(kitData),
      { access: 'public', contentType: 'application/json' }
    );

    return res.status(200).json({
      slug,
      jsonUrl: jsonBlob.url,
      logoUrl: kitData.logoUrl,
      fbUrl: kitData.fbUrl,
      liUrl: kitData.liUrl
    });

  } catch (e) {
    console.error('Save error:', e);
    return res.status(500).json({ error: e.message });
  }
};
