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

function classifyDevice(ua) {
  const value = String(ua || "");
  if (/ipad|tablet|playbook|silk/i.test(value)) return "Tablet";
  if (/mobile|android|iphone|ipod|windows phone|iemobile/i.test(value)) return "Mobile";
  if (/windows|macintosh|linux|x11|cros/i.test(value)) return "Desktop";
  return "Tidak diketahui";
}

function firstQueryValue(req, ...keys) {
  for (const key of keys) {
    const raw = req.query?.[key];
    if (raw == null) continue;
    const value = String(Array.isArray(raw) ? raw[0] : raw).trim();
    if (value) return value;
  }
  return "";
}

function getSourceTitle(req) {
  // Judul sumber harus dikirim secara eksplisit oleh halaman sumber.
  // Header Referer tidak pernah memuat document.title.
  // Parameter yang didukung: source_title, page_title, title
  const value = firstQueryValue(req, "source_title", "page_title", "title");
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

function getSourceUrlOverride(req) {
  // Halaman AMP / sumber bisa mengirim full URL secara paksa lewat query.
  // Berguna karena Referer header sering dipotong (hanya origin) oleh browser modern.
  // Parameter yang didukung: source_url, source, ref, referrer
  const value = firstQueryValue(req, "source_url", "source", "ref", "referrer");
  if (!value) return "";
  try {
    const u = new URL(value);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    return u.toString().slice(0, 2048);
  } catch {
    return "";
  }
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

// Rate limit atomik dalam satu operasi Redis Lua.
// Counter menggunakan fixed window 60 detik dan key kedaluwarsa otomatis.
const RATE_LIMIT_SCRIPT = `
local ttl = tonumber(ARGV[1])
local counts = {}
for i = 1, 3 do
  local count = redis.call("INCR", KEYS[i])
  if count == 1 then
    redis.call("EXPIRE", KEYS[i], ttl + 2)
  end
  counts[i] = count
end
return {
  counts[1], counts[2], counts[3],
  redis.call("TTL", KEYS[1]),
  redis.call("TTL", KEYS[2]),
  redis.call("TTL", KEYS[3])
}
`;

function positiveInt(value, fallback, max = 1000000) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

function getClientIp(req) {
  // x-real-ip umumnya diisi reverse proxy; fallback ke x-forwarded-for.
  const realIp = String(req.headers["x-real-ip"] || "").trim();
  if (realIp) return realIp;
  const forwarded = String(req.headers["x-forwarded-for"] || "");
  const firstForwarded = forwarded.split(",")[0].trim();
  return firstForwarded || String(req.socket?.remoteAddress || "unknown");
}

async function enforceRateLimit(req, res, slug) {
  const windowSeconds = 60;
  const ipLimit = positiveInt(process.env.TRACKER_IP_LIMIT, 30, 100000);
  const linkLimit = positiveInt(process.env.TRACKER_LINK_IP_LIMIT, 20, 100000);
  const globalLimit = positiveInt(process.env.TRACKER_GLOBAL_LIMIT, 1200, 10000000);
  const ip = getClientIp(req);
  // Hash + salt: alamat IP mentah tidak disimpan di Redis.
  const salt = process.env.RATE_LIMIT_SALT || process.env.DASHBOARD_KEY || "linktracker-rate-limit";
  const ipHash = createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
  const windowId = Math.floor(Date.now() / (windowSeconds * 1000));
  const prefix = `ratelimit:${windowId}`;
  const keys = [
    `${prefix}:ip:${ipHash}`,
    `${prefix}:ip-link:${ipHash}:${slug}`,
    `${prefix}:global`
  ];

  const result = await redis.eval(
    RATE_LIMIT_SCRIPT,
    keys,
    [windowSeconds]
  );

  const [ipCount, linkCount, globalCount, ipTtl, linkTtl, globalTtl] = (result || []).map(Number);
  const blocked = ipCount > ipLimit || linkCount > linkLimit || globalCount > globalLimit;
  const retryAfter = Math.max(1, Math.min(...[
    ipCount > ipLimit ? ipTtl : Infinity,
    linkCount > linkLimit ? linkTtl : Infinity,
    globalCount > globalLimit ? globalTtl : Infinity
  ].filter(Number.isFinite)));

  res.setHeader("X-RateLimit-Window", String(windowSeconds));
  res.setHeader("X-RateLimit-Limit", String(ipLimit));
  res.setHeader("X-RateLimit-Remaining", String(Math.max(0, ipLimit - ipCount)));

  if (blocked) {
    res.setHeader("Retry-After", String(retryAfter));
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.status(429).json({
      error: "Terlalu banyak request. Silakan tunggu sebentar sebelum mencoba lagi.",
      retryAfter
    });
    return false;
  }
  return true;
}

function jakartaDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export default async function handler(req, res) {
  const slug = String(req.query.slug || "").toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(slug)) {
    return res.status(404).send("Link tidak ditemukan.");
  }

  try {
    // Batasi request sebelum membaca link dan sebelum menjalankan pencatatan klik.
    if (!(await enforceRateLimit(req, res, slug))) return;

    const raw = await redis.get(`link:${slug}`);
    if (!raw) return res.status(404).send("Link tidak ditemukan.");
    const link = typeof raw === "string" ? JSON.parse(raw) : raw;

    const now = new Date();
    const day = jakartaDate(now);

    // 1. Ambil Referer header (bisa kosong / hanya origin)
    const headerReferer = String(req.headers.referer || "").slice(0, 2048);

    // 2. Ambil override dari query parameter (sangat berguna untuk AMP)
    //    Parameter: source_url | source | ref | referrer
    const overrideUrl = getSourceUrlOverride(req);

    // 3. Prioritas: override query > header Referer
    const effectiveReferer = overrideUrl || headerReferer;

    const ua = String(req.headers["user-agent"] || "").slice(0, 300);
    let refHost = "";
    let refPath = "";
    let refQuery = "";
    let refFull = effectiveReferer;

    try {
      const ref = new URL(effectiveReferer);
      refHost = ref.hostname.toLowerCase().replace(/^www\./, "");
      refPath = ref.pathname || "/";
      refQuery = ref.search || "";
      refFull = ref.toString();
    } catch {}

    // Deduplikasi statistik tetap berjalan setelah rate limit.
    const ip = getClientIp(req);
    const ipHash = createHash("sha256")
      .update(`${process.env.RATE_LIMIT_SALT || process.env.DASHBOARD_KEY || "linktracker-dedupe"}:${ip}`)
      .digest("hex").slice(0, 24);
    const dedupeKey = `dedupe:${slug}:${ipHash}`;
    const device = classifyDevice(ua);
    const source = classifySource(refHost);
    const sourceTitle = getSourceTitle(req);

    const event = {
      slug,
      at: now.toISOString(),
      referer: effectiveReferer,
      referrerFull: refFull,
      referrerDomain: refHost,
      referrerHost: refHost,
      referrerPath: refPath,
      referrerQuery: refQuery,
      sourceTitle,
      sourceTitleMethod: sourceTitle
        ? (overrideUrl ? "query_parameter+source_url" : "query_parameter")
        : (overrideUrl ? "source_url_only" : "not_provided"),
      sourceUrlOverride: Boolean(overrideUrl),
      source,
      keyword: getKeyword(effectiveReferer, req.url),
      userAgent: ua,
      device
    };

    if (!isBot(ua)) {
      const firstHit = await redis.set(dedupeKey, "1", { nx: true, ex: 30 });
      if (firstHit) {
        const operations = [
          redis.incr(`clicks:${slug}`),
          redis.hincrby(`daily:${day}`, slug, 1),
          redis.incr(`daily-total:${day}`),
          redis.hincrby(`sources:${slug}`, source, 1),
          redis.hincrby(`devices:${slug}`, device, 1),
          redis.lpush(`logs:${slug}`, JSON.stringify(event)),
          redis.ltrim(`logs:${slug}`, 0, 199)
        ];

        if (refHost) operations.push(redis.hincrby(`domains:${slug}`, refHost, 1));
        if (event.keyword) operations.push(redis.hincrby(`keywords:${slug}`, event.keyword, 1));

        await Promise.all(operations);
      }
    }

    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    return res.redirect(302, link.url);
  } catch (error) {
    console.error("tracking:", error);
    return res.status(503).send("Layanan tracking sedang tidak tersedia. Silakan coba lagi.");
  }
}
