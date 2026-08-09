import type { APIRoute } from "astro";
import { diagnosePromoGate, promoCampaignSlug, promoCategories } from "../../../lib/promo";
import { normalizeTenantHostname, normalizeTenantSlug } from "../../../lib/tenantUrls";

export const prerender = false;

/**
 * Diagnóstico público (sem segredos) para ver por que o CTA WhatsApp não habilita.
 * Ex.: /api/promo/status?hostname=louveiranews.com.br&slug=...&category=publieditorial
 */
export const GET: APIRoute = async ({ url }) => {
  const hostname = normalizeTenantHostname(url.searchParams.get("hostname") ?? "louveiranews.com.br");
  const slug = normalizeTenantSlug(url.searchParams.get("slug") ?? "");
  const category = url.searchParams.get("category");

  const gate = diagnosePromoGate({
    hostname,
    slug: slug || "diagnostico",
    category: category ?? "publieditorial"
  });

  return new Response(
    JSON.stringify({
      ok: true,
      campaignSlugDefault: promoCampaignSlug(),
      categories: promoCategories(),
      gate
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      }
    }
  );
};
