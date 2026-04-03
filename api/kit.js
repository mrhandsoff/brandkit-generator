const fetch = require('node-fetch');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { jsonUrl } = req.query;
  if (!jsonUrl) return res.status(400).json({ error: 'Missing jsonUrl parameter' });

  try {
    const decoded = decodeURIComponent(jsonUrl);
    const r = await fetch(decoded, { timeout: 10000 });
    if (!r.ok) return res.status(404).json({ error: 'Brand kit not found' });

    const data = await r.json();

    // Cache for 1 hour — kit data is immutable once saved
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
    return res.status(200).json(data);
  } catch (e) {
    console.error('Kit fetch error:', e.message);
    return res.status(500).json({ error: 'Failed to load brand kit' });
  }
};
