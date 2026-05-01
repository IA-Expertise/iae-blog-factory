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

async function fetchImageBytes(url: string): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  try {
    const upstream = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent": "WhatsApp/2.24 IAE-Blog-Factory-OG/1.0",
        Accept: "image/*,*/*;q=0.8"
      },
      signal: AbortSignal.timeout(8000)
    });
    if (!upstream.ok) return null;
    const bytes = await upstream.arrayBuffer();
    const contentType = upstream.headers.get("content-type") || contentTypeFromUrl(url);
    if (!contentType.toLowerCase().startsWith("image/")) return null;
    return { bytes, contentType };
  } catch {
    return null;
  }
}

export const GET: APIRoute = async ({ params, request }) => {
  const hostname = normalizeTenantHostname(params.hostname ?? "");
  const slug = normalizeTenantSlug(params.slug ?? "");
  if (!hostname || !slug) return new Response("Not found", { status: 404 });

  try {
    const siteData = await getSiteDataByHostname(hostname);
    const post = await getPublishedPostBySlug(siteData.hostname, slug);
    if (!post?.image) return new Response("Not found", { status: 404 });

    const primaryHref = resolvePublicAssetUrl(post.image);
    const fallbackHref = resolvePublicAssetUrl(siteData.hero.image);
    const candidates = [primaryHref, fallbackHref].filter(Boolean).map((href) => new URL(href, request.url).toString());

    for (const absolute of candidates) {
      const fetched = await fetchImageBytes(absolute);
      if (!fetched) continue;
      return new Response(fetched.bytes, {
        status: 200,
        headers: {
          "Content-Type": fetched.contentType,
          "Content-Length": String(fetched.bytes.byteLength),
          // Mais estável para scrapers sociais: mantém cache curto e revalidação frequente.
          "Cache-Control": "public, max-age=3600"
        }
      });
    }

    return new Response("Not found", { status: 404 });
  } catch {
    return new Response("Not found", { status: 404 });
  }
};
