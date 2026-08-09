import type { APIRoute } from "astro";
import { commentsEnabledForHostname, createCommentFromPublic } from "../../../lib/comments";
import { isPromoPost } from "../../../lib/promo";
import { buildPromoCtaForComment, notifyPromoHubLead } from "../../../lib/promoService";
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
    const normalizedSlug = normalizeTenantSlug(body.slug ?? "");
    if (!commentsEnabledForHostname(normalizedHost)) {
      return new Response(JSON.stringify({ ok: false, error: "Comentários indisponíveis para este blog." }), {
        status: 403,
        headers: { "Content-Type": "application/json" }
      });
    }

    const promoPost = await isPromoPost(normalizedHost, normalizedSlug);
    const authorEmail = (body.authorEmail ?? "").trim();
    if (promoPost && !authorEmail) {
      return new Response(
        JSON.stringify({ ok: false, error: "E-mail obrigatório para participar da promoção." }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    const result = await createCommentFromPublic({
      hostname: normalizedHost,
      slug: normalizedSlug,
      authorName: body.authorName ?? "",
      authorEmail,
      content: body.content ?? "",
      consentGiven: Boolean(body.consentGiven),
      honeypot: body.website ?? "",
      ip,
      userAgent: request.headers.get("user-agent")
    });

    const promo = result.authorEmail
      ? await buildPromoCtaForComment({
          hostname: result.hostname,
          slug: result.slug,
          email: result.authorEmail,
          name: result.authorName,
          category: result.category
        })
      : null;

    if (!promo && promoPost) {
      console.warn(
        JSON.stringify({
          event: "promo_cta_missing",
          hostname: result.hostname,
          slug: result.slug,
          hasEmail: Boolean(result.authorEmail)
        })
      );
    }

    if (!promoPost) {
      console.info(
        JSON.stringify({
          event: "promo_post_disabled",
          hostname: normalizedHost,
          slug: normalizedSlug
        })
      );
    }

    if (promo && result.authorEmail) {
      notifyPromoHubLead({
        hostname: result.hostname,
        postId: result.postId,
        commentId: result.id,
        authorName: result.authorName,
        authorEmail: result.authorEmail,
        consentGiven: result.consentGiven,
        campaignSlug: promo.campaignSlug
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        id: result.id,
        status: result.status,
        published: result.published,
        comment: {
          id: result.id,
          authorName: result.authorName,
          content: result.content,
          createdAt: result.createdAt,
          status: result.status
        },
        message: promo
          ? "Comentário enviado! Agora receba seu número da sorte no WhatsApp."
          : result.published
            ? "Comentário publicado com sucesso."
            : "Comentário recebido. Ele pode passar por validação automática.",
        promo
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
