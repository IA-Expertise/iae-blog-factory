import { defineMiddleware } from "astro:middleware";
import { isAdminAuthenticated, isEditorAuthenticated } from "./lib/adminAuth";
import { getSiteDataByHostname } from "./lib/cms";
import {
  buildHttpsRedirectUrl,
  getForwardedProto,
  getRequestHostname,
  isPlatformAppHost,
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

  // Host da plataforma (ex.: *.up.railway.app): não é tenant — evita throw/stack no log.
  if (isPlatformAppHost(requestHost)) {
    if (pathname === "/" || pathname === "") {
      return new Response("IAE Blog Factory\n", {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
      });
    }
    return new Response("Not Found\n", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
    });
  }

  const hostnameForTenant = shouldNormalizePublicHost(requestHost)
    ? stripWwwPrefix(requestHost)
    : requestHost;

  try {
    context.locals.siteData = await getSiteDataByHostname(hostnameForTenant);
  } catch {
    // Host sem tenant (bot, typo, probe) — 404 limpo, sem stack no log do middleware.
    return new Response("Site nao encontrado.\n", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
    });
  }

  return next();
});
