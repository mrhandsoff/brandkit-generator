const { put, list, del } = require('@vercel/blob');
const fetch = require('node-fetch');

const HISTORY_KEY = 'kits/_history.json';

async function getHistory() {
  try {
    // Find the history file in Blob
    const blobs = await list({ prefix: HISTORY_KEY });
    if (!blobs.blobs.length) return [];
    const r = await fetch(blobs.blobs[0].url);
    if (!r.ok) return [];
    return await r.json();
  } catch (_) {
    return [];
  }
}

async function saveHistory(entries) {
  await put(HISTORY_KEY, JSON.stringify(entries), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── GET — return full history ───────────────────────────────────────
  if (req.method === 'GET') {
    const history = await getHistory();
    return res.status(200).json({ history });
  }

  // ── POST — add, delete, or clear ───────────────────────────────────
  if (req.method === 'POST') {
    const { action, entry, id } = req.body || {};

    if (action === 'add' && entry) {
      const history = await getHistory();
      history.unshift({ ...entry, id: Date.now(), date: new Date().toISOString() });
      // Keep last 200 entries max
      await saveHistory(history.slice(0, 200));
      return res.status(200).json({ ok: true });
    }

    if (action === 'delete' && id) {
      const history = await getHistory();
      const filtered = history.filter(h => h.id !== id);
      await saveHistory(filtered);
      return res.status(200).json({ ok: true });
    }

    if (action === 'clear') {
      await saveHistory([]);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Invalid action' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
