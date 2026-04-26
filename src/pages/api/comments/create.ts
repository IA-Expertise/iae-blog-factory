import type { APIRoute } from "astro";
import { commentsEnabledForHostname, createCommentFromPublic } from "../../../lib/comments";
import { normalizeTenantHostname, normalizeTenantSlug } from "../../../lib/tenantUrls";

export const prerender = false;

function getClientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  const real = request.headers.get("x-real-ip")?.trim();
  return real || null;
}

export const POST: APIRoute = async ({ request }) => {
  try {
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
      ip: getClientIp(request),
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
