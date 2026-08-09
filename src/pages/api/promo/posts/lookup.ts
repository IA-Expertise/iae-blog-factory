import type { APIRoute } from "astro";
import { isAuthorizedPromoRequest } from "../../../../lib/promo";
import { getPromoPostByHostnameSlug } from "../../../../lib/promoService";

export const prerender = false;

/** GET /api/promo/posts/lookup?hostname=&slug= */
export const GET: APIRoute = async ({ request, url }) => {
  if (!isAuthorizedPromoRequest(request)) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  const hostname = url.searchParams.get("hostname");
  const slug = url.searchParams.get("slug");
  if (!hostname || !slug) {
    return new Response(
      JSON.stringify({ ok: false, error: "hostname_and_slug_required" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  const post = await getPromoPostByHostnameSlug(hostname, slug);
  if (!post) {
    return new Response(JSON.stringify({ ok: false, error: "not_found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" }
    });
  }

  return new Response(JSON.stringify({ ok: true, post }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};
