import type { APIRoute } from "astro";
import { prisma } from "../../../lib/db";

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const id = Number.parseInt(url.searchParams.get("id") ?? "", 10);
  if (!Number.isFinite(id) || id < 1) {
    return new Response("Solicitação inválida.", { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const ad = await prisma.ad.findUnique({ where: { id } });
  if (!ad) {
    return new Response("Anúncio não encontrado.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  await prisma.ad.update({
    where: { id },
    data: { cliques: { increment: 1 } }
  });

  return Response.redirect(ad.ctaUrl, 302);
};
