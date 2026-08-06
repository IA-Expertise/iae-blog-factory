import type { APIRoute } from "astro";

export const prerender = false;

/** Health check (Railway/probes) — não resolve tenant. */
export const GET: APIRoute = async () => {
  return new Response(JSON.stringify({ ok: true, service: "iae-blog-factory" }), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
};
