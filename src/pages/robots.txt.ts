import type { APIRoute } from "astro";

function resolvePublicOrigin(url: URL, request: Request): string {
  const configured = import.meta.env.PUBLIC_SITE_ORIGIN?.trim()?.replace(/\/+$/, "");
  if (configured) return configured;

  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (forwardedHost) return `${forwardedProto || "https"}://${forwardedHost}`;

  return url.origin;
}

export const GET: APIRoute = ({ url, request }) => {
  const origin = resolvePublicOrigin(url, request);
  const body = [
    "User-agent: facebookexternalhit",
    "Allow: /",
    "",
    "User-agent: Facebot",
    "Allow: /",
    "",
    "User-agent: LinkedInBot",
    "Allow: /",
    "",
    "User-agent: *",
    "Allow: /",
    "",
    `Sitemap: ${origin}/sitemap.xml`,
    ""
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600"
    }
  });
};
