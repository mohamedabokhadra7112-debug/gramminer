const TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN;

// Simple in-memory cache (resets on cold start — acceptable for avatars)
const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!TOKEN) return res.status(503).end();

  const userId = Number(req.query.userId);
  if (!Number.isFinite(userId)) return res.status(400).end();

  try {
    const cached = cache.get(userId);
    let filePath;

    if (cached && cached.expiresAt > Date.now()) {
      filePath = cached.filePath;
    } else {
      const photosRes  = await fetch(
        `https://api.telegram.org/bot${TOKEN}/getUserProfilePhotos?user_id=${userId}&limit=1`,
      );
      const photosData = await photosRes.json();
      const fileId     = photosData?.result?.photos?.[0]?.[0]?.file_id;

      if (!fileId) {
        filePath = null;
      } else {
        const fileRes  = await fetch(`https://api.telegram.org/bot${TOKEN}/getFile?file_id=${fileId}`);
        const fileData = await fileRes.json();
        filePath       = fileData?.result?.file_path ?? null;
      }

      cache.set(userId, { filePath, expiresAt: Date.now() + CACHE_TTL });
    }

    if (!filePath) return res.status(404).end();

    const imageRes = await fetch(`https://api.telegram.org/file/bot${TOKEN}/${filePath}`);
    if (!imageRes.ok) return res.status(404).end();

    res.setHeader('Content-Type', imageRes.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=600');
    return res.status(200).send(Buffer.from(await imageRes.arrayBuffer()));
  } catch {
    return res.status(502).end();
  }
};
