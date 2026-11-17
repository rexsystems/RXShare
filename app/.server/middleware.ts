import type { MiddlewareFunction } from "react-router";

// React Router injects inline scripts for hydration, so 'unsafe-inline' is required for script-src.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://cdn.rxss.click",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

/** Applies security headers to every response. Handlers that set their own value (e.g. raw file serving) win. */
export const securityHeaders: MiddlewareFunction<Response> = async ({ request }, next) => {
  const response = await next();
  const set = (k: string, v: string) => { if (!response.headers.has(k)) response.headers.set(k, v); };

  set("X-Content-Type-Options", "nosniff");
  set("X-Frame-Options", "SAMEORIGIN");
  set("Referrer-Policy", "strict-origin-when-cross-origin");
  set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  set("Content-Security-Policy", CSP);

  const proto = request.headers.get("x-forwarded-proto") || new URL(request.url).protocol.replace(":", "");
  if (proto === "https") set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");

  return response;
};
