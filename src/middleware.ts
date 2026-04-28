import { defineMiddleware } from "astro:middleware";
import { getSiteDataForRequest } from "./lib/cms";
import { collectHostnameCandidates } from "./lib/tenantUrls";

export const onRequest = defineMiddleware(async ({ request, locals }, next) => {
  try {
    locals.siteData = await getSiteDataForRequest(request);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao carregar o site.";
    const tried = collectHostnameCandidates(request).join(", ") || "(nenhum)";
    return new Response(`${msg}\n\nHosts tentados: ${tried}\nDica: defina TENANT_DEFAULT_HOSTNAME na Railway se o dominio nao aparecer na lista.`, {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" }
    });
  }
  return next();
});
