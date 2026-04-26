export function resolvePublicOrigin(requestUrl: string, request: Request): string {
  const configured = import.meta.env.PUBLIC_SITE_ORIGIN?.trim()?.replace(/\/+$/, "");
  if (configured) return configured;

  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (forwardedHost) return `${forwardedProto || "https"}://${forwardedHost}`;

  return new URL(requestUrl).origin;
}
