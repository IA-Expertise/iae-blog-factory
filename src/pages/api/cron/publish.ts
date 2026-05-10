import type { APIRoute } from "astro";
import { timingSafeEqual } from "node:crypto";
import { runScheduledPublishing } from "../../../lib/cms";

export const prerender = false;

function cronSecretFromEnv(): string {
  if (typeof process !== "undefined" && process.env?.CRON_SECRET !== undefined) {
    return String(process.env.CRON_SECRET);
  }
  return String(import.meta.env.CRON_SECRET ?? "");
}

/**
 * Lê o segredo enviado pelo cron.
 * Preferir header (cron-job.org: “HTTP Headers”) para evitar ambiguidade de `+` na query.
 * Na query, lemos o valor bruto e aplicamos decodeURIComponent (não usar só URLSearchParams: `+` vira espaço).
 */
function getProvidedCronKey(request: Request, url: URL): string {
  const bearer = request.headers.get("authorization");
  if (bearer?.toLowerCase().startsWith("bearer ")) {
    return bearer.slice(7).trim();
  }
  const headerKey = request.headers.get("x-cron-secret");
  if (headerKey?.trim()) return headerKey.trim();

  const q = url.search.startsWith("?") ? url.search.slice(1) : url.search;
  const m = /(?:^|&)key=([^&]*)/.exec(q);
  if (!m?.[1]) return "";
  try {
    return decodeURIComponent(m[1]).trim();
  } catch {
    return m[1].trim();
  }
}

function cronKeysMatch(secret: string, provided: string): boolean {
  const a = Buffer.from(secret, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const GET: APIRoute = async ({ request }) => {
  const secret = cronSecretFromEnv().trim();
  if (secret) {
    const url = new URL(request.url);
    const key = getProvidedCronKey(request, url);
    if (!cronKeysMatch(secret, key)) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const published = await runScheduledPublishing();
  return new Response(JSON.stringify({ ok: true, published }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};
