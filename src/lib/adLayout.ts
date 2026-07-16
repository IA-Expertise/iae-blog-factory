/**
 * Helpers de inventário de banners e layout da home.
 * Alternância: seed por pageview + slot sem repetir o mesmo Ad pago.
 */

/** Home: 1 destaque + até 9 cards (3 linhas × 3). */
export const HOME_GRID_POST_LIMIT = 9;

export function chunkHomeGridRows<T>(posts: T[]): [T[], T[], T[]] {
  const grid = posts.slice(0, HOME_GRID_POST_LIMIT);
  return [grid.slice(0, 3), grid.slice(3, 6), grid.slice(6, 9)];
}

/**
 * Divide HTML do artigo para inserir banner no meio (após o H2 do meio, ou no meio por parágrafos).
 */
export function splitHtmlForMidAd(html: string): { before: string; after: string } {
  const trimmed = html.trim();
  if (!trimmed) return { before: "", after: "" };

  const h2Matches = [...trimmed.matchAll(/<h2\b[^>]*>/gi)];
  if (h2Matches.length >= 2) {
    const mid = h2Matches[Math.floor(h2Matches.length / 2)]!;
    const at = mid.index ?? 0;
    if (at > 0) return { before: trimmed.slice(0, at), after: trimmed.slice(at) };
  }

  const parts = trimmed.split(/(?=<\/p>)/i);
  if (parts.length >= 4) {
    const mid = Math.floor(parts.length / 2);
    return { before: parts.slice(0, mid).join(""), after: parts.slice(mid).join("") };
  }

  return { before: trimmed, after: "" };
}
