import { defineMiddleware } from "astro:middleware";
import { getSiteDataByHostname } from "./lib/cms";

export const onRequest = defineMiddleware(async ({ request, locals }, next) => {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const hostHeader = request.headers.get("host")?.trim();
  const hostnameRaw = forwardedHost || hostHeader || new URL(request.url).hostname;
  const hostname = hostnameRaw.split(":")[0]?.trim() || "";
  const urlHost = new URL(request.url).hostname;

  console.log(
    `[tenant-debug] x-forwarded-host=${forwardedHost ?? "(null)"} host=${hostHeader ?? "(null)"} urlHost=${urlHost} resolved=${hostname}`
  );

  locals.siteData = await getSiteDataByHostname(hostname);
  return next();
});
