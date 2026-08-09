import { timingSafeEqual } from "node:crypto";
import { prisma } from "./db";

/**
 * Lê env em runtime (Railway/Node). Usa Reflect para evitar freeze do Vite em
 * `process.env.FOO` / `import.meta.env.FOO` no build.
 */
function envString(name: string): string {
  try {
    if (typeof process !== "undefined" && process.env) {
      const fromProcess = Reflect.get(process.env, name);
      if (typeof fromProcess === "string") return fromProcess.trim();
    }
  } catch {
    // ignore
  }
  try {
    const fromMeta = Reflect.get(import.meta.env as object, name);
    if (typeof fromMeta === "string") return fromMeta.trim();
  } catch {
    // ignore
  }
  return "";
}

/** Hostname limpo: sem protocol/path/porta; lower-case. */
export function normalizePromoHost(raw: string): string {
  const noProtocol = raw.trim().toLowerCase().replace(/^https?:\/\//, "");
  return (noProtocol.split(/[/?#]/)[0]?.split(":")[0] ?? "").replace(/^www\./, "");
}

export function blogFactoryApiToken(): string {
  return envString("BLOG_FACTORY_API_TOKEN");
}

export function promoHubWebhookUrl(): string {
  return envString("PROMO_HUB_WEBHOOK_URL");
}

export function promoHubWebhookSecret(): string {
  return envString("PROMO_HUB_WEBHOOK_SECRET");
}

export function promoWhatsappNumber(): string {
  return envString("PROMO_WHATSAPP_NUMBER").replace(/\D/g, "");
}

export function promoCampaignSlug(): string {
  return envString("PROMO_CAMPAIGN_SLUG") || "piloto";
}

export function promoEnabledHosts(): string[] {
  const raw = envString("PROMO_ENABLED_HOSTS");
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(",")
        .map((h) => normalizePromoHost(h))
        .filter(Boolean)
    )
  ];
}

export function promoPostSlugs(): string[] {
  const raw = envString("PROMO_POST_SLUGS");
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Categorias que habilitam sorteio (CSV). Default: publieditorial */
export function promoCategories(): string[] {
  const raw = envString("PROMO_CATEGORIES");
  if (!raw) return ["publieditorial"];
  return raw
    .split(",")
    .map((s) => normalizeCategory(s))
    .filter(Boolean);
}

function tokensMatch(expected: string, provided: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Auth server-to-server para /api/promo/* */
export function isAuthorizedPromoRequest(request: Request): boolean {
  const expected = blogFactoryApiToken();
  if (!expected) return false;
  const bearer = request.headers.get("authorization");
  if (!bearer?.toLowerCase().startsWith("bearer ")) return false;
  return tokensMatch(expected, bearer.slice(7).trim());
}

export function hostnameMatchesPromo(hostname: string): boolean {
  const hosts = promoEnabledHosts();
  if (hosts.length === 0) {
    return Boolean(promoWhatsappNumber());
  }
  const normalized = normalizePromoHost(hostname);
  if (!normalized) return false;
  return hosts.includes(normalized);
}

export function normalizeCategory(category: string): string {
  return category
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

export function isPublieditorialCategory(category?: string | null): boolean {
  if (!category) return false;
  const normalized = normalizeCategory(category);
  const allowed = promoCategories();
  return allowed.some((a) => normalized === a || normalized.includes(a));
}

export type PromoGate = {
  hasWhatsappNumber: boolean;
  whatsappNumberDigits: number;
  hostnameMatch: boolean;
  enabledHosts: string[];
  category: string | null;
  categoryMatch: boolean;
  slugAllowlist: string[];
  slugAllowlistActive: boolean;
  slugAllowed: boolean;
  eligible: boolean;
  blockReason: string | null;
};

export function diagnosePromoGate(input: {
  hostname: string;
  slug: string;
  category?: string | null;
}): PromoGate {
  const phone = promoWhatsappNumber();
  const hasWhatsappNumber = phone.length >= 10;
  const hostnameMatch = hostnameMatchesPromo(input.hostname);
  const category = input.category ?? null;
  const categoryMatch = isPublieditorialCategory(category);
  const slugAllowlist = promoPostSlugs();
  const slugAllowlistActive = slugAllowlist.length > 0;
  const slugAllowed = slugAllowlistActive
    ? slugAllowlist.includes(input.slug.trim().toLowerCase())
    : true;

  let blockReason: string | null = null;
  if (!hasWhatsappNumber) blockReason = "missing_PROMO_WHATSAPP_NUMBER";
  else if (!hostnameMatch) blockReason = "hostname_not_in_PROMO_ENABLED_HOSTS";
  else if (slugAllowlistActive && !slugAllowed) blockReason = "slug_not_in_PROMO_POST_SLUGS";
  else if (!slugAllowlistActive && !categoryMatch) blockReason = "category_not_publieditorial";

  const eligible =
    hasWhatsappNumber && hostnameMatch && slugAllowed && (slugAllowlistActive || categoryMatch);

  return {
    hasWhatsappNumber,
    whatsappNumberDigits: phone.length,
    hostnameMatch,
    enabledHosts: promoEnabledHosts(),
    category,
    categoryMatch,
    slugAllowlist,
    slugAllowlistActive,
    slugAllowed,
    eligible,
    blockReason
  };
}

/**
 * Promo/sorteio só em matérias elegíveis.
 * - Host permitido + WhatsApp configurado
 * - Se PROMO_POST_SLUGS estiver setado: só esses slugs (override)
 * - Senão: categoria publieditorial (ou PROMO_CATEGORIES)
 */
export async function isPromoPost(
  hostname: string,
  slug: string,
  category?: string | null,
): Promise<boolean> {
  let cat = category ?? null;
  if (cat == null) {
    const host = normalizePromoHost(hostname);
    const postSlug = slug.trim().toLowerCase();
    const hostVariants = [...new Set([host, `www.${host}`, hostname.trim().toLowerCase()])].filter(
      Boolean
    );
    const post = await prisma.post.findFirst({
      where: {
        slug: postSlug,
        status: "PUBLISHED",
        tenant: { hostname: { in: hostVariants } }
      },
      select: { category: true }
    });
    cat = post?.category ?? null;
  }

  return diagnosePromoGate({ hostname, slug, category: cat }).eligible;
}

export function buildPromoWaMeUrl(params: {
  campaignSlug: string;
  email?: string | null;
  name?: string | null;
}): string | null {
  const phone = promoWhatsappNumber();
  if (!phone) return null;
  const email = params.email?.trim().toLowerCase();
  const name = params.name?.trim().replace(/\s+/g, " ").slice(0, 80);
  let text = `Quero meu bilhete CAMP:${params.campaignSlug}`;
  if (email) text += ` EMAIL:${email}`;
  if (name) text += ` NOME:${name}`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
