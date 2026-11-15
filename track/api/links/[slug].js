import { redis, sendJson, validSlug, validDestination, requireDashboardKey } from "../../lib/server.js";

export default async function handler(req, res) {
  if (!requireDashboardKey(req, res)) return;
  const slug = String(req.query.slug || "").toLowerCase();
  if (!validSlug(slug)) return sendJson(res, 400, { error: "Slug tidak valid." });

  try {
    const key = `link:${slug}`;
    const raw = await redis.get(key);
    if (!raw) return sendJson(res, 404, { error: "Link tidak ditemukan." });
    const link = typeof raw === "string" ? JSON.parse(raw) : raw;

    if (req.method === "PATCH") {
      const { name, url } = req.body || {};
      if (name !== undefined) {
        const cleanName = String(name).trim().slice(0, 80);
        if (!cleanName) return sendJson(res, 400, { error: "Nama link wajib diisi." });
        link.name = cleanName;
      }
      if (url !== undefined) {
        if (!validDestination(url)) return sendJson(res, 400, { error: "URL tujuan harus HTTP atau HTTPS." });
        link.url = url;
      }
      link.updatedAt = Date.now();
      await redis.set(key, JSON.stringify(link));
      return sendJson(res, 200, { link });
    }

    if (req.method === "DELETE") {
      await redis.del(key);
      await redis.srem("links", slug);
      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 405, { error: "Method not allowed." });
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { error: "Terjadi kesalahan server." });
  }
}
