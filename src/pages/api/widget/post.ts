import type { APIRoute } from "astro";
import { getWidgetPostDetail, widgetCorsHeaders } from "../../../lib/widgetFeed";

export const prerender = false;

export const OPTIONS: APIRoute = async () => {
  return new Response(null, { status: 204, headers: widgetCorsHeaders });
};

/** Matéria completa para overlay do embed (HTML + capa). */
export const GET: APIRoute = async ({ request, url }) => {
  const hostname = url.searchParams.get("hostname") ?? "";
  const slug = url.searchParams.get("slug") ?? "";

  if (!hostname.trim() || !slug.trim()) {
    return new Response(JSON.stringify({ ok: false, error: "hostname_and_slug_required" }), {
      status: 400,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...widgetCorsHeaders
      }
    });
  }

  const post = await getWidgetPostDetail(hostname, slug, request);
  if (!post) {
    return new Response(JSON.stringify({ ok: false, error: "not_found" }), {
      status: 404,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...widgetCorsHeaders
      }
    });
  }

  return new Response(JSON.stringify({ ok: true, post }), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=120, stale-while-revalidate=300",
      ...widgetCorsHeaders
    }
  });
};
