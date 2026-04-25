import type { APIRoute } from "astro";

export const prerender = false;

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

  try {
    const response = await fetch(parsed.toString(), {
      redirect: "follow",
      headers: {
        "User-Agent": "IAE-Blog-Factory-OG-Proxy/1.0"
      }
    });

    if (!response.ok) {
      return new Response("upstream fetch failed", { status: 502 });
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("image/")) {
      return new Response("unsupported content-type", { status: 415 });
    }

    const body = await response.arrayBuffer();
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400"
      }
    });
  } catch {
    return new Response("proxy error", { status: 502 });
  }
};
