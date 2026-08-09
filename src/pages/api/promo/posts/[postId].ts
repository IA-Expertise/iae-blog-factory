import type { APIRoute } from "astro";
import { isAuthorizedPromoRequest } from "../../../../lib/promo";
import { getPromoPostSummary } from "../../../../lib/promoService";

export const prerender = false;

export const GET: APIRoute = async ({ request, params }) => {
  if (!isAuthorizedPromoRequest(request)) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  const postId = params.postId?.trim();
  if (!postId) {
    return new Response(JSON.stringify({ ok: false, error: "postId_required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const post = await getPromoPostSummary(postId);
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
