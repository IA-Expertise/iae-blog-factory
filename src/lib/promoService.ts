import { prisma } from "./db";
import {
  buildPromoWaMeUrl,
  isPromoPost,
  promoCampaignSlug,
  promoHubWebhookSecret,
  promoHubWebhookUrl
} from "./promo";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function lookupPromoComment(input: {
  postId?: string | null;
  hostname?: string | null;
  postSlug?: string | null;
  email: string;
}) {
  const email = normalizeEmail(input.email);
  if (!email || !email.includes("@")) {
    return { ok: true as const, found: false as const };
  }

  let postId = input.postId?.trim() || null;

  if (!postId && input.hostname && input.postSlug) {
    const hostname = input.hostname.trim().toLowerCase();
    const slug = input.postSlug.trim().toLowerCase();
    const post = await prisma.post.findFirst({
      where: {
        slug,
        status: "PUBLISHED",
        tenant: { hostname }
      },
      select: { id: true }
    });
    postId = post?.id ?? null;
  }

  if (!postId) {
    return { ok: true as const, found: false as const };
  }

  const comment = await prisma.comment.findFirst({
    where: {
      postId,
      consentGiven: true,
      authorEmail: {
        equals: email,
        mode: "insensitive"
      },
      status: { in: ["PUBLISHED", "AUTO_HIDDEN"] }
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      authorName: true,
      authorEmail: true,
      consentGiven: true,
      createdAt: true,
      status: true,
      postId: true
    }
  });

  if (!comment) {
    return { ok: true as const, found: false as const };
  }

  return {
    ok: true as const,
    found: true as const,
    comment: {
      id: comment.id,
      authorName: comment.authorName,
      authorEmail: comment.authorEmail,
      consentGiven: comment.consentGiven,
      createdAt: comment.createdAt.toISOString(),
      status: comment.status,
      postId: comment.postId
    }
  };
}

export async function getPromoPostSummary(postId: string) {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: { tenant: true }
  });
  if (!post) return null;

  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    hostname: post.tenant.hostname,
    status: post.status,
    publicUrl: `/t/${post.tenant.hostname}/post/${post.slug}`
  };
}

export type PromoCtaPayload = {
  enabled: true;
  campaignSlug: string;
  waMeUrl: string;
  message: string;
};

export function buildPromoCtaForComment(input: {
  hostname: string;
  slug: string;
  email: string;
}): PromoCtaPayload | null {
  if (!isPromoPost(input.hostname, input.slug)) return null;
  const email = normalizeEmail(input.email);
  if (!email) return null;

  const campaignSlug = promoCampaignSlug();
  const waMeUrl = buildPromoWaMeUrl({ campaignSlug, email });
  if (!waMeUrl) return null;

  return {
    enabled: true,
    campaignSlug,
    waMeUrl,
    message: "Comentário registrado. Resgate seu bilhete no WhatsApp."
  };
}

/** Fire-and-forget para o Promo Hub (não bloqueia o leitor). */
export function notifyPromoHubLead(payload: {
  hostname: string;
  postId: string;
  commentId: string;
  authorName: string;
  authorEmail: string;
  consentGiven: boolean;
  campaignSlug: string;
}): void {
  const url = promoHubWebhookUrl();
  if (!url) return;

  const secret = promoHubWebhookSecret();
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (secret) {
    headers["x-promo-webhook-secret"] = secret;
    headers.Authorization = `Bearer ${secret}`;
  }

  void fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  }).catch((err) => {
    console.warn(
      JSON.stringify({
        event: "promo_hub_notify_failed",
        message: err instanceof Error ? err.message : "unknown"
      })
    );
  });
}
