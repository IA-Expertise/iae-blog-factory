/** Domínio público real (ex.: techpolis.com.br) — não confundir com .local ou Railway. */
export function isLikelyProductionCustomDomain(hostname: string): boolean {
  const h = hostname.trim().toLowerCase();
  if (!h || !h.includes(".")) return false;
  if (h.endsWith(".local") || h.endsWith(".localhost")) return false;
  if (h === "localhost") return false;
  if (h.endsWith(".up.railway.app")) return false;
  return true;
}

/**
 * Todos os hosts candidatos do pedido (ordem: domínios custom primeiro, depois o resto).
 * Resolve o caso em que um header traz techpolis.com.br e outro traz *.railway.app.
 */
export function collectHostnameCandidates(request: Request): string[] {
  const raw: string[] = [];

  const pushHeaderList = (header: string | null) => {
    if (!header) return;
    for (const seg of header.split(",")) {
      const p = seg.trim().split(":")[0]?.trim();
      if (p) raw.push(p);
    }
  };

  pushHeaderList(request.headers.get("host"));
  pushHeaderList(request.headers.get("x-forwarded-host"));
  pushHeaderList(request.headers.get("cf-connecting-host"));
  try {
    raw.push(new URL(request.url).hostname);
  } catch {
    /* ignore */
  }

  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const n = normalizeTenantHostname(r);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    normalized.push(n);
  }

  const custom = normalized.filter(isLikelyProductionCustomDomain);
  const rest = normalized.filter((h) => !isLikelyProductionCustomDomain(h));
  return [...custom, ...rest];
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
