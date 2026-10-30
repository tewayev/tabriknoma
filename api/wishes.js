// Taklifnoma tilaklari: GET — ro'yxat, POST — yangi tilak.
// Saqlash uchun Upstash Redis (Vercel → Storage → Upstash for Redis) ishlatiladi.
// Muhit o'zgaruvchilari: KV_REST_API_URL va KV_REST_API_TOKEN
// (yoki UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN), ixtiyoriy ADMIN_KEY.
// Sozlanmagan bo'lsa 503 qaytaradi va sahifa tilaklarni brauzerda saqlaydi.

const crypto = require('crypto');

const KEY = 'taklifnoma:shaxzodbek-mohigul:wishes';
const MAX_STORED = 2000;      // ro'yxatda saqlanadigan eng ko'p tilak
const MAX_RETURNED = 1000;    // bitta so'rovda qaytariladigan tilaklar
const NAME_MAX = 60;
const TEXT_MAX = 600;
const RATE_LIMIT = 5;         // bitta IP'dan ...
const RATE_WINDOW = 600;      // ... shuncha soniya ichida

// Boshqaruv belgilari va ko'rinmas yo'nalish belgilarini olib tashlaydi, bo'sh joylarni siqadi
const clean = (v, max) => String(v == null ? '' : v)
  .replace(/[\u0000-\u0008\u000B-\u001F\u007F​-‏‪-‮⁦-⁩]/g, '')
  .replace(/[ \t]+/g, ' ')
  .replace(/\n{3,}/g, '\n\n')
  .trim()
  .slice(0, max);

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

const clientIp = (req) => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';

module.exports = async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) { res.setHeader('Cache-Control', 'no-store'); return res.status(503).json({ error: 'storage-not-configured' }); }

  const redis = async (command) => {
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(command)
    });
    if (!r.ok) throw new Error(`redis ${r.status}`);
    return (await r.json()).result;
  };

  try {
    const q = req.query || {};

    // Tilakni o'chirish (faqat egasi uchun): GET /api/wishes?admin=<ADMIN_KEY>&remove=<ism>
    if (req.method === 'GET' && q.remove) {
      res.setHeader('Cache-Control', 'no-store');
      if (!process.env.ADMIN_KEY || !safeEqual(q.admin || '', process.env.ADMIN_KEY)) return res.status(403).json({ error: 'forbidden' });
      const items = (await redis(['LRANGE', KEY, '0', '-1'])) || [];
      let removed = 0;
      for (const raw of items) {
        let w = null; try { w = JSON.parse(raw); } catch {}
        if (w && w.name === String(q.remove)) removed += Number(await redis(['LREM', KEY, '0', raw])) || 0;
      }
      return res.status(200).json({ removed });
    }

    if (req.method === 'GET') {
      // Vercel CDN javobni 10 soniya saqlaydi: 1000 mehmon bir vaqtda ochsa ham bazaga bir necha so'rov boradi
      res.setHeader('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=60');
      const items = (await redis(['LRANGE', KEY, '0', String(MAX_RETURNED - 1)])) || [];
      const wishes = items.map((s) => {
        try { const w = JSON.parse(s); return { name: clean(w.name, NAME_MAX), text: clean(w.text, TEXT_MAX), ts: Number(w.ts) || 0 }; }
        catch { return null; }
      }).filter((w) => w && w.name && w.text);
      return res.status(200).json({ wishes });
    }

    if (req.method === 'POST') {
      res.setHeader('Cache-Control', 'no-store');
      if (!String(req.headers['content-type'] || '').includes('application/json')) return res.status(415).json({ error: 'json-required' });
      let body = req.body;
      if (typeof body === 'string') { if (body.length > 4000) return res.status(413).json({ error: 'too-large' }); try { body = JSON.parse(body); } catch { body = {}; } }
      if (!body || typeof body !== 'object') body = {};
      // "website" — odamlar ko'rmaydigan tuzoq maydon; uni faqat botlar to'ldiradi
      if (body.website) return res.status(201).json({ wish: { name: '', text: '', ts: Date.now() } });
      const name = clean(body.name, NAME_MAX);
      const text = clean(body.text, TEXT_MAX);
      if (!name || !text) return res.status(400).json({ error: 'name-and-text-required' });

      // Bitta IP'dan juda ko'p yuborishni cheklash
      const rk = `${KEY}:rate:${crypto.createHash('sha256').update(clientIp(req)).digest('hex').slice(0, 24)}`;
      const n = Number(await redis(['INCR', rk])) || 0;
      if (n === 1) await redis(['EXPIRE', rk, String(RATE_WINDOW)]);
      if (n > RATE_LIMIT) return res.status(429).json({ error: 'too-many-requests' });

      const wish = { name, text, ts: Date.now() };
      await redis(['LPUSH', KEY, JSON.stringify(wish)]);
      await redis(['LTRIM', KEY, '0', String(MAX_STORED - 1)]);
      return res.status(201).json({ wish });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method-not-allowed' });
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({ error: 'storage-error' });
  }
};
