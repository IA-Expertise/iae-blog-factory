import type { APIRoute } from "astro";
import { listSites } from "../lib/cms";
import {
  buildTenantArquivoPath,
  buildTenantContatoPath,
  buildTenantHomePath,
  buildTenantPostPath,
  buildTenantSobrePath
} from "../lib/tenantUrls";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export const GET: APIRoute = async ({ url }) => {
  const origin = url.origin;
  const sites = await listSites();

  const entries: string[] = [];
  for (const site of sites) {
    entries.push(new URL(buildTenantHomePath(site.hostname), origin).toString());
    entries.push(new URL(buildTenantSobrePath(site.hostname), origin).toString());
    entries.push(new URL(buildTenantArquivoPath(site.hostname), origin).toString());
    entries.push(new URL(buildTenantContatoPath(site.hostname), origin).toString());
    for (const post of site.posts) {
      if (post.status !== "PUBLISHED" || !post.slug) continue;
      entries.push(new URL(buildTenantPostPath(site.hostname, post.slug), origin).toString());
    }
  }

  const uniqueEntries = [...new Set(entries)];
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${uniqueEntries
    .map((entry) => `  <url><loc>${escapeXml(entry)}</loc></url>`)
    .join("\n")}\n</urlset>\n`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=1800"
    }
  });
};
