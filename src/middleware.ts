import { defineMiddleware } from "astro:middleware";
import { getSiteDataByHostname } from "./lib/cms";

export const onRequest = defineMiddleware(async ({ request, locals }, next) => {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const hostHeader = request.headers.get("host")?.trim();
  const hostnameRaw = forwardedHost || hostHeader || new URL(request.url).hostname;
  const hostname = hostnameRaw.split(":")[0]?.trim() || "";
  locals.siteData = await getSiteDataByHostname(hostname);
  return next();
});
