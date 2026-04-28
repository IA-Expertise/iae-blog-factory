function looksLikeRailwayServiceHostname(hostname: string): boolean {
  const h = hostname.trim().toLowerCase();
  return h.endsWith(".up.railway.app");
}

/**
 * Host usado para resolver o tenant.
 * Em alguns proxies, `X-Forwarded-Host` vem com o host interno (`*.up.railway.app`) enquanto `Host` traz o domínio custom — priorizamos o público.
 */
export function resolveRequestHostname(request: Request): string {
  const forwardedRaw = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ?? "";
  const fromForwarded = forwardedRaw.split(":")[0]?.trim() ?? "";

  const rawHost = request.headers.get("host")?.split(":")[0]?.trim() ?? "";

  if (rawHost && !looksLikeRailwayServiceHostname(rawHost)) {
    return normalizeTenantHostname(rawHost);
  }
  if (fromForwarded && !looksLikeRailwayServiceHostname(fromForwarded)) {
    return normalizeTenantHostname(fromForwarded);
  }
  if (fromForwarded) return normalizeTenantHostname(fromForwarded);
  if (rawHost) return normalizeTenantHostname(rawHost);

  return normalizeTenantHostname(new URL(request.url).hostname);
}

export function normalizeTenantHostname(input: string): string {
  const noProtocol = input.trim().toLowerCase().replace(/^https?:\/\//, "");
  const hostOnly = noProtocol.split(/[/?#]/)[0]?.split(":")[0] ?? "";
  return hostOnly
    .replace(/[^a-z0-9.-]/g, "")
    .replace(/\.+/g, ".")
    .replace(/^-+|-+$/g, "")
    .replace(/^\.+|\.+$/g, "");
}

const RESERVED_TENANT_HOSTNAMES = new Set([
  "www",
  "admin",
  "api",
  "app",
  "static",
  "cdn",
  "localhost"
]);

export function isReservedTenantHostname(hostname: string): boolean {
  const normalized = normalizeTenantHostname(hostname);
  return RESERVED_TENANT_HOSTNAMES.has(normalized);
}

export function normalizeTenantSlug(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

export function buildTenantBasePath(hostname: string): string {
  return `/t/${encodeURIComponent(normalizeTenantHostname(hostname))}`;
}

export function buildTenantHomePath(hostname: string): string {
  return `${buildTenantBasePath(hostname)}/`;
}

export function buildTenantPostPath(hostname: string, slug: string): string {
  return `${buildTenantBasePath(hostname)}/post/${encodeURIComponent(normalizeTenantSlug(slug))}`;
}

export function buildTenantSobrePath(hostname: string): string {
  return `${buildTenantBasePath(hostname)}/sobre`;
}

export function buildTenantArquivoPath(hostname: string): string {
  return `${buildTenantBasePath(hostname)}/arquivo`;
}

export function buildTenantContatoPath(hostname: string): string {
  return `${buildTenantBasePath(hostname)}/contato`;
}

export function buildTenantPublicUrl(origin: string, hostname: string): string {
  const base = origin.endsWith("/") ? origin.slice(0, -1) : origin;
  return `${base}${buildTenantHomePath(hostname)}`;
}
