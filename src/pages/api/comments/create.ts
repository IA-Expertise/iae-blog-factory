import type { APIRoute } from "astro";
import { commentsEnabledForHostname, createCommentFromPublic } from "../../../lib/comments";
import {
  getRequestClientIp,
  rateLimitComments,
  tooManyRequestsResponse
} from "../../../lib/rateLimit";
import { normalizeTenantHostname, normalizeTenantSlug } from "../../../lib/tenantUrls";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const ip = getRequestClientIp(request);
    const limited = rateLimitComments(ip);
    if (!limited.allowed) {
      console.warn(`[rateLimit] comments blocked ip=${ip} retryAfter=${limited.retryAfterSec}s`);
      return tooManyRequestsResponse(limited);
    }

    const body = (await request.json()) as {
      hostname?: string;
      slug?: string;
      authorName?: string;
      authorEmail?: string;
      content?: string;
      consentGiven?: boolean;
      website?: string;
    };
    const normalizedHost = normalizeTenantHostname(body.hostname ?? "");
    if (!commentsEnabledForHostname(normalizedHost)) {
      return new Response(JSON.stringify({ ok: false, error: "Comentários indisponíveis para este blog." }), {
        status: 403,
        headers: { "Content-Type": "application/json" }
      });
    }

    const result = await createCommentFromPublic({
      hostname: normalizedHost,
      slug: normalizeTenantSlug(body.slug ?? ""),
      authorName: body.authorName ?? "",
      authorEmail: body.authorEmail ?? "",
      content: body.content ?? "",
      consentGiven: Boolean(body.consentGiven),
      honeypot: body.website ?? "",
      ip,
      userAgent: request.headers.get("user-agent")
    });

    return new Response(
      JSON.stringify({
        ok: true,
        id: result.id,
        status: result.status,
        message: result.published
          ? "Comentário publicado com sucesso."
          : "Comentário recebido. Ele pode passar por validação automática."
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao enviar comentário.";
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
};
