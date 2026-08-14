import type { APIRoute } from "astro";
import { getWidgetPosts, parseWidgetLimit, widgetCorsHeaders } from "../../../lib/widgetFeed";

export const prerender = false;

export const OPTIONS: APIRoute = async () => {
  return new Response(null, { status: 204, headers: widgetCorsHeaders });
};

/** Lista pública das últimas matérias publicadas (embed WordPress / sites terceiros). */
export const GET: APIRoute = async ({ request, url }) => {
  const hostname = url.searchParams.get("hostname") ?? "";
  const limit = parseWidgetLimit(url.searchParams.get("limit"));
  const feed = await getWidgetPosts(hostname, limit, request);

  if (!feed) {
    return new Response(JSON.stringify({ ok: false, error: "hostname_required", posts: [] }), {
      status: 400,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        ...widgetCorsHeaders
      }
    });
  }

  return new Response(JSON.stringify({ ok: true, hostname: feed.hostname, posts: feed.posts }), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=120, stale-while-revalidate=300",
      ...widgetCorsHeaders
    }
  });
};
