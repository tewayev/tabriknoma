# Tabriknoma — Shaxzodbek & Mohigul

Elektron to'y taklifnomasi (statik sahifa + Vercel funksiyasi).

- `index.html` — butun sahifa. Manzil va karta ma'lumotlari skript boshidagi `CONFIG` ichida.
- `assets/` — fon rasmi va musiqa.
- `api/wishes.js` — tilaklar. Barcha mehmonlar bir-birining tilagini ko'rishi uchun
  Vercel → Storage → **Upstash for Redis** ni loyihaga ulang (KV_REST_API_URL / KV_REST_API_TOKEN).
  Ulanmagan bo'lsa tilaklar faqat mehmonning o'z brauzerida saqlanadi.
