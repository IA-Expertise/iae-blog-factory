/**
 * Caminhos gravados em runtime em `public/generated-images/` não são expostos pelo servidor
 * de assets do build; servimos via `/api/media/generated/:name`.
 */
export function resolvePublicAssetUrl(href: string | null | undefined): string {
  if (!href?.trim()) return "";
  const u = href.trim();
  if (u.startsWith("/generated-images/")) {
    const name = u.slice("/generated-images/".length);
    if (/^[a-zA-Z0-9._-]+$/.test(name)) {
      return `/api/media/generated/${encodeURIComponent(name)}`;
    }
  }
  return u;
}
