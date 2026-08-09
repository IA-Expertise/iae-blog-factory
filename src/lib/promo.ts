import { timingSafeEqual } from "node:crypto";

function envString(name: string): string {
  if (typeof process !== "undefined" && process.env?.[name] !== undefined) {
    return String(process.env[name] ?? "").trim();
  }
  const fromMeta = (import.meta.env as Record<string, string | undefined>)[name];
  return String(fromMeta ?? "").trim();
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
  return raw
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

export function promoPostSlugs(): string[] {
  const raw = envString("PROMO_POST_SLUGS");
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
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
    // Sem allowlist: promo ativo se número WhatsApp estiver configurado.
    return Boolean(promoWhatsappNumber());
  }
  const h = hostname.trim().toLowerCase();
  const noWww = h.startsWith("www.") ? h.slice(4) : h;
  const withWww = h.startsWith("www.") ? h : `www.${h}`;
  return hosts.includes(h) || hosts.includes(noWww) || hosts.includes(withWww);
}

export function isPromoPost(hostname: string, slug: string): boolean {
  if (!promoWhatsappNumber()) return false;
  if (!hostnameMatchesPromo(hostname)) return false;
  const allowed = promoPostSlugs();
  if (allowed.length === 0) return true;
  return allowed.includes(slug.trim().toLowerCase());
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
