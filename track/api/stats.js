import { redis, sendJson, requireDashboardKey } from "../lib/server.js";

export default async function handler(req, res) {
  if (!requireDashboardKey(req, res)) return;
  if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed." });

  try {
    const slugs = await redis.smembers("links");
    const links = await Promise.all(slugs.map(async (slug) => {
      const [raw, clicks, logs, sources, keywords] = await Promise.all([
        redis.get(`link:${slug}`), redis.get(`clicks:${slug}`),
        redis.lrange(`logs:${slug}`, 0, 9),
        redis.hgetall(`sources:${slug}`), redis.hgetall(`keywords:${slug}`)
      ]);
      if (!raw) return null;
      const link = typeof raw === "string" ? JSON.parse(raw) : raw;
      const toRows = obj => Object.entries(obj || {}).map(([name, count]) => ({ name, count: Number(count || 0) })).sort((a,b) => b.count-a.count);
      return {
        ...link, clicks: Number(clicks || 0),
        recent: logs.map(x => typeof x === "string" ? JSON.parse(x) : x),
        sources: toRows(sources), keywords: toRows(keywords)
      };
    }));

    const daily = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - i);
      const date = d.toISOString().slice(0, 10);
      daily.push({ date, clicks: Number(await redis.get(`daily-total:${date}`) || 0) });
    }

    const clean = links.filter(Boolean);
    const totalClicks = clean.reduce((sum, item) => sum + item.clicks, 0);
    const recent = clean.flatMap(item => item.recent.map(event => ({ ...event, name: item.name })))
      .sort((a,b) => new Date(b.at) - new Date(a.at)).slice(0, 30);
    const sourceMap = new Map(), keywordMap = new Map();
    for (const link of clean) {
      for (const row of link.sources) sourceMap.set(row.name, (sourceMap.get(row.name) || 0) + row.count);
      for (const row of link.keywords) keywordMap.set(row.name, (keywordMap.get(row.name) || 0) + row.count);
    }
    const sortMap = map => [...map].map(([name,count]) => ({name,count})).sort((a,b)=>b.count-a.count).slice(0,20);
    return sendJson(res, 200, {
      totalClicks, totalLinks: clean.length, daily, links: clean, recent,
      sources: sortMap(sourceMap), keywords: sortMap(keywordMap)
    });
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { error: "Gagal mengambil statistik." });
  }
}
