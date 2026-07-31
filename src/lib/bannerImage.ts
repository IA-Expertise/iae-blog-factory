/**
 * URL pública do banner no HTML.
 * Banners no R2/CDN vão direto ao browser (sem passar pelo Railway),
 * reduzindo RX/TX do container. O proxy fica só para OG / casos allowlisted.
 */
export function bannerImageSrc(imagemUrl: string): string {
  return imagemUrl.trim();
}

/** @deprecated Use bannerImageSrc — mantido para imports legados. */
export function proxiedBannerImageSrc(imagemUrl: string): string {
  return bannerImageSrc(imagemUrl);
}
