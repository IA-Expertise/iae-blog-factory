import type { APIRoute } from "astro";
import { getPublishedPostBySlug, getSiteDataByHostname } from "../../../../../lib/cms";
import { resolvePublicAssetUrl } from "../../../../../lib/mediaUrl";
import { normalizeTenantHostname, normalizeTenantSlug } from "../../../../../lib/tenantUrls";

export const prerender = false;

function contentTypeFromUrl(url: string): string {
  const lower = url.toLowerCase();
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "image/png";
}

export const GET: APIRoute = async ({ params, request }) => {
  const hostname = normalizeTenantHostname(params.hostname ?? "");
  const slug = normalizeTenantSlug(params.slug ?? "");
  if (!hostname || !slug) return new Response("Not found", { status: 404 });

  try {
    const siteData = await getSiteDataByHostname(hostname);
    const post = await getPublishedPostBySlug(siteData.hostname, slug);
    if (!post?.image) return new Response("Not found", { status: 404 });

    const imageHref = resolvePublicAssetUrl(post.image);
    if (!imageHref) return new Response("Not found", { status: 404 });

    const absolute = new URL(imageHref, request.url).toString();
    const upstream = await fetch(absolute, {
      redirect: "follow",
      headers: { "User-Agent": "IAE-Blog-Factory-OG-Cover/1.0" }
    });
    if (!upstream.ok) return new Response("Not found", { status: 404 });

    const buf = await upstream.arrayBuffer();
    const contentType = upstream.headers.get("content-type") || contentTypeFromUrl(absolute);
    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(buf.byteLength),
        "Cache-Control": "public, max-age=86400"
      }
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
};
