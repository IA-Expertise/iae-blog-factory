import { defineMiddleware } from "astro:middleware";
import { getSiteDataByHostname } from "./lib/cms";

export const onRequest = defineMiddleware(async ({ request, locals }, next) => {
  const hostname = new URL(request.url).hostname;
  locals.siteData = await getSiteDataByHostname(hostname);
  return next();
});
