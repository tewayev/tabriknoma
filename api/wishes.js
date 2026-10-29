// Taklifnoma tilaklari: GET — ro'yxat, POST — yangi tilak.
// Saqlash uchun Upstash Redis (Vercel → Storage → Upstash for Redis) ishlatiladi.
// Muhit o'zgaruvchilari: KV_REST_API_URL va KV_REST_API_TOKEN
// (yoki UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN).
// Sozlanmagan bo'lsa 503 qaytaradi va sahifa tilaklarni brauzerda saqlaydi.

const KEY = 'taklifnoma:shaxzodbek-mohigul:wishes';

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return res.status(503).json({ error: 'storage-not-configured' });

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
    if (req.method === 'GET') {
      const items = (await redis(['LRANGE', KEY, '0', '499'])) || [];
      const wishes = items.map((s) => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
      return res.status(200).json({ wishes });
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
      const name = String((body && body.name) || '').trim().slice(0, 60);
      const text = String((body && body.text) || '').trim().slice(0, 600);
      if (!name || !text) return res.status(400).json({ error: 'name-and-text-required' });
      const wish = { name, text, ts: Date.now() };
      await redis(['LPUSH', KEY, JSON.stringify(wish)]);
      await redis(['LTRIM', KEY, '0', '999']);
      return res.status(201).json({ wish });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method-not-allowed' });
  } catch (e) {
    return res.status(500).json({ error: 'storage-error' });
  }
};
