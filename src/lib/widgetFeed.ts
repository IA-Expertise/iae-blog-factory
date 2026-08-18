import { getPublishedPostBySlug, listPublishedPostsForTenant } from "./cms";
import { prisma } from "./db";
import { resolvePublicAssetUrl } from "./mediaUrl";
import { isLikelyRegistrableDomain, isLocalDevHost } from "./publicHostRedirects";
import { resolvePublicOrigin } from "./publicOrigin";
import { renderPostMarkdown } from "./renderMarkdown";
import { parseSocialVideoUrl, socialVideoEmbedHtml } from "./socialVideoEmbed";
import { buildTenantPostPath, normalizeTenantHostname, normalizeTenantSlug } from "./tenantUrls";

export const WIDGET_DEFAULT_LIMIT = 6;
export const WIDGET_MAX_LIMIT = 12;

export type WidgetPost = {
  title: string;
  image: string;
  url: string;
  slug: string;
};

export type WidgetPostDetail = {
  title: string;
  image: string;
  url: string;
  slug: string;
  category: string;
  publishedAt: string;
  brandName: string;
  html: string;
  videoHtml: string;
};

function tenantPublicOrigin(hostname: string, request: Request): string {
  const host = normalizeTenantHostname(hostname);
  if (host && isLikelyRegistrableDomain(host) && !isLocalDevHost(host)) {
    return `https://${host}`;
  }
  return resolvePublicOrigin(request.url, request);
}

function absoluteAssetUrl(href: string, requestOrigin: string): string {
  const resolved = resolvePublicAssetUrl(href);
  if (!resolved) return "";
  if (/^https?:\/\//i.test(resolved)) return resolved;
  try {
    return new URL(resolved, `${requestOrigin.replace(/\/$/, "")}/`).toString();
  } catch {
    return resolved;
  }
}

export function parseWidgetLimit(raw: string | null): number {
  if (!raw?.trim()) return WIDGET_DEFAULT_LIMIT;
  const n = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(n) || n < 1) return WIDGET_DEFAULT_LIMIT;
  return Math.min(WIDGET_MAX_LIMIT, n);
}

export async function getWidgetPosts(
  hostnameRaw: string,
  limit: number,
  request: Request
): Promise<{ hostname: string; posts: WidgetPost[] } | null> {
  const hostname = normalizeTenantHostname(hostnameRaw);
  if (!hostname) return null;

  const rows = await listPublishedPostsForTenant(hostname, limit);
  const origin = tenantPublicOrigin(hostname, request);
  const requestOrigin = resolvePublicOrigin(request.url, request);

  return {
    hostname,
    posts: rows.map((post) => {
      const slug = post.slug ?? "";
      return {
        title: post.title,
        image: absoluteAssetUrl(post.image, requestOrigin),
        slug,
        url: new URL(buildTenantPostPath(hostname, slug), `${origin}/`).toString()
      };
    })
  };
}

export async function getWidgetPostDetail(
  hostnameRaw: string,
  slugRaw: string,
  request: Request
): Promise<WidgetPostDetail | null> {
  const hostname = normalizeTenantHostname(hostnameRaw);
  const slug = normalizeTenantSlug(slugRaw);
  if (!hostname || !slug) return null;

  const tenant = await prisma.tenant.findUnique({
    where: { hostname },
    select: { brandName: true }
  });
  if (!tenant) return null;

  const post = await getPublishedPostBySlug(hostname, slug);
  if (!post) return null;

  const origin = tenantPublicOrigin(hostname, request);
  const requestOrigin = resolvePublicOrigin(request.url, request);
  const html = post.content ? renderPostMarkdown(post.content) : post.excerpt ? `<p>${escapeHtml(post.excerpt)}</p>` : "";
  const parsedVideo = parseSocialVideoUrl(post.videoUrl);
  const videoHtml = parsedVideo ? socialVideoEmbedHtml(parsedVideo) : "";

  return {
    title: post.title,
    image: absoluteAssetUrl(post.image, requestOrigin),
    slug,
    category: post.category,
    publishedAt: post.publishedAt,
    brandName: tenant.brandName,
    url: new URL(buildTenantPostPath(hostname, slug), `${origin}/`).toString(),
    html,
    videoHtml
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const widgetCorsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};
