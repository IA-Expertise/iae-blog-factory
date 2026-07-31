import type { APIRoute } from "astro";
import { isAllowedMediaProxyUrl } from "../../../lib/objectStorage";

export const prerender = false;

/** Limite de segurança: evita puxar arquivos enormes mesmo do host allowlisted. */
const MAX_PROXY_BYTES = 5 * 1024 * 1024;

function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "127.0.0.1" || h === "::1") return true;
  if (h.endsWith(".local")) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true;
  return false;
}

export const GET: APIRoute = async ({ url }) => {
  const src = url.searchParams.get("src")?.trim();
  if (!src) return new Response("missing src", { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(src);
  } catch {
    return new Response("invalid src", { status: 400 });
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return new Response("invalid protocol", { status: 400 });
  }
  if (isPrivateHost(parsed.hostname)) {
    return new Response("forbidden host", { status: 403 });
  }
  if (!isAllowedMediaProxyUrl(parsed.toString())) {
    return new Response("host not allowed", { status: 403 });
  }

  try {
    const response = await fetch(parsed.toString(), {
      redirect: "follow",
      headers: {
        "User-Agent": "IAE-Blog-Factory-OG-Proxy/1.0"
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      return new Response("upstream fetch failed", { status: 502 });
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength && Number(contentLength) > MAX_PROXY_BYTES) {
      return new Response("too large", { status: 413 });
    }

    const rawCt = response.headers.get("content-type") ?? "";
    const contentType = rawCt.toLowerCase().split(";")[0]?.trim() ?? "";
    const pathLower = parsed.pathname.toLowerCase();
    const hasImageExtension = /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(pathLower);

    const okImageType =
      contentType.startsWith("image/") ||
      (hasImageExtension &&
        (contentType === "application/octet-stream" ||
          contentType === "binary/octet-stream" ||
          contentType === ""));

    if (!okImageType) {
      return new Response("unsupported content-type", { status: 415 });
    }

    const body = await response.arrayBuffer();
    if (body.byteLength > MAX_PROXY_BYTES) {
      return new Response("too large", { status: 413 });
    }

    const outType =
      contentType.startsWith("image/") && contentType !== ""
        ? rawCt.split(";")[0]?.trim() || "image/jpeg"
        : hasImageExtension && pathLower.endsWith(".webp")
          ? "image/webp"
          : hasImageExtension && /\.jpe?g$/i.test(pathLower)
            ? "image/jpeg"
            : hasImageExtension && pathLower.endsWith(".png")
              ? "image/png"
              : "application/octet-stream";

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": outType,
        "Cache-Control": "public, max-age=86400"
      }
    });
  } catch {
    return new Response("proxy error", { status: 502 });
  }
};
