import type { APIRoute } from "astro";
import { prisma } from "../../../lib/db";
import { getRequestClientIp, rateLimitAdClicks } from "../../../lib/rateLimit";

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  const id = Number.parseInt(url.searchParams.get("id") ?? "", 10);
  if (!Number.isFinite(id) || id < 1) {
    return new Response("Solicitação inválida.", { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const ad = await prisma.ad.findUnique({ where: { id } });
  if (!ad) {
    return new Response("Anúncio não encontrado.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const ip = getRequestClientIp(request);
  const limited = rateLimitAdClicks(ip);
  if (!limited.allowed) {
    // Sempre redireciona o anunciante; só deixa de contar clique sob abuso.
    console.warn(`[rateLimit] ads click not counted ip=${ip} ad=${id} retryAfter=${limited.retryAfterSec}s`);
    return Response.redirect(ad.ctaUrl, 302);
  }

  await prisma.ad.update({
    where: { id },
    data: { cliques: { increment: 1 } }
  });

  return Response.redirect(ad.ctaUrl, 302);
};
