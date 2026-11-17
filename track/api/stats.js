import { redis, sendJson, requireDashboardKey } from "../lib/server.js";

const TIME_ZONE = "Asia/Jakarta";

function dateInJakarta(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function toRows(obj) {
  return Object.entries(obj || {})
    .map(([name, count]) => ({ name, count: Number(count || 0) }))
    .sort((a, b) => b.count - a.count);
}

export default async function handler(req, res) {
  if (!requireDashboardKey(req, res)) return;
  if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed." });

  try {
    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const limit = requestedLimit === 100 ? 100 : 200;
    const slugs = await redis.smembers("links");

    const links = await Promise.all(slugs.map(async (slug) => {
      const [raw, clicks, logs, sources, keywords, domains, devices] = await Promise.all([
        redis.get(`link:${slug}`),
        redis.get(`clicks:${slug}`),
        redis.lrange(`logs:${slug}`, 0, limit - 1),
        redis.hgetall(`sources:${slug}`),
        redis.hgetall(`keywords:${slug}`),
        redis.hgetall(`domains:${slug}`),
        redis.hgetall(`devices:${slug}`)
      ]);

      if (!raw) return null;
      const link = typeof raw === "string" ? JSON.parse(raw) : raw;
      return {
        ...link,
        clicks: Number(clicks || 0),
        recent: (logs || []).map((item) => typeof item === "string" ? JSON.parse(item) : item),
        sources: toRows(sources),
        keywords: toRows(keywords),
        domains: toRows(domains),
        devices: toRows(devices)
      };
    }));

    const clean = links.filter(Boolean);
    const today = dateInJakarta();
    const daily = [];
    const cursor = new Date(`${today}T12:00:00.000Z`);

    for (let i = 6; i >= 0; i--) {
      const day = new Date(cursor);
      day.setUTCDate(day.getUTCDate() - i);
      const date = day.toISOString().slice(0, 10);
      const clicks = Number(await redis.get(`daily-total:${date}`) || 0);
      daily.push({ date, clicks });
    }

    const totalClicks = clean.reduce((sum, item) => sum + item.clicks, 0);
    const recent = clean
      .flatMap((item) => item.recent.map((event) => ({ ...event, name: item.name })))
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, limit);

    const domainMap = new Map();
    const deviceMap = new Map();
    const sourceMap = new Map();
    const keywordMap = new Map();

    for (const link of clean) {
      for (const row of link.domains) {
        domainMap.set(row.name, (domainMap.get(row.name) || 0) + row.count);
      }
      for (const row of link.devices) {
        deviceMap.set(row.name, (deviceMap.get(row.name) || 0) + row.count);
      }
      for (const row of link.sources) {
        sourceMap.set(row.name, (sourceMap.get(row.name) || 0) + row.count);
      }
      for (const row of link.keywords) {
        keywordMap.set(row.name, (keywordMap.get(row.name) || 0) + row.count);
      }
    }

    const sortMap = (map, max = 20) => [...map]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, max);

    return sendJson(res, 200, {
      totalClicks,
      totalLinks: clean.length,
      daily,
      links: clean,
      recent,
      topDomains: sortMap(domainMap, 10),
      devices: sortMap(deviceMap, 10),
      sources: sortMap(sourceMap),
      keywords: sortMap(keywordMap)
    });
  } catch (error) {
    console.error("stats:", error);
    return sendJson(res, 500, { error: "Gagal mengambil statistik." });
  }
}
