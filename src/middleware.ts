import { defineMiddleware } from "astro:middleware";
import { getSiteDataByHostname } from "./lib/cms";

export const onRequest = defineMiddleware(async ({ request, locals }, next) => {
  const pathname = new URL(request.url).pathname;
  // Admin, multi-tenant por path (/t/...) e APIs públicas não usam Host como chave de tenant.
  // Sem isso, em *.up.railway.app o getSiteDataByHostname falha e quebra /api/media/proxy, /api/ads/click, etc.
  if (pathname.startsWith("/admin") || pathname.startsWith("/t/") || pathname.startsWith("/api/")) return next();

  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const hostHeader = request.headers.get("host")?.trim();
  const hostnameRaw = forwardedHost || hostHeader || new URL(request.url).hostname;
  const hostname = hostnameRaw.split(":")[0]?.trim() || "";
  locals.siteData = await getSiteDataByHostname(hostname);
  return next();
});
