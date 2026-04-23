export function buildTenantBasePath(hostname: string): string {
  return `/t/${encodeURIComponent(hostname)}`;
}

export function buildTenantHomePath(hostname: string): string {
  return `${buildTenantBasePath(hostname)}/`;
}

export function buildTenantPostPath(hostname: string, slug: string): string {
  return `${buildTenantBasePath(hostname)}/post/${encodeURIComponent(slug)}`;
}

export function buildTenantPublicUrl(origin: string, hostname: string): string {
  const base = origin.endsWith("/") ? origin.slice(0, -1) : origin;
  return `${base}${buildTenantHomePath(hostname)}`;
}
