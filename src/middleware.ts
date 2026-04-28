import { defineMiddleware } from "astro:middleware";
import { getSiteDataByHostname } from "./lib/cms";
import { resolveRequestHostname } from "./lib/tenantUrls";

export const onRequest = defineMiddleware(async ({ request, locals }, next) => {
  const hostname = resolveRequestHostname(request);
  locals.siteData = await getSiteDataByHostname(hostname);
  return next();
});
