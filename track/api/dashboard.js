import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { timingSafeEqual } from "node:crypto";

// File-file ini ikut dimasukkan ke bundle Vercel melalui functions.includeFiles.
const notFoundPath = fileURLToPath(new URL("../public/404.html", import.meta.url));
const dashboardPath = fileURLToPath(new URL("../private/dashboard.html", import.meta.url));

function sendHtml(res, status, html) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.end(html);
}

export default function handler(req, res) {
  try {
    const expected = String(process.env.DASHBOARD_KEY || "");
    const supplied = typeof req.query?.key === "string" ? req.query.key : "";
    const a = Buffer.from(supplied, "utf8");
    const b = Buffer.from(expected, "utf8");
    const valid = expected.length > 0 && a.length === b.length && timingSafeEqual(a, b);

    if (!valid) {
      return sendHtml(res, 404, readFileSync(notFoundPath, "utf8"));
    }

    return sendHtml(res, 200, readFileSync(dashboardPath, "utf8"));
  } catch (error) {
    // Catat detail di Vercel Runtime Logs; jangan bocorkan detail internal ke pengunjung.
    console.error("dashboard handler failed:", error);
    return res.status(500).send("Internal Server Error");
  }
}
