import { listPublishedPostsForTenant } from "./cms";
import { resolvePublicAssetUrl } from "./mediaUrl";
import { isLikelyRegistrableDomain, isLocalDevHost } from "./publicHostRedirects";
import { resolvePublicOrigin } from "./publicOrigin";
import { buildTenantPostPath, normalizeTenantHostname } from "./tenantUrls";

export const WIDGET_DEFAULT_LIMIT = 6;
export const WIDGET_MAX_LIMIT = 12;

export type WidgetPost = {
  title: string;
  image: string;
  url: string;
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
    posts: rows.map((post) => ({
      title: post.title,
      image: absoluteAssetUrl(post.image, requestOrigin),
      url: new URL(buildTenantPostPath(hostname, post.slug ?? ""), `${origin}/`).toString()
    }))
  };
}

export const widgetCorsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};
