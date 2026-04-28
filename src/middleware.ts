import { defineMiddleware } from "astro:middleware";
import { getSiteDataByHostname } from "./lib/cms";
import { resolveRequestHostname } from "./lib/tenantUrls";

export const onRequest = defineMiddleware(async ({ request, locals }, next) => {
  const hostname = resolveRequestHostname(request);
  try {
    locals.siteData = await getSiteDataByHostname(hostname);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao carregar o site.";
    return new Response(`${msg}\n\nHost usado na resolucao: ${hostname || "(vazio)"}`, {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" }
    });
  }
  return next();
});
