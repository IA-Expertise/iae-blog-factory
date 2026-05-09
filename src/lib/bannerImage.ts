/** Usa o proxy de mídia para cache na borda (Railway) em URLs absolutas de banner (R2/CDN). */
export function proxiedBannerImageSrc(imagemUrl: string): string {
  const t = imagemUrl.trim();
  if (!t) return t;
  if (t.startsWith("/")) return t;
  if (t.startsWith("http://") || t.startsWith("https://")) {
    return `/api/media/proxy?src=${encodeURIComponent(t)}`;
  }
  return t;
}
