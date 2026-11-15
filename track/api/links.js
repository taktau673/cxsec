import { redis, sendJson, validSlug, validDestination, requireDashboardKey } from "../lib/server.js";

export default async function handler(req, res) {
  if (!requireDashboardKey(req, res)) return;

  try {
    if (req.method === "GET") {
      const slugs = await redis.smembers("links");
      const rows = await Promise.all(slugs.map(async (slug) => {
        const raw = await redis.get(`link:${slug}`);
        if (!raw) return null;
        const link = typeof raw === "string" ? JSON.parse(raw) : raw;
        const clicks = Number(await redis.get(`clicks:${slug}`) || 0);
        return { ...link, clicks };
      }));
      return sendJson(res, 200, { links: rows.filter(Boolean).sort((a,b) => b.createdAt - a.createdAt) });
    }

    if (req.method === "POST") {
      const { slug, name, url } = req.body || {};
      const cleanSlug = String(slug || "").trim().toLowerCase();
      const cleanName = String(name || "").trim().slice(0, 80);
      if (!validSlug(cleanSlug)) return sendJson(res, 400, { error: "Slug 1-50 karakter: huruf kecil, angka, dan tanda hubung." });
      if (!cleanName) return sendJson(res, 400, { error: "Nama link wajib diisi." });
      if (!validDestination(url)) return sendJson(res, 400, { error: "URL tujuan harus berupa alamat HTTP atau HTTPS yang valid." });
      if (await redis.exists(`link:${cleanSlug}`)) return sendJson(res, 409, { error: "Slug sudah digunakan." });

      const link = { slug: cleanSlug, name: cleanName, url, createdAt: Date.now(), updatedAt: Date.now() };
      await redis.set(`link:${cleanSlug}`, JSON.stringify(link));
      await redis.sadd("links", cleanSlug);
      return sendJson(res, 201, { link });
    }

    return sendJson(res, 405, { error: "Method not allowed." });
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { error: "Terjadi kesalahan server." });
  }
}
