import { defineMiddleware } from "astro:middleware";
import { isAdminAuthenticated, isEditorAuthenticated } from "./lib/adminAuth";
import { getSiteDataByHostname } from "./lib/cms";
import {
  buildHttpsRedirectUrl,
  getForwardedProto,
  getRequestHostname,
  shouldNormalizePublicHost,
  stripWwwPrefix
} from "./lib/publicHostRedirects";

export const onRequest = defineMiddleware(async (context, next) => {
  const { request } = context;
  const pathname = new URL(request.url).pathname;
  const requestHost = getRequestHostname(request);
  const proto = getForwardedProto(request);

  if (shouldNormalizePublicHost(requestHost)) {
    const apexHost = stripWwwPrefix(requestHost);
    if (proto === "http" || requestHost !== apexHost) {
      return context.redirect(buildHttpsRedirectUrl(request, apexHost), 301);
    }
  }

  // Editor de cliente: só Campo (+ login/logout). Bloqueia /admin completo.
  if (
    pathname.startsWith("/admin") &&
    !pathname.startsWith("/admin/login") &&
    !pathname.startsWith("/admin/logout") &&
    isEditorAuthenticated(context.cookies) &&
    !isAdminAuthenticated(context.cookies)
  ) {
    return context.redirect("/campo");
  }

  // Admin, campo, multi-tenant por path (/t/...) e APIs públicas não usam Host como chave de tenant.
  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/campo") ||
    pathname.startsWith("/t/") ||
    pathname.startsWith("/api/")
  ) {
    return next();
  }

  const hostnameForTenant = shouldNormalizePublicHost(requestHost)
    ? stripWwwPrefix(requestHost)
    : requestHost;
  context.locals.siteData = await getSiteDataByHostname(hostnameForTenant);
  return next();
});
