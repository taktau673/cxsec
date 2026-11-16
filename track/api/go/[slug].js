import { createHash } from "node:crypto";
import { redis } from "../../lib/server.js";

function classifySource(host) {
  if (!host) return "Direct / tidak diketahui";
  const h = host.toLowerCase().replace(/^www\./, "");
  if (/(^|\.)google\./.test(h)) return "Google";
  if (/(^|\.)bing\.com$/.test(h)) return "Bing";
  if (/(^|\.)yahoo\.com$/.test(h)) return "Yahoo";
  if (/(^|\.)facebook\.com$|(^|\.)fb\.com$/.test(h)) return "Facebook";
  if (/(^|\.)instagram\.com$/.test(h)) return "Instagram";
  if (/(^|\.)tiktok\.com$/.test(h)) return "TikTok";
  if (/(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(h)) return "YouTube";
  return host;
}

function getKeyword(referrer, requestUrl) {
  const params = [];
  try {
    const r = new URL(referrer);
    for (const key of ["q", "query", "keyword", "p", "text"]) {
      const value = r.searchParams.get(key);
      if (value) params.push(value);
    }
  } catch {}
  try {
    const u = new URL(requestUrl, "https://tracker.invalid");
    for (const key of ["keyword", "utm_term"]) {
      const value = u.searchParams.get(key);
      if (value) params.push(value);
    }
  } catch {}
  return [...new Set(params)].join(" | ").slice(0, 160);
}

function isBot(ua) {
  return /(bot|crawler|spider|slurp|preview|facebookexternalhit|whatsapp|telegrambot|discordbot|skypeuripreview|bingpreview|google-inspectiontool|headless|curl|wget)/i.test(ua);
}

export default async function handler(req, res) {
  const slug = String(req.query.slug || "").toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(slug)) {
    return res.status(404).send("Link tidak ditemukan.");
  }

  try {
    const raw = await redis.get(`link:${slug}`);
    if (!raw) return res.status(404).send("Link tidak ditemukan.");
    const link = typeof raw === "string" ? JSON.parse(raw) : raw;

    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    const referer = String(req.headers.referer || "").slice(0, 2048);
    const ua = String(req.headers["user-agent"] || "").slice(0, 300);
    let refHost = "";
    let refPath = "";
    let refQuery = "";
    let refFull = referer;
    try {
      const ref = new URL(referer);
      refHost = ref.host; // hostname + port jika ada
      refPath = ref.pathname || "/";
      refQuery = ref.search || ""; // tetap menyertakan tanda tanya
      refFull = ref.toString();
    } catch {
      // Simpan nilai header mentah jika bukan URL yang dapat diparse.
    }

    // Hash IP; alamat IP asli tidak disimpan. Satu IP/slug dihitung sekali per 30 detik.
    const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    const ip = forwarded || String(req.socket?.remoteAddress || "unknown");
    const ipHash = createHash("sha256").update(ip).digest("hex").slice(0, 24);
    const dedupeKey = `dedupe:${slug}:${ipHash}`;
    const countable = !isBot(ua);
    const event = {
      slug, at: now.toISOString(),
      // `referer` dipertahankan agar kompatibel dengan dashboard/data lama.
      referer, referrerFull: refFull, referrerDomain: refHost,
      referrerHost: refHost, referrerPath: refPath, referrerQuery: refQuery,
      source: classifySource(refHost), keyword: getKeyword(referer, req.url), userAgent: ua
    };

    if (countable) {
      const firstHit = await redis.set(dedupeKey, "1", { nx: true, ex: 30 });
      if (firstHit) {
        await Promise.all([
          redis.incr(`clicks:${slug}`),
          redis.hincrby(`daily:${day}`, slug, 1),
          redis.incr(`daily-total:${day}`),
          redis.hincrby(`sources:${slug}`, event.source, 1),
          ...(event.keyword ? [redis.hincrby(`keywords:${slug}`, event.keyword, 1)] : []),
          redis.lpush(`logs:${slug}`, JSON.stringify(event)),
          redis.ltrim(`logs:${slug}`, 0, 99)
        ]);
      }
    }

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    return res.redirect(302, link.url);
  } catch (error) {
    console.error(error);
    return res.status(503).send("Layanan tracking sedang tidak tersedia. Silakan coba lagi.");
  }
}
