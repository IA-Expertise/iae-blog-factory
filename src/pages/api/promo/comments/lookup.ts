import type { APIRoute } from "astro";
import { isAuthorizedPromoRequest } from "../../../lib/promo";
import { lookupPromoComment } from "../../../lib/promoService";

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  if (!isAuthorizedPromoRequest(request)) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  const postId = url.searchParams.get("postId");
  const email = url.searchParams.get("email");
  const hostname = url.searchParams.get("hostname");
  const postSlug = url.searchParams.get("postSlug");

  if (!email) {
    return new Response(JSON.stringify({ ok: false, error: "email_required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  if (!postId && !(hostname && postSlug)) {
    return new Response(
      JSON.stringify({ ok: false, error: "postId_or_hostname_postSlug_required" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  const result = await lookupPromoComment({
    postId,
    hostname,
    postSlug,
    email
  });

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};
