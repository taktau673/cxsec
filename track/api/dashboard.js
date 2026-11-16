import { readFileSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";

function readPage(relativeUrl) {
  return readFileSync(new URL(relativeUrl, import.meta.url));
}

export default function handler(req, res) {
  const expected = process.env.DASHBOARD_KEY || "";
  const supplied = String(req.query?.key || "");
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  const valid = Boolean(expected) &&
    a.length === b.length &&
    timingSafeEqual(a, b);

  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");

  if (!valid) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.end(readPage("../public/404.html"));
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.end(readPage("../private/dashboard.html"));
}
