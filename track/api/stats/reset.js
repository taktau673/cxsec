import { redis, sendJson, requireDashboardKey } from "../../lib/server.js";

async function deleteInBatches(keys, size = 100) {
  for (let i = 0; i < keys.length; i += size) {
    const batch = keys.slice(i, i + size);
    if (batch.length) await redis.del(...batch);
  }
}

export default async function handler(req, res) {
  if (!requireDashboardKey(req, res)) return;
  if (req.method !== "DELETE") return sendJson(res, 405, { error: "Method not allowed." });

  try {
    // Daftar link dan data link (link:<slug>) sengaja tidak dihapus.
    const slugs = await redis.smembers("links");
    const keys = [];

    for (const slug of slugs) {
      keys.push(
        `clicks:${slug}`,
        `logs:${slug}`,
        `sources:${slug}`,
        `domains:${slug}`,
        `devices:${slug}`,
        `keywords:${slug}`,
        `daily:${slug}`
      );
    }

    // Hapus agregat harian dan deduplikasi sementara agar klik berikutnya
    // langsung dapat dihitung kembali setelah reset.
    const dailyKeys = await redis.keys("daily:*");
    const dailyTotalKeys = await redis.keys("daily-total:*");
    const dedupeKeys = await redis.keys("dedupe:*");
    keys.push(...dailyKeys, ...dailyTotalKeys, ...dedupeKeys);

    const uniqueKeys = [...new Set(keys)];
    await deleteInBatches(uniqueKeys);

    return sendJson(res, 200, {
      ok: true,
      deletedKeys: uniqueKeys.length,
      preservedLinks: slugs.length
    });
  } catch (error) {
    console.error("stats reset:", error);
    return sendJson(res, 500, { error: "Gagal mereset statistik. Data link tidak diubah." });
  }
}
