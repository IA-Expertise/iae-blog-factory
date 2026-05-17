import { normalizeTenantHostname } from "./tenantUrls";

export function isLocalDevHost(hostname: string): boolean {
  const h = hostname.trim().toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1" || h.endsWith(".local") || h.endsWith(".localhost");
}

/** Domínio público registrável (ex.: louveiranews.com.br). */
export function isLikelyRegistrableDomain(hostname: string): boolean {
  const h = hostname.trim().toLowerCase();
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(h);
}

/** Aplica redirecionamento www→apex e HTTP→HTTPS (não em *.railway.app nem localhost). */
export function shouldNormalizePublicHost(hostname: string): boolean {
  const h = normalizeTenantHostname(hostname);
  if (!h || isLocalDevHost(h)) return false;
  if (h.includes("railway.app") || h.includes("vercel.app") || h.includes("fly.dev")) return false;
  return isLikelyRegistrableDomain(h);
}

export function stripWwwPrefix(hostname: string): string {
  const h = normalizeTenantHostname(hostname);
  return h.startsWith("www.") ? h.slice(4) : h;
}

export function getRequestHostname(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const hostHeader = request.headers.get("host")?.trim();
  const hostnameRaw = forwardedHost || hostHeader || new URL(request.url).hostname;
  return hostnameRaw.split(":")[0]?.trim() || "";
}

export function getForwardedProto(request: Request): string {
  return request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase() || "https";
}

/** URL absoluta HTTPS no host canónico, preservando path e query. */
export function buildHttpsRedirectUrl(request: Request, host: string): string {
  const { pathname, search } = new URL(request.url);
  return `https://${host}${pathname}${search}`;
}
