/**
 * Site-wide access gate (reviewer password), layered in front of the whole app by proxy.ts.
 * The password lives only in the SITE_PASSWORD env var; the browser holds an HttpOnly cookie with an
 * HMAC derived from it, so the password itself is never stored client-side. Works in any runtime (Web Crypto).
 */
export const ACCESS_COOKIE = "cl_access";
export const ACCESS_MAX_AGE_S = 30 * 24 * 60 * 60;

/** Paths reachable without the access cookie. */
const PUBLIC_PATHS = new Set(["/access", "/api/access", "/api/health"]);

export async function accessToken(password: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode("co-learn-access-v1"));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type AccessDecision = "allow" | "redirect" | "unauthorized" | "misconfigured";

/**
 * Pure decision used by proxy.ts. Without SITE_PASSWORD: open in development, closed in production
 * (so forgetting to configure it can never expose the site).
 */
export function decideAccess(input: {
  pathname: string;
  cookie: string | undefined;
  expectedToken: string | null; // null when SITE_PASSWORD is unset
  production: boolean;
}): AccessDecision {
  if (PUBLIC_PATHS.has(input.pathname)) return "allow";
  if (input.expectedToken === null) return input.production ? "misconfigured" : "allow";
  if (input.cookie && safeEqual(input.cookie, input.expectedToken)) return "allow";
  return input.pathname.startsWith("/api/") ? "unauthorized" : "redirect";
}
