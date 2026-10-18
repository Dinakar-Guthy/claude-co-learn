/** Small response helpers shared by route handlers. Error bodies are `{ error: string, code?: string }`. */
import { isStoreError, redactError, STORE_ERROR_MESSAGE } from "@/lib/store/errors";
import type { LimitCheck } from "./limits";

export function jsonError(status: number, error: string, code?: string, headers?: HeadersInit): Response {
  return Response.json(code ? { error, code } : { error }, { status, headers });
}

export const unauthorized = () => jsonError(401, "Type /co-learn to switch on Co-learn mode.", "no_session");
export const notFound = () => jsonError(404, "Not found.", "not_found");

/** 429 for a failed `checkLimits`, with Retry-After when known. */
export function limitResponse(check: Extract<LimitCheck, { ok: false }>): Response {
  const headers = check.retryAfterS ? { "Retry-After": String(check.retryAfterS) } : undefined;
  return jsonError(429, check.message, check.code, headers);
}

/** Maps StoreError to a friendly 503; anything else becomes a logged, generic 500. */
export function routeErrorResponse(e: unknown, route: string): Response {
  if (isStoreError(e)) return jsonError(503, STORE_ERROR_MESSAGE, "store_unavailable");
  console.error(`[${route}] unexpected error (${redactError(e)})`);
  return jsonError(500, "Something went wrong on our side. Please try again.", "internal");
}
