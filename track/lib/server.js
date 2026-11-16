import { Redis } from "@upstash/redis";
import { timingSafeEqual } from "node:crypto";

export const redis = Redis.fromEnv();

export function sendJson(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.json(body);
}

// Lindungi seluruh endpoint administrasi, bukan hanya file dashboard.
export function requireDashboardKey(req, res) {
  const expected = process.env.DASHBOARD_KEY;
  if (!expected) {
    sendJson(res, 503, { error: "Dashboard belum dikonfigurasi. Atur DASHBOARD_KEY di environment Vercel." });
    return false;
  }

  const supplied = String(req.headers["x-dashboard-key"] || "");
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  const valid = a.length === b.length && timingSafeEqual(a, b);
  if (!valid) {
    sendJson(res, 401, { error: "Akses ditolak. Buka dashboard menggunakan key yang benar." });
    return false;
  }
  return true;
}

export function validSlug(value) {
  return typeof value === "string" && /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(value);
}

export function validDestination(value) {
  try {
    const u = new URL(value);
    return (u.protocol === "https:" || u.protocol === "http:") && !!u.hostname;
  } catch {
    return false;
  }
}

export function baseUrl(req) {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/+$/, "");
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
}
