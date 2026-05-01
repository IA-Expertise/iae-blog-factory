import type { APIRoute } from "astro";
import sharp from "sharp";
import { getPublishedPostBySlug, getSiteDataByHostname } from "../../../../../lib/cms";
import { resolvePublicAssetUrl } from "../../../../../lib/mediaUrl";
import { normalizeTenantHostname, normalizeTenantSlug } from "../../../../../lib/tenantUrls";

export const prerender = false;
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const OG_MAX_BYTES = 300 * 1024;

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

async function normalizeForSocialOg(bytes: ArrayBuffer): Promise<Buffer | null> {
  const input = Buffer.from(bytes);
  const qualities = [72, 64, 56, 48, 40];

  try {
    // Primeiro pass: enquadra no formato OG (1.91:1) e tenta compressão padrão.
    let candidate = await sharp(input)
      .resize(OG_WIDTH, OG_HEIGHT, { fit: "cover", position: "attention" })
      .jpeg({ quality: qualities[0], mozjpeg: true, chromaSubsampling: "4:2:0" })
      .toBuffer();
    if (candidate.byteLength <= OG_MAX_BYTES) return candidate;

    // Segundo pass: reduz qualidade até ficar em faixa mais estável para WhatsApp.
    for (const quality of qualities.slice(1)) {
      candidate = await sharp(candidate).jpeg({ quality, mozjpeg: true, chromaSubsampling: "4:2:0" }).toBuffer();
      if (candidate.byteLength <= OG_MAX_BYTES) return candidate;
    }

    return candidate;
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
      const normalized = await normalizeForSocialOg(fetched.bytes);
      const body = normalized ?? Buffer.from(fetched.bytes);
      const contentType = normalized ? "image/jpeg" : fetched.contentType;

      return new Response(body, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(body.byteLength),
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
